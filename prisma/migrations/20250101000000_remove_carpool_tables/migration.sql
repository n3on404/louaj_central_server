-- Remove carpool tables
DROP TABLE IF EXISTS "carpool_bookings";
DROP TABLE IF EXISTS "carpool_trips";
DROP TABLE IF EXISTS "carpool_drivers";

-- Drop the enums
DROP TYPE IF EXISTS "CarpoolDriverStatus";
DROP TYPE IF EXISTS "CarpoolTripStatus";
DROP TYPE IF EXISTS "CarpoolBookingStatus"; 