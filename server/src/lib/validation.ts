import { z } from 'zod';

export const AssistantPermissionsSchema = z.object({
  roster: z.boolean(),
  boat_inventory: z.boolean(),
  boat_assignments: z.boolean(),
});

export type AssistantPermissions = z.infer<typeof AssistantPermissionsSchema>;

export const SignupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const CreateDivisionSchema = z.object({
  name: z.string().min(1, 'Division name is required'),
  leagueId: z.string().min(1, 'League ID is required'),
});

export const CreateTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  divisionId: z.string().min(1, 'Division ID is required'),
});

export const InviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['head_coach', 'assistant_coach', 'official']),
  teamId: z.string().optional(),
  divisionId: z.string().optional(),
  permissions: AssistantPermissionsSchema.optional(),
});

export const UpdatePermissionsSchema = z.object({
  permissions: AssistantPermissionsSchema,
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateDivisionInput = z.infer<typeof CreateDivisionSchema>;
export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type UpdatePermissionsInput = z.infer<typeof UpdatePermissionsSchema>;
