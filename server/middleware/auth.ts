import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
  process.exit(1);
}

// After the guard above, JWT_SECRET is guaranteed to be a string
const JWT_KEY: string = JWT_SECRET;

export interface JwtPayload {
  userId: string;
  domainId: string;
  role: string;
  name: string;
}

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
  return jwt.sign(payload, JWT_KEY, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

/**
 * Middleware that verifies the JWT token from the Authorization header.
 * Attaches `req.user` with { userId, domainId, role } on success.
 * Re-checks the user's current role and active status from DB to prevent stale JWT roles.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_KEY) as unknown as JwtPayload;
    // Re-check user status and role from DB to prevent stale JWT issues
    const dbUser = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { role: true, active: true } });
    if (!dbUser || !dbUser.active) {
      res.status(401).json({ error: 'Account is deactivated or no longer exists' });
      return;
    }
    // Use the current DB role instead of the token's (possibly stale) role
    req.user = { ...decoded, role: dbUser.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware that restricts access to users with specified roles.
 * Must be used after `authenticate`.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
