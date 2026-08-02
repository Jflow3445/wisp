CREATE TYPE "public"."delivery_offer_status" AS ENUM('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."driver_cash_transaction_status" AS ENUM('PENDING', 'CONFIRMED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."driver_cash_transaction_type" AS ENUM('CASH_COLLECTED', 'CASH_DEPOSITED', 'CASH_ADJUSTMENT', 'CASH_WRITEOFF');--> statement-breakpoint
CREATE TYPE "public"."driver_location_source" AS ENUM('FOREGROUND', 'BACKGROUND', 'OFFLINE_SYNC');--> statement-breakpoint
CREATE TYPE "public"."driver_shift_status" AS ENUM('STARTED', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('BICYCLE', 'MOTORBIKE', 'CAR', 'VAN', 'TRUCK');--> statement-breakpoint
CREATE TABLE "delivery_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"delivery_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"status" "delivery_offer_status" DEFAULT 'SENT' NOT NULL,
	"offered_earning_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'GHS' NOT NULL,
	"distance_to_pickup_metres" integer,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"rejection_reason" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "delivery_offers_delivery_driver_sent_uq" UNIQUE("delivery_id","driver_id","sent_at"),
	CONSTRAINT "delivery_offers_money_ck" CHECK ("delivery_offers"."offered_earning_minor" >= 0),
	CONSTRAINT "delivery_offers_currency_ck" CHECK ("delivery_offers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "delivery_offers_distance_ck" CHECK ("delivery_offers"."distance_to_pickup_metres" is null or "delivery_offers"."distance_to_pickup_metres" >= 0),
	CONSTRAINT "delivery_offers_expiry_ck" CHECK ("delivery_offers"."expires_at" > "delivery_offers"."sent_at"),
	CONSTRAINT "delivery_offers_response_ck" CHECK ("delivery_offers"."status" in ('SENT', 'EXPIRED', 'CANCELLED')
          or "delivery_offers"."responded_at" is not null),
	CONSTRAINT "delivery_offers_version_positive_ck" CHECK ("delivery_offers"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "driver_cash_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"delivery_id" uuid,
	"type" "driver_cash_transaction_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'GHS' NOT NULL,
	"status" "driver_cash_transaction_status" DEFAULT 'PENDING' NOT NULL,
	"evidence_storage_key" varchar(1000),
	"reference" varchar(64),
	"reason" text,
	"offline_event_id" uuid,
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_cash_transactions_driver_key_uq" UNIQUE("driver_id","idempotency_key"),
	CONSTRAINT "driver_cash_transactions_amount_ck" CHECK ("driver_cash_transactions"."amount_minor" > 0),
	CONSTRAINT "driver_cash_transactions_currency_ck" CHECK ("driver_cash_transactions"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "driver_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"storage_key" varchar(1000) NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"document_number" varchar(150),
	"issued_at" date,
	"expires_at" date,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_documents_driver_type_storage_uq" UNIQUE("driver_id","document_type","storage_key"),
	CONSTRAINT "driver_documents_status_ck" CHECK ("driver_documents"."status" in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
	CONSTRAINT "driver_documents_expiry_ck" CHECK ("driver_documents"."expires_at" is null or "driver_documents"."issued_at" is null or "driver_documents"."expires_at" >= "driver_documents"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "driver_emergency_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"delivery_id" uuid,
	"emergency_type" varchar(100) NOT NULL,
	"message" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_emergency_events_status_ck" CHECK ("driver_emergency_events"."status" in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED')),
	CONSTRAINT "driver_emergency_events_latitude_ck" CHECK ("driver_emergency_events"."latitude" is null or "driver_emergency_events"."latitude" between -90 and 90),
	CONSTRAINT "driver_emergency_events_longitude_ck" CHECK ("driver_emergency_events"."longitude" is null or "driver_emergency_events"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "driver_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"delivery_id" uuid,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"accuracy_metres" numeric(10, 2),
	"heading_degrees" numeric(6, 2),
	"speed_metres_second" numeric(8, 3),
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "driver_location_source" NOT NULL,
	"offline_event_id" uuid,
	CONSTRAINT "driver_locations_latitude_ck" CHECK ("driver_locations"."latitude" between -90 and 90),
	CONSTRAINT "driver_locations_longitude_ck" CHECK ("driver_locations"."longitude" between -180 and 180),
	CONSTRAINT "driver_locations_accuracy_ck" CHECK ("driver_locations"."accuracy_metres" is null or "driver_locations"."accuracy_metres" >= 0),
	CONSTRAINT "driver_locations_heading_ck" CHECK ("driver_locations"."heading_degrees" is null or "driver_locations"."heading_degrees" between 0 and 360),
	CONSTRAINT "driver_locations_speed_ck" CHECK ("driver_locations"."speed_metres_second" is null or "driver_locations"."speed_metres_second" >= 0),
	CONSTRAINT "driver_locations_received_ck" CHECK ("driver_locations"."received_at" >= "driver_locations"."recorded_at" - interval '5 minutes')
);
--> statement-breakpoint
CREATE TABLE "driver_payout_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"provider_type" varchar(32) NOT NULL,
	"provider_name" varchar(100) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"account_identifier_encrypted" text NOT NULL,
	"masked_identifier" varchar(64) NOT NULL,
	"country_code" char(2) DEFAULT 'GH' NOT NULL,
	"currency" char(3) DEFAULT 'GHS' NOT NULL,
	"verification_status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"verified_at" timestamp with time zone,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"cooling_off_until" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_payout_accounts_provider_type_ck" CHECK ("driver_payout_accounts"."provider_type" in ('BANK', 'MOBILE_MONEY')),
	CONSTRAINT "driver_payout_accounts_country_code_ck" CHECK ("driver_payout_accounts"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "driver_payout_accounts_currency_ck" CHECK ("driver_payout_accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "driver_payout_accounts_verification_status_ck" CHECK ("driver_payout_accounts"."verification_status" in ('PENDING', 'VERIFIED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "driver_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"status" "driver_status" DEFAULT 'DRAFT' NOT NULL,
	"profile_photo_storage_key" varchar(1000),
	"home_region" varchar(100),
	"emergency_contact_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cash_limit_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'GHS' NOT NULL,
	"approved_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "driver_profiles_user_id_uq" UNIQUE("user_id"),
	CONSTRAINT "driver_profiles_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "driver_profiles_cash_limit_ck" CHECK ("driver_profiles"."cash_limit_minor" >= 0),
	CONSTRAINT "driver_profiles_currency_ck" CHECK ("driver_profiles"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "driver_profiles_version_positive_ck" CHECK ("driver_profiles"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "driver_safety_incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"delivery_id" uuid,
	"incident_type" varchar(100) NOT NULL,
	"severity" varchar(16) DEFAULT 'MEDIUM' NOT NULL,
	"description" text NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"evidence_storage_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_safety_incidents_severity_ck" CHECK ("driver_safety_incidents"."severity" in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
	CONSTRAINT "driver_safety_incidents_status_ck" CHECK ("driver_safety_incidents"."status" in ('OPEN', 'TRIAGED', 'RESOLVED', 'CLOSED')),
	CONSTRAINT "driver_safety_incidents_latitude_ck" CHECK ("driver_safety_incidents"."latitude" is null or "driver_safety_incidents"."latitude" between -90 and 90),
	CONSTRAINT "driver_safety_incidents_longitude_ck" CHECK ("driver_safety_incidents"."longitude" is null or "driver_safety_incidents"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "driver_shifts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"service_zone_id" uuid NOT NULL,
	"status" "driver_shift_status" DEFAULT 'STARTED' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"start_check_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "driver_shifts_window_ck" CHECK ("driver_shifts"."ended_at" is null or "driver_shifts"."ended_at" >= "driver_shifts"."started_at"),
	CONSTRAINT "driver_shifts_pause_ck" CHECK ("driver_shifts"."status" <> 'PAUSED' or "driver_shifts"."paused_at" is not null),
	CONSTRAINT "driver_shifts_version_positive_ck" CHECK ("driver_shifts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"registration_number" varchar(64),
	"make" varchar(100),
	"model" varchar(100),
	"colour" varchar(64),
	"capacity_weight_kg" numeric(12, 3),
	"capacity_volume_m3" numeric(12, 4),
	"status" "vehicle_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "vehicles_capacity_ck" CHECK (("vehicles"."capacity_weight_kg" is null or "vehicles"."capacity_weight_kg" > 0)
          and ("vehicles"."capacity_volume_m3" is null or "vehicles"."capacity_volume_m3" > 0)),
	CONSTRAINT "vehicles_version_positive_ck" CHECK ("vehicles"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "driver_id" uuid;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "driver_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_cash_transactions" ADD CONSTRAINT "driver_cash_transactions_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_cash_transactions" ADD CONSTRAINT "driver_cash_transactions_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_emergency_events" ADD CONSTRAINT "driver_emergency_events_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_emergency_events" ADD CONSTRAINT "driver_emergency_events_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payout_accounts" ADD CONSTRAINT "driver_payout_accounts_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payout_accounts" ADD CONSTRAINT "driver_payout_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_safety_incidents" ADD CONSTRAINT "driver_safety_incidents_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_safety_incidents" ADD CONSTRAINT "driver_safety_incidents_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_shifts" ADD CONSTRAINT "driver_shifts_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_shifts" ADD CONSTRAINT "driver_shifts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_shifts" ADD CONSTRAINT "driver_shifts_service_zone_id_service_zones_id_fk" FOREIGN KEY ("service_zone_id") REFERENCES "public"."service_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_offers_driver_status_idx" ON "delivery_offers" USING btree ("driver_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "delivery_offers_delivery_status_idx" ON "delivery_offers" USING btree ("delivery_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_cash_transactions_offline_event_uidx" ON "driver_cash_transactions" USING btree ("driver_id","offline_event_id") WHERE "driver_cash_transactions"."offline_event_id" is not null;--> statement-breakpoint
CREATE INDEX "driver_cash_transactions_driver_created_idx" ON "driver_cash_transactions" USING btree ("driver_id","created_at");--> statement-breakpoint
CREATE INDEX "driver_cash_transactions_delivery_idx" ON "driver_cash_transactions" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "driver_documents_driver_status_idx" ON "driver_documents" USING btree ("driver_id","status");--> statement-breakpoint
CREATE INDEX "driver_emergency_events_driver_created_idx" ON "driver_emergency_events" USING btree ("driver_id","created_at");--> statement-breakpoint
CREATE INDEX "driver_emergency_events_status_idx" ON "driver_emergency_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "driver_locations_driver_recorded_idx" ON "driver_locations" USING btree ("driver_id","recorded_at");--> statement-breakpoint
CREATE INDEX "driver_locations_delivery_recorded_idx" ON "driver_locations" USING btree ("delivery_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_locations_offline_event_uidx" ON "driver_locations" USING btree ("driver_id","offline_event_id") WHERE "driver_locations"."offline_event_id" is not null;--> statement-breakpoint
CREATE INDEX "driver_payout_accounts_driver_idx" ON "driver_payout_accounts" USING btree ("driver_id","archived_at");--> statement-breakpoint
CREATE INDEX "driver_profiles_status_idx" ON "driver_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "driver_profiles_created_at_idx" ON "driver_profiles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "driver_safety_incidents_driver_created_idx" ON "driver_safety_incidents" USING btree ("driver_id","created_at");--> statement-breakpoint
CREATE INDEX "driver_safety_incidents_status_idx" ON "driver_safety_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "driver_shifts_driver_started_idx" ON "driver_shifts" USING btree ("driver_id","started_at");--> statement-breakpoint
CREATE INDEX "driver_shifts_zone_status_idx" ON "driver_shifts" USING btree ("service_zone_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_shifts_one_active_uidx" ON "driver_shifts" USING btree ("driver_id") WHERE "driver_shifts"."status" <> 'ENDED';--> statement-breakpoint
CREATE INDEX "vehicles_driver_status_idx" ON "vehicles" USING btree ("driver_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_registration_uidx" ON "vehicles" USING btree ("registration_number") WHERE "vehicles"."registration_number" is not null;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_driver_profile_status_idx" ON "deliveries" USING btree ("driver_id","status");--> statement-breakpoint
CREATE INDEX "ledger_entries_driver_created_idx" ON "ledger_entries" USING btree ("driver_id","created_at");