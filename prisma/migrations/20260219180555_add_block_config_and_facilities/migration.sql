-- Convert block column from enum to text (preserving data)
ALTER TABLE "rooms" ALTER COLUMN "block" SET DATA TYPE TEXT USING "block"::TEXT;

-- DropEnum
DROP TYPE IF EXISTS "RoomBlock";

-- Update enum values to display names
UPDATE "rooms" SET "block" = 'Block A' WHERE "block" = 'BLOCK_A';
UPDATE "rooms" SET "block" = 'Block B' WHERE "block" = 'BLOCK_B';

-- CreateTable
CREATE TABLE "room_block_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "itEmail" TEXT NOT NULL DEFAULT '',
    "receptionEmail" TEXT NOT NULL DEFAULT '',
    "adminEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_block_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_block_configs_code_key" ON "room_block_configs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_name_key" ON "facilities"("name");

-- Seed default blocks from existing room data
INSERT INTO "room_block_configs" ("id", "name", "code", "active", "itEmail", "receptionEmail", "adminEmail", "updatedAt")
SELECT gen_random_uuid(), "block", REPLACE("block", 'Block ', ''), true, '', '', '', NOW()
FROM (SELECT DISTINCT "block" FROM "rooms") AS blocks
ON CONFLICT ("code") DO NOTHING;

-- Seed default facilities
INSERT INTO "facilities" ("id", "name", "active", "updatedAt") VALUES
  (gen_random_uuid(), 'Projector', true, NOW()),
  (gen_random_uuid(), 'Whiteboard', true, NOW()),
  (gen_random_uuid(), 'Video Conf', true, NOW()),
  (gen_random_uuid(), 'TV Screen', true, NOW()),
  (gen_random_uuid(), 'Speakerphone', true, NOW()),
  (gen_random_uuid(), 'HDMI', true, NOW()),
  (gen_random_uuid(), 'Mic System', true, NOW())
ON CONFLICT ("name") DO NOTHING;
