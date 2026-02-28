-- AlterTable: add accessibility fields to Establishment
ALTER TABLE "Establishment"
  ADD COLUMN "accessWheelchair" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accessToilets"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accessParking"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accessElevator"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accessLevelEntry" BOOLEAN NOT NULL DEFAULT false;
