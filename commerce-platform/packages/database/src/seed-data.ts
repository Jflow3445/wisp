import type { InferInsertModel } from "drizzle-orm";

import { ledgerAccounts, permissions, roles } from "./schema.js";

export const deterministicSeedUuid = (sequence: number): string => {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0xffffffffffff) {
    throw new Error("Seed UUID sequence must fit in 48 bits");
  }
  return `01900000-0000-7000-8000-${sequence.toString(16).padStart(12, "0")}`;
};

export const roleSeeds = [
  {
    id: deterministicSeedUuid(1),
    code: "BUYER",
    name: "Buyer",
    description: "Buyer self-service access",
    scopeType: "SELF",
    isSystem: true,
  },
  {
    id: deterministicSeedUuid(2),
    code: "VENDOR_OWNER",
    name: "Vendor owner",
    description: "Full operational access within one vendor",
    scopeType: "VENDOR",
    isSystem: true,
  },
  {
    id: deterministicSeedUuid(3),
    code: "VENDOR_STAFF",
    name: "Vendor staff",
    description: "Store-scoped catalogue, inventory, and order operations",
    scopeType: "STORE",
    isSystem: true,
  },
  {
    id: deterministicSeedUuid(4),
    code: "PLATFORM_ADMIN",
    name: "Platform administrator",
    description: "Marketplace administration excluding finance approvals",
    scopeType: "GLOBAL",
    isSystem: true,
  },
  {
    id: deterministicSeedUuid(5),
    code: "FINANCE_ADMIN",
    name: "Finance administrator",
    description: "Ledger, payment reconciliation, and financial controls",
    scopeType: "GLOBAL",
    isSystem: true,
  },
  {
    id: deterministicSeedUuid(6),
    code: "DRIVER",
    name: "Driver",
    description: "Driver mobile delivery, cash, and earnings access",
    scopeType: "SELF",
    isSystem: true,
  },
] as const satisfies readonly InferInsertModel<typeof roles>[];

const permissionDefinitions = [
  ["buyer.profile.read", "Read own buyer profile", "LOW"],
  ["buyer.profile.update", "Update own buyer profile", "MEDIUM"],
  ["buyer.order.read_own", "Read own orders", "LOW"],
  ["buyer.order.cancel_own", "Cancel eligible own orders", "HIGH"],
  ["vendor.dashboard.read", "Read vendor dashboard", "LOW"],
  ["vendor.order.read", "Read vendor orders", "LOW"],
  ["vendor.order.accept", "Accept vendor orders", "HIGH"],
  ["vendor.order.reject", "Reject vendor orders", "HIGH"],
  ["vendor.product.create", "Create vendor product drafts", "MEDIUM"],
  ["vendor.product.update", "Update vendor product drafts", "MEDIUM"],
  ["vendor.inventory.adjust", "Post inventory adjustments", "HIGH"],
  ["vendor.finance.read", "Read vendor financial data", "HIGH"],
  ["vendor.staff.manage", "Manage vendor staff", "CRITICAL"],
  ["driver.delivery.offer.read", "Read assigned delivery offers", "LOW"],
  ["driver.delivery.offer.accept", "Accept assigned delivery offers", "HIGH"],
  ["driver.delivery.update", "Update assigned delivery state", "HIGH"],
  ["driver.delivery.complete", "Complete assigned deliveries", "HIGH"],
  ["driver.cash.record", "Record driver cash collections and deposits", "HIGH"],
  ["driver.earnings.read", "Read own driver earnings", "MEDIUM"],
  ["admin.buyer.read", "Read buyer administration data", "MEDIUM"],
  ["admin.buyer.suspend", "Suspend buyer accounts", "CRITICAL"],
  ["admin.vendor.review", "Review vendor applications", "HIGH"],
  ["admin.vendor.suspend", "Suspend vendors", "CRITICAL"],
  ["admin.product.moderate", "Moderate catalogue products", "HIGH"],
  ["admin.order.manage", "Manage marketplace orders", "CRITICAL"],
  ["admin.payment.reconcile", "Reconcile provider payments", "CRITICAL"],
  ["admin.ledger.read", "Read financial ledger", "HIGH"],
  ["admin.audit.read", "Read security audit records", "HIGH"],
  ["admin.system.configure", "Configure marketplace operations", "CRITICAL"],
] as const;

export const permissionSeeds = permissionDefinitions.map(
  ([code, name, riskLevel], index) =>
    ({
      id: deterministicSeedUuid(100 + index),
      code,
      name,
      riskLevel,
    }) satisfies InferInsertModel<typeof permissions>,
);

