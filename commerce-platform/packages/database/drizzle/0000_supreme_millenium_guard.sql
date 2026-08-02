CREATE TYPE "public"."actor_type" AS ENUM('USER', 'SYSTEM', 'PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."brand_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."category_status" AS ENUM('ACTIVE', 'ARCHIVED', 'RESTRICTED');--> statement-breakpoint
CREATE TYPE "public"."checkout_status" AS ENUM('CREATED', 'VALIDATING', 'READY', 'PAYMENT_PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'REVIEW_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('EMAIL', 'PHONE');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('PLATFORM', 'VENDOR', 'PICKUP', 'THIRD_PARTY');--> statement-breakpoint
CREATE TYPE "public"."delivery_quote_status" AS ENUM('ACTIVE', 'ACCEPTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('CREATED', 'AWAITING_ASSIGNMENT', 'OFFER_SENT', 'DRIVER_ASSIGNED', 'DRIVER_ACCEPTED', 'TRAVELLING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKUP_VERIFIED', 'IN_TRANSIT', 'ARRIVED_AT_CUSTOMER', 'COMPLETED', 'FAILED', 'RETURN_REQUIRED', 'RETURNING_TO_VENDOR', 'RETURNED_TO_VENDOR', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('INITIAL', 'RESTOCK', 'ADJUSTMENT', 'RESERVATION', 'RESERVATION_RELEASE', 'SALE', 'RETURN', 'DAMAGE', 'EXPIRY', 'TRANSFER_OUT', 'TRANSFER_IN', 'COUNT_CORRECTION');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_status" AS ENUM('ACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."ledger_owner_type" AS ENUM('PLATFORM', 'VENDOR', 'DRIVER', 'TAX_AUTHORITY', 'PAYMENT_PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_status" AS ENUM('PENDING', 'POSTED');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('ACTIVE', 'CANCELLED', 'RETURNED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."parent_order_status" AS ENUM('DRAFT', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'PARTIALLY_ACCEPTED', 'PROCESSING', 'PARTIALLY_FULFILLED', 'COMPLETED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'INITIALISED', 'PENDING', 'ACTION_REQUIRED', 'SUCCESSFUL', 'FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'UNDER_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."permission_risk" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."permission_scope" AS ENUM('GLOBAL', 'COUNTRY', 'REGION', 'VENDOR', 'STORE', 'SELF', 'ASSIGNED_RECORDS');--> statement-breakpoint
CREATE TYPE "public"."product_condition" AS ENUM('NEW', 'USED', 'REFURBISHED');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."stock_location_status" AS ENUM('ACTIVE', 'PAUSED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."stock_location_type" AS ENUM('STORE', 'WAREHOUSE', 'DARK_STORE');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('ACTIVE', 'PAUSED', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('PENDING_VERIFICATION', 'ACTIVE', 'RESTRICTED', 'SUSPENDED', 'DEACTIVATED', 'DELETION_PENDING', 'ANONYMISED');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."vendor_application_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."vendor_order_status" AS ENUM('AWAITING_VENDOR_RESPONSE', 'ACCEPTED', 'REJECTED', 'PREPARING', 'READY_FOR_PICKUP', 'HANDED_TO_DRIVER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."webhook_processing_status" AS ENUM('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" varchar(150) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid,
	"request_id" uuid,
	"reason" text,
	"before_data" jsonb,
	"after_data" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" varchar(128),
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_ck" CHECK (("audit_logs"."actor_type" = 'USER' and "audit_logs"."actor_user_id" is not null)
          or ("audit_logs"."actor_type" <> 'USER' and "audit_logs"."actor_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"logo_storage_key" varchar(1000),
	"verification_status" varchar(16) DEFAULT 'UNVERIFIED' NOT NULL,
	"status" "brand_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_uq" UNIQUE("slug"),
	CONSTRAINT "brands_verification_status_ck" CHECK ("brands"."verification_status" in ('UNVERIFIED', 'VERIFIED'))
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"vendor_offer_id" uuid NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"unit_price_snapshot_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"saved_for_later" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_offer_saved_uq" UNIQUE("cart_id","vendor_offer_id","saved_for_later"),
	CONSTRAINT "cart_items_quantity_positive_ck" CHECK ("cart_items"."quantity" > 0),
	CONSTRAINT "cart_items_price_nonnegative_ck" CHECK ("cart_items"."unit_price_snapshot_minor" >= 0),
	CONSTRAINT "cart_items_currency_ck" CHECK ("cart_items"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"guest_token_hash" varchar(128),
	"currency" char(3) DEFAULT 'GHS' NOT NULL,
	"status" "cart_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "carts_owner_ck" CHECK (("carts"."user_id" is not null)::integer + ("carts"."guest_token_hash" is not null)::integer = 1),
	CONSTRAINT "carts_currency_ck" CHECK ("carts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "carts_version_positive_ck" CHECK ("carts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"image_storage_key" varchar(1000),
	"status" "category_status" DEFAULT 'ACTIVE' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"seo_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "categories_slug_uq" UNIQUE("slug"),
	CONSTRAINT "categories_not_own_parent_ck" CHECK ("categories"."parent_id" is null or "categories"."parent_id" <> "categories"."id"),
	CONSTRAINT "categories_version_positive_ck" CHECK ("categories"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"user_id" uuid,
	"cart_id" uuid NOT NULL,
	"status" "checkout_status" DEFAULT 'CREATED' NOT NULL,
	"currency" char(3) DEFAULT 'GHS' NOT NULL,
	"contact_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"address_data" jsonb,
	"pricing_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_snapshot" jsonb,
	"promotion_snapshot" jsonb,
	"payment_method_type" varchar(64),
	"idempotency_actor" varchar(255) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "checkout_sessions_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "checkout_sessions_actor_idempotency_uq" UNIQUE("idempotency_actor","idempotency_key"),
	CONSTRAINT "checkout_sessions_currency_ck" CHECK ("checkout_sessions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "checkout_sessions_expiry_ck" CHECK ("checkout_sessions"."expires_at" > "checkout_sessions"."created_at"),
	CONSTRAINT "checkout_sessions_version_positive_ck" CHECK ("checkout_sessions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "checkout_vendor_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_session_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"items_snapshot" jsonb NOT NULL,
	"delivery_option_code" varchar(64),
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"delivery_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_vendor_groups_checkout_vendor_store_uq" UNIQUE("checkout_session_id","vendor_id","store_id"),
	CONSTRAINT "checkout_vendor_groups_money_ck" CHECK ("checkout_vendor_groups"."subtotal_minor" >= 0 and "checkout_vendor_groups"."discount_minor" >= 0 and "checkout_vendor_groups"."delivery_minor" >= 0
          and "checkout_vendor_groups"."tax_minor" >= 0 and "checkout_vendor_groups"."total_minor" >= 0
          and "checkout_vendor_groups"."total_minor" = "checkout_vendor_groups"."subtotal_minor" - "checkout_vendor_groups"."discount_minor"
              + "checkout_vendor_groups"."delivery_minor" + "checkout_vendor_groups"."tax_minor")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"vendor_order_id" uuid NOT NULL,
	"delivery_quote_id" uuid,
	"delivery_method" "delivery_method" NOT NULL,
	"status" "delivery_status" DEFAULT 'CREATED' NOT NULL,
	"service_zone_id" uuid,
	"assigned_driver_user_id" uuid,
	"external_provider" varchar(100),
	"external_reference" varchar(255),
	"pickup_snapshot" jsonb NOT NULL,
	"dropoff_snapshot" jsonb NOT NULL,
	"delivery_fee_minor" bigint NOT NULL,
	"driver_earning_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"delivery_code_hash" varchar(255),
	"estimated_pickup_at" timestamp with time zone,
	"estimated_delivery_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "deliveries_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "deliveries_vendor_order_uq" UNIQUE("vendor_order_id"),
	CONSTRAINT "deliveries_money_ck" CHECK ("deliveries"."delivery_fee_minor" >= 0 and "deliveries"."driver_earning_minor" >= 0
          and "deliveries"."driver_earning_minor" <= "deliveries"."delivery_fee_minor"),
	CONSTRAINT "deliveries_currency_ck" CHECK ("deliveries"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "deliveries_estimate_window_ck" CHECK ("deliveries"."estimated_delivery_at" is null or "deliveries"."estimated_pickup_at" is null
          or "deliveries"."estimated_delivery_at" >= "deliveries"."estimated_pickup_at"),
	CONSTRAINT "deliveries_version_positive_ck" CHECK ("deliveries"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_vendor_group_id" uuid,
	"vendor_order_id" uuid,
	"service_zone_id" uuid,
	"pickup_location" jsonb NOT NULL,
	"dropoff_location" jsonb NOT NULL,
	"distance_metres" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"fee_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"rate_rule_snapshot" jsonb NOT NULL,
	"status" "delivery_quote_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_quotes_owner_ck" CHECK (("delivery_quotes"."checkout_vendor_group_id" is not null)::integer + ("delivery_quotes"."vendor_order_id" is not null)::integer = 1),
	CONSTRAINT "delivery_quotes_distance_duration_ck" CHECK ("delivery_quotes"."distance_metres" >= 0 and "delivery_quotes"."duration_seconds" >= 0),
	CONSTRAINT "delivery_quotes_fee_ck" CHECK ("delivery_quotes"."fee_minor" >= 0),
	CONSTRAINT "delivery_quotes_currency_ck" CHECK ("delivery_quotes"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "delivery_quotes_expiry_ck" CHECK ("delivery_quotes"."expires_at" > "delivery_quotes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "delivery_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"delivery_id" uuid NOT NULL,
	"previous_status" "delivery_status",
	"new_status" "delivery_status" NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"reason_code" varchar(100),
	"reason_text" text,
	"request_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_status_history_request_idempotency_uq" UNIQUE("request_id","idempotency_key"),
	CONSTRAINT "delivery_status_history_actor_ck" CHECK (("delivery_status_history"."actor_type" = 'USER' and "delivery_status_history"."actor_user_id" is not null)
          or ("delivery_status_history"."actor_type" <> 'USER' and "delivery_status_history"."actor_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"actor_key" varchar(255) NOT NULL,
	"scope" varchar(100) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"state" varchar(16) DEFAULT 'PROCESSING' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"resource_type" varchar(100),
	"resource_id" uuid,
	"locked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_actor_scope_key_uq" UNIQUE("actor_key","scope","idempotency_key"),
	CONSTRAINT "idempotency_records_request_hash_ck" CHECK ("idempotency_records"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "idempotency_records_state_ck" CHECK ("idempotency_records"."state" in ('PROCESSING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "idempotency_records_response_ck" CHECK ("idempotency_records"."state" <> 'COMPLETED' or "idempotency_records"."response_status" between 100 and 599),
	CONSTRAINT "idempotency_records_expiry_ck" CHECK ("idempotency_records"."expires_at" > "idempotency_records"."created_at")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_offer_id" uuid NOT NULL,
	"stock_location_id" uuid NOT NULL,
	"physical_quantity" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"reserved_quantity" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"damaged_quantity" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"safety_quantity" numeric(18, 6) DEFAULT '0.000000' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inventory_items_offer_location_uq" UNIQUE("vendor_offer_id","stock_location_id"),
	CONSTRAINT "inventory_items_quantities_nonnegative_ck" CHECK ("inventory_items"."physical_quantity" >= 0 and "inventory_items"."reserved_quantity" >= 0
          and "inventory_items"."damaged_quantity" >= 0 and "inventory_items"."safety_quantity" >= 0),
	CONSTRAINT "inventory_items_allocation_ck" CHECK ("inventory_items"."damaged_quantity" + "inventory_items"."safety_quantity" <= "inventory_items"."physical_quantity"
          and "inventory_items"."reserved_quantity" <= "inventory_items"."physical_quantity" - "inventory_items"."damaged_quantity" - "inventory_items"."safety_quantity"),
	CONSTRAINT "inventory_items_version_positive_ck" CHECK ("inventory_items"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"quantity_change" numeric(18, 6) NOT NULL,
	"physical_before" numeric(18, 6) NOT NULL,
	"physical_after" numeric(18, 6) NOT NULL,
	"reserved_before" numeric(18, 6) NOT NULL,
	"reserved_after" numeric(18, 6) NOT NULL,
	"reason_code" varchar(100) NOT NULL,
	"notes" text,
	"related_order_item_id" uuid,
	"related_reservation_id" uuid,
	"performed_by_user_id" uuid,
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_item_idempotency_uq" UNIQUE("inventory_item_id","idempotency_key"),
	CONSTRAINT "inventory_movements_change_nonzero_ck" CHECK ("inventory_movements"."quantity_change" <> 0),
	CONSTRAINT "inventory_movements_snapshots_nonnegative_ck" CHECK ("inventory_movements"."physical_before" >= 0 and "inventory_movements"."physical_after" >= 0
          and "inventory_movements"."reserved_before" >= 0 and "inventory_movements"."reserved_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"account_type" "ledger_account_type" NOT NULL,
	"owner_type" "ledger_owner_type" NOT NULL,
	"owner_id" uuid,
	"currency" char(3) NOT NULL,
	"status" "ledger_account_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "ledger_accounts_currency_ck" CHECK ("ledger_accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ledger_accounts_owner_ck" CHECK (("ledger_accounts"."owner_type" = 'PLATFORM' and "ledger_accounts"."owner_id" is null)
          or ("ledger_accounts"."owner_type" <> 'PLATFORM' and "ledger_accounts"."owner_id" is not null)),
	CONSTRAINT "ledger_accounts_closed_ck" CHECK (("ledger_accounts"."status" = 'ACTIVE' and "ledger_accounts"."closed_at" is null)
          or ("ledger_accounts"."status" = 'CLOSED' and "ledger_accounts"."closed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ledger_transaction_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"vendor_id" uuid,
	"order_id" uuid,
	"vendor_order_id" uuid,
	"payment_id" uuid,
	"delivery_id" uuid,
	"tax_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_positive_ck" CHECK ("ledger_entries"."amount_minor" > 0),
	CONSTRAINT "ledger_entries_currency_ck" CHECK ("ledger_entries"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"transaction_type" varchar(100) NOT NULL,
	"posting_template_code" varchar(100) NOT NULL,
	"source_entity_type" varchar(100) NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"source_event_id" varchar(255) NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "ledger_transaction_status" DEFAULT 'PENDING' NOT NULL,
	"description" text NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"reversal_of_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	CONSTRAINT "ledger_transactions_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "ledger_transactions_source_posting_uq" UNIQUE("source_event_id","posting_template_code"),
	CONSTRAINT "ledger_transactions_source_idempotency_uq" UNIQUE("source_entity_type","idempotency_key"),
	CONSTRAINT "ledger_transactions_currency_ck" CHECK ("ledger_transactions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ledger_transactions_posted_at_ck" CHECK (("ledger_transactions"."status" = 'PENDING' and "ledger_transactions"."posted_at" is null)
          or ("ledger_transactions"."status" = 'POSTED' and "ledger_transactions"."posted_at" is not null)),
	CONSTRAINT "ledger_transactions_not_self_reversal_ck" CHECK ("ledger_transactions"."reversal_of_transaction_id" is null or "ledger_transactions"."reversal_of_transaction_id" <> "ledger_transactions"."id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"vendor_order_id" uuid NOT NULL,
	"vendor_offer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"product_snapshot" jsonb NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"commission_rule_snapshot" jsonb NOT NULL,
	"return_policy_snapshot" jsonb NOT NULL,
	"status" "order_item_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive_ck" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_money_ck" CHECK ("order_items"."unit_price_minor" >= 0 and "order_items"."discount_minor" >= 0 and "order_items"."tax_minor" >= 0
          and "order_items"."line_total_minor" >= 0
          and "order_items"."line_total_minor" = ("order_items"."unit_price_minor" * "order_items"."quantity")::bigint
              - "order_items"."discount_minor" + "order_items"."tax_minor")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"vendor_order_id" uuid,
	"previous_status" varchar(64),
	"new_status" varchar(64) NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"reason_code" varchar(100),
	"reason_text" text,
	"request_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_status_history_request_idempotency_uq" UNIQUE("request_id","idempotency_key"),
	CONSTRAINT "order_status_history_entity_ck" CHECK (("order_status_history"."order_id" is not null)::integer + ("order_status_history"."vendor_order_id" is not null)::integer = 1),
	CONSTRAINT "order_status_history_actor_ck" CHECK (("order_status_history"."actor_type" = 'USER' and "order_status_history"."actor_user_id" is not null)
          or ("order_status_history"."actor_type" <> 'USER' and "order_status_history"."actor_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"user_id" uuid,
	"checkout_session_id" uuid NOT NULL,
	"status" "parent_order_status" DEFAULT 'DRAFT' NOT NULL,
	"currency" char(3) NOT NULL,
	"item_subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"delivery_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"service_fee_minor" bigint DEFAULT 0 NOT NULL,
	"grand_total_minor" bigint NOT NULL,
	"contact_snapshot" jsonb NOT NULL,
	"address_snapshot" jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "orders_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "orders_checkout_session_uq" UNIQUE("checkout_session_id"),
	CONSTRAINT "orders_currency_ck" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_money_ck" CHECK ("orders"."item_subtotal_minor" >= 0 and "orders"."discount_minor" >= 0 and "orders"."delivery_minor" >= 0
          and "orders"."tax_minor" >= 0 and "orders"."service_fee_minor" >= 0 and "orders"."grand_total_minor" >= 0
          and "orders"."grand_total_minor" = "orders"."item_subtotal_minor" - "orders"."discount_minor"
              + "orders"."delivery_minor" + "orders"."tax_minor" + "orders"."service_fee_minor"),
	CONSTRAINT "orders_version_positive_ck" CHECK ("orders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(150) NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(255),
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "outbox_events_aggregate_version_uq" UNIQUE("aggregate_type","aggregate_id","event_version"),
	CONSTRAINT "outbox_events_version_positive_ck" CHECK ("outbox_events"."event_version" > 0),
	CONSTRAINT "outbox_events_attempt_count_ck" CHECK ("outbox_events"."attempt_count" >= 0),
	CONSTRAINT "outbox_events_lock_ck" CHECK (("outbox_events"."locked_at" is null and "outbox_events"."locked_by" is null)
          or ("outbox_events"."locked_at" is not null and "outbox_events"."locked_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider_request_reference" varchar(255),
	"status" varchar(64) NOT NULL,
	"safe_request_data" jsonb,
	"safe_response_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_payment_number_uq" UNIQUE("payment_id","attempt_number"),
	CONSTRAINT "payment_attempts_number_positive_ck" CHECK ("payment_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_event_id" varchar(255) NOT NULL,
	"event_type" varchar(150) NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_sha256" char(64) NOT NULL,
	"processing_status" "webhook_processing_status" DEFAULT 'RECEIVED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_webhook_events_provider_event_uq" UNIQUE("provider","provider_event_id"),
	CONSTRAINT "payment_webhook_events_attempt_count_ck" CHECK ("payment_webhook_events"."attempt_count" >= 0),
	CONSTRAINT "payment_webhook_events_payload_sha256_ck" CHECK ("payment_webhook_events"."payload_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"checkout_session_id" uuid NOT NULL,
	"order_id" uuid,
	"user_id" uuid,
	"provider" varchar(64) NOT NULL,
	"provider_reference" varchar(255),
	"channel" varchar(64),
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"provider_fee_minor" bigint,
	"idempotency_actor" varchar(255) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"initialised_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_code" varchar(100),
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payments_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "payments_provider_actor_idempotency_uq" UNIQUE("provider","idempotency_actor","idempotency_key"),
	CONSTRAINT "payments_amount_positive_ck" CHECK ("payments"."amount_minor" > 0),
	CONSTRAINT "payments_provider_fee_ck" CHECK ("payments"."provider_fee_minor" is null or ("payments"."provider_fee_minor" >= 0 and "payments"."provider_fee_minor" <= "payments"."amount_minor")),
	CONSTRAINT "payments_currency_ck" CHECK ("payments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payments_version_positive_ck" CHECK ("payments"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(150) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"risk_level" "permission_risk" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_code_uq" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "platform_staff_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_country_code" char(2),
	"scope_region" varchar(100),
	"active_from" timestamp with time zone NOT NULL,
	"active_until" timestamp with time zone,
	"granted_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_staff_roles_active_window_ck" CHECK ("platform_staff_roles"."active_until" is null or "platform_staff_roles"."active_until" > "platform_staff_roles"."active_from")
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"storage_key" varchar(1000) NOT NULL,
	"media_type" varchar(16) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"alt_text" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_media_storage_key_uq" UNIQUE("storage_key"),
	CONSTRAINT "product_media_type_ck" CHECK ("product_media"."media_type" in ('IMAGE', 'VIDEO')),
	CONSTRAINT "product_media_sort_order_ck" CHECK ("product_media"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"name" varchar(500) NOT NULL,
	"sku_reference" varchar(150),
	"barcode" varchar(150),
	"weight_kg" numeric(12, 6),
	"length_cm" numeric(12, 4),
	"width_cm" numeric(12, 4),
	"height_cm" numeric(12, 4),
	"status" "variant_status" DEFAULT 'ACTIVE' NOT NULL,
	"attribute_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "product_variants_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "product_variants_dimensions_ck" CHECK (("product_variants"."weight_kg" is null or "product_variants"."weight_kg" > 0)
          and ("product_variants"."length_cm" is null or "product_variants"."length_cm" > 0)
          and ("product_variants"."width_cm" is null or "product_variants"."width_cm" > 0)
          and ("product_variants"."height_cm" is null or "product_variants"."height_cm" > 0)),
	CONSTRAINT "product_variants_version_positive_ck" CHECK ("product_variants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"submitted_by_vendor_id" uuid,
	"data" jsonb NOT NULL,
	"status" "product_status" NOT NULL,
	"moderator_user_id" uuid,
	"moderator_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_versions_product_number_uq" UNIQUE("product_id","version_number"),
	CONSTRAINT "product_versions_number_positive_ck" CHECK ("product_versions"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"name" varchar(500) NOT NULL,
	"slug" varchar(500) NOT NULL,
	"short_description" text,
	"description" text,
	"category_id" uuid NOT NULL,
	"brand_id" uuid,
	"manufacturer" varchar(255),
	"model_number" varchar(150),
	"country_of_origin" char(2),
	"condition" "product_condition" DEFAULT 'NEW' NOT NULL,
	"status" "product_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_vendor_id" uuid,
	"approved_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "products_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "products_slug_uq" UNIQUE("slug"),
	CONSTRAINT "products_version_positive_ck" CHECK ("products"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"scope_type" "permission_scope" NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_uq" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "service_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"country_code" char(2) DEFAULT 'GH' NOT NULL,
	"region" varchar(100),
	"geometry_geojson" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"operating_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "service_zones_country_code_ck" CHECK ("service_zones"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "service_zones_status_ck" CHECK ("service_zones"."status" in ('ACTIVE', 'PAUSED', 'ARCHIVED')),
	CONSTRAINT "service_zones_version_positive_ck" CHECK ("service_zones"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"store_id" uuid,
	"name" varchar(255) NOT NULL,
	"type" "stock_location_type" NOT NULL,
	"address_data" jsonb NOT NULL,
	"status" "stock_location_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "stock_locations_vendor_name_uq" UNIQUE("vendor_id","name"),
	CONSTRAINT "stock_locations_store_type_ck" CHECK ("stock_locations"."type" <> 'STORE' or "stock_locations"."store_id" is not null),
	CONSTRAINT "stock_locations_version_positive_ck" CHECK ("stock_locations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_session_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"status" "reservation_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "stock_reservations_checkout_inventory_uq" UNIQUE("checkout_session_id","inventory_item_id"),
	CONSTRAINT "stock_reservations_quantity_positive_ck" CHECK ("stock_reservations"."quantity" > 0),
	CONSTRAINT "stock_reservations_expiry_ck" CHECK ("stock_reservations"."expires_at" > "stock_reservations"."created_at"),
	CONSTRAINT "stock_reservations_terminal_timestamp_ck" CHECK (("stock_reservations"."status" = 'ACTIVE' and "stock_reservations"."consumed_at" is null and "stock_reservations"."released_at" is null)
          or ("stock_reservations"."status" = 'CONSUMED' and "stock_reservations"."consumed_at" is not null and "stock_reservations"."released_at" is null)
          or ("stock_reservations"."status" in ('RELEASED', 'EXPIRED') and "stock_reservations"."released_at" is not null
              and "stock_reservations"."consumed_at" is null)),
	CONSTRAINT "stock_reservations_version_positive_ck" CHECK ("stock_reservations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "store_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"is_closed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "store_hours_store_day_uq" UNIQUE("store_id","day_of_week"),
	CONSTRAINT "store_hours_day_of_week_ck" CHECK ("store_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "store_hours_window_ck" CHECK (("store_hours"."is_closed" and "store_hours"."opens_at" is null and "store_hours"."closes_at" is null)
          or (not "store_hours"."is_closed" and "store_hours"."opens_at" is not null and "store_hours"."closes_at" is not null
              and "store_hours"."opens_at" < "store_hours"."closes_at"))
);
--> statement-breakpoint
CREATE TABLE "store_memberships" (
	"vendor_membership_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "store_memberships_pk" PRIMARY KEY("vendor_membership_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"status" "store_status" DEFAULT 'ACTIVE' NOT NULL,
	"phone" varchar(32),
	"email" varchar(320),
	"address_data" jsonb NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"service_zone_id" uuid,
	"preparation_minutes" integer DEFAULT 0 NOT NULL,
	"pickup_enabled" boolean DEFAULT false NOT NULL,
	"vendor_delivery_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "stores_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "stores_vendor_name_uq" UNIQUE("vendor_id","name"),
	CONSTRAINT "stores_latitude_ck" CHECK ("stores"."latitude" between -90 and 90),
	CONSTRAINT "stores_longitude_ck" CHECK ("stores"."longitude" between -180 and 180),
	CONSTRAINT "stores_preparation_minutes_ck" CHECK ("stores"."preparation_minutes" >= 0),
	CONSTRAINT "stores_version_positive_ck" CHECK ("stores"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient_name" varchar(200) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"country_code" char(2) DEFAULT 'GH' NOT NULL,
	"region" varchar(100) NOT NULL,
	"district" varchar(100),
	"city" varchar(100) NOT NULL,
	"locality" varchar(150),
	"street_address" varchar(255),
	"building" varchar(150),
	"unit" varchar(100),
	"digital_address" varchar(32),
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"landmark" varchar(500) NOT NULL,
	"delivery_instructions" varchar(500),
	"address_type" varchar(16) NOT NULL,
	"label" varchar(100),
	"is_default" boolean DEFAULT false NOT NULL,
	"last_validated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_addresses_country_code_ck" CHECK ("user_addresses"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "user_addresses_latitude_ck" CHECK ("user_addresses"."latitude" between -90 and 90),
	CONSTRAINT "user_addresses_longitude_ck" CHECK ("user_addresses"."longitude" between -180 and 180),
	CONSTRAINT "user_addresses_type_ck" CHECK ("user_addresses"."address_type" in ('HOME', 'WORK', 'OTHER')),
	CONSTRAINT "user_addresses_version_positive_ck" CHECK ("user_addresses"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "contact_type" NOT NULL,
	"value" varchar(320) NOT NULL,
	"normalized_value" varchar(320) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_contacts_type_normalized_uq" UNIQUE("type","normalized_value")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"display_name" varchar(150),
	"date_of_birth" date,
	"avatar_storage_key" varchar(1000),
	"country_code" char(2),
	"deleted_personal_data_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identity_provider_subject" varchar(255) NOT NULL,
	"status" "user_status" NOT NULL,
	"primary_email" varchar(320),
	"primary_phone" varchar(32),
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"preferred_locale" varchar(16) DEFAULT 'en-GH' NOT NULL,
	"preferred_timezone" varchar(64) DEFAULT 'Africa/Accra' NOT NULL,
	"last_login_at" timestamp with time zone,
	"risk_level" varchar(32) DEFAULT 'NORMAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "users_identity_provider_subject_uq" UNIQUE("identity_provider_subject"),
	CONSTRAINT "users_version_positive_ck" CHECK ("users"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"status" "vendor_application_status" DEFAULT 'DRAFT' NOT NULL,
	"assigned_reviewer_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"decision_at" timestamp with time zone,
	"decision_by_user_id" uuid,
	"decision_reason" text,
	"application_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "vendor_applications_version_positive_ck" CHECK ("vendor_applications"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_membership_roles" (
	"vendor_membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "vendor_membership_roles_pk" PRIMARY KEY("vendor_membership_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "vendor_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'INVITED' NOT NULL,
	"invited_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "vendor_memberships_vendor_user_uq" UNIQUE("vendor_id","user_id"),
	CONSTRAINT "vendor_memberships_version_positive_ck" CHECK ("vendor_memberships"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"product_variant_id" uuid NOT NULL,
	"vendor_sku" varchar(150) NOT NULL,
	"status" "offer_status" DEFAULT 'DRAFT' NOT NULL,
	"price_minor" bigint NOT NULL,
	"previous_price_minor" bigint,
	"cost_price_minor" bigint,
	"currency" char(3) DEFAULT 'GHS' NOT NULL,
	"minimum_quantity" numeric(18, 6) DEFAULT '1.000000' NOT NULL,
	"maximum_quantity" numeric(18, 6),
	"fulfilment_minutes" integer DEFAULT 0 NOT NULL,
	"warranty_data" jsonb,
	"return_policy_snapshot" jsonb,
	"available_from" timestamp with time zone,
	"available_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "vendor_offers_vendor_store_sku_uq" UNIQUE("vendor_id","store_id","vendor_sku"),
	CONSTRAINT "vendor_offers_store_variant_uq" UNIQUE("store_id","product_variant_id"),
	CONSTRAINT "vendor_offers_currency_ck" CHECK ("vendor_offers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "vendor_offers_money_nonnegative_ck" CHECK ("vendor_offers"."price_minor" >= 0
          and ("vendor_offers"."previous_price_minor" is null or "vendor_offers"."previous_price_minor" >= 0)
          and ("vendor_offers"."cost_price_minor" is null or "vendor_offers"."cost_price_minor" >= 0)),
	CONSTRAINT "vendor_offers_quantity_range_ck" CHECK ("vendor_offers"."minimum_quantity" > 0
          and ("vendor_offers"."maximum_quantity" is null or "vendor_offers"."maximum_quantity" >= "vendor_offers"."minimum_quantity")),
	CONSTRAINT "vendor_offers_fulfilment_minutes_ck" CHECK ("vendor_offers"."fulfilment_minutes" >= 0),
	CONSTRAINT "vendor_offers_availability_window_ck" CHECK ("vendor_offers"."available_until" is null or "vendor_offers"."available_from" is null
          or "vendor_offers"."available_until" > "vendor_offers"."available_from"),
	CONSTRAINT "vendor_offers_version_positive_ck" CHECK ("vendor_offers"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendor_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"order_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "vendor_order_status" DEFAULT 'AWAITING_VENDOR_RESPONSE' NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"delivery_minor" bigint DEFAULT 0 NOT NULL,
	"commission_minor" bigint DEFAULT 0 NOT NULL,
	"vendor_net_minor" bigint NOT NULL,
	"response_deadline_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "vendor_orders_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "vendor_orders_order_vendor_store_uq" UNIQUE("order_id","vendor_id","store_id"),
	CONSTRAINT "vendor_orders_id_order_uq" UNIQUE("id","order_id"),
	CONSTRAINT "vendor_orders_money_ck" CHECK ("vendor_orders"."subtotal_minor" >= 0 and "vendor_orders"."discount_minor" >= 0 and "vendor_orders"."tax_minor" >= 0
          and "vendor_orders"."delivery_minor" >= 0 and "vendor_orders"."commission_minor" >= 0 and "vendor_orders"."vendor_net_minor" >= 0
          and "vendor_orders"."vendor_net_minor" + "vendor_orders"."commission_minor"
              = "vendor_orders"."subtotal_minor" - "vendor_orders"."discount_minor" + "vendor_orders"."tax_minor"),
	CONSTRAINT "vendor_orders_version_positive_ck" CHECK ("vendor_orders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_reference" varchar(32) NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"trading_name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"business_registration_number" varchar(100),
	"tax_identifier" varchar(100),
	"country_code" char(2) DEFAULT 'GH' NOT NULL,
	"status" "vendor_status" DEFAULT 'DRAFT' NOT NULL,
	"verification_level" varchar(32) DEFAULT 'UNVERIFIED' NOT NULL,
	"logo_storage_key" varchar(1000),
	"cover_storage_key" varchar(1000),
	"approved_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "vendors_public_reference_uq" UNIQUE("public_reference"),
	CONSTRAINT "vendors_slug_uq" UNIQUE("slug"),
	CONSTRAINT "vendors_country_code_ck" CHECK ("vendors"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "vendors_version_positive_ck" CHECK ("vendors"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_vendor_groups" ADD CONSTRAINT "checkout_vendor_groups_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_vendor_groups" ADD CONSTRAINT "checkout_vendor_groups_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_vendor_groups" ADD CONSTRAINT "checkout_vendor_groups_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_vendor_order_id_vendor_orders_id_fk" FOREIGN KEY ("vendor_order_id") REFERENCES "public"."vendor_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delivery_quote_id_delivery_quotes_id_fk" FOREIGN KEY ("delivery_quote_id") REFERENCES "public"."delivery_quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_service_zone_id_service_zones_id_fk" FOREIGN KEY ("service_zone_id") REFERENCES "public"."service_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_assigned_driver_user_id_users_id_fk" FOREIGN KEY ("assigned_driver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_quotes" ADD CONSTRAINT "delivery_quotes_checkout_vendor_group_id_checkout_vendor_groups_id_fk" FOREIGN KEY ("checkout_vendor_group_id") REFERENCES "public"."checkout_vendor_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_quotes" ADD CONSTRAINT "delivery_quotes_vendor_order_id_vendor_orders_id_fk" FOREIGN KEY ("vendor_order_id") REFERENCES "public"."vendor_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_quotes" ADD CONSTRAINT "delivery_quotes_service_zone_id_service_zones_id_fk" FOREIGN KEY ("service_zone_id") REFERENCES "public"."service_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_stock_location_id_stock_locations_id_fk" FOREIGN KEY ("stock_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_related_order_item_id_order_items_id_fk" FOREIGN KEY ("related_order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_related_reservation_id_stock_reservations_id_fk" FOREIGN KEY ("related_reservation_id") REFERENCES "public"."stock_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_vendor_order_id_vendor_orders_id_fk" FOREIGN KEY ("vendor_order_id") REFERENCES "public"."vendor_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reversal_of_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("reversal_of_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_vendor_order_order_fk" FOREIGN KEY ("vendor_order_id","order_id") REFERENCES "public"."vendor_orders"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_vendor_order_id_vendor_orders_id_fk" FOREIGN KEY ("vendor_order_id") REFERENCES "public"."vendor_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_staff_roles" ADD CONSTRAINT "platform_staff_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_staff_roles" ADD CONSTRAINT "platform_staff_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_staff_roles" ADD CONSTRAINT "platform_staff_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_submitted_by_vendor_id_vendors_id_fk" FOREIGN KEY ("submitted_by_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_vendor_id_vendors_id_fk" FOREIGN KEY ("created_by_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_approved_version_id_product_versions_id_fk" FOREIGN KEY ("approved_version_id") REFERENCES "public"."product_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_vendor_membership_id_vendor_memberships_id_fk" FOREIGN KEY ("vendor_membership_id") REFERENCES "public"."vendor_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_service_zone_id_service_zones_id_fk" FOREIGN KEY ("service_zone_id") REFERENCES "public"."service_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_assigned_reviewer_user_id_users_id_fk" FOREIGN KEY ("assigned_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_decision_by_user_id_users_id_fk" FOREIGN KEY ("decision_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_membership_roles" ADD CONSTRAINT "vendor_membership_roles_vendor_membership_id_vendor_memberships_id_fk" FOREIGN KEY ("vendor_membership_id") REFERENCES "public"."vendor_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_membership_roles" ADD CONSTRAINT "vendor_membership_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_memberships" ADD CONSTRAINT "vendor_memberships_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_memberships" ADD CONSTRAINT "vendor_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_memberships" ADD CONSTRAINT "vendor_memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_created_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "cart_items_offer_idx" ON "cart_items" USING btree ("vendor_offer_id");--> statement-breakpoint
CREATE INDEX "carts_user_status_idx" ON "carts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "carts_guest_status_idx" ON "carts" USING btree ("guest_token_hash","status");--> statement-breakpoint
CREATE INDEX "categories_parent_status_idx" ON "categories" USING btree ("parent_id","status");--> statement-breakpoint
CREATE INDEX "checkout_sessions_user_status_idx" ON "checkout_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "checkout_sessions_expires_idx" ON "checkout_sessions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_external_reference_uidx" ON "deliveries" USING btree ("external_provider","external_reference") WHERE "deliveries"."external_reference" is not null;--> statement-breakpoint
CREATE INDEX "deliveries_status_created_idx" ON "deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "deliveries_driver_status_idx" ON "deliveries" USING btree ("assigned_driver_user_id","status");--> statement-breakpoint
CREATE INDEX "delivery_quotes_expiry_idx" ON "delivery_quotes" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "delivery_status_history_delivery_created_idx" ON "delivery_status_history" USING btree ("delivery_id","created_at");--> statement-breakpoint
CREATE INDEX "idempotency_records_expiry_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "inventory_items_location_idx" ON "inventory_items" USING btree ("stock_location_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_created_idx" ON "inventory_movements" USING btree ("inventory_item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_identity_uidx" ON "ledger_accounts" USING btree ("code","owner_type",coalesce("owner_id"::text, ''),"currency");--> statement-breakpoint
CREATE INDEX "ledger_accounts_owner_idx" ON "ledger_accounts" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("ledger_transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_created_idx" ON "ledger_entries" USING btree ("ledger_account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_vendor_created_idx" ON "ledger_entries" USING btree ("vendor_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_order_idx" ON "ledger_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_payment_idx" ON "ledger_entries" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_reversal_of_uidx" ON "ledger_transactions" USING btree ("reversal_of_transaction_id") WHERE "ledger_transactions"."reversal_of_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "ledger_transactions_source_idx" ON "ledger_transactions" USING btree ("source_entity_type","source_entity_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_status_created_idx" ON "ledger_transactions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_vendor_order_id_idx" ON "order_items" USING btree ("vendor_order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_created_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_status_history_vendor_order_created_idx" ON "order_status_history" USING btree ("vendor_order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_dispatch_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_processing_idx" ON "payment_webhook_events" USING btree ("processing_status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_uidx" ON "payments" USING btree ("provider","provider_reference") WHERE "payments"."provider_reference" is not null;--> statement-breakpoint
CREATE INDEX "payments_checkout_status_idx" ON "payments" USING btree ("checkout_session_id","status");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "platform_staff_roles_user_id_idx" ON "platform_staff_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_staff_roles_active_idx" ON "platform_staff_roles" USING btree ("user_id","active_from","active_until");--> statement-breakpoint
CREATE INDEX "product_media_product_sort_idx" ON "product_media" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_one_primary_uidx" ON "product_media" USING btree ("product_id","variant_id") WHERE "product_media"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_barcode_uidx" ON "product_variants" USING btree ("barcode") WHERE "product_variants"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "product_variants_product_status_idx" ON "product_variants" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "products_category_status_idx" ON "products" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_name_search_idx" ON "products" USING gin (to_tsvector('simple', "name"));--> statement-breakpoint
CREATE INDEX "service_zones_status_idx" ON "service_zones" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_locations_store_idx" ON "stock_locations" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_expiry_idx" ON "stock_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "stock_reservations_inventory_status_idx" ON "stock_reservations" USING btree ("inventory_item_id","status");--> statement-breakpoint
CREATE INDEX "stores_vendor_status_idx" ON "stores" USING btree ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_addresses_one_default_uidx" ON "user_addresses" USING btree ("user_id") WHERE "user_addresses"."is_default" and "user_addresses"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_contacts_one_primary_per_type_uidx" ON "user_contacts" USING btree ("user_id","type") WHERE "user_contacts"."is_primary";--> statement-breakpoint
CREATE INDEX "user_contacts_user_id_idx" ON "user_contacts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_primary_email_lower_uidx" ON "users" USING btree (lower("primary_email")) WHERE "users"."primary_email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_primary_phone_uidx" ON "users" USING btree ("primary_phone") WHERE "users"."primary_phone" is not null;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "vendor_applications_vendor_id_idx" ON "vendor_applications" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_applications_status_idx" ON "vendor_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendor_memberships_user_id_idx" ON "vendor_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vendor_offers_variant_status_idx" ON "vendor_offers" USING btree ("product_variant_id","status");--> statement-breakpoint
CREATE INDEX "vendor_offers_vendor_status_idx" ON "vendor_offers" USING btree ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "vendor_orders_vendor_status_idx" ON "vendor_orders" USING btree ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "vendor_orders_response_deadline_idx" ON "vendor_orders" USING btree ("status","response_deadline_at");--> statement-breakpoint
CREATE INDEX "vendors_status_idx" ON "vendors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendors_created_at_idx" ON "vendors" USING btree ("created_at");--> statement-breakpoint

-- Operational histories, audit records, and inventory movements are evidence.
-- Corrections are represented by new rows rather than mutation.
CREATE FUNCTION prevent_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER inventory_movements_append_only
	BEFORE UPDATE OR DELETE ON inventory_movements
	FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER order_status_history_append_only
	BEFORE UPDATE OR DELETE ON order_status_history
	FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER delivery_status_history_append_only
	BEFORE UPDATE OR DELETE ON delivery_status_history
	FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
	BEFORE UPDATE OR DELETE ON audit_logs
	FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();--> statement-breakpoint

-- Account identity is immutable. The sole permitted mutation is an ACTIVE to
-- CLOSED transition with a closure timestamp; closed accounts cannot reopen.
CREATE FUNCTION protect_ledger_account() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'ledger accounts cannot be deleted' USING ERRCODE = '55000';
	END IF;

	IF OLD.status = 'ACTIVE'
		AND NEW.status = 'CLOSED'
		AND NEW.closed_at IS NOT NULL
		AND OLD.id = NEW.id
		AND OLD.code = NEW.code
		AND OLD.name = NEW.name
		AND OLD.account_type = NEW.account_type
		AND OLD.owner_type = NEW.owner_type
		AND OLD.owner_id IS NOT DISTINCT FROM NEW.owner_id
		AND OLD.currency = NEW.currency
		AND OLD.created_at = NEW.created_at THEN
		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'ledger account identity is immutable; only account closure is permitted'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_accounts_immutable
	BEFORE UPDATE OR DELETE ON ledger_accounts
	FOR EACH ROW EXECUTE FUNCTION protect_ledger_account();--> statement-breakpoint

-- Journal identity is immutable. A pending journal may only transition once to
-- POSTED. A posted journal remains posted even when a separate reversal exists.
CREATE FUNCTION protect_ledger_transaction() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'ledger transactions cannot be deleted' USING ERRCODE = '55000';
	END IF;

	IF OLD.status = 'POSTED' THEN
		RAISE EXCEPTION 'posted ledger transactions are immutable' USING ERRCODE = '55000';
	END IF;

	IF NEW.status = 'POSTED'
		AND NEW.posted_at IS NOT NULL
		AND OLD.id = NEW.id
		AND OLD.public_reference = NEW.public_reference
		AND OLD.transaction_type = NEW.transaction_type
		AND OLD.posting_template_code = NEW.posting_template_code
		AND OLD.source_entity_type = NEW.source_entity_type
		AND OLD.source_entity_id = NEW.source_entity_id
		AND OLD.source_event_id = NEW.source_event_id
		AND OLD.currency = NEW.currency
		AND OLD.description = NEW.description
		AND OLD.idempotency_key = NEW.idempotency_key
		AND OLD.reversal_of_transaction_id IS NOT DISTINCT FROM NEW.reversal_of_transaction_id
		AND OLD.created_at = NEW.created_at THEN
		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'pending ledger transactions may only transition to POSTED'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_transactions_immutable
	BEFORE UPDATE OR DELETE ON ledger_transactions
	FOR EACH ROW EXECUTE FUNCTION protect_ledger_transaction();--> statement-breakpoint

-- Entry insertion locks the parent journal. This serializes construction with
-- posting and closes the race where a concurrent writer could add an entry
-- after another transaction validated the journal.
CREATE FUNCTION protect_ledger_entry() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	journal_status ledger_transaction_status;
BEGIN
	IF TG_OP <> 'INSERT' THEN
		RAISE EXCEPTION 'ledger entries are immutable' USING ERRCODE = '55000';
	END IF;

	SELECT status
	INTO journal_status
	FROM ledger_transactions
	WHERE id = NEW.ledger_transaction_id
	FOR UPDATE;

	IF journal_status IS NULL THEN
		RAISE EXCEPTION 'ledger transaction % does not exist', NEW.ledger_transaction_id
			USING ERRCODE = '23503';
	END IF;
	IF journal_status <> 'PENDING' THEN
		RAISE EXCEPTION 'entries can only be added to a pending ledger transaction'
			USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable
	BEFORE INSERT OR UPDATE OR DELETE ON ledger_entries
	FOR EACH ROW EXECUTE FUNCTION protect_ledger_entry();--> statement-breakpoint

-- PostgreSQL CHECK constraints cannot aggregate sibling rows. This function is
-- called by deferred constraint triggers and therefore evaluates the final
-- journal shape at transaction commit, after all entries have been inserted.
CREATE FUNCTION assert_ledger_transaction_balanced(transaction_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	journal_status ledger_transaction_status;
	journal_currency char(3);
	reversed_transaction_id uuid;
	reversed_transaction_status ledger_transaction_status;
	reversed_transaction_currency char(3);
	entry_count bigint;
	debit_total numeric;
	credit_total numeric;
	invalid_account_count bigint;
	reversal_difference_count bigint;
BEGIN
	SELECT status, currency, reversal_of_transaction_id
	INTO journal_status, journal_currency, reversed_transaction_id
	FROM ledger_transactions
	WHERE id = transaction_id;

	IF NOT FOUND OR journal_status <> 'POSTED' THEN
		RETURN;
	END IF;

	SELECT count(*),
		coalesce(sum(entry.amount_minor) FILTER (WHERE entry.direction = 'DEBIT'), 0),
		coalesce(sum(entry.amount_minor) FILTER (WHERE entry.direction = 'CREDIT'), 0),
		count(*) FILTER (
			WHERE account.id IS NULL
				OR account.status <> 'ACTIVE'
				OR account.currency <> journal_currency
				OR entry.currency <> journal_currency
		)
	INTO entry_count, debit_total, credit_total, invalid_account_count
	FROM ledger_entries entry
	LEFT JOIN ledger_accounts account ON account.id = entry.ledger_account_id
	WHERE entry.ledger_transaction_id = transaction_id;

	IF entry_count < 2 THEN
		RAISE EXCEPTION 'posted ledger transaction % must contain at least two entries', transaction_id
			USING ERRCODE = '23514';
	END IF;
	IF invalid_account_count <> 0 THEN
		RAISE EXCEPTION 'posted ledger transaction % contains an inactive, missing, or currency-mismatched account',
			transaction_id USING ERRCODE = '23514';
	END IF;
	IF debit_total <> credit_total THEN
		RAISE EXCEPTION 'posted ledger transaction % is unbalanced: debits %, credits %',
			transaction_id, debit_total, credit_total USING ERRCODE = '23514';
	END IF;

	IF reversed_transaction_id IS NULL THEN
		RETURN;
	END IF;

	SELECT status, currency
	INTO reversed_transaction_status, reversed_transaction_currency
	FROM ledger_transactions
	WHERE id = reversed_transaction_id;

	IF reversed_transaction_status IS DISTINCT FROM 'POSTED'
		OR reversed_transaction_currency IS DISTINCT FROM journal_currency THEN
		RAISE EXCEPTION 'reversal % must reference a posted journal in the same currency', transaction_id
			USING ERRCODE = '23514';
	END IF;

	SELECT count(*)
	INTO reversal_difference_count
	FROM (
		(
			SELECT ledger_account_id,
				CASE direction
					WHEN 'DEBIT' THEN 'CREDIT'::ledger_direction
					ELSE 'DEBIT'::ledger_direction
				END AS direction,
				vendor_id, order_id, vendor_order_id, payment_id, delivery_id, tax_code,
				sum(amount_minor) AS amount_minor
			FROM ledger_entries
			WHERE ledger_transaction_id = reversed_transaction_id
			GROUP BY ledger_account_id, direction, vendor_id, order_id, vendor_order_id,
				payment_id, delivery_id, tax_code
			EXCEPT
			SELECT ledger_account_id, direction, vendor_id, order_id, vendor_order_id,
				payment_id, delivery_id, tax_code, sum(amount_minor)
			FROM ledger_entries
			WHERE ledger_transaction_id = transaction_id
			GROUP BY ledger_account_id, direction, vendor_id, order_id, vendor_order_id,
				payment_id, delivery_id, tax_code
		)
		UNION ALL
		(
			SELECT ledger_account_id, direction, vendor_id, order_id, vendor_order_id,
				payment_id, delivery_id, tax_code, sum(amount_minor)
			FROM ledger_entries
			WHERE ledger_transaction_id = transaction_id
			GROUP BY ledger_account_id, direction, vendor_id, order_id, vendor_order_id,
				payment_id, delivery_id, tax_code
			EXCEPT
			SELECT ledger_account_id,
				CASE direction
					WHEN 'DEBIT' THEN 'CREDIT'::ledger_direction
					ELSE 'DEBIT'::ledger_direction
				END AS direction,
				vendor_id, order_id, vendor_order_id, payment_id, delivery_id, tax_code,
				sum(amount_minor)
			FROM ledger_entries
			WHERE ledger_transaction_id = reversed_transaction_id
			GROUP BY ledger_account_id, direction, vendor_id, order_id, vendor_order_id,
				payment_id, delivery_id, tax_code
		)
	) differences;

	IF reversal_difference_count <> 0 THEN
		RAISE EXCEPTION 'reversal % is not the complete dimensional inverse of journal %',
			transaction_id, reversed_transaction_id USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint

CREATE FUNCTION check_ledger_entry_constraint() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM assert_ledger_transaction_balanced(NEW.ledger_transaction_id);
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balance_at_commit
	AFTER INSERT ON ledger_entries
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION check_ledger_entry_constraint();--> statement-breakpoint

CREATE FUNCTION check_ledger_transaction_constraint() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM assert_ledger_transaction_balanced(NEW.id);
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_transactions_balance_at_commit
	AFTER INSERT OR UPDATE ON ledger_transactions
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION check_ledger_transaction_constraint();
