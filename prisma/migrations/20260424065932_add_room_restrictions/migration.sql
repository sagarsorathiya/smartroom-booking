-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "restricted" BOOLEAN NOT NULL DEFAULT false;
