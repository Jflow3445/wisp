import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  actorTypeEnum,
  brandStatusEnum,
  cartStatusEnum,
  categoryStatusEnum,
  checkoutStatusEnum,
  contactTypeEnum,
  deliveryMethodEnum,
  deliveryOfferStatusEnum,
  deliveryQuoteStatusEnum,
  deliveryStatusEnum,
  driverCashTransactionStatusEnum,
  driverCashTransactionTypeEnum,
  driverLocationSourceEnum,
  driverShiftStatusEnum,
  driverStatusEnum,
  inventoryMovementTypeEnum,
  ledgerAccountStatusEnum,
  ledgerAccountTypeEnum,
  ledgerDirectionEnum,
  ledgerOwnerTypeEnum,
  ledgerTransactionStatusEnum,
  membershipStatusEnum,
  offerStatusEnum,
  orderItemStatusEnum,
  outboxStatusEnum,
  parentOrderStatusEnum,
  paymentStatusEnum,
  permissionRiskEnum,
  permissionScopeEnum,
  productConditionEnum,
  productStatusEnum,
  reservationStatusEnum,
  stockLocationStatusEnum,
  stockLocationTypeEnum,
  storeStatusEnum,
  userStatusEnum,
  variantStatusEnum,
  vehicleStatusEnum,
  vehicleTypeEnum,
  vendorApplicationStatusEnum,
  vendorOrderStatusEnum,
  vendorStatusEnum,
  webhookProcessingStatusEnum,
} from "./enums.js";

const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => bigint(name, { mode: "bigint" });
const quantity = (name: string) => numeric(name, { precision: 18, scale: 6 });
const currencyCheck = (column: AnyPgColumn) => sql`${column} ~ '^[A-Z]{3}$'`;

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    identityProviderSubject: varchar("identity_provider_subject", { length: 255 }).notNull(),
    status: userStatusEnum("status").notNull(),
    primaryEmail: varchar("primary_email", { length: 320 }),
    primaryPhone: varchar("primary_phone", { length: 32 }),
    emailVerifiedAt: timestampTz("email_verified_at"),
    phoneVerifiedAt: timestampTz("phone_verified_at"),
    preferredLocale: varchar("preferred_locale", { length: 16 }).default("en-GH").notNull(),
    preferredTimezone: varchar("preferred_timezone", { length: 64 })
      .default("Africa/Accra")
      .notNull(),
    lastLoginAt: timestampTz("last_login_at"),
    riskLevel: varchar("risk_level", { length: 32 }).default("NORMAL").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("users_identity_provider_subject_uq").on(table.identityProviderSubject),
    uniqueIndex("users_primary_email_lower_uidx")
      .on(sql`lower(${table.primaryEmail})`)
      .where(sql`${table.primaryEmail} is not null`),
    uniqueIndex("users_primary_phone_uidx")
      .on(table.primaryPhone)
      .where(sql`${table.primaryPhone} is not null`),
    index("users_status_idx").on(table.status),
    index("users_created_at_idx").on(table.createdAt),
    check("users_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 150 }),
  dateOfBirth: date("date_of_birth", { mode: "date" }),
  avatarStorageKey: varchar("avatar_storage_key", { length: 1000 }),
  countryCode: char("country_code", { length: 2 }),
  deletedPersonalDataAt: timestampTz("deleted_personal_data_at"),
});

export const userContacts = pgTable(
  "user_contacts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: contactTypeEnum("type").notNull(),
    value: varchar("value", { length: 320 }).notNull(),
    normalizedValue: varchar("normalized_value", { length: 320 }).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    verifiedAt: timestampTz("verified_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("user_contacts_type_normalized_uq").on(table.type, table.normalizedValue),
    uniqueIndex("user_contacts_one_primary_per_type_uidx")
      .on(table.userId, table.type)
      .where(sql`${table.isPrimary}`),
    index("user_contacts_user_id_idx").on(table.userId),
  ],
);

