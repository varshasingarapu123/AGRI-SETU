import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import {
  resolveDemoActorByUid,
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
 * Demo authentication is strictly limited to non-production development/test environments
 * when ENABLE_DEMO_MODE is not disabled. It can NEVER be enabled when NODE_ENV === 'production'.
 */
export function isDemoModeEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  const raw = (process.env.ENABLE_DEMO_MODE ?? 'true').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

interface DemoTokenPayload {
  uid: string;
  exp: number;
}

export function issueDemoSessionToken(uid: string, ttlSeconds = 60 * 60 * 8): string {
  if (!isDemoModeEnabled()) {
    throw new Error('Demo authentication is disabled in this environment.');
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
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as DemoTokenPayload;
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
 * Allows automated test suites to inject a deterministic Firebase token verifier
 * without weakening production verification.
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
 * Strict Firebase Auth middleware for verified Google-authenticated endpoints (e.g. /api/auth/sync).
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing Bearer token.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || token.startsWith('agrisetu_demo.')) {
    return res.status(401).json({ error: 'Unauthorized: Verified Firebase ID token required.' });
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
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid Firebase ID token.' });
  }
};

/**
 * Primary server-side authentication & actor resolution middleware.
 * - NEVER reads or trusts client-supplied role/ID headers (x-agrisetu-demo-role, etc.).
 * - Verifies Firebase ID token and resolves role & record ownership strictly from PostgreSQL.
 * - Supports server-signed demo tokens ONLY when isDemoModeEnabled() is true AND the target
 *   database user is explicitly marked is_demo = true.
 */
export const requireAuthenticatedActor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Client role headers are not accepted.',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty Bearer token.' });
  }

  if (token.startsWith('agrisetu_demo.')) {
    if (!isDemoModeEnabled()) {
      return res.status(401).json({
        error: 'Unauthorized: Demo sessions are disabled in production.',
      });
    }
    const demoPayload = verifyDemoSessionToken(token);
    if (!demoPayload) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired demo session token.' });
    }
    try {
      const demoActor = await resolveDemoActorByUid(demoPayload.uid);
      if (!demoActor || !demoActor.isDemo) {
        return res.status(401).json({ error: 'Unauthorized: Demo persona not permitted.' });
      }
      req.actor = demoActor;
      return next();
    } catch (error) {
      console.error('Error resolving demo session actor:', error);
      return res.status(500).json({ error: 'Failed to resolve demo session.' });
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
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication token.' });
  }
};

/**
 * Role-based access control middleware enforcing server-derived actor roles.
 */
export const requireRole = (...allowedRoles: Array<'farmer' | 'merchant' | 'coordinator'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.actor) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.actor.role)) {
      return res.status(403).json({
        error: `Forbidden: Role "${req.actor.role}" cannot access this resource.`,
      });
    }
    return next();
  };
};
