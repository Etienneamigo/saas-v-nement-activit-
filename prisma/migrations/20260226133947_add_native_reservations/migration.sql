/*
  Warnings:

  - Changed the type of `type` on the `Activity` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'PHONE', 'EMAIL', 'CHECKBOX');

-- AlterTable
ALTER TABLE "Activity" DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL,
ALTER COLUMN "zone1Tags" DROP DEFAULT,
ALTER COLUMN "zone2Tags" DROP DEFAULT,
ALTER COLUMN "zone3Tags" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "videoCategory" TEXT;

-- DropEnum
DROP TYPE "ActivityType";

-- CreateTable
CREATE TABLE "ActivityTypeConfig" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🎯',
    "iconUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCategoryConfig" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoCategoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationSettings" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "showExternalLinkAlso" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "slotDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "capacityPerSlot" INTEGER NOT NULL DEFAULT 10,
    "minPartySize" INTEGER NOT NULL DEFAULT 1,
    "maxPartySize" INTEGER NOT NULL DEFAULT 10,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
    "bookingWindowDays" INTEGER NOT NULL DEFAULT 30,
    "cancellationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cancellationDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "confirmationMessage" TEXT,
    "cancellationPolicyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySchedule" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openRanges" JSONB NOT NULL,

    CONSTRAINT "WeeklySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationOverride" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "customOpenRanges" JSONB,
    "customCapacity" INTEGER,

    CONSTRAINT "ReservationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "userId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationCustomFieldDef" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationCustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationCustomFieldValue" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "fieldDefId" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ReservationCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTypeConfig_slug_key" ON "ActivityTypeConfig"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCategoryConfig_slug_key" ON "VideoCategoryConfig"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationSettings_establishmentId_key" ON "ReservationSettings"("establishmentId");

-- CreateIndex
CREATE INDEX "WeeklySchedule_settingsId_idx" ON "WeeklySchedule"("settingsId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySchedule_settingsId_dayOfWeek_key" ON "WeeklySchedule"("settingsId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ReservationOverride_establishmentId_date_idx" ON "ReservationOverride"("establishmentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationOverride_establishmentId_date_key" ON "ReservationOverride"("establishmentId", "date");

-- CreateIndex
CREATE INDEX "Reservation_establishmentId_startAt_idx" ON "Reservation"("establishmentId", "startAt");

-- CreateIndex
CREATE INDEX "Reservation_establishmentId_status_idx" ON "Reservation"("establishmentId", "status");

-- CreateIndex
CREATE INDEX "Reservation_userId_idx" ON "Reservation"("userId");

-- CreateIndex
CREATE INDEX "ReservationCustomFieldDef_settingsId_idx" ON "ReservationCustomFieldDef"("settingsId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationCustomFieldValue_reservationId_fieldDefId_key" ON "ReservationCustomFieldValue"("reservationId", "fieldDefId");

-- CreateIndex
CREATE INDEX "Activity_type_idx" ON "Activity"("type");

-- CreateIndex
CREATE INDEX "Media_activityId_kind_idx" ON "Media"("activityId", "kind");

-- AddForeignKey
ALTER TABLE "ReservationSettings" ADD CONSTRAINT "ReservationSettings_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "ReservationSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationOverride" ADD CONSTRAINT "ReservationOverride_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "ReservationSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationCustomFieldDef" ADD CONSTRAINT "ReservationCustomFieldDef_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "ReservationSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationCustomFieldValue" ADD CONSTRAINT "ReservationCustomFieldValue_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationCustomFieldValue" ADD CONSTRAINT "ReservationCustomFieldValue_fieldDefId_fkey" FOREIGN KEY ("fieldDefId") REFERENCES "ReservationCustomFieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
