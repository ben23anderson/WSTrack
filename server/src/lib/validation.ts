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

export const CreateAthleteSchema = z.object({
  name: z.string().min(1),
  grade: z.string().optional(),
});

export const UpdateAthleteSchema = z.object({
  name: z.string().min(1).optional(),
  grade: z.string().optional(),
});

export const UpsertBestTimeSchema = z.object({
  time_ms: z.number().int().positive(),
  is_official: z.boolean().default(true),
});

export const CreateBoatSchema = z.object({
  number: z.string().min(1),
  model: z.string().optional(),
  is_double: z.boolean().default(false),
  model_rank: z.number().int().default(0),
  number_rank: z.number().int().default(0),
});

export const UpdateBoatSchema = CreateBoatSchema.partial();

export type CreateAthleteInput = z.infer<typeof CreateAthleteSchema>;
export type UpdateAthleteInput = z.infer<typeof UpdateAthleteSchema>;
export type UpsertBestTimeInput = z.infer<typeof UpsertBestTimeSchema>;
export type CreateBoatInput = z.infer<typeof CreateBoatSchema>;
export type UpdateBoatInput = z.infer<typeof UpdateBoatSchema>;

export const CreateRaceDaySchema = z.object({
  name: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  primary_official_id: z.string().optional(),
  official_ids: z.array(z.string()).default([]),
});

export const CreateRaceSchema = z.object({
  classification_id: z.string().min(1),
  distance_id: z.string().min(1),
  lane_count: z.number().int().min(1).max(20).default(8),
  order_index: z.number().int().min(0),
  has_finals: z.boolean().default(true),
  final_b_enabled: z.boolean().default(false),
  advancement_rule: z.record(z.unknown()).optional(),
  final_b_rule: z.record(z.unknown()).optional(),
});

export const UpdateRaceSchema = CreateRaceSchema.partial().extend({
  status: z.enum(['setup','boat_prep','seeded','live','review','published']).optional(),
});

export const CreateDistanceSchema = z.object({
  label: z.string().min(1),
  sort_order: z.number().int().default(0),
});

export const CreateClassificationSchema = z.object({
  label: z.string().min(1),
  is_doubles: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export const AddLineupEntrySchema = z.object({
  athlete_id: z.string().min(1),
  pair_id: z.string().optional(),
});

export const RequestSubstitutionSchema = z.object({
  out_athlete_id: z.string().min(1),
  in_athlete_id: z.string().min(1),
});

export const ReviewSubstitutionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const ScratchAthleteSchema = z.object({
  athlete_id: z.string().min(1),
});

export type CreateRaceDayInput = z.infer<typeof CreateRaceDaySchema>;
export type CreateRaceInput = z.infer<typeof CreateRaceSchema>;
export type UpdateRaceInput = z.infer<typeof UpdateRaceSchema>;
export type CreateDistanceInput = z.infer<typeof CreateDistanceSchema>;
export type CreateClassificationInput = z.infer<typeof CreateClassificationSchema>;
export type AddLineupEntryInput = z.infer<typeof AddLineupEntrySchema>;
export type RequestSubstitutionInput = z.infer<typeof RequestSubstitutionSchema>;
export type ReviewSubstitutionInput = z.infer<typeof ReviewSubstitutionSchema>;
export type ScratchAthleteInput = z.infer<typeof ScratchAthleteSchema>;

export const MarkBoatBroughtSchema = z.object({
  boat_id: z.string().min(1),
});

export const AssignBoatSchema = z.object({
  boat_id: z.string().min(1),
});

export const AutoAssignBoatsSchema = z.object({
  // If true, save the assignments; if false, just return proposed
  save: z.boolean().default(true),
});

export const CreateBoatLoanSchema = z.object({
  boat_id: z.string().min(1),
  to_team_id: z.string().min(1),
});

export type MarkBoatBroughtInput = z.infer<typeof MarkBoatBroughtSchema>;
export type AssignBoatInput = z.infer<typeof AssignBoatSchema>;
export type AutoAssignBoatsInput = z.infer<typeof AutoAssignBoatsSchema>;
export type CreateBoatLoanInput = z.infer<typeof CreateBoatLoanSchema>;

export const SeedRaceSchema = z.object({
  strategy: z.enum(['snake', 'random']).default('snake'),
  balance_teams: z.boolean().default(false),
});
export type SeedRaceInput = z.infer<typeof SeedRaceSchema>;

export const RecordFinishEventSchema = z.object({
  entry_id: z.string().min(1),
  client_finish_ts: z.number().int().positive(),  // epoch ms
  sequence: z.number().int().min(0),
});

export const MarkDnsDqSchema = z.object({
  entry_id: z.string().min(1),
  status: z.enum(['dns', 'dq']),
});

export const LogDisagreeSchema = z.object({
  finish_event_id: z.string().min(1),
  reason: z.string().optional(),
});

export const ManualResultSchema = z.object({
  results: z.array(z.object({
    entry_id: z.string().min(1),
    place: z.number().int().min(1),
    time_ms: z.number().int().positive().optional(),
    status: z.enum(['ok', 'dns', 'dnf', 'dq']).default('ok'),
  })),
});

export type RecordFinishEventInput = z.infer<typeof RecordFinishEventSchema>;
export type MarkDnsDqInput = z.infer<typeof MarkDnsDqSchema>;
export type LogDisagreeInput = z.infer<typeof LogDisagreeSchema>;
export type ManualResultInput = z.infer<typeof ManualResultSchema>;
