import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { ensureDemoSeedData } from '../db/seed.ts';
import {
  resolveDemoActorByUid,
  resolveDemoPersonaForSession,
  resolveRealAuthenticatedActor,
  type ResolvedActor,
} from '../db/repository.ts';

export type { ResolvedActor };

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  actor?: ResolvedActor;
}

const RUNTIME_FALLBACK_DEMO_SECRET = crypto.randomBytes(32).toString('hex');

function getDemoSigningSecret(): string {
  const configured = process.env.DEMO_SESSION_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : RUNTIME_FALLBACK_DEMO_SECRET;
}

/**
 * Open workspace access is enabled across development, test, and production
 * deployments so anyone can access and utilize AGRISETU without signing in,
 * unless explicitly disabled via ENABLE_DEMO_MODE=false.
 */
export function isDemoModeEnabled(): boolean {
  const raw = (process.env.ENABLE_DEMO_MODE ?? 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0';
}

interface DemoTokenPayload {
  uid: string;
  exp: number;
}

export function issueDemoSessionToken(uid: string, ttlSeconds = 60 * 60 * 24): string {
  if (!isDemoModeEnabled()) {
    throw new Error('Open workspace sessions are disabled in this environment.');
  }
  const payload: DemoTokenPayload = {
    uid,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getDemoSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `agrisetu_demo.${encoded}.${signature}`;
}

export function verifyDemoSessionToken(token: string): DemoTokenPayload | null {
  if (!isDemoModeEnabled()) {
    return null;
  }
  if (!token.startsWith('agrisetu_demo.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [, encoded, providedSig] = parts;
  if (!encoded || !providedSig) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', getDemoSigningSecret())
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as DemoTokenPayload;
    if (!parsed.uid || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export type FirebaseTokenVerifier = (token: string) => Promise<DecodedIdToken>;

let customTokenVerifier: FirebaseTokenVerifier | null = null;

/**
 * Allows automated test suites to inject a deterministic token verifier.
 */
export function setFirebaseTokenVerifierForTests(verifier: FirebaseTokenVerifier | null) {
  customTokenVerifier = verifier;
}

async function verifyBearerFirebaseToken(token: string): Promise<DecodedIdToken> {
  if (customTokenVerifier) {
    return customTokenVerifier(token);
  }
  return adminAuth.verifyIdToken(token);
}

/**
 * Primary server-side workspace actor resolution middleware (no sign-in required).
 * - Never reads or trusts arbitrary client-supplied role/ID headers (x-agrisetu-demo-role, etc.).
 * - When no Authorization header is sent, automatically resolves the default open farmer
 *   workspace so anyone can access AGRISETU immediately without logging in.
 * - Supports server-signed workspace session tokens (`agrisetu_demo.*`) for switching
 *   between farmer, merchant, and coordinator workspaces in both dev and production.
 */
export const requireAuthenticatedActor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    if (!isDemoModeEnabled()) {
      return res.status(401).json({ error: 'Workspace session required.' });
    }
    try {
      await ensureDemoSeedData();
      const defaultActor = await resolveDemoPersonaForSession({ role: 'farmer' });
      req.actor = defaultActor;
      return next();
    } catch (error) {
      console.error('Error resolving default open workspace actor:', error);
      return res.status(500).json({ error: 'Failed to initialize open workspace session.' });
    }
  }

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Invalid Authorization header format.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Empty Bearer token.' });
  }

  if (token.startsWith('agrisetu_demo.')) {
    if (!isDemoModeEnabled()) {
      return res.status(401).json({
        error: 'Open workspace sessions are disabled in this environment.',
      });
    }
    const demoPayload = verifyDemoSessionToken(token);
    if (!demoPayload) {
      return res.status(401).json({ error: 'Invalid or expired workspace session token.' });
    }
    try {
      await ensureDemoSeedData();
      const demoActor = await resolveDemoActorByUid(demoPayload.uid);
      if (!demoActor || !demoActor.isDemo) {
        return res.status(401).json({ error: 'Workspace persona not found.' });
      }
      req.actor = demoActor;
      return next();
    } catch (error) {
      console.error('Error resolving workspace session actor:', error);
      return res.status(500).json({ error: 'Failed to resolve workspace session.' });
    }
  }

  try {
    const decodedToken = await verifyBearerFirebaseToken(token);
    req.user = decodedToken;
    const actor = await resolveRealAuthenticatedActor({
      uid: decodedToken.uid,
      email: decodedToken.email || `${decodedToken.uid}@firebase.user`,
      name: decodedToken.name,
      emailVerified: decodedToken.email_verified !== false,
    });
    req.actor = actor;
    return next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json({ error: 'Invalid session token.' });
  }
};

/**
 * Role-based workspace guard enforcing active workspace role separation.
 */
export const requireRole = (...allowedRoles: Array<'farmer' | 'merchant' | 'coordinator'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.actor) {
      return res.status(401).json({ error: 'Workspace actor not initialized.' });
    }
    if (!allowedRoles.includes(req.actor.role)) {
      return res.status(403).json({
        error: `Forbidden: Role "${req.actor.role}" cannot access this resource.`,
      });
    }
    return next();
  };
};
