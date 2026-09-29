-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('FOOD_BEVERAGE', 'STATIONERY', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SERVICE_UPDATED';

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "items" TEXT[],
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'PENDING',
    "handledBy" TEXT,
    "handledByName" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
