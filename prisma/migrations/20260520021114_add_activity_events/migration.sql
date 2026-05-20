-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('CREATED', 'UPDATED', 'STAGE_CHANGED', 'STAGE_CHANGE_REQUESTED', 'STAGE_CHANGE_APPROVED', 'STAGE_CHANGE_REJECTED', 'ASSIGNED', 'UNASSIGNED', 'COMMENT_ADDED', 'FILE_UPLOADED');

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "type" "ActivityEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "stageChangeRequestId" TEXT,
    "commentId" TEXT,
    "fileId" TEXT,
    "note" TEXT,
    "metadata" JSONB,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_events_activityId_createdAt_idx" ON "activity_events"("activityId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_events_actorId_idx" ON "activity_events"("actorId");

-- CreateIndex
CREATE INDEX "activity_events_targetUserId_idx" ON "activity_events"("targetUserId");

-- CreateIndex
CREATE INDEX "activity_events_type_idx" ON "activity_events"("type");

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_stageChangeRequestId_fkey" FOREIGN KEY ("stageChangeRequestId") REFERENCES "stage_change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
