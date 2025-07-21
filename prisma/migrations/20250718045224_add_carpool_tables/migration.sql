-- CreateEnum
CREATE TYPE "CarpoolDriverStatus" AS ENUM ('PENDING', 'VERIFIED', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CarpoolTripStatus" AS ENUM ('SCHEDULED', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CarpoolBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "is_banned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "carpool_drivers" (
    "id" TEXT NOT NULL,
    "cin" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_cin_verified" BOOLEAN NOT NULL DEFAULT false,
    "cin_photo_url" TEXT,
    "account_status" "CarpoolDriverStatus" NOT NULL DEFAULT 'PENDING',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "car_model" TEXT,
    "license_plate" TEXT,
    "total_seats" INTEGER,
    "last_login_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carpool_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carpool_trips" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "start_latitude" DOUBLE PRECISION NOT NULL,
    "start_longitude" DOUBLE PRECISION NOT NULL,
    "start_address" TEXT,
    "end_latitude" DOUBLE PRECISION NOT NULL,
    "end_longitude" DOUBLE PRECISION NOT NULL,
    "end_address" TEXT,
    "departure_time" TIMESTAMP(3) NOT NULL,
    "estimated_duration" INTEGER,
    "available_seats" INTEGER NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "price_per_seat" DECIMAL(10,2) NOT NULL,
    "status" "CarpoolTripStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carpool_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carpool_bookings" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "passenger_name" TEXT NOT NULL,
    "passenger_phone" TEXT NOT NULL,
    "seats_booked" INTEGER NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "status" "CarpoolBookingStatus" NOT NULL DEFAULT 'PENDING',
    "payment_method" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "verification_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carpool_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "license_plate" TEXT NOT NULL,
    "departure_station_id" TEXT NOT NULL,
    "destination_station_id" TEXT NOT NULL,
    "destination_name" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "seats_booked" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carpool_drivers_cin_key" ON "carpool_drivers"("cin");

-- CreateIndex
CREATE UNIQUE INDEX "carpool_drivers_phone_number_key" ON "carpool_drivers"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "carpool_drivers_license_plate_key" ON "carpool_drivers"("license_plate");

-- CreateIndex
CREATE UNIQUE INDEX "carpool_bookings_verification_code_key" ON "carpool_bookings"("verification_code");

-- AddForeignKey
ALTER TABLE "carpool_trips" ADD CONSTRAINT "carpool_trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "carpool_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carpool_bookings" ADD CONSTRAINT "carpool_bookings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "carpool_trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carpool_bookings" ADD CONSTRAINT "carpool_bookings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "carpool_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_departure_station_id_fkey" FOREIGN KEY ("departure_station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_station_id_fkey" FOREIGN KEY ("destination_station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