export const rolePermissionCodes: Readonly<Record<string, readonly string[]>> = {
  BUYER: ["buyer.profile.read", "buyer.profile.update", "buyer.order.read_own", "buyer.order.cancel_own"],
  VENDOR_OWNER: [
    "vendor.dashboard.read",
    "vendor.order.read",
    "vendor.order.accept",
    "vendor.order.reject",
    "vendor.product.create",
    "vendor.product.update",
    "vendor.inventory.adjust",
    "vendor.finance.read",
    "vendor.staff.manage",
  ],
  VENDOR_STAFF: [
    "vendor.dashboard.read",
    "vendor.order.read",
    "vendor.order.accept",
    "vendor.order.reject",
    "vendor.product.create",
    "vendor.product.update",
    "vendor.inventory.adjust",
  ],
  DRIVER: [
    "driver.delivery.offer.read",
    "driver.delivery.offer.accept",
    "driver.delivery.update",
    "driver.delivery.complete",
    "driver.cash.record",
    "driver.earnings.read",
  ],
  PLATFORM_ADMIN: [
    "admin.buyer.read",
    "admin.buyer.suspend",
    "admin.vendor.review",
    "admin.vendor.suspend",
    "admin.product.moderate",
    "admin.order.manage",
    "admin.audit.read",
    "admin.system.configure",
  ],
  FINANCE_ADMIN: ["admin.payment.reconcile", "admin.ledger.read", "admin.audit.read"],
};

const chartOfAccounts = [
  ["1000", "BANK_CASH", "ASSET"],
  ["1010", "PAYMENT_PROVIDER_RECEIVABLE", "ASSET"],
  ["1020", "DRIVER_CASH_RECEIVABLE", "ASSET"],
  ["1030", "VENDOR_RECEIVABLE", "ASSET"],
  ["1040", "DRIVER_RECEIVABLE", "ASSET"],
  ["1050", "CHARGEBACK_SUSPENSE", "ASSET"],
  ["1060", "REFUND_PROVIDER_RECEIVABLE", "ASSET"],
  ["1070", "PAYOUT_PROVIDER_RECEIVABLE", "ASSET"],
  ["1080", "TAX_RECOVERABLE", "ASSET"],
  ["2000", "CUSTOMER_FUNDS_CLEARING", "LIABILITY"],
  ["2010", "VENDOR_PAYABLE_PENDING_FULFILMENT", "LIABILITY"],
  ["2020", "VENDOR_PAYABLE_RETURN_HOLD", "LIABILITY"],
  ["2030", "VENDOR_PAYABLE_AVAILABLE", "LIABILITY"],
  ["2040", "VENDOR_RESERVE", "LIABILITY"],
  ["2050", "DRIVER_PAYABLE_PENDING", "LIABILITY"],
  ["2060", "DRIVER_PAYABLE_AVAILABLE", "LIABILITY"],
  ["2070", "REFUND_PAYABLE", "LIABILITY"],
  ["2080", "TAX_PAYABLE", "LIABILITY"],
  ["2090", "VENDOR_PAYOUT_CLEARING", "LIABILITY"],
  ["2100", "DRIVER_PAYOUT_CLEARING", "LIABILITY"],
  ["2110", "BUYER_WALLET_LIABILITY", "LIABILITY"],
  ["2120", "GIFT_CARD_LIABILITY", "LIABILITY"],
  ["2130", "COMMISSION_DEFERRED", "LIABILITY"],
  ["2140", "DELIVERY_FEE_DEFERRED", "LIABILITY"],
  ["2150", "CUSTOMER_COMPENSATION_PAYABLE", "LIABILITY"],
  ["4000", "COMMISSION_REVENUE", "REVENUE"],
  ["4010", "DELIVERY_MARGIN_REVENUE", "REVENUE"],
  ["4020", "SERVICE_FEE_REVENUE", "REVENUE"],
  ["4030", "PAYMENT_FEE_RECOVERY_REVENUE", "REVENUE"],
  ["4040", "VENDOR_SUBSCRIPTION_REVENUE", "REVENUE"],
  ["4050", "ADVERTISING_REVENUE", "REVENUE"],
  ["4090", "COMMISSION_REVERSALS", "REVENUE"],
  ["4091", "DELIVERY_REVENUE_REVERSALS", "REVENUE"],
  ["4092", "SERVICE_FEE_REVERSALS", "REVENUE"],
  ["5000", "PAYMENT_PROCESSING_EXPENSE", "EXPENSE"],
  ["5010", "PLATFORM_PROMOTION_EXPENSE", "EXPENSE"],
  ["5020", "DELIVERY_SUBSIDY_EXPENSE", "EXPENSE"],
  ["5030", "CUSTOMER_COMPENSATION_EXPENSE", "EXPENSE"],
  ["5040", "CHARGEBACK_LOSS", "EXPENSE"],
  ["5050", "PAYOUT_PROCESSING_EXPENSE", "EXPENSE"],
  ["5060", "BAD_DEBT_EXPENSE", "EXPENSE"],
  ["5070", "REFUND_PROCESSING_EXPENSE", "EXPENSE"],
  ["5080", "DRIVER_WAITING_COMPENSATION_EXPENSE", "EXPENSE"],
  ["5090", "FRAUD_LOSS_EXPENSE", "EXPENSE"],
  ["5100", "FX_GAIN_OR_LOSS", "EXPENSE"],
] as const;

const titleCaseAccountName = (value: string): string =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const ledgerAccountSeeds = chartOfAccounts.map(
  ([code, accountName, accountType], index) =>
    ({
      id: deterministicSeedUuid(1000 + index),
      code,
      name: titleCaseAccountName(accountName),
      accountType,
      ownerType: "PLATFORM",
      ownerId: null,
      currency: "GHS",
      status: "ACTIVE",
    }) satisfies InferInsertModel<typeof ledgerAccounts>,
);
