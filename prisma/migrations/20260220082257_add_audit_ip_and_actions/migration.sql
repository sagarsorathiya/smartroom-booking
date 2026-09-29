-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_LOGIN';
ALTER TYPE "AuditAction" ADD VALUE 'USER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PROFILE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'DEPARTMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'DEPARTMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DEPARTMENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'DESIGNATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'DESIGNATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DESIGNATION_DELETED';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "ipAddress" TEXT;
