-- AlterTable
ALTER TABLE "ReservationResource" ADD COLUMN "description" TEXT;
ALTER TABLE "ReservationResource" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "ReservationResource" ADD COLUMN "useCustomRules" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReservationResource" ADD COLUMN "minPartySizeOverride" INTEGER;
ALTER TABLE "ReservationResource" ADD COLUMN "maxPartySizeOverride" INTEGER;
ALTER TABLE "ReservationResource" ADD COLUMN "slotDurationMinutesOverride" INTEGER;
ALTER TABLE "ReservationResource" ADD COLUMN "bookingWindowDaysOverride" INTEGER;
