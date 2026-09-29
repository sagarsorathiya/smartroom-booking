-- AlterTable
ALTER TABLE "users" ADD COLUMN     "designationId" TEXT;

-- CreateTable
CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "companyIds" TEXT[],
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designations_code_key" ON "designations"("code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
