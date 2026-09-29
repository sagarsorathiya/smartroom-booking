-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "notifyEmail" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "blocked_slots_roomId_startTime_endTime_idx" ON "blocked_slots"("roomId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "bookings_roomId_startTime_endTime_idx" ON "bookings"("roomId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "bookings_userId_idx" ON "bookings"("userId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");
