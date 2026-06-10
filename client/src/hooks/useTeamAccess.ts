import { useAuthContext } from '../context/AuthContext.js';

export function useTeamAccess(teamId: string) {
  const { memberships } = useAuthContext();
  const m = memberships?.find((mem) => mem.teamId === teamId);
  const isHeadCoach = m?.role === 'head_coach';
  const perms = (m?.permissions ?? {}) as Record<string, boolean>;
  return {
    canManageRoster: isHeadCoach || (m?.role === 'assistant_coach' && !!perms['roster']),
    canManageBoatInventory: isHeadCoach || (m?.role === 'assistant_coach' && !!perms['boat_inventory']),
    canManageBoatAssignments: isHeadCoach || (m?.role === 'assistant_coach' && !!perms['boat_assignments']),
    isHeadCoach,
    isCoordinator: m?.role === 'coordinator',
    isOfficial: m?.role === 'official',
  };
}
