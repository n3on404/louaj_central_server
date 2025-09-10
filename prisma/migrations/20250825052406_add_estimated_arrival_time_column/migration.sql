/*
  Warnings:

  - You are about to drop the `carpool_bookings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `carpool_drivers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `carpool_trips` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "public"."BookingStatus" ADD VALUE 'COMPLETED';

-- DropForeignKey
ALTER TABLE "public"."carpool_bookings" DROP CONSTRAINT "carpool_bookings_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."carpool_bookings" DROP CONSTRAINT "carpool_bookings_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."carpool_trips" DROP CONSTRAINT "carpool_trips_driver_id_fkey";

-- AlterTable
ALTER TABLE "public"."bookings" ADD COLUMN     "estimated_arrival_time" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "public"."carpool_bookings";

-- DropTable
DROP TABLE "public"."carpool_drivers";

-- DropTable
DROP TABLE "public"."carpool_trips";

-- DropEnum
DROP TYPE "public"."CarpoolBookingStatus";

-- DropEnum
DROP TYPE "public"."CarpoolDriverStatus";

-- DropEnum
DROP TYPE "public"."CarpoolTripStatus";
