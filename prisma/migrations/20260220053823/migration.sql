/*
  Warnings:

  - You are about to drop the column `companyId` on the `departments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `departments` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "departments" DROP CONSTRAINT "departments_companyId_fkey";

-- DropIndex
DROP INDEX "departments_companyId_code_key";

-- AlterTable
ALTER TABLE "departments" DROP COLUMN "companyId",
ADD COLUMN     "companyIds" TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");