export const userAddresses = pgTable(
  "user_addresses",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientName: varchar("recipient_name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    countryCode: char("country_code", { length: 2 }).default("GH").notNull(),
    region: varchar("region", { length: 100 }).notNull(),
    district: varchar("district", { length: 100 }),
    city: varchar("city", { length: 100 }).notNull(),
    locality: varchar("locality", { length: 150 }),
    streetAddress: varchar("street_address", { length: 255 }),
    building: varchar("building", { length: 150 }),
    unit: varchar("unit", { length: 100 }),
    digitalAddress: varchar("digital_address", { length: 32 }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    landmark: varchar("landmark", { length: 500 }).notNull(),
    deliveryInstructions: varchar("delivery_instructions", { length: 500 }),
    addressType: varchar("address_type", { length: 16 }).notNull(),
    label: varchar("label", { length: 100 }),
    isDefault: boolean("is_default").default(false).notNull(),
    lastValidatedAt: timestampTz("last_validated_at"),
    archivedAt: timestampTz("archived_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("user_addresses_user_id_idx").on(table.userId),
    uniqueIndex("user_addresses_one_default_uidx")
      .on(table.userId)
      .where(sql`${table.isDefault} and ${table.archivedAt} is null`),
    check("user_addresses_country_code_ck", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
    check("user_addresses_latitude_ck", sql`${table.latitude} between -90 and 90`),
    check("user_addresses_longitude_ck", sql`${table.longitude} between -180 and 180`),
    check("user_addresses_type_ck", sql`${table.addressType} in ('HOME', 'WORK', 'OTHER')`),
    check("user_addresses_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    scopeType: permissionScopeEnum("scope_type").notNull(),
    isSystem: boolean("is_system").default(true).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [unique("roles_code_uq").on(table.code)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 150 }).notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    riskLevel: permissionRiskEnum("risk_level").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [unique("permissions_code_uq").on(table.code)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ name: "role_permissions_pk", columns: [table.roleId, table.permissionId] })],
);

export const platformStaffRoles = pgTable(
  "platform_staff_roles",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    scopeCountryCode: char("scope_country_code", { length: 2 }),
    scopeRegion: varchar("scope_region", { length: 100 }),
    activeFrom: timestampTz("active_from").notNull(),
    activeUntil: timestampTz("active_until"),
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("platform_staff_roles_user_id_idx").on(table.userId),
    index("platform_staff_roles_active_idx").on(table.userId, table.activeFrom, table.activeUntil),
    check(
      "platform_staff_roles_active_window_ck",
      sql`${table.activeUntil} is null or ${table.activeUntil} > ${table.activeFrom}`,
    ),
  ],
);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    legalName: varchar("legal_name", { length: 255 }).notNull(),
    tradingName: varchar("trading_name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    businessRegistrationNumber: varchar("business_registration_number", { length: 100 }),
    taxIdentifier: varchar("tax_identifier", { length: 100 }),
    countryCode: char("country_code", { length: 2 }).default("GH").notNull(),
    status: vendorStatusEnum("status").default("DRAFT").notNull(),
    verificationLevel: varchar("verification_level", { length: 32 }).default("UNVERIFIED").notNull(),
    logoStorageKey: varchar("logo_storage_key", { length: 1000 }),
    coverStorageKey: varchar("cover_storage_key", { length: 1000 }),
    approvedAt: timestampTz("approved_at"),
    suspendedAt: timestampTz("suspended_at"),
    suspensionReason: text("suspension_reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("vendors_public_reference_uq").on(table.publicReference),
    unique("vendors_slug_uq").on(table.slug),
    index("vendors_status_idx").on(table.status),
    index("vendors_created_at_idx").on(table.createdAt),
    check("vendors_country_code_ck", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
    check("vendors_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const vendorApplications = pgTable(
  "vendor_applications",
  {
    id: uuid("id").primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    submittedByUserId: uuid("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: vendorApplicationStatusEnum("status").default("DRAFT").notNull(),
    assignedReviewerUserId: uuid("assigned_reviewer_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    submittedAt: timestampTz("submitted_at"),
    decisionAt: timestampTz("decision_at"),
    decisionByUserId: uuid("decision_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    decisionReason: text("decision_reason"),
    applicationData: jsonb("application_data").default({}).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("vendor_applications_vendor_id_idx").on(table.vendorId),
    index("vendor_applications_status_idx").on(table.status),
    check("vendor_applications_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const vendorMemberships = pgTable(
  "vendor_memberships",
  {
    id: uuid("id").primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: membershipStatusEnum("status").default("INVITED").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    acceptedAt: timestampTz("accepted_at"),
    removedAt: timestampTz("removed_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("vendor_memberships_vendor_user_uq").on(table.vendorId, table.userId),
    index("vendor_memberships_user_id_idx").on(table.userId),
    check("vendor_memberships_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const vendorMembershipRoles = pgTable(
  "vendor_membership_roles",
  {
    vendorMembershipId: uuid("vendor_membership_id")
      .notNull()
      .references(() => vendorMemberships.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      name: "vendor_membership_roles_pk",
      columns: [table.vendorMembershipId, table.roleId],
    }),
  ],
);

export const serviceZones = pgTable(
  "service_zones",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    countryCode: char("country_code", { length: 2 }).default("GH").notNull(),
    region: varchar("region", { length: 100 }),
    geometryGeoJson: jsonb("geometry_geojson").notNull(),
    status: varchar("status", { length: 16 }).default("ACTIVE").notNull(),
    operatingHours: jsonb("operating_hours").default({}).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("service_zones_status_idx").on(table.status),
    check("service_zones_country_code_ck", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
    check("service_zones_status_ck", sql`${table.status} in ('ACTIVE', 'PAUSED', 'ARCHIVED')`),
    check("service_zones_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const driverProfiles = pgTable(
  "driver_profiles",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    status: driverStatusEnum("status").default("DRAFT").notNull(),
    profilePhotoStorageKey: varchar("profile_photo_storage_key", { length: 1000 }),
    homeRegion: varchar("home_region", { length: 100 }),
    emergencyContactData: jsonb("emergency_contact_data").default({}).notNull(),
    cashLimitMinor: money("cash_limit_minor").default(sql`0`).notNull(),
    currency: char("currency", { length: 3 }).default("GHS").notNull(),
    approvedAt: timestampTz("approved_at"),
    suspendedAt: timestampTz("suspended_at"),
    suspensionReason: text("suspension_reason"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("driver_profiles_user_id_uq").on(table.userId),
    unique("driver_profiles_public_reference_uq").on(table.publicReference),
    index("driver_profiles_status_idx").on(table.status),
    index("driver_profiles_created_at_idx").on(table.createdAt),
    check("driver_profiles_cash_limit_ck", sql`${table.cashLimitMinor} >= 0`),
    check("driver_profiles_currency_ck", currencyCheck(table.currency)),
    check("driver_profiles_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const driverDocuments = pgTable(
  "driver_documents",
  {
    id: uuid("id").primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    documentType: varchar("document_type", { length: 100 }).notNull(),
    storageKey: varchar("storage_key", { length: 1000 }).notNull(),
    status: varchar("status", { length: 16 }).default("PENDING").notNull(),
    documentNumber: varchar("document_number", { length: 150 }),
    issuedAt: date("issued_at", { mode: "date" }),
    expiresAt: date("expires_at", { mode: "date" }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestampTz("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("driver_documents_driver_status_idx").on(table.driverId, table.status),
    unique("driver_documents_driver_type_storage_uq").on(table.driverId, table.documentType, table.storageKey),
    check("driver_documents_status_ck", sql`${table.status} in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')`),
    check("driver_documents_expiry_ck", sql`${table.expiresAt} is null or ${table.issuedAt} is null or ${table.expiresAt} >= ${table.issuedAt}`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    registrationNumber: varchar("registration_number", { length: 64 }),
    make: varchar("make", { length: 100 }),
    model: varchar("model", { length: 100 }),
    colour: varchar("colour", { length: 64 }),
    capacityWeightKg: numeric("capacity_weight_kg", { precision: 12, scale: 3 }),
    capacityVolumeM3: numeric("capacity_volume_m3", { precision: 12, scale: 4 }),
    status: vehicleStatusEnum("status").default("PENDING").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("vehicles_driver_status_idx").on(table.driverId, table.status),
    uniqueIndex("vehicles_registration_uidx")
      .on(table.registrationNumber)
      .where(sql`${table.registrationNumber} is not null`),
    check(
      "vehicles_capacity_ck",
      sql`(${table.capacityWeightKg} is null or ${table.capacityWeightKg} > 0)
          and (${table.capacityVolumeM3} is null or ${table.capacityVolumeM3} > 0)`,
    ),
    check("vehicles_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const driverPayoutAccounts = pgTable(
  "driver_payout_accounts",
  {
    id: uuid("id").primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    providerType: varchar("provider_type", { length: 32 }).notNull(),
    providerName: varchar("provider_name", { length: 100 }).notNull(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    accountIdentifierEncrypted: text("account_identifier_encrypted").notNull(),
    maskedIdentifier: varchar("masked_identifier", { length: 64 }).notNull(),
    countryCode: char("country_code", { length: 2 }).default("GH").notNull(),
    currency: char("currency", { length: 3 }).default("GHS").notNull(),
    verificationStatus: varchar("verification_status", { length: 16 }).default("PENDING").notNull(),
    verifiedAt: timestampTz("verified_at"),
    activeFrom: timestampTz("active_from").defaultNow().notNull(),
    coolingOffUntil: timestampTz("cooling_off_until"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestampTz("archived_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("driver_payout_accounts_driver_idx").on(table.driverId, table.archivedAt),
    check("driver_payout_accounts_provider_type_ck", sql`${table.providerType} in ('BANK', 'MOBILE_MONEY')`),
    check("driver_payout_accounts_country_code_ck", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
    check("driver_payout_accounts_currency_ck", currencyCheck(table.currency)),
    check("driver_payout_accounts_verification_status_ck", sql`${table.verificationStatus} in ('PENDING', 'VERIFIED', 'REJECTED')`),
  ],
);

export const driverShifts = pgTable(
  "driver_shifts",
  {
    id: uuid("id").primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    serviceZoneId: uuid("service_zone_id")
      .notNull()
      .references(() => serviceZones.id, { onDelete: "restrict" }),
    status: driverShiftStatusEnum("status").default("STARTED").notNull(),
    startedAt: timestampTz("started_at").defaultNow().notNull(),
    pausedAt: timestampTz("paused_at"),
    endedAt: timestampTz("ended_at"),
    startCheckData: jsonb("start_check_data").default({}).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("driver_shifts_driver_started_idx").on(table.driverId, table.startedAt),
    index("driver_shifts_zone_status_idx").on(table.serviceZoneId, table.status),
    uniqueIndex("driver_shifts_one_active_uidx")
      .on(table.driverId)
      .where(sql`${table.status} <> 'ENDED'`),
    check(
      "driver_shifts_window_ck",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
    check(
      "driver_shifts_pause_ck",
      sql`${table.status} <> 'PAUSED' or ${table.pausedAt} is not null`,
    ),
    check("driver_shifts_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    status: storeStatusEnum("status").default("ACTIVE").notNull(),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 320 }),
    addressData: jsonb("address_data").notNull(),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    serviceZoneId: uuid("service_zone_id").references(() => serviceZones.id, { onDelete: "restrict" }),
    preparationMinutes: integer("preparation_minutes").default(0).notNull(),
    pickupEnabled: boolean("pickup_enabled").default(false).notNull(),
    vendorDeliveryEnabled: boolean("vendor_delivery_enabled").default(false).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("stores_public_reference_uq").on(table.publicReference),
    unique("stores_vendor_name_uq").on(table.vendorId, table.name),
    index("stores_vendor_status_idx").on(table.vendorId, table.status),
    check("stores_latitude_ck", sql`${table.latitude} between -90 and 90`),
    check("stores_longitude_ck", sql`${table.longitude} between -180 and 180`),
    check("stores_preparation_minutes_ck", sql`${table.preparationMinutes} >= 0`),
    check("stores_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const storeHours = pgTable(
  "store_hours",
  {
    id: uuid("id").primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    isClosed: boolean("is_closed").default(false).notNull(),
  },
  (table) => [
    unique("store_hours_store_day_uq").on(table.storeId, table.dayOfWeek),
    check("store_hours_day_of_week_ck", sql`${table.dayOfWeek} between 0 and 6`),
    check(
      "store_hours_window_ck",
      sql`(${table.isClosed} and ${table.opensAt} is null and ${table.closesAt} is null)
          or (not ${table.isClosed} and ${table.opensAt} is not null and ${table.closesAt} is not null
              and ${table.opensAt} < ${table.closesAt})`,
    ),
  ],
);

export const storeMemberships = pgTable(
  "store_memberships",
  {
    vendorMembershipId: uuid("vendor_membership_id")
      .notNull()
      .references(() => vendorMemberships.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      name: "store_memberships_pk",
      columns: [table.vendorMembershipId, table.storeId],
    }),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    imageStorageKey: varchar("image_storage_key", { length: 1000 }),
    status: categoryStatusEnum("status").default("ACTIVE").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    seoData: jsonb("seo_data").default({}).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("categories_slug_uq").on(table.slug),
    index("categories_parent_status_idx").on(table.parentId, table.status),
    check("categories_not_own_parent_ck", sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`),
    check("categories_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    logoStorageKey: varchar("logo_storage_key", { length: 1000 }),
    verificationStatus: varchar("verification_status", { length: 16 }).default("UNVERIFIED").notNull(),
    status: brandStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("brands_slug_uq").on(table.slug),
    check("brands_verification_status_ck", sql`${table.verificationStatus} in ('UNVERIFIED', 'VERIFIED')`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    slug: varchar("slug", { length: 500 }).notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    manufacturer: varchar("manufacturer", { length: 255 }),
    modelNumber: varchar("model_number", { length: 150 }),
    countryOfOrigin: char("country_of_origin", { length: 2 }),
    condition: productConditionEnum("condition").default("NEW").notNull(),
    status: productStatusEnum("status").default("DRAFT").notNull(),
    createdByVendorId: uuid("created_by_vendor_id").references(() => vendors.id, { onDelete: "restrict" }),
    approvedVersionId: uuid("approved_version_id").references((): AnyPgColumn => productVersions.id, {
      onDelete: "restrict",
    }),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("products_public_reference_uq").on(table.publicReference),
    unique("products_slug_uq").on(table.slug),
    index("products_category_status_idx").on(table.categoryId, table.status),
    index("products_brand_idx").on(table.brandId),
    index("products_name_search_idx").using("gin", sql`to_tsvector('simple', ${table.name})`),
    check("products_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const productVersions = pgTable(
  "product_versions",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    submittedByUserId: uuid("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedByVendorId: uuid("submitted_by_vendor_id").references(() => vendors.id, {
      onDelete: "restrict",
    }),
    data: jsonb("data").notNull(),
    status: productStatusEnum("status").notNull(),
    moderatorUserId: uuid("moderator_user_id").references(() => users.id, { onDelete: "restrict" }),
    moderatorNotes: text("moderator_notes"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("product_versions_product_number_uq").on(table.productId, table.versionNumber),
    check("product_versions_number_positive_ck", sql`${table.versionNumber} > 0`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    skuReference: varchar("sku_reference", { length: 150 }),
    barcode: varchar("barcode", { length: 150 }),
    weightKg: numeric("weight_kg", { precision: 12, scale: 6 }),
    lengthCm: numeric("length_cm", { precision: 12, scale: 4 }),
    widthCm: numeric("width_cm", { precision: 12, scale: 4 }),
    heightCm: numeric("height_cm", { precision: 12, scale: 4 }),
    status: variantStatusEnum("status").default("ACTIVE").notNull(),
    attributeValues: jsonb("attribute_values").default({}).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("product_variants_public_reference_uq").on(table.publicReference),
    uniqueIndex("product_variants_barcode_uidx")
      .on(table.barcode)
      .where(sql`${table.barcode} is not null`),
    index("product_variants_product_status_idx").on(table.productId, table.status),
    check(
      "product_variants_dimensions_ck",
      sql`(${table.weightKg} is null or ${table.weightKg} > 0)
          and (${table.lengthCm} is null or ${table.lengthCm} > 0)
          and (${table.widthCm} is null or ${table.widthCm} > 0)
          and (${table.heightCm} is null or ${table.heightCm} > 0)`,
    ),
    check("product_variants_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const productMedia = pgTable(
  "product_media",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "restrict" }),
    storageKey: varchar("storage_key", { length: 1000 }).notNull(),
    mediaType: varchar("media_type", { length: 16 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    altText: varchar("alt_text", { length: 500 }),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("product_media_storage_key_uq").on(table.storageKey),
    index("product_media_product_sort_idx").on(table.productId, table.sortOrder),
    uniqueIndex("product_media_one_primary_uidx")
      .on(table.productId, table.variantId)
      .where(sql`${table.isPrimary}`),
    check("product_media_type_ck", sql`${table.mediaType} in ('IMAGE', 'VIDEO')`),
    check("product_media_sort_order_ck", sql`${table.sortOrder} >= 0`),
  ],
);

export const vendorOffers = pgTable(
  "vendor_offers",
  {
    id: uuid("id").primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    productVariantId: uuid("product_variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    vendorSku: varchar("vendor_sku", { length: 150 }).notNull(),
    status: offerStatusEnum("status").default("DRAFT").notNull(),
    priceMinor: money("price_minor").notNull(),
    previousPriceMinor: money("previous_price_minor"),
    costPriceMinor: money("cost_price_minor"),
    currency: char("currency", { length: 3 }).default("GHS").notNull(),
    minimumQuantity: quantity("minimum_quantity").default("1.000000").notNull(),
    maximumQuantity: quantity("maximum_quantity"),
    fulfilmentMinutes: integer("fulfilment_minutes").default(0).notNull(),
    warrantyData: jsonb("warranty_data"),
    returnPolicySnapshot: jsonb("return_policy_snapshot"),
    availableFrom: timestampTz("available_from"),
    availableUntil: timestampTz("available_until"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("vendor_offers_vendor_store_sku_uq").on(table.vendorId, table.storeId, table.vendorSku),
    unique("vendor_offers_store_variant_uq").on(table.storeId, table.productVariantId),
    index("vendor_offers_variant_status_idx").on(table.productVariantId, table.status),
    index("vendor_offers_vendor_status_idx").on(table.vendorId, table.status),
    check("vendor_offers_currency_ck", currencyCheck(table.currency)),
    check(
      "vendor_offers_money_nonnegative_ck",
      sql`${table.priceMinor} >= 0
          and (${table.previousPriceMinor} is null or ${table.previousPriceMinor} >= 0)
          and (${table.costPriceMinor} is null or ${table.costPriceMinor} >= 0)`,
    ),
    check(
      "vendor_offers_quantity_range_ck",
      sql`${table.minimumQuantity} > 0
          and (${table.maximumQuantity} is null or ${table.maximumQuantity} >= ${table.minimumQuantity})`,
    ),
    check("vendor_offers_fulfilment_minutes_ck", sql`${table.fulfilmentMinutes} >= 0`),
    check(
      "vendor_offers_availability_window_ck",
      sql`${table.availableUntil} is null or ${table.availableFrom} is null
          or ${table.availableUntil} > ${table.availableFrom}`,
    ),
    check("vendor_offers_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const stockLocations = pgTable(
  "stock_locations",
  {
    id: uuid("id").primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    type: stockLocationTypeEnum("type").notNull(),
    addressData: jsonb("address_data").notNull(),
    status: stockLocationStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("stock_locations_vendor_name_uq").on(table.vendorId, table.name),
    index("stock_locations_store_idx").on(table.storeId),
    check(
      "stock_locations_store_type_ck",
      sql`${table.type} <> 'STORE' or ${table.storeId} is not null`,
    ),
    check("stock_locations_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey(),
    vendorOfferId: uuid("vendor_offer_id")
      .notNull()
      .references(() => vendorOffers.id, { onDelete: "restrict" }),
    stockLocationId: uuid("stock_location_id")
      .notNull()
      .references(() => stockLocations.id, { onDelete: "restrict" }),
    physicalQuantity: quantity("physical_quantity").default("0.000000").notNull(),
    reservedQuantity: quantity("reserved_quantity").default("0.000000").notNull(),
    damagedQuantity: quantity("damaged_quantity").default("0.000000").notNull(),
    safetyQuantity: quantity("safety_quantity").default("0.000000").notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("inventory_items_offer_location_uq").on(table.vendorOfferId, table.stockLocationId),
    index("inventory_items_location_idx").on(table.stockLocationId),
    check(
      "inventory_items_quantities_nonnegative_ck",
      sql`${table.physicalQuantity} >= 0 and ${table.reservedQuantity} >= 0
          and ${table.damagedQuantity} >= 0 and ${table.safetyQuantity} >= 0`,
    ),
    check(
      "inventory_items_allocation_ck",
      sql`${table.damagedQuantity} + ${table.safetyQuantity} <= ${table.physicalQuantity}
          and ${table.reservedQuantity} <= ${table.physicalQuantity} - ${table.damagedQuantity} - ${table.safetyQuantity}`,
    ),
    check("inventory_items_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    guestTokenHash: varchar("guest_token_hash", { length: 128 }),
    currency: char("currency", { length: 3 }).default("GHS").notNull(),
    status: cartStatusEnum("status").default("ACTIVE").notNull(),
    expiresAt: timestampTz("expires_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("carts_user_status_idx").on(table.userId, table.status),
    index("carts_guest_status_idx").on(table.guestTokenHash, table.status),
    check(
      "carts_owner_ck",
      sql`(${table.userId} is not null)::integer + (${table.guestTokenHash} is not null)::integer = 1`,
    ),
    check("carts_currency_ck", currencyCheck(table.currency)),
    check("carts_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    vendorOfferId: uuid("vendor_offer_id")
      .notNull()
      .references(() => vendorOffers.id, { onDelete: "restrict" }),
    quantity: quantity("quantity").notNull(),
    unitPriceSnapshotMinor: money("unit_price_snapshot_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    savedForLater: boolean("saved_for_later").default(false).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("cart_items_cart_offer_saved_uq").on(table.cartId, table.vendorOfferId, table.savedForLater),
    index("cart_items_offer_idx").on(table.vendorOfferId),
    check("cart_items_quantity_positive_ck", sql`${table.quantity} > 0`),
    check("cart_items_price_nonnegative_ck", sql`${table.unitPriceSnapshotMinor} >= 0`),
    check("cart_items_currency_ck", currencyCheck(table.currency)),
  ],
);

export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: uuid("id").primaryKey(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "restrict" }),
    status: checkoutStatusEnum("status").default("CREATED").notNull(),
    currency: char("currency", { length: 3 }).default("GHS").notNull(),
    contactData: jsonb("contact_data").default({}).notNull(),
    addressData: jsonb("address_data"),
    pricingSnapshot: jsonb("pricing_snapshot").default({}).notNull(),
    deliverySnapshot: jsonb("delivery_snapshot"),
    promotionSnapshot: jsonb("promotion_snapshot"),
    paymentMethodType: varchar("payment_method_type", { length: 64 }),
    idempotencyActor: varchar("idempotency_actor", { length: 255 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    expiresAt: timestampTz("expires_at").notNull(),
    completedAt: timestampTz("completed_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("checkout_sessions_public_reference_uq").on(table.publicReference),
    unique("checkout_sessions_actor_idempotency_uq").on(table.idempotencyActor, table.idempotencyKey),
    index("checkout_sessions_user_status_idx").on(table.userId, table.status),
    index("checkout_sessions_expires_idx").on(table.status, table.expiresAt),
    check("checkout_sessions_currency_ck", currencyCheck(table.currency)),
    check("checkout_sessions_expiry_ck", sql`${table.expiresAt} > ${table.createdAt}`),
    check("checkout_sessions_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const checkoutVendorGroups = pgTable(
  "checkout_vendor_groups",
  {
    id: uuid("id").primaryKey(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    itemsSnapshot: jsonb("items_snapshot").notNull(),
    deliveryOptionCode: varchar("delivery_option_code", { length: 64 }),
    subtotalMinor: money("subtotal_minor").notNull(),
    discountMinor: money("discount_minor").default(sql`0`).notNull(),
    deliveryMinor: money("delivery_minor").default(sql`0`).notNull(),
    taxMinor: money("tax_minor").default(sql`0`).notNull(),
    totalMinor: money("total_minor").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("checkout_vendor_groups_checkout_vendor_store_uq").on(
      table.checkoutSessionId,
      table.vendorId,
      table.storeId,
    ),
    check(
      "checkout_vendor_groups_money_ck",
      sql`${table.subtotalMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.deliveryMinor} >= 0
          and ${table.taxMinor} >= 0 and ${table.totalMinor} >= 0
          and ${table.totalMinor} = ${table.subtotalMinor} - ${table.discountMinor}
              + ${table.deliveryMinor} + ${table.taxMinor}`,
    ),
  ],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "restrict" }),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    quantity: quantity("quantity").notNull(),
    status: reservationStatusEnum("status").default("ACTIVE").notNull(),
    expiresAt: timestampTz("expires_at").notNull(),
    consumedAt: timestampTz("consumed_at"),
    releasedAt: timestampTz("released_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("stock_reservations_checkout_inventory_uq").on(table.checkoutSessionId, table.inventoryItemId),
    index("stock_reservations_expiry_idx").on(table.status, table.expiresAt),
    index("stock_reservations_inventory_status_idx").on(table.inventoryItemId, table.status),
    check("stock_reservations_quantity_positive_ck", sql`${table.quantity} > 0`),
    check("stock_reservations_expiry_ck", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "stock_reservations_terminal_timestamp_ck",
      sql`(${table.status} = 'ACTIVE' and ${table.consumedAt} is null and ${table.releasedAt} is null)
          or (${table.status} = 'CONSUMED' and ${table.consumedAt} is not null and ${table.releasedAt} is null)
          or (${table.status} in ('RELEASED', 'EXPIRED') and ${table.releasedAt} is not null
              and ${table.consumedAt} is null)`,
    ),
    check("stock_reservations_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "restrict" }),
    status: parentOrderStatusEnum("status").default("DRAFT").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    itemSubtotalMinor: money("item_subtotal_minor").notNull(),
    discountMinor: money("discount_minor").default(sql`0`).notNull(),
    deliveryMinor: money("delivery_minor").default(sql`0`).notNull(),
    taxMinor: money("tax_minor").default(sql`0`).notNull(),
    serviceFeeMinor: money("service_fee_minor").default(sql`0`).notNull(),
    grandTotalMinor: money("grand_total_minor").notNull(),
    contactSnapshot: jsonb("contact_snapshot").notNull(),
    addressSnapshot: jsonb("address_snapshot").notNull(),
    confirmedAt: timestampTz("confirmed_at"),
    completedAt: timestampTz("completed_at"),
    cancelledAt: timestampTz("cancelled_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("orders_public_reference_uq").on(table.publicReference),
    unique("orders_checkout_session_uq").on(table.checkoutSessionId),
    index("orders_user_created_idx").on(table.userId, table.createdAt),
    index("orders_status_created_idx").on(table.status, table.createdAt),
    check("orders_currency_ck", currencyCheck(table.currency)),
    check(
      "orders_money_ck",
      sql`${table.itemSubtotalMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.deliveryMinor} >= 0
          and ${table.taxMinor} >= 0 and ${table.serviceFeeMinor} >= 0 and ${table.grandTotalMinor} >= 0
          and ${table.grandTotalMinor} = ${table.itemSubtotalMinor} - ${table.discountMinor}
              + ${table.deliveryMinor} + ${table.taxMinor} + ${table.serviceFeeMinor}`,
    ),
    check("orders_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const vendorOrders = pgTable(
  "vendor_orders",
  {
    id: uuid("id").primaryKey(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    status: vendorOrderStatusEnum("status").default("AWAITING_VENDOR_RESPONSE").notNull(),
    subtotalMinor: money("subtotal_minor").notNull(),
    discountMinor: money("discount_minor").default(sql`0`).notNull(),
    taxMinor: money("tax_minor").default(sql`0`).notNull(),
    deliveryMinor: money("delivery_minor").default(sql`0`).notNull(),
    commissionMinor: money("commission_minor").default(sql`0`).notNull(),
    vendorNetMinor: money("vendor_net_minor").notNull(),
    responseDeadlineAt: timestampTz("response_deadline_at"),
    acceptedAt: timestampTz("accepted_at"),
    rejectedAt: timestampTz("rejected_at"),
    readyAt: timestampTz("ready_at"),
    deliveredAt: timestampTz("delivered_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("vendor_orders_public_reference_uq").on(table.publicReference),
    unique("vendor_orders_order_vendor_store_uq").on(table.orderId, table.vendorId, table.storeId),
    unique("vendor_orders_id_order_uq").on(table.id, table.orderId),
    index("vendor_orders_vendor_status_idx").on(table.vendorId, table.status),
    index("vendor_orders_response_deadline_idx").on(table.status, table.responseDeadlineAt),
    check(
      "vendor_orders_money_ck",
      sql`${table.subtotalMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.taxMinor} >= 0
          and ${table.deliveryMinor} >= 0 and ${table.commissionMinor} >= 0 and ${table.vendorNetMinor} >= 0
          and ${table.vendorNetMinor} + ${table.commissionMinor}
              = ${table.subtotalMinor} - ${table.discountMinor} + ${table.taxMinor}`,
    ),
    check("vendor_orders_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull(),
    vendorOrderId: uuid("vendor_order_id").notNull(),
    vendorOfferId: uuid("vendor_offer_id")
      .notNull()
      .references(() => vendorOffers.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productVariantId: uuid("product_variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    productSnapshot: jsonb("product_snapshot").notNull(),
    quantity: quantity("quantity").notNull(),
    unitPriceMinor: money("unit_price_minor").notNull(),
    discountMinor: money("discount_minor").default(sql`0`).notNull(),
    taxMinor: money("tax_minor").default(sql`0`).notNull(),
    lineTotalMinor: money("line_total_minor").notNull(),
    commissionRuleSnapshot: jsonb("commission_rule_snapshot").notNull(),
    returnPolicySnapshot: jsonb("return_policy_snapshot").notNull(),
    status: orderItemStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "order_items_vendor_order_order_fk",
      columns: [table.vendorOrderId, table.orderId],
      foreignColumns: [vendorOrders.id, vendorOrders.orderId],
    }).onDelete("restrict"),
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_vendor_order_id_idx").on(table.vendorOrderId),
    check("order_items_quantity_positive_ck", sql`${table.quantity} > 0`),
    check(
      "order_items_money_ck",
      sql`${table.unitPriceMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.taxMinor} >= 0
          and ${table.lineTotalMinor} >= 0
          and ${table.lineTotalMinor} = (${table.unitPriceMinor} * ${table.quantity})::bigint
              - ${table.discountMinor} + ${table.taxMinor}`,
    ),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey(),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    movementType: inventoryMovementTypeEnum("movement_type").notNull(),
    quantityChange: quantity("quantity_change").notNull(),
    physicalBefore: quantity("physical_before").notNull(),
    physicalAfter: quantity("physical_after").notNull(),
    reservedBefore: quantity("reserved_before").notNull(),
    reservedAfter: quantity("reserved_after").notNull(),
    reasonCode: varchar("reason_code", { length: 100 }).notNull(),
    notes: text("notes"),
    relatedOrderItemId: uuid("related_order_item_id").references(() => orderItems.id, {
      onDelete: "restrict",
    }),
    relatedReservationId: uuid("related_reservation_id").references(() => stockReservations.id, {
      onDelete: "restrict",
    }),
    performedByUserId: uuid("performed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("inventory_movements_item_idempotency_uq").on(table.inventoryItemId, table.idempotencyKey),
    index("inventory_movements_item_created_idx").on(table.inventoryItemId, table.createdAt),
    check("inventory_movements_change_nonzero_ck", sql`${table.quantityChange} <> 0`),
    check(
      "inventory_movements_snapshots_nonnegative_ck",
      sql`${table.physicalBefore} >= 0 and ${table.physicalAfter} >= 0
          and ${table.reservedBefore} >= 0 and ${table.reservedAfter} >= 0`,
    ),
  ],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    vendorOrderId: uuid("vendor_order_id").references(() => vendorOrders.id, { onDelete: "restrict" }),
    previousStatus: varchar("previous_status", { length: 64 }),
    newStatus: varchar("new_status", { length: 64 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    reasonCode: varchar("reason_code", { length: 100 }),
    reasonText: text("reason_text"),
    requestId: uuid("request_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("order_status_history_request_idempotency_uq").on(table.requestId, table.idempotencyKey),
    index("order_status_history_order_created_idx").on(table.orderId, table.createdAt),
    index("order_status_history_vendor_order_created_idx").on(table.vendorOrderId, table.createdAt),
    check(
      "order_status_history_entity_ck",
      sql`(${table.orderId} is not null)::integer + (${table.vendorOrderId} is not null)::integer = 1`,
    ),
    check(
      "order_status_history_actor_ck",
      sql`(${table.actorType} = 'USER' and ${table.actorUserId} is not null)
          or (${table.actorType} <> 'USER' and ${table.actorUserId} is null)`,
    ),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    checkoutSessionId: uuid("checkout_session_id")
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerReference: varchar("provider_reference", { length: 255 }),
    channel: varchar("channel", { length: 64 }),
    status: paymentStatusEnum("status").default("CREATED").notNull(),
    amountMinor: money("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    providerFeeMinor: money("provider_fee_minor"),
    idempotencyActor: varchar("idempotency_actor", { length: 255 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    initialisedAt: timestampTz("initialised_at"),
    completedAt: timestampTz("completed_at"),
    failedAt: timestampTz("failed_at"),
    failureCode: varchar("failure_code", { length: 100 }),
    failureMessage: text("failure_message"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("payments_public_reference_uq").on(table.publicReference),
    unique("payments_provider_actor_idempotency_uq").on(
      table.provider,
      table.idempotencyActor,
      table.idempotencyKey,
    ),
    uniqueIndex("payments_provider_reference_uidx")
      .on(table.provider, table.providerReference)
      .where(sql`${table.providerReference} is not null`),
    index("payments_checkout_status_idx").on(table.checkoutSessionId, table.status),
    index("payments_order_id_idx").on(table.orderId),
    check("payments_amount_positive_ck", sql`${table.amountMinor} > 0`),
    check(
      "payments_provider_fee_ck",
      sql`${table.providerFeeMinor} is null or (${table.providerFeeMinor} >= 0 and ${table.providerFeeMinor} <= ${table.amountMinor})`,
    ),
    check("payments_currency_ck", currencyCheck(table.currency)),
    check("payments_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    providerRequestReference: varchar("provider_request_reference", { length: 255 }),
    status: varchar("status", { length: 64 }).notNull(),
    safeRequestData: jsonb("safe_request_data"),
    safeResponseData: jsonb("safe_response_data"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("payment_attempts_payment_number_uq").on(table.paymentId, table.attemptNumber),
    check("payment_attempts_number_positive_ck", sql`${table.attemptNumber} > 0`),
  ],
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 150 }).notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    payload: jsonb("payload").notNull(),
    payloadSha256: char("payload_sha256", { length: 64 }).notNull(),
    processingStatus: webhookProcessingStatusEnum("processing_status").default("RECEIVED").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestampTz("next_attempt_at"),
    lastError: text("last_error"),
    receivedAt: timestampTz("received_at").defaultNow().notNull(),
    processedAt: timestampTz("processed_at"),
  },
  (table) => [
    unique("payment_webhook_events_provider_event_uq").on(table.provider, table.providerEventId),
    index("payment_webhook_events_processing_idx").on(table.processingStatus, table.nextAttemptAt),
    check("payment_webhook_events_attempt_count_ck", sql`${table.attemptCount} >= 0`),
    check("payment_webhook_events_payload_sha256_ck", sql`${table.payloadSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const deliveryQuotes = pgTable(
  "delivery_quotes",
  {
    id: uuid("id").primaryKey(),
    checkoutVendorGroupId: uuid("checkout_vendor_group_id").references(() => checkoutVendorGroups.id, {
      onDelete: "restrict",
    }),
    vendorOrderId: uuid("vendor_order_id").references(() => vendorOrders.id, { onDelete: "restrict" }),
    serviceZoneId: uuid("service_zone_id").references(() => serviceZones.id, { onDelete: "restrict" }),
    pickupLocation: jsonb("pickup_location").notNull(),
    dropoffLocation: jsonb("dropoff_location").notNull(),
    distanceMetres: integer("distance_metres").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    feeMinor: money("fee_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    rateRuleSnapshot: jsonb("rate_rule_snapshot").notNull(),
    status: deliveryQuoteStatusEnum("status").default("ACTIVE").notNull(),
    expiresAt: timestampTz("expires_at").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("delivery_quotes_expiry_idx").on(table.status, table.expiresAt),
    check(
      "delivery_quotes_owner_ck",
      sql`(${table.checkoutVendorGroupId} is not null)::integer + (${table.vendorOrderId} is not null)::integer = 1`,
    ),
    check("delivery_quotes_distance_duration_ck", sql`${table.distanceMetres} >= 0 and ${table.durationSeconds} >= 0`),
    check("delivery_quotes_fee_ck", sql`${table.feeMinor} >= 0`),
    check("delivery_quotes_currency_ck", currencyCheck(table.currency)),
    check("delivery_quotes_expiry_ck", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    vendorOrderId: uuid("vendor_order_id")
      .notNull()
      .references(() => vendorOrders.id, { onDelete: "restrict" }),
    deliveryQuoteId: uuid("delivery_quote_id").references(() => deliveryQuotes.id, { onDelete: "restrict" }),
    deliveryMethod: deliveryMethodEnum("delivery_method").notNull(),
    status: deliveryStatusEnum("status").default("CREATED").notNull(),
    serviceZoneId: uuid("service_zone_id").references(() => serviceZones.id, { onDelete: "restrict" }),
    assignedDriverUserId: uuid("assigned_driver_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    driverId: uuid("driver_id").references(() => driverProfiles.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "restrict" }),
    externalProvider: varchar("external_provider", { length: 100 }),
    externalReference: varchar("external_reference", { length: 255 }),
    pickupSnapshot: jsonb("pickup_snapshot").notNull(),
    dropoffSnapshot: jsonb("dropoff_snapshot").notNull(),
    deliveryFeeMinor: money("delivery_fee_minor").notNull(),
    driverEarningMinor: money("driver_earning_minor").default(sql`0`).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    deliveryCodeHash: varchar("delivery_code_hash", { length: 255 }),
    estimatedPickupAt: timestampTz("estimated_pickup_at"),
    estimatedDeliveryAt: timestampTz("estimated_delivery_at"),
    completedAt: timestampTz("completed_at"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("deliveries_public_reference_uq").on(table.publicReference),
    unique("deliveries_vendor_order_uq").on(table.vendorOrderId),
    uniqueIndex("deliveries_external_reference_uidx")
      .on(table.externalProvider, table.externalReference)
      .where(sql`${table.externalReference} is not null`),
    index("deliveries_status_created_idx").on(table.status, table.createdAt),
    index("deliveries_driver_status_idx").on(table.assignedDriverUserId, table.status),
    index("deliveries_driver_profile_status_idx").on(table.driverId, table.status),
    check(
      "deliveries_money_ck",
      sql`${table.deliveryFeeMinor} >= 0 and ${table.driverEarningMinor} >= 0
          and ${table.driverEarningMinor} <= ${table.deliveryFeeMinor}`,
    ),
    check("deliveries_currency_ck", currencyCheck(table.currency)),
    check(
      "deliveries_estimate_window_ck",
      sql`${table.estimatedDeliveryAt} is null or ${table.estimatedPickupAt} is null
          or ${table.estimatedDeliveryAt} >= ${table.estimatedPickupAt}`,
    ),
    check("deliveries_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const deliveryOffers = pgTable(
  "delivery_offers",
  {
    id: uuid("id").primaryKey(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    status: deliveryOfferStatusEnum("status").default("SENT").notNull(),
    offeredEarningMinor: money("offered_earning_minor").notNull(),
    currency: char("currency", { length: 3 }).default("GHS").notNull(),
    distanceToPickupMetres: integer("distance_to_pickup_metres"),
    sentAt: timestampTz("sent_at").defaultNow().notNull(),
    expiresAt: timestampTz("expires_at").notNull(),
    respondedAt: timestampTz("responded_at"),
    rejectionReason: varchar("rejection_reason", { length: 100 }),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    unique("delivery_offers_delivery_driver_sent_uq").on(table.deliveryId, table.driverId, table.sentAt),
    index("delivery_offers_driver_status_idx").on(table.driverId, table.status, table.expiresAt),
    index("delivery_offers_delivery_status_idx").on(table.deliveryId, table.status),
    check("delivery_offers_money_ck", sql`${table.offeredEarningMinor} >= 0`),
    check("delivery_offers_currency_ck", currencyCheck(table.currency)),
    check("delivery_offers_distance_ck", sql`${table.distanceToPickupMetres} is null or ${table.distanceToPickupMetres} >= 0`),
    check("delivery_offers_expiry_ck", sql`${table.expiresAt} > ${table.sentAt}`),
    check(
      "delivery_offers_response_ck",
      sql`${table.status} in ('SENT', 'EXPIRED', 'CANCELLED')
          or ${table.respondedAt} is not null`,
    ),
    check("delivery_offers_version_positive_ck", sql`${table.version} > 0`),
  ],
);

export const deliveryStatusHistory = pgTable(
  "delivery_status_history",
  {
    id: uuid("id").primaryKey(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "restrict" }),
    previousStatus: deliveryStatusEnum("previous_status"),
    newStatus: deliveryStatusEnum("new_status").notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    reasonCode: varchar("reason_code", { length: 100 }),
    reasonText: text("reason_text"),
    requestId: uuid("request_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("delivery_status_history_request_idempotency_uq").on(table.requestId, table.idempotencyKey),
    index("delivery_status_history_delivery_created_idx").on(table.deliveryId, table.createdAt),
    check(
      "delivery_status_history_actor_ck",
      sql`(${table.actorType} = 'USER' and ${table.actorUserId} is not null)
          or (${table.actorType} <> 'USER' and ${table.actorUserId} is null)`,
    ),
  ],
);

export const driverLocations = pgTable(
  "driver_locations",
  {
    id: uuid("id").primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    deliveryId: uuid("delivery_id").references(() => deliveries.id, { onDelete: "restrict" }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    accuracyMetres: numeric("accuracy_metres", { precision: 10, scale: 2 }),
    headingDegrees: numeric("heading_degrees", { precision: 6, scale: 2 }),
    speedMetresSecond: numeric("speed_metres_second", { precision: 8, scale: 3 }),
    recordedAt: timestampTz("recorded_at").notNull(),
    receivedAt: timestampTz("received_at").defaultNow().notNull(),
    source: driverLocationSourceEnum("source").notNull(),
    offlineEventId: uuid("offline_event_id"),
  },
  (table) => [
    index("driver_locations_driver_recorded_idx").on(table.driverId, table.recordedAt),
    index("driver_locations_delivery_recorded_idx").on(table.deliveryId, table.recordedAt),
    uniqueIndex("driver_locations_offline_event_uidx")
      .on(table.driverId, table.offlineEventId)
      .where(sql`${table.offlineEventId} is not null`),
    check("driver_locations_latitude_ck", sql`${table.latitude} between -90 and 90`),
    check("driver_locations_longitude_ck", sql`${table.longitude} between -180 and 180`),
    check("driver_locations_accuracy_ck", sql`${table.accuracyMetres} is null or ${table.accuracyMetres} >= 0`),
    check("driver_locations_heading_ck", sql`${table.headingDegrees} is null or ${table.headingDegrees} between 0 and 360`),
    check("driver_locations_speed_ck", sql`${table.speedMetresSecond} is null or ${table.speedMetresSecond} >= 0`),
    check("driver_locations_received_ck", sql`${table.receivedAt} >= ${table.recordedAt} - interval '5 minutes'`),
  ],
);

export const driverCashTransactions = pgTable(
  "driver_cash_transactions",
  {
    id: uuid("id").primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    deliveryId: uuid("delivery_id").references(() => deliveries.id, { onDelete: "restrict" }),
    type: driverCashTransactionTypeEnum("type").notNull(),
    amountMinor: money("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).default("GHS").notNull(),
    status: driverCashTransactionStatusEnum("status").default("PENDING").notNull(),
    evidenceStorageKey: varchar("evidence_storage_key", { length: 1000 }),
    reference: varchar("reference", { length: 64 }),
    reason: text("reason"),
    offlineEventId: uuid("offline_event_id"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("driver_cash_transactions_driver_key_uq").on(table.driverId, table.idempotencyKey),
    uniqueIndex("driver_cash_transactions_offline_event_uidx")
      .on(table.driverId, table.offlineEventId)
      .where(sql`${table.offlineEventId} is not null`),
    index("driver_cash_transactions_driver_created_idx").on(table.driverId, table.createdAt),
    index("driver_cash_transactions_delivery_idx").on(table.deliveryId),
    check("driver_cash_transactions_amount_ck", sql`${table.amountMinor} > 0`),
    check("driver_cash_transactions_currency_ck", currencyCheck(table.currency)),
  ],
);

export const driverSafetyIncidents = pgTable(
  "driver_safety_incidents",
  {
    id: uuid("id").primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    deliveryId: uuid("delivery_id").references(() => deliveries.id, { onDelete: "restrict" }),
    incidentType: varchar("incident_type", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 16 }).default("MEDIUM").notNull(),
    description: text("description").notNull(),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    evidenceStorageKeys: jsonb("evidence_storage_keys").default([]).notNull(),
    status: varchar("status", { length: 32 }).default("OPEN").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("driver_safety_incidents_driver_created_idx").on(table.driverId, table.createdAt),
    index("driver_safety_incidents_status_idx").on(table.status),
    check("driver_safety_incidents_severity_ck", sql`${table.severity} in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`),
    check("driver_safety_incidents_status_ck", sql`${table.status} in ('OPEN', 'TRIAGED', 'RESOLVED', 'CLOSED')`),
    check("driver_safety_incidents_latitude_ck", sql`${table.latitude} is null or ${table.latitude} between -90 and 90`),
    check("driver_safety_incidents_longitude_ck", sql`${table.longitude} is null or ${table.longitude} between -180 and 180`),
  ],
);

export const driverEmergencyEvents = pgTable(
  "driver_emergency_events",
  {
    id: uuid("id").primaryKey(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.id, { onDelete: "restrict" }),
    deliveryId: uuid("delivery_id").references(() => deliveries.id, { onDelete: "restrict" }),
    emergencyType: varchar("emergency_type", { length: 100 }).notNull(),
    message: text("message"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    status: varchar("status", { length: 32 }).default("OPEN").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("driver_emergency_events_driver_created_idx").on(table.driverId, table.createdAt),
    index("driver_emergency_events_status_idx").on(table.status),
    check("driver_emergency_events_status_ck", sql`${table.status} in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED')`),
    check("driver_emergency_events_latitude_ck", sql`${table.latitude} is null or ${table.latitude} between -90 and 90`),
    check("driver_emergency_events_longitude_ck", sql`${table.longitude} is null or ${table.longitude} between -180 and 180`),
  ],
);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    accountType: ledgerAccountTypeEnum("account_type").notNull(),
    ownerType: ledgerOwnerTypeEnum("owner_type").notNull(),
    ownerId: uuid("owner_id"),
    currency: char("currency", { length: 3 }).notNull(),
    status: ledgerAccountStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    closedAt: timestampTz("closed_at"),
  },
  (table) => [
    uniqueIndex("ledger_accounts_identity_uidx").on(
      table.code,
      table.ownerType,
      sql`coalesce(${table.ownerId}::text, '')`,
      table.currency,
    ),
    index("ledger_accounts_owner_idx").on(table.ownerType, table.ownerId),
    check("ledger_accounts_currency_ck", currencyCheck(table.currency)),
    check(
      "ledger_accounts_owner_ck",
      sql`(${table.ownerType} = 'PLATFORM' and ${table.ownerId} is null)
          or (${table.ownerType} <> 'PLATFORM' and ${table.ownerId} is not null)`,
    ),
    check(
      "ledger_accounts_closed_ck",
      sql`(${table.status} = 'ACTIVE' and ${table.closedAt} is null)
          or (${table.status} = 'CLOSED' and ${table.closedAt} is not null)`,
    ),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey(),
    publicReference: varchar("public_reference", { length: 32 }).notNull(),
    transactionType: varchar("transaction_type", { length: 100 }).notNull(),
    postingTemplateCode: varchar("posting_template_code", { length: 100 }).notNull(),
    sourceEntityType: varchar("source_entity_type", { length: 100 }).notNull(),
    sourceEntityId: uuid("source_entity_id").notNull(),
    sourceEventId: varchar("source_event_id", { length: 255 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    status: ledgerTransactionStatusEnum("status").default("PENDING").notNull(),
    description: text("description").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    reversalOfTransactionId: uuid("reversal_of_transaction_id").references(
      (): AnyPgColumn => ledgerTransactions.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    postedAt: timestampTz("posted_at"),
  },
  (table) => [
    unique("ledger_transactions_public_reference_uq").on(table.publicReference),
    unique("ledger_transactions_source_posting_uq").on(table.sourceEventId, table.postingTemplateCode),
    unique("ledger_transactions_source_idempotency_uq").on(table.sourceEntityType, table.idempotencyKey),
    uniqueIndex("ledger_transactions_reversal_of_uidx")
      .on(table.reversalOfTransactionId)
      .where(sql`${table.reversalOfTransactionId} is not null`),
    index("ledger_transactions_source_idx").on(table.sourceEntityType, table.sourceEntityId),
    index("ledger_transactions_status_created_idx").on(table.status, table.createdAt),
    check("ledger_transactions_currency_ck", currencyCheck(table.currency)),
    check(
      "ledger_transactions_posted_at_ck",
      sql`(${table.status} = 'PENDING' and ${table.postedAt} is null)
          or (${table.status} = 'POSTED' and ${table.postedAt} is not null)`,
    ),
    check(
      "ledger_transactions_not_self_reversal_ck",
      sql`${table.reversalOfTransactionId} is null or ${table.reversalOfTransactionId} <> ${table.id}`,
    ),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey(),
    ledgerTransactionId: uuid("ledger_transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    ledgerAccountId: uuid("ledger_account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    direction: ledgerDirectionEnum("direction").notNull(),
    amountMinor: money("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id").references(() => driverProfiles.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    vendorOrderId: uuid("vendor_order_id").references(() => vendorOrders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    deliveryId: uuid("delivery_id").references(() => deliveries.id, { onDelete: "restrict" }),
    taxCode: varchar("tax_code", { length: 64 }),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ledger_entries_transaction_idx").on(table.ledgerTransactionId),
    index("ledger_entries_account_created_idx").on(table.ledgerAccountId, table.createdAt),
    index("ledger_entries_vendor_created_idx").on(table.vendorId, table.createdAt),
    index("ledger_entries_driver_created_idx").on(table.driverId, table.createdAt),
    index("ledger_entries_order_idx").on(table.orderId),
    index("ledger_entries_payment_idx").on(table.paymentId),
    check("ledger_entries_amount_positive_ck", sql`${table.amountMinor} > 0`),
    check("ledger_entries_currency_ck", currencyCheck(table.currency)),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    actorKey: varchar("actor_key", { length: 255 }).notNull(),
    scope: varchar("scope", { length: 100 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    state: varchar("state", { length: 16 }).default("PROCESSING").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    resourceType: varchar("resource_type", { length: 100 }),
    resourceId: uuid("resource_id"),
    lockedUntil: timestampTz("locked_until"),
    expiresAt: timestampTz("expires_at").notNull(),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    updatedAt: timestampTz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("idempotency_records_actor_scope_key_uq").on(table.actorKey, table.scope, table.idempotencyKey),
    index("idempotency_records_expiry_idx").on(table.expiresAt),
    check("idempotency_records_request_hash_ck", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
    check("idempotency_records_state_ck", sql`${table.state} in ('PROCESSING', 'COMPLETED', 'FAILED')`),
    check(
      "idempotency_records_response_ck",
      sql`${table.state} <> 'COMPLETED' or ${table.responseStatus} between 100 and 599`,
    ),
    check("idempotency_records_expiry_ck", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    action: varchar("action", { length: 150 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id"),
    requestId: uuid("request_id"),
    reason: text("reason"),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    metadata: jsonb("metadata").default({}).notNull(),
    ipHash: varchar("ip_hash", { length: 128 }),
    sessionId: uuid("session_id"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
    index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_logs_request_id_idx").on(table.requestId),
    check(
      "audit_logs_actor_ck",
      sql`(${table.actorType} = 'USER' and ${table.actorUserId} is not null)
          or (${table.actorType} <> 'USER' and ${table.actorUserId} is null)`,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 150 }).notNull(),
    eventVersion: integer("event_version").default(1).notNull(),
    payload: jsonb("payload").notNull(),
    headers: jsonb("headers").default({}).notNull(),
    status: outboxStatusEnum("status").default("PENDING").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    availableAt: timestampTz("available_at").defaultNow().notNull(),
    lockedAt: timestampTz("locked_at"),
    lockedBy: varchar("locked_by", { length: 255 }),
    lastError: text("last_error"),
    createdAt: timestampTz("created_at").defaultNow().notNull(),
    processedAt: timestampTz("processed_at"),
  },
  (table) => [
    unique("outbox_events_aggregate_version_uq").on(
      table.aggregateType,
      table.aggregateId,
      table.eventVersion,
    ),
    index("outbox_events_dispatch_idx").on(table.status, table.availableAt),
    check("outbox_events_version_positive_ck", sql`${table.eventVersion} > 0`),
    check("outbox_events_attempt_count_ck", sql`${table.attemptCount} >= 0`),
    check(
      "outbox_events_lock_ck",
      sql`(${table.lockedAt} is null and ${table.lockedBy} is null)
          or (${table.lockedAt} is not null and ${table.lockedBy} is not null)`,
    ),
  ],
);

export * from "./enums.js";
