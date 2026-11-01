import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  demoActor?: {
    uid: string;
    email: string;
    role: 'farmer' | 'merchant' | 'coordinator';
    farmerId?: number;
    merchantId?: number;
  };
}

/**
 * Strict Firebase Auth middleware for verified Google-authenticated endpoints.
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

/**
 * Pilot & Demo session resolver:
 * Verifies real Firebase Bearer token when signed in with Google, OR attaches
 * clearly scoped demo pilot context when operating seeded demo accounts in prototype mode.
 */
export const resolvePilotSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = decodedToken;
      return next();
    } catch (error) {
      console.error('Error verifying Firebase ID token:', error);
      return res.status(401).json({ error: 'Unauthorized: Invalid Firebase ID token' });
    }
  }

  // Prototype demo mode header (explicitly marked as demo pilot session, never spoofing verified auth)
  const demoRoleHeader = req.headers['x-agrisetu-demo-role'];
  if (demoRoleHeader === 'farmer' || demoRoleHeader === 'merchant' || demoRoleHeader === 'coordinator') {
    const farmerId = Number(req.headers['x-agrisetu-farmer-id'] || 1);
    const merchantId = Number(req.headers['x-agrisetu-merchant-id'] || 1);
    req.demoActor = {
      uid: `demo-${demoRoleHeader}-${demoRoleHeader === 'farmer' ? farmerId : demoRoleHeader === 'merchant' ? merchantId : 0}`,
      email: `${demoRoleHeader}.demo@agrisetu.example`,
      role: demoRoleHeader,
      farmerId: Number.isNaN(farmerId) ? 1 : farmerId,
      merchantId: Number.isNaN(merchantId) ? 1 : merchantId,
    };
    return next();
  }

  return res.status(401).json({ error: 'Authentication or active demo pilot role required.' });
};
