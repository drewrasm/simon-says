-- CreateEnum
CREATE TYPE "RecapStatus" AS ENUM ('pending', 'running', 'ready', 'failed', 'stale');

-- CreateTable
CREATE TABLE "recaps" (
    "id" UUID NOT NULL,
    "ownerPrincipalId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "bookmarkSnapshot" JSONB NOT NULL,
    "status" "RecapStatus" NOT NULL DEFAULT 'pending',
    "takeaways" JSONB NOT NULL DEFAULT '[]',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recaps_ownerPrincipalId_sessionId_idx" ON "recaps"("ownerPrincipalId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "recaps_ownerPrincipalId_operationId_key" ON "recaps"("ownerPrincipalId", "operationId");

-- AddForeignKey
ALTER TABLE "recaps" ADD CONSTRAINT "recaps_ownerPrincipalId_fkey" FOREIGN KEY ("ownerPrincipalId") REFERENCES "principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recaps" ADD CONSTRAINT "recaps_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
