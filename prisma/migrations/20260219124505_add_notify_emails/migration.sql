-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "notifyEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
