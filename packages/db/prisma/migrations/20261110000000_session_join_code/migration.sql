-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "joinCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_joinCode_key" ON "sessions"("joinCode");
