-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('setup', 'live', 'degraded', 'ended', 'expired');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('host', 'attendee');

-- CreateEnum
CREATE TYPE "BookmarkAnchorKind" AS ENUM ('live', 'paragraph');

-- CreateEnum
CREATE TYPE "BookmarkCompleteness" AS ENUM ('pending', 'complete', 'incomplete');

-- CreateTable
CREATE TABLE "principals" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "principals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'setup',
    "hostPrincipalId" UUID NOT NULL,
    "hostLinkTokenHash" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "principalId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" UUID NOT NULL,
    "ownerPrincipalId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "operationId" TEXT NOT NULL,
    "anchorKind" "BookmarkAnchorKind" NOT NULL,
    "markedAtMs" DOUBLE PRECISION,
    "segmentId" TEXT,
    "segmentRevision" INTEGER,
    "requestedStartMs" DOUBLE PRECISION NOT NULL,
    "requestedEndMs" DOUBLE PRECISION NOT NULL,
    "actualStartMs" DOUBLE PRECISION,
    "actualEndMs" DOUBLE PRECISION,
    "clockUncertaintyMs" DOUBLE PRECISION NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "completeness" "BookmarkCompleteness" NOT NULL DEFAULT 'pending',
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_hostLinkTokenHash_key" ON "sessions"("hostLinkTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_inviteCode_key" ON "sessions"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_sessionId_principalId_key" ON "memberships"("sessionId", "principalId");

-- CreateIndex
CREATE INDEX "bookmarks_ownerPrincipalId_sessionId_idx" ON "bookmarks"("ownerPrincipalId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_ownerPrincipalId_operationId_key" ON "bookmarks"("ownerPrincipalId", "operationId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_hostPrincipalId_fkey" FOREIGN KEY ("hostPrincipalId") REFERENCES "principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_ownerPrincipalId_fkey" FOREIGN KEY ("ownerPrincipalId") REFERENCES "principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

