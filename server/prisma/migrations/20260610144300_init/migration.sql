-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLeague" (
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,

    CONSTRAINT "UserLeague_pkey" PRIMARY KEY ("userId","leagueId")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "teamId" TEXT,
    "divisionId" TEXT,
    "permissions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distance" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Distance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classification" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isDoubles" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Athlete" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteBestTime" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "distanceId" TEXT NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AthleteBestTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boat" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "model" TEXT,
    "isDouble" BOOLEAN NOT NULL DEFAULT false,
    "modelRank" INTEGER NOT NULL DEFAULT 0,
    "numberRank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Boat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoatLoan" (
    "id" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoatLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceDay" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "primaryOfficialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RaceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceDayOfficial" (
    "raceDayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RaceDayOfficial_pkey" PRIMARY KEY ("raceDayId","userId")
);

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "raceDayId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "distanceId" TEXT NOT NULL,
    "laneCount" INTEGER NOT NULL DEFAULT 8,
    "orderIndex" INTEGER NOT NULL,
    "hasFinals" BOOLEAN NOT NULL DEFAULT true,
    "finalBEnabled" BOOLEAN NOT NULL DEFAULT false,
    "advancementRule" JSONB,
    "finalBRule" JSONB,
    "status" TEXT NOT NULL DEFAULT 'setup',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lineup" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineupEntry" (
    "id" TEXT NOT NULL,
    "lineupId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "pairId" TEXT,

    CONSTRAINT "LineupEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Substitution" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "outAthleteId" TEXT NOT NULL,
    "inAthleteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Substitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scratch" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scratch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoatAssignment" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "isFinalAssignment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoatAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Heat" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "heatNumber" INTEGER NOT NULL,
    "startTs" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Heat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Final" (
    "id" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startTs" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Final_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaneAssignment" (
    "id" TEXT NOT NULL,
    "heatId" TEXT,
    "finalId" TEXT,
    "lane" INTEGER NOT NULL,
    "entryId" TEXT NOT NULL,

    CONSTRAINT "LaneAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialTape" (
    "id" TEXT NOT NULL,
    "officialId" TEXT NOT NULL,
    "heatId" TEXT,
    "finalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialTape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinishEvent" (
    "id" TEXT NOT NULL,
    "tapeId" TEXT NOT NULL,
    "entryId" TEXT,
    "boatNumber" TEXT,
    "clientFinishTs" BIGINT NOT NULL,
    "serverReceivedTs" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinishEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisagreeEvent" (
    "id" TEXT NOT NULL,
    "finishEventId" TEXT NOT NULL,
    "officialId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisagreeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "heatId" TEXT,
    "finalId" TEXT,
    "place" INTEGER,
    "timeMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "teamId" TEXT,
    "divisionId" TEXT,
    "permissions" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceDayBoat" (
    "raceDayId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    CONSTRAINT "RaceDayBoat_pkey" PRIMARY KEY ("raceDayId","boatId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_role_teamId_divisionId_key" ON "Membership"("userId", "role", "teamId", "divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteBestTime_athleteId_distanceId_key" ON "AthleteBestTime"("athleteId", "distanceId");

-- CreateIndex
CREATE UNIQUE INDEX "BoatLoan_boatId_raceId_key" ON "BoatLoan"("boatId", "raceId");

-- CreateIndex
CREATE UNIQUE INDEX "Lineup_teamId_raceId_key" ON "Lineup"("teamId", "raceId");

-- CreateIndex
CREATE UNIQUE INDEX "Scratch_raceId_athleteId_key" ON "Scratch"("raceId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "BoatAssignment_raceId_entryId_key" ON "BoatAssignment"("raceId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "Heat_raceId_heatNumber_key" ON "Heat"("raceId", "heatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Final_raceId_type_key" ON "Final"("raceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeague" ADD CONSTRAINT "UserLeague_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeague" ADD CONSTRAINT "UserLeague_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distance" ADD CONSTRAINT "Distance_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classification" ADD CONSTRAINT "Classification_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteBestTime" ADD CONSTRAINT "AthleteBestTime_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteBestTime" ADD CONSTRAINT "AthleteBestTime_distanceId_fkey" FOREIGN KEY ("distanceId") REFERENCES "Distance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boat" ADD CONSTRAINT "Boat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatLoan" ADD CONSTRAINT "BoatLoan_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatLoan" ADD CONSTRAINT "BoatLoan_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatLoan" ADD CONSTRAINT "BoatLoan_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatLoan" ADD CONSTRAINT "BoatLoan_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceDay" ADD CONSTRAINT "RaceDay_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceDay" ADD CONSTRAINT "RaceDay_primaryOfficialId_fkey" FOREIGN KEY ("primaryOfficialId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceDayOfficial" ADD CONSTRAINT "RaceDayOfficial_raceDayId_fkey" FOREIGN KEY ("raceDayId") REFERENCES "RaceDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceDayOfficial" ADD CONSTRAINT "RaceDayOfficial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_raceDayId_fkey" FOREIGN KEY ("raceDayId") REFERENCES "RaceDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "Classification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_distanceId_fkey" FOREIGN KEY ("distanceId") REFERENCES "Distance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lineup" ADD CONSTRAINT "Lineup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lineup" ADD CONSTRAINT "Lineup_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupEntry" ADD CONSTRAINT "LineupEntry_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "Lineup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupEntry" ADD CONSTRAINT "LineupEntry_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_outAthleteId_fkey" FOREIGN KEY ("outAthleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substitution" ADD CONSTRAINT "Substitution_inAthleteId_fkey" FOREIGN KEY ("inAthleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scratch" ADD CONSTRAINT "Scratch_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scratch" ADD CONSTRAINT "Scratch_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scratch" ADD CONSTRAINT "Scratch_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatAssignment" ADD CONSTRAINT "BoatAssignment_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatAssignment" ADD CONSTRAINT "BoatAssignment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LineupEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatAssignment" ADD CONSTRAINT "BoatAssignment_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Heat" ADD CONSTRAINT "Heat_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Final" ADD CONSTRAINT "Final_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaneAssignment" ADD CONSTRAINT "LaneAssignment_heatId_fkey" FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaneAssignment" ADD CONSTRAINT "LaneAssignment_finalId_fkey" FOREIGN KEY ("finalId") REFERENCES "Final"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaneAssignment" ADD CONSTRAINT "LaneAssignment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LineupEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialTape" ADD CONSTRAINT "OfficialTape_officialId_fkey" FOREIGN KEY ("officialId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialTape" ADD CONSTRAINT "OfficialTape_heatId_fkey" FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialTape" ADD CONSTRAINT "OfficialTape_finalId_fkey" FOREIGN KEY ("finalId") REFERENCES "Final"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishEvent" ADD CONSTRAINT "FinishEvent_tapeId_fkey" FOREIGN KEY ("tapeId") REFERENCES "OfficialTape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishEvent" ADD CONSTRAINT "FinishEvent_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LineupEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisagreeEvent" ADD CONSTRAINT "DisagreeEvent_finishEventId_fkey" FOREIGN KEY ("finishEventId") REFERENCES "FinishEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LineupEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_heatId_fkey" FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_finalId_fkey" FOREIGN KEY ("finalId") REFERENCES "Final"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceDayBoat" ADD CONSTRAINT "RaceDayBoat_raceDayId_fkey" FOREIGN KEY ("raceDayId") REFERENCES "RaceDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceDayBoat" ADD CONSTRAINT "RaceDayBoat_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceDayBoat" ADD CONSTRAINT "RaceDayBoat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
