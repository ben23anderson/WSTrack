import type { Request, Response, NextFunction } from 'express';
import type { Membership } from '@prisma/client';
import db from '../lib/db.js';
import type { AssistantPermissions } from '../lib/validation.js';

// Augment the Express Request type to carry resolved membership
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      membership?: Membership;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

type ScopeFn = (req: Request) => { teamId?: string; divisionId?: string };

export function requireRole(
  role: string,
  scopeFn: ScopeFn
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { teamId, divisionId } = scopeFn(req);
    try {
      const membership = await db.membership.findFirst({
        where: {
          userId: req.session.userId,
          role,
          ...(teamId !== undefined ? { teamId } : {}),
          ...(divisionId !== undefined ? { divisionId } : {}),
        },
      });
      if (!membership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      req.membership = membership;
      next();
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export function requireCoordinator(
  divisionIdParam: string
): (req: Request, res: Response, next: NextFunction) => void {
  return requireRole('coordinator', (req) => ({
    divisionId: req.params[divisionIdParam],
  }));
}

export function requireHeadCoach(
  teamIdParam: string
): (req: Request, res: Response, next: NextFunction) => void {
  return requireRole('head_coach', (req) => ({
    teamId: req.params[teamIdParam],
  }));
}

export function requireAssistantPerm(
  perm: keyof AssistantPermissions,
  teamIdParam: string
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const teamId = req.params[teamIdParam];
    try {
      const membership = await db.membership.findFirst({
        where: {
          userId: req.session.userId,
          role: 'assistant_coach',
          teamId,
        },
      });
      if (!membership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const permissions = membership.permissions as AssistantPermissions | null;
      if (!permissions || !permissions[perm]) {
        res.status(403).json({ error: 'Forbidden: insufficient permissions' });
        return;
      }
      req.membership = membership;
      next();
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/** Requires head_coach OR assistant_coach with `roster` permission on teamIdParam. */
export function requireRosterAccess(
  teamIdParam: string
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const teamId = req.params[teamIdParam];
    try {
      // Check head_coach first
      const headCoach = await db.membership.findFirst({
        where: { userId: req.session.userId, role: 'head_coach', teamId },
      });
      if (headCoach) {
        req.membership = headCoach;
        next();
        return;
      }
      // Check assistant_coach with roster permission
      const assistant = await db.membership.findFirst({
        where: { userId: req.session.userId, role: 'assistant_coach', teamId },
      });
      if (assistant) {
        const permissions = assistant.permissions as AssistantPermissions | null;
        if (permissions?.roster) {
          req.membership = assistant;
          next();
          return;
        }
      }
      res.status(403).json({ error: 'Forbidden' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/** Requires any membership on the team (head_coach, assistant_coach). */
export function requireTeamMember(
  teamIdParam: string
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const teamId = req.params[teamIdParam];
    try {
      const membership = await db.membership.findFirst({
        where: { userId: req.session.userId, teamId },
      });
      if (!membership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      req.membership = membership;
      next();
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/** User must be the designated primary official for this race day. */
export function requirePrimaryOfficial(
  raceDayIdParam: string
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req, res, next): Promise<void> => {
    if (!req.session.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const raceDay = await db.raceDay.findUnique({ where: { id: req.params[raceDayIdParam] } });
      if (!raceDay || raceDay.primaryOfficialId !== req.session.userId) {
        res.status(403).json({ error: 'Forbidden: primary official only' }); return;
      }
      next();
    } catch { res.status(500).json({ error: 'Internal server error' }); }
  };
}

/** Requires head_coach OR assistant_coach with `boat_inventory` permission on teamIdParam. */
export function requireBoatInventoryAccess(
  teamIdParam: string
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const teamId = req.params[teamIdParam];
    try {
      // Check head_coach first
      const headCoach = await db.membership.findFirst({
        where: { userId: req.session.userId, role: 'head_coach', teamId },
      });
      if (headCoach) {
        req.membership = headCoach;
        next();
        return;
      }
      // Check assistant_coach with boat_inventory permission
      const assistant = await db.membership.findFirst({
        where: { userId: req.session.userId, role: 'assistant_coach', teamId },
      });
      if (assistant) {
        const permissions = assistant.permissions as AssistantPermissions | null;
        if (permissions?.boat_inventory) {
          req.membership = assistant;
          next();
          return;
        }
      }
      res.status(403).json({ error: 'Forbidden' });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
