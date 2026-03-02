-- CreateEnum
CREATE TYPE "ResourceSelectionMode" AS ENUM ('HIDDEN', 'PICK_RESOURCE_FIRST', 'PICK_TIME_FIRST');

-- AlterTable
ALTER TABLE "ReservationSettings" ADD COLUMN "resourceSelectionMode" "ResourceSelectionMode" NOT NULL DEFAULT 'HIDDEN';
