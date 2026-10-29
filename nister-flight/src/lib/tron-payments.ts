import { createTronRpcClient } from "@/lib/flight-tron-rpc";
import crypto from "node:crypto";
import {
  AutomationMarket,
  InvoiceAmountReservationStatus,
  MarketEnrollmentStatus,
  NotificationType,
  PaymentOrderStatus,
  PaymentStatus,
  Prisma,
  ReferralCommissionStatus,
  ProcessedTransferStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/site";
import { reconcileUserSubscriptionLifecycle } from "@/lib/subscription-lifecycle";
import { creditUserAvailableFunds } from "@/lib/wallet-funds";

const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_TRANSFER_TOPIC =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const USDT_DECIMALS = 6;
const USDT_MICROS_PER_TOKEN = BigInt(1_000_000);
const MICROS_PER_CENT = BigInt(10_000);
const WATCHER_KEY = "usdt_trc20_default";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map(BASE58_ALPHABET.split("").map((char, idx) => [char, idx]));

type JsonRecord = Record<string, unknown>;
type DbClient = Prisma.TransactionClient | typeof prisma;

type PaymentAddonMetadata = {
  slug: string;
  name: string;
  billing: "ONE_TIME" | "RECURRING";
  priceUsdCents: number;
};

type PaymentOrderMetadata = {
  source?: string;
  paymentMethodId?: string | null;
  planSlug?: string | null;
  amountUsdCents?: number | null;
  planPriceUsdCents?: number | null;
  discountUsdCents?: number | null;
  addonChargeUsdCents?: number | null;
  finalAmountUsdCents?: number | null;
  addons?: PaymentAddonMetadata[];
  referralCodeUsed?: string | null;
  visitorId?: string | null;
  experimentKey?: string | null;
  experimentVariant?: string | null;
  note?: string | null;
  market?: string | null;
  waitlistPrepayAnnual?: boolean;
};

type TronConfig = {
  solidityNodeUrl: string;
  fullNodeUrl: string;
  apiKey: string | null;
  merchantAddressRaw: string;
  merchantAddressHex: string;
  usdtContractRaw: string;
  usdtContractHex: string;
  invoiceTtlMs: number;
  invoiceGraceMs: number;
  reservationCooldownMs: number;
  invoiceOffsetSlots: number;
  watcherMaxBlocks: number;
};

type TronTxInfoLog = {
  address?: string;
  topics?: string[];
  data?: string;
};

type TronTxInfo = {
  id?: string;
  receipt?: {
    result?: string;
  };
  blockNumber?: number;
  blockTimeStamp?: number;
  log?: TronTxInfoLog[];
  result?: string;
};

type ParsedTransferEvent = {
  txHash: string;
  parsedEventIndex: number;
  tokenContractHex: string;
  fromAddressHex: string;
  toAddressHex: string;
  amountMicros: bigint;
  blockNumber: bigint;
  blockTimestamp: Date;
  success: boolean;
  rawPayload: JsonRecord;
};

type CreateInvoiceInput = {
  baseAmountUsdt: string;
  declaredSenderAddress?: string;
  userId?: string;
  metadata?: JsonRecord;
  reference?: string;
  allowReuse?: boolean;
};

type CreateInvoiceResult = {
  reference: string;
  status: PaymentOrderStatus;
  amountUsdt: string;
  amountMicros: string;
  receiveAddress: string;
  token: "USDT";
  network: "TRC20";
  expiresAt: string;
  graceExpiresAt: string;
  qrPayload: string;
};

type SubmitTxInput = {
  reference: string;
  txHash: string;
  submittedSenderAddress?: string;
};

type SubmitTxResult = {
  reference: string;
  orderStatus: PaymentOrderStatus;
  verification:
    | "PAID"
    | "PENDING_CHAIN"
    | "PENDING_MATCH"
    | "MANUAL_REVIEW"
    | "ALREADY_PROCESSED";
  reason?: string;
};

type ScanWatcherInput = {
  maxBlocks?: number;
  dryRun?: boolean;
};

type ScanWatcherResult = {
  scannedBlocks: number;
  latestSolidBlock: number;
  lastProcessedBlock: number;
  ingestedEvents: number;
  autoCredited: number;
  manualReviewQueued: number;
};

type SweepExpiredPendingOrdersInput = {
  now?: Date;
  limit?: number;
  dryRun?: boolean;
};

type SweepExpiredPendingOrdersResult = {
  dryRun: boolean;
  scanned: number;
  expiredOrders: number;
  releasedReservations: number;
  hasMore: boolean;
};

let cachedConfig: { value: TronConfig; expiresAt: number } | null = null;

export function clearTronConfigCache() {
  cachedConfig = null;
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toSafeInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

function toSafeString(value: unknown, max = 191) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, max);
}

function toSafeBool(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function toAutomationMarket(value: string | null | undefined): AutomationMarket | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "FOREX") return AutomationMarket.FOREX;
  if (normalized === "STOCKS") return AutomationMarket.STOCKS;
  if (normalized === "OPTIONS") return AutomationMarket.OPTIONS;
  return null;
}

function parseOrderMetadata(value: Prisma.JsonValue | null | undefined): PaymentOrderMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const row = value as Record<string, unknown>;
  const addonsRaw = Array.isArray(row.addons) ? row.addons : [];
  const addons = addonsRaw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const entry = item as Record<string, unknown>;
      const slug = toSafeString(entry.slug, 80);
      const name = toSafeString(entry.name, 120);
      const billingRaw = String(entry.billing || "").trim().toUpperCase();
      const billing: "ONE_TIME" | "RECURRING" =
        billingRaw === "RECURRING" ? "RECURRING" : "ONE_TIME";
      const priceUsdCents = Math.max(0, toSafeInt(entry.priceUsdCents) || 0);
      if (!slug || !name || priceUsdCents <= 0) {
        return null;
      }
      return {
        slug,
        name,
        billing,
        priceUsdCents,
      };
    })
    .filter((item): item is PaymentAddonMetadata => Boolean(item));

  return {
    source: toSafeString(row.source, 80) || undefined,
    paymentMethodId: toSafeString(row.paymentMethodId, 191),
    planSlug: toSafeString(row.planSlug, 80),
    amountUsdCents: toSafeInt(row.amountUsdCents),
    planPriceUsdCents: toSafeInt(row.planPriceUsdCents),
    discountUsdCents: toSafeInt(row.discountUsdCents),
    addonChargeUsdCents: toSafeInt(row.addonChargeUsdCents),
    finalAmountUsdCents: toSafeInt(row.finalAmountUsdCents),
    addons,
    referralCodeUsed: toSafeString(row.referralCodeUsed, 80),
    visitorId: toSafeString(row.visitorId, 120),
    experimentKey: toSafeString(row.experimentKey, 80),
    experimentVariant: toSafeString(row.experimentVariant, 80),
    note: toSafeString(row.note, 191),
    market: toSafeString(row.market, 24),
    waitlistPrepayAnnual: toSafeBool(row.waitlistPrepayAnnual),
  };
}

function invoiceReuseFingerprint(input: {
  baseAmountMicros: bigint;
  metadata: PaymentOrderMetadata;
}) {
  return JSON.stringify({
    baseAmountMicros: input.baseAmountMicros.toString(),
    source: input.metadata.source || null,
    paymentMethodId: input.metadata.paymentMethodId || null,
    planSlug: input.metadata.planSlug || null,
    amountUsdCents: input.metadata.amountUsdCents ?? null,
    planPriceUsdCents: input.metadata.planPriceUsdCents ?? null,
    discountUsdCents: input.metadata.discountUsdCents ?? null,
    addonChargeUsdCents: input.metadata.addonChargeUsdCents ?? null,
    finalAmountUsdCents: input.metadata.finalAmountUsdCents ?? null,
    market: input.metadata.market || null,
    waitlistPrepayAnnual: Boolean(input.metadata.waitlistPrepayAnnual),
  });
}

function nowMs() {
  return Date.now();
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.trunc(parsed);
  return Math.max(min, Math.min(max, rounded));
}

function normalizeTxHash(raw: string) {
  return String(raw || "").trim().toLowerCase();
}

function isValidTxHash(raw: string) {
  return /^[a-f0-9]{64}$/.test(normalizeTxHash(raw));
}

function buildPendingChainManualReviewDetails(input: {
  txHash: string;
  orderReference: string;
  submittedSenderAddress?: string | null;
}): JsonRecord {
  return {
    tx_hash: normalizeTxHash(input.txHash),
    submitted_sender_address: input.submittedSenderAddress || null,
    order_reference: input.orderReference,
    reason: "Transaction not yet visible on solidified chain",
  };
}

function normalizeHex(raw: string) {
  return String(raw || "").trim().toLowerCase().replace(/^0x/, "");
}

function normalizeHexAddress(raw: string): string | null {
  const value = normalizeHex(raw);
  if (!value) {
    return null;
  }
  if (value.length === 40) {
    return `41${value}`;
  }
  if (value.length === 42 && value.startsWith("41")) {
    return value;
  }
  return null;
}

function decodeBase58(valueRaw: string): Uint8Array | null {
  const value = String(valueRaw || "").trim();
  if (!value) {
    return null;
  }

  let numeric = BigInt(0);
  for (const char of value) {
    const idx = BASE58_INDEX.get(char);
    if (typeof idx !== "number") {
      return null;
    }
    numeric = numeric * BigInt(58) + BigInt(idx);
  }

  const bytes: number[] = [];
  while (numeric > BigInt(0)) {
    bytes.push(Number(numeric % BigInt(256)));
    numeric /= BigInt(256);
  }
  bytes.reverse();

  let leadingZeros = 0;
  while (leadingZeros < value.length && value.charAt(leadingZeros) === "1") {
    leadingZeros += 1;
  }

  return Uint8Array.from([
    ...new Array(leadingZeros).fill(0),
    ...bytes,
  ]);
}

function deriveTronHexFromBase58(raw: string): string | null {
  const decoded = decodeBase58(raw);
  if (!decoded || decoded.length !== 25) {
    return null;
  }

  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const first = crypto.createHash("sha256").update(Buffer.from(payload)).digest();
  const second = crypto.createHash("sha256").update(first).digest();
  const expectedChecksum = second.subarray(0, 4);

  for (let idx = 0; idx < 4; idx += 1) {
    if (checksum[idx] !== expectedChecksum[idx]) {
      return null;
    }
  }
  if (payload[0] !== 0x41) {
    return null;
  }

  return Buffer.from(payload).toString("hex").toLowerCase();
}

function decodeTopicAddress(topicRaw: string): string | null {
  const topic = normalizeHex(topicRaw);
  if (!topic || topic.length < 40) {
    return null;
  }
  const last20 = topic.slice(-40);
  return normalizeHexAddress(`41${last20}`);
}

function parseAmountMicrosFromLogData(dataRaw: string): bigint | null {
  const value = normalizeHex(dataRaw);
  if (!value || !/^[a-f0-9]+$/.test(value)) {
    return null;
  }
  try {
    return BigInt(`0x${value}`);
  } catch {
    return null;
  }
}

function parseUsdtToMicros(valueRaw: string): bigint {
  const value = String(valueRaw || "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error("Amount must be a positive USDT value with up to 6 decimals");
  }
  const [wholeRaw, fracRaw = ""] = value.split(".");
  const whole = BigInt(wholeRaw);
  const frac = BigInt((fracRaw + "000000").slice(0, USDT_DECIMALS));
  const micros = whole * USDT_MICROS_PER_TOKEN + frac;
  if (micros <= BigInt(0)) {
    throw new Error("Amount must be greater than zero");
  }
  return micros;
}

function microsToUsdt(micros: bigint) {
  const safe = micros < BigInt(0) ? BigInt(0) : micros;
  const whole = safe / USDT_MICROS_PER_TOKEN;
  const frac = safe % USDT_MICROS_PER_TOKEN;
  const fracRaw = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracRaw ? `${whole.toString()}.${fracRaw}` : whole.toString();
}

function microsToCentsFloor(micros: bigint) {
  const safe = micros < BigInt(0) ? BigInt(0) : micros;
  return Number(safe / MICROS_PER_CENT);
}

function uniqueReference() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = crypto.randomBytes(3).toString("hex");
  return `INV${stamp}${rand}`.toUpperCase();
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "P2002";
}

const pacedTronRequest = createTronRpcClient({ intervalMs: Math.max(100, Math.min(5000, Number(process.env.TRON_RPC_MIN_INTERVAL_MS) || 200)) });

async function tronJsonRequest(nodeUrl: string, path: string, body: JsonRecord = {}, apiKey: string | null = null) {
  return await pacedTronRequest(nodeUrl, path, body, apiKey) as JsonRecord;
}

async function resolveAddressHex(addressRaw: string, fullNodeUrl: string, apiKey: string | null) {
  const local = normalizeHexAddress(addressRaw);
  if (local) {
    return local;
  }
  const base58Derived = deriveTronHexFromBase58(addressRaw);
  if (base58Derived) {
    return base58Derived;
  }
  const payload = await tronJsonRequest(fullNodeUrl, "/wallet/validateaddress", {
    address: String(addressRaw || "").trim(),
    visible: true,
  }, apiKey);
  if (!payload.result) {
    throw new Error(`Invalid TRON address: ${addressRaw}`);
  }
  const hex =
    normalizeHexAddress(String(payload.hexAddress || "")) ||
    normalizeHexAddress(String(payload.address || "")) ||
    deriveTronHexFromBase58(String(payload.base58 || ""));
  if (!hex) {
    throw new Error(`Could not normalize TRON address: ${addressRaw}`);
  }
  return hex;
}

async function getTronConfig(): Promise<TronConfig> {
  const now = nowMs();
  if (cachedConfig && cachedConfig.expiresAt > now) {
    return cachedConfig.value;
  }

  const settings = await getPlatformSettings();
  const solidityNodeUrl = (
    settings.tronSolidityNodeUrl ||
    process.env.TRON_SOLIDITY_NODE_URL ||
    process.env.TRON_NODE_URL ||
    ""
  ).trim();
  if (!solidityNodeUrl) {
    throw new Error("TRON_SOLIDITY_NODE_URL must be configured");
  }
  const fullNodeUrl = (settings.tronFullNodeUrl || process.env.TRON_FULL_NODE_URL || solidityNodeUrl).trim();
  const dbTronApiKey = await prisma
    .$queryRawUnsafe<Array<{ tronApiKey: string | null }>>(
      "SELECT tronApiKey FROM PlatformSetting WHERE id = ? LIMIT 1",
      1,
    )
    .then((rows) => rows[0]?.tronApiKey || null)
    .catch(() => null);
  const apiKey = (dbTronApiKey || process.env.TRON_PRO_API_KEY || "").trim() || null;
  const merchantAddressRaw = (
    settings.tronMerchantReceiveAddress ||
    process.env.TRON_MERCHANT_RECEIVE_ADDRESS ||
    ""
  ).trim();
  if (!merchantAddressRaw) {
    throw new Error("TRON_MERCHANT_RECEIVE_ADDRESS must be configured");
  }
  const usdtContractRaw = (
    settings.tronUsdtContractAddress ||
    process.env.TRON_USDT_TRC20_CONTRACT ||
    USDT_TRC20_CONTRACT
  ).trim();
  const merchantAddressHex = await resolveAddressHex(merchantAddressRaw, fullNodeUrl, apiKey);
  const usdtContractHex = await resolveAddressHex(usdtContractRaw, fullNodeUrl, apiKey);

  const config: TronConfig = {
    solidityNodeUrl,
    fullNodeUrl,
    apiKey,
    merchantAddressRaw,
    merchantAddressHex,
    usdtContractRaw,
    usdtContractHex,
    invoiceTtlMs:
      parsePositiveInt(
        String(settings.tronInvoiceTtlMinutes ?? process.env.TRON_INVOICE_TTL_MINUTES ?? ""),
        30,
        1,
        60 * 24,
      ) * 60 * 1000,
    invoiceGraceMs:
      parsePositiveInt(
        String(settings.tronInvoiceGraceMinutes ?? process.env.TRON_INVOICE_GRACE_MINUTES ?? ""),
        20,
        0,
        60 * 24,
      ) * 60 * 1000,
    reservationCooldownMs:
      parsePositiveInt(
        String(
          settings.tronAmountReuseCooldownMinutes ?? process.env.TRON_AMOUNT_REUSE_COOLDOWN_MINUTES ?? "",
        ),
        240,
        1,
        60 * 24 * 7,
      ) *
      60 *
      1000,
    invoiceOffsetSlots: parsePositiveInt(
      String(settings.tronInvoiceOffsetSlots ?? process.env.TRON_INVOICE_OFFSET_SLOTS ?? ""),
      99,
      1,
      500,
    ),
    watcherMaxBlocks: parsePositiveInt(
      String(settings.tronWatcherMaxBlocks ?? process.env.TRON_WATCHER_MAX_BLOCKS ?? ""),
      200,
      1,
      500,
    ),
  };

  cachedConfig = {
    value: config,
    expiresAt: now + 5 * 60 * 1000,
  };
  return config;
}

async function getSolidifiedHeadBlock(nodeUrl: string, apiKey: string | null) {
  const payload = await tronJsonRequest(nodeUrl, "/walletsolidity/getnowblock", {}, apiKey);
  const number = Number(
    ((payload.block_header as JsonRecord | undefined)?.raw_data as JsonRecord | undefined)?.number || 0,
  );
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

async function getSolidifiedTxInfo(
  nodeUrl: string,
  txHash: string,
  apiKey: string | null,
): Promise<TronTxInfo | null> {
  const payload = await tronJsonRequest(nodeUrl, "/walletsolidity/gettransactioninfobyid", {
    value: txHash,
  }, apiKey);
  const id = String(payload.id || "").toLowerCase();
  if (!id) {
    return null;
  }
  return payload as unknown as TronTxInfo;
}

async function getSolidifiedTxInfosByBlock(
  nodeUrl: string,
  blockNumber: number,
  apiKey: string | null,
): Promise<TronTxInfo[]> {
  const payload = (await tronJsonRequest(nodeUrl, "/walletsolidity/gettransactioninfobyblocknum", {
    num: blockNumber,
  }, apiKey)) as unknown;
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload as TronTxInfo[];
}

function parseTransferEventsFromTxInfo(input: {
  txHash: string;
  txInfo: TronTxInfo;
}): ParsedTransferEvent[] {
  const logs = Array.isArray(input.txInfo.log) ? input.txInfo.log : [];
  const txHash = normalizeTxHash(input.txHash);
  const blockNumber = BigInt(Math.max(0, Number(input.txInfo.blockNumber || 0)));
  const blockTimestampMs = Number(input.txInfo.blockTimeStamp || 0);
  const blockTimestamp = Number.isFinite(blockTimestampMs) && blockTimestampMs > 0
    ? new Date(blockTimestampMs)
    : new Date();
  const receiptResult = String(input.txInfo.receipt?.result || input.txInfo.result || "")
    .trim()
    .toUpperCase();
  const success = receiptResult === "SUCCESS";

  const out: ParsedTransferEvent[] = [];
  logs.forEach((entry, idx) => {
    const topics = Array.isArray(entry.topics) ? entry.topics : [];
    if (!topics.length) {
      return;
    }
    const eventSig = normalizeHex(topics[0] || "");
    if (eventSig !== USDT_TRANSFER_TOPIC) {
      return;
    }
    const contractHex = normalizeHexAddress(String(entry.address || ""));
    const fromAddressHex = decodeTopicAddress(String(topics[1] || ""));
    const toAddressHex = decodeTopicAddress(String(topics[2] || ""));
    const amountMicros = parseAmountMicrosFromLogData(String(entry.data || ""));
    if (!contractHex || !fromAddressHex || !toAddressHex || amountMicros === null) {
      return;
    }
    out.push({
      txHash,
      parsedEventIndex: idx,
      tokenContractHex: contractHex,
      fromAddressHex,
      toAddressHex,
      amountMicros,
      blockNumber,
      blockTimestamp,
      success,
      rawPayload: {
        log: entry as unknown as JsonRecord,
        receipt_result: receiptResult,
      },
    });
  });
  return out;
}

function getEffectivePaymentOrderStatus(
  order: { status: PaymentOrderStatus; graceExpiresAt: Date },
  now = new Date(),
) {
  if (
    order.status === PaymentOrderStatus.PENDING &&
    order.graceExpiresAt.getTime() < now.getTime()
  ) {
    return PaymentOrderStatus.EXPIRED;
  }
  return order.status;
}

function isTransferCreditEligibleStatus(status: PaymentOrderStatus, reason?: string | null) {
  return (
    status === PaymentOrderStatus.PENDING ||
    status === PaymentOrderStatus.EXPIRED ||
    status === PaymentOrderStatus.PAID ||
    (status === PaymentOrderStatus.MANUAL_REVIEW && reason === "pending_chain_visibility")
  );
}

function isTransferWithinOrderWindow(
  order: { createdAt: Date; graceExpiresAt: Date },
  eventTimestamp: Date,
) {
  const eventTime = eventTimestamp.getTime();
  return (
    eventTime >= order.createdAt.getTime() &&
    eventTime <= order.graceExpiresAt.getTime()
  );
}

export async function sweepExpiredPendingPaymentOrders(
  input: SweepExpiredPendingOrdersInput = {},
): Promise<SweepExpiredPendingOrdersResult> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 500)));
  const stale = await prisma.paymentOrder.findMany({
    where: {
      status: PaymentOrderStatus.PENDING,
      graceExpiresAt: {
        lt: now,
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      graceExpiresAt: "asc",
    },
    take: limit + 1,
  });
  const hasMore = stale.length > limit;
  const sweepTargets = stale.slice(0, limit);
  if (!sweepTargets.length) {
    return {
      dryRun: Boolean(input.dryRun),
      scanned: 0,
      expiredOrders: 0,
      releasedReservations: 0,
      hasMore: false,
    };
  }
  const staleIds = sweepTargets.map((row) => row.id);
  const reservationWhere = {
    orderId: {
      in: staleIds,
    },
    status: InvoiceAmountReservationStatus.RESERVED,
    releaseAt: {
      lte: now,
    },
  } satisfies Prisma.InvoiceAmountReservationWhereInput;
  if (input.dryRun) {
    const releasedReservations = await prisma.invoiceAmountReservation.count({
      where: reservationWhere,
    });
    return {
      dryRun: true,
      scanned: sweepTargets.length,
      expiredOrders: sweepTargets.length,
      releasedReservations,
      hasMore,
    };
  }
  const [expiredUpdate, releasedReservations] = await prisma.$transaction([
    prisma.paymentOrder.updateMany({
      where: {
        id: {
          in: staleIds,
        },
        status: PaymentOrderStatus.PENDING,
      },
      data: {
        status: PaymentOrderStatus.EXPIRED,
        manualReviewReason: "invoice_expired",
      },
    }),
    prisma.invoiceAmountReservation.deleteMany({
      where: reservationWhere,
    }),
  ]);
  return {
    dryRun: false,
    scanned: sweepTargets.length,
    expiredOrders: expiredUpdate.count,
    releasedReservations: releasedReservations.count,
    hasMore,
  };
}

async function toManualReview(orderId: string, reason: string, details: JsonRecord) {
  await prisma.$transaction(async (tx) => {
    const orderUpdate = await tx.paymentOrder.updateMany({
      where: {
        id: orderId,
        status: PaymentOrderStatus.PENDING,
      },
      data: {
        status: PaymentOrderStatus.MANUAL_REVIEW,
        manualReviewReason: reason,
      },
    });
    const unresolved = await tx.paymentManualReview.findFirst({
      where: {
        orderId,
        resolvedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (unresolved) {
      await tx.paymentManualReview.update({
        where: { id: unresolved.id },
        data: {
          reason,
          detailsJson: asInputJson(details),
        },
      });
      return;
    }
    if (orderUpdate.count !== 1) {
      await tx.paymentOrder.updateMany({
        where: {
          id: orderId,
          status: {
            not: PaymentOrderStatus.PAID,
          },
        },
        data: {
          manualReviewReason: reason,
        },
      });
    }
    await tx.paymentManualReview.create({
      data: {
        orderId,
        reason,
        detailsJson: asInputJson(details),
      },
    });
  });
}

async function upsertChainPayment(event: ParsedTransferEvent) {
  await prisma.chainPayment.upsert({
    where: {
      txHash_parsedEventIndex: {
        txHash: event.txHash,
        parsedEventIndex: event.parsedEventIndex,
      },
    },
    create: {
      txHash: event.txHash,
      parsedEventIndex: event.parsedEventIndex,
      blockNumber: event.blockNumber,
      blockTimestamp: event.blockTimestamp,
      tokenContract: event.tokenContractHex,
      fromAddress: event.fromAddressHex,
      toAddress: event.toAddressHex,
      amountMicros: event.amountMicros,
      success: event.success,
      source: "solidity_node",
      rawPayloadJson: asInputJson(event.rawPayload),
    },
    update: {
      blockNumber: event.blockNumber,
      blockTimestamp: event.blockTimestamp,
      tokenContract: event.tokenContractHex,
      fromAddress: event.fromAddressHex,
      toAddress: event.toAddressHex,
      amountMicros: event.amountMicros,
      success: event.success,
      source: "solidity_node",
      rawPayloadJson: asInputJson(event.rawPayload),
    },
  });
}

async function triggerFulfillmentIfApplicable(input: {
  userId: string | null;
  amountMicros: bigint;
}) {
  if (!input.userId) {
    return;
  }
  await reconcileUserSubscriptionLifecycle(input.userId);
  await notifyUser(input.userId, {
    type: NotificationType.PAYMENT,
    title: "Payment received",
    message: `Your USDT-TRC20 payment ${microsToUsdt(input.amountMicros)} has been confirmed.`,
    href: "/dashboard/billing",
    email: {
      subject: "Payment confirmed",
    },
  });
}

async function resolvePaymentMethodIdForOrder(input: {
  tx?: DbClient;
  metadata: PaymentOrderMetadata;
  fallbackSymbol?: string | null;
  fallbackNetwork?: string | null;
}) {
  const db = input.tx || prisma;
  const explicitId = input.metadata.paymentMethodId || null;
  if (explicitId) {
    const row = await db.paymentMethod.findUnique({
      where: { id: explicitId },
      select: { id: true },
    });
    if (row) {
      return row.id;
    }
  }

  const fallbackSymbol = (input.fallbackSymbol || "USDT").trim().toUpperCase();
  const fallbackNetwork = (input.fallbackNetwork || "TRC20").trim().toUpperCase();
  const method = await db.paymentMethod.findFirst({
    where: {
      active: true,
      symbol: {
        equals: fallbackSymbol,
      },
      network: {
        equals: fallbackNetwork,
      },
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
    },
  });
  return method?.id || null;
}

async function applyPostCreditSideEffects(input: {
  tx?: DbClient;
  userId: string;
  txHash: string;
  amountMicros: bigint;
  metadata: PaymentOrderMetadata;
  fallbackSymbol?: string | null;
  fallbackNetwork?: string | null;
}) {
  const db = input.tx || prisma;
  const existing = await db.paymentSubmission.findUnique({
    where: { txHash: input.txHash },
    select: { id: true, userId: true },
  });
  if (existing && existing.userId !== input.userId) {
    return {
      creditedUsdCents: microsToCentsFloor(input.amountMicros),
      submissionId: null as string | null,
    };
  }

  const paymentMethodId = await resolvePaymentMethodIdForOrder({
    tx: db,
    metadata: input.metadata,
    fallbackSymbol: input.fallbackSymbol,
    fallbackNetwork: input.fallbackNetwork,
  });
  if (!paymentMethodId) {
    return {
      creditedUsdCents: microsToCentsFloor(input.amountMicros),
      submissionId: null as string | null,
    };
  }

  const grossAmountUsdCents = verifiedPaymentCreditCents(input.amountMicros,
    input.metadata.finalAmountUsdCents ?? input.metadata.amountUsdCents);
  const addons = input.metadata.addons || [];
  const addonChargeUsdCents = Math.max(
    0,
    input.metadata.addonChargeUsdCents ??
      addons.reduce((sum, addon) => sum + Math.max(0, addon.priceUsdCents), 0),
  );
  const oneTimeAddonChargeUsdCents = addons
    .filter((addon) => addon.billing === "ONE_TIME")
    .reduce((sum, addon) => sum + Math.max(0, addon.priceUsdCents), 0);
  const creditedUsdCents = Math.max(0, grossAmountUsdCents - oneTimeAddonChargeUsdCents);
  const now = new Date();

  const submission = await db.paymentSubmission.upsert({
    where: { txHash: input.txHash },
    update: {
      userId: input.userId,
      paymentMethodId,
      planSlug: input.metadata.planSlug || null,
      visitorId: input.metadata.visitorId || null,
      amountUsdCents: input.metadata.amountUsdCents ?? grossAmountUsdCents,
      planPriceUsdCents: input.metadata.planPriceUsdCents ?? null,
      discountUsdCents: Math.max(0, input.metadata.discountUsdCents ?? 0),
      addonChargeUsdCents,
      finalAmountUsdCents: grossAmountUsdCents,
      addonsJson: addons.length ? asInputJson(addons) : Prisma.JsonNull,
      experimentKey: input.metadata.experimentKey || null,
      experimentVariant: input.metadata.experimentVariant || null,
      referralCodeUsed: input.metadata.referralCodeUsed || null,
      note: input.metadata.note || null,
      status: PaymentStatus.APPROVED,
      reviewedById: null,
      reviewedAt: now,
      reviewNote: "Auto-verified on solidified chain",
    },
    create: {
      userId: input.userId,
      paymentMethodId,
      planSlug: input.metadata.planSlug || null,
      visitorId: input.metadata.visitorId || null,
      amountUsdCents: input.metadata.amountUsdCents ?? grossAmountUsdCents,
      planPriceUsdCents: input.metadata.planPriceUsdCents ?? null,
      discountUsdCents: Math.max(0, input.metadata.discountUsdCents ?? 0),
      addonChargeUsdCents,
      finalAmountUsdCents: grossAmountUsdCents,
      addonsJson: addons.length ? asInputJson(addons) : Prisma.JsonNull,
      experimentKey: input.metadata.experimentKey || null,
      experimentVariant: input.metadata.experimentVariant || null,
      referralCodeUsed: input.metadata.referralCodeUsed || null,
      txHash: input.txHash,
      note: input.metadata.note || null,
      status: PaymentStatus.APPROVED,
      reviewNote: "Auto-verified on solidified chain",
      reviewedById: null,
      reviewedAt: now,
    },
  });

  const requestedPlan = input.metadata.planSlug
    ? await db.pricingPlan.findUnique({
        where: { slug: input.metadata.planSlug },
        select: { id: true, automationMarket: true },
      })
    : null;

  const isWaitlistPrepay = Boolean(input.metadata.waitlistPrepayAnnual);
  if (isWaitlistPrepay) {
    const market =
      toAutomationMarket(input.metadata.market) ||
      requestedPlan?.automationMarket ||
      null;
    if (market) {
      await db.marketEnrollment.upsert({
        where: {
          userId_market: {
            userId: input.userId,
            market,
          },
        },
        update: {
          planId: requestedPlan?.id || null,
          status: MarketEnrollmentStatus.WAITLIST_PREPAID,
          annualPrepaySelected: true,
          annualPrepayAmountUsdCents: grossAmountUsdCents,
          annualPrepayPaidAt: now,
        },
        create: {
          userId: input.userId,
          market,
          planId: requestedPlan?.id || null,
          status: MarketEnrollmentStatus.WAITLIST_PREPAID,
          annualPrepaySelected: true,
          annualPrepayAmountUsdCents: grossAmountUsdCents,
          annualPrepayPaidAt: now,
        },
      });
    }
  } else if (requestedPlan) {
    const recurringAddonSlugs = addons
      .filter((addon) => addon.billing === "RECURRING")
      .map((addon) => addon.slug);
    await db.subscription.upsert({
      where: { userId: input.userId },
      update: {
        planId: requestedPlan.id,
        activeAddonSlugs: recurringAddonSlugs.length ? asInputJson(recurringAddonSlugs) : Prisma.DbNull,
      },
      create: {
        userId: input.userId,
        planId: requestedPlan.id,
        status: SubscriptionStatus.INACTIVE,
        activeAddonSlugs: recurringAddonSlugs.length ? asInputJson(recurringAddonSlugs) : Prisma.DbNull,
      },
    });
  }

  const settings = await getPlatformSettings();
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { referredById: true },
  });
  if (settings.referralEnabled && user?.referredById) {
    const finalAmount = Math.max(0, submission.finalAmountUsdCents ?? submission.amountUsdCents ?? 0);
    const discountAmount = Math.max(0, submission.discountUsdCents ?? 0);
    const commissionAmount = Math.max(
      0,
      Math.floor((Math.max(0, finalAmount) * settings.referralCommissionBps) / 10_000),
    );
    if (commissionAmount > 0) {
      const existingCommission = await db.referralCommission.findUnique({
        where: { paymentSubmissionId: submission.id },
        select: { id: true, status: true },
      });
      if (existingCommission) {
        if (existingCommission.status === ReferralCommissionStatus.REVERSED) {
          await db.referralCommission.update({
            where: { id: existingCommission.id },
            data: {
              status: ReferralCommissionStatus.PENDING,
            },
          });
        }
      } else {
        await db.referralCommission.create({
          data: {
            referrerId: user.referredById,
            referredUserId: input.userId,
            paymentSubmissionId: submission.id,
            status: ReferralCommissionStatus.PENDING,
            commissionPercentBps: settings.referralCommissionBps,
            discountPercentBps: settings.referralDiscountBps,
            grossAmountUsdCents: submission.planPriceUsdCents ?? submission.finalAmountUsdCents ?? finalAmount,
            discountUsdCents: discountAmount,
            commissionUsdCents: commissionAmount,
          },
        });
      }
    }
  }

  return {
    creditedUsdCents,
    submissionId: submission.id,
  };
}

async function finalizeTransferCredit(input: {
  orderId: string;
  event: ParsedTransferEvent;
  reasonNote?: string;
  dryRun?: boolean;
}, deps: {
  applyPostCreditSideEffects: typeof applyPostCreditSideEffects;
  creditUserAvailableFunds: typeof creditUserAvailableFunds;
  triggerFulfillmentIfApplicable: typeof triggerFulfillmentIfApplicable;
} = {
  applyPostCreditSideEffects,
  creditUserAvailableFunds,
  triggerFulfillmentIfApplicable,
}) {
  const existing = await prisma.processedTransfer.findUnique({
    where: {
      txHash_parsedEventIndex: {
        txHash: input.event.txHash,
        parsedEventIndex: input.event.parsedEventIndex,
      },
    },
    select: {
      id: true,
      orderId: true,
      creditStatus: true,
    },
  });
  if (existing) {
    if (existing.orderId === input.orderId && existing.creditStatus === ProcessedTransferStatus.CREDITED) {
      return "ALREADY_PROCESSED" as const;
    }
    throw new Error("Processed transfer already consumed by another order");
  }

  if (input.dryRun) {
    return "PAID" as const;
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Serialize all wallet mutations with Flight; the second receipt must observe
    // a paid invoice before it can apply any credit.
    await tx.$queryRaw`SELECT id FROM FlightControl WHERE id = 1 FOR UPDATE`;
    const order = await tx.paymentOrder.findUnique({
      where: {
        id: input.orderId,
      },
      select: {
        id: true,
        userId: true,
        status: true,
        currency: true,
        network: true,
        createdAt: true,
        graceExpiresAt: true,
        manualReviewReason: true,
        metadataJson: true,
      },
    });
    if (!order) {
      throw new Error("Order not found");
    }
    if (order.status === PaymentOrderStatus.PAID) {
      const consumed = await tx.processedTransfer.findUnique({ where: { txHash_parsedEventIndex: { txHash: input.event.txHash, parsedEventIndex: input.event.parsedEventIndex } } });
      if (consumed?.orderId === order.id && consumed.creditStatus === ProcessedTransferStatus.CREDITED) {
        return { userId: null, amountMicros: input.event.amountMicros, source: "flight_topup" };
      }
      throw new Error("This invoice has already been credited by another transfer.");
    }
    if (!isTransferCreditEligibleStatus(order.status, order.manualReviewReason)) {
      throw new Error(`Order not creditable in status ${order.status}`);
    }
    if (!isTransferWithinOrderWindow(order, input.event.blockTimestamp)) {
      throw new Error("Order not creditable outside invoice window");
    }

    const metadata = parseOrderMetadata(order.metadataJson as Prisma.JsonValue | null);
    let postEffects: {
      creditedUsdCents: number;
      submissionId?: string | null;
    } = {
      creditedUsdCents: microsToCentsFloor(input.event.amountMicros),
    };
    if (order.userId && metadata.source !== "flight_topup") {
      postEffects = await deps.applyPostCreditSideEffects({
        tx,
        userId: order.userId,
        txHash: input.event.txHash,
        amountMicros: input.event.amountMicros,
        metadata,
        fallbackSymbol: order.currency,
        fallbackNetwork: order.network,
      });
    }
    if (order.userId) {
      const creditCents =
        typeof postEffects.creditedUsdCents === "number" && Number.isFinite(postEffects.creditedUsdCents)
          ? Math.max(0, Math.round(postEffects.creditedUsdCents))
          : microsToCentsFloor(input.event.amountMicros);
      if (creditCents > 0) {
        await deps.creditUserAvailableFunds({
          tx,
          userId: order.userId,
          creditUsdCents: creditCents,
          reference: `deposit:${input.event.txHash}:${input.event.parsedEventIndex}`,
        });
      }
    }

    await tx.processedTransfer.create({
      data: {
        txHash: input.event.txHash,
        parsedEventIndex: input.event.parsedEventIndex,
        tokenContract: input.event.tokenContractHex,
        fromAddress: input.event.fromAddressHex,
        toAddress: input.event.toAddressHex,
        amountMicros: input.event.amountMicros,
        orderId: order.id,
        creditStatus: ProcessedTransferStatus.CREDITED,
        notes: input.reasonNote || null,
        blockNumber: input.event.blockNumber,
        blockTimestamp: input.event.blockTimestamp,
      },
    });
    await tx.paymentOrder.update({
      where: {
        id: order.id,
      },
      data: {
        status: PaymentOrderStatus.PAID,
        paidAt: new Date(),
        manualReviewReason: null,
      },
    });
    await tx.invoiceAmountReservation.deleteMany({
      where: {
        orderId: order.id,
        status: InvoiceAmountReservationStatus.RESERVED,
      },
    });
    return {
      userId: order.userId,
      amountMicros: input.event.amountMicros,
      source: metadata.source,
    };
  });

  try {
    if (updated.source !== "flight_topup") await deps.triggerFulfillmentIfApplicable({
      userId: updated.userId,
      amountMicros: updated.amountMicros,
    });
  } catch (error) {
    console.error("Non-blocking post-credit fulfillment failed", error);
  }
  return "PAID" as const;
}

async function verifySingleOrderTransfer(input: {
  orderReference: string;
  txHash: string;
  submittedSenderAddress?: string;
  dryRun?: boolean;
}): Promise<SubmitTxResult> {
  const config = await getTronConfig();
  const txHash = normalizeTxHash(input.txHash);
  const now = new Date();

  const order = await prisma.paymentOrder.findUnique({
    where: {
      reference: input.orderReference,
    },
    select: {
      id: true,
      reference: true,
      userId: true,
      status: true,
      invoiceAmountMicros: true,
      createdAt: true,
      graceExpiresAt: true,
      declaredSenderAddress: true,
      merchantReceiveAddress: true,
      manualReviewReason: true,
    },
  });
  if (!order) {
    throw new Error("Order not found");
  }
  if (order.status === PaymentOrderStatus.PAID) {
    return {
      reference: order.reference,
      orderStatus: order.status,
      verification: "ALREADY_PROCESSED",
    };
  }
  const effectiveStatus = getEffectivePaymentOrderStatus(order, now);
  if (!isTransferCreditEligibleStatus(effectiveStatus, order.manualReviewReason)) {
    return {
      reference: order.reference,
      orderStatus: effectiveStatus,
      verification: "MANUAL_REVIEW",
      reason: `Order status is ${effectiveStatus}`,
    };
  }

  const normalizedSubmittedSender = input.submittedSenderAddress
    ? await resolveAddressHex(input.submittedSenderAddress, config.fullNodeUrl, config.apiKey).catch(() => null)
    : null;
  if (input.submittedSenderAddress && !normalizedSubmittedSender) {
    throw new Error("Invalid declared sender address");
  }
  const receiver = deriveTronHexFromBase58(order.merchantReceiveAddress) || config.merchantAddressHex;
  if (normalizedSubmittedSender && (normalizedSubmittedSender === receiver || normalizedSubmittedSender === config.merchantAddressHex)) throw new Error(SENDER_WALLET_WARNING);
  // Correct old invoices where the receiving wallet was mistakenly entered as sender.
  const correctingReceiver = order.declaredSenderAddress === receiver || order.declaredSenderAddress === config.merchantAddressHex;
  if (normalizedSubmittedSender && order.declaredSenderAddress && !correctingReceiver && normalizedSubmittedSender !== order.declaredSenderAddress) throw new Error("Use the sending wallet entered when this invoice was created.");
  if (!order.declaredSenderAddress && !normalizedSubmittedSender) {
    await toManualReview(order.id, "declared_sender_missing", {
      tx_hash: txHash,
      order_reference: order.reference,
    });
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.MANUAL_REVIEW,
      verification: "MANUAL_REVIEW",
      reason: "Declared sender wallet is required",
    };
  }

  if (normalizedSubmittedSender && (!order.declaredSenderAddress || correctingReceiver)) {
    await prisma.paymentOrder.update({
      where: {
        id: order.id,
      },
      data: {
        declaredSenderAddress: normalizedSubmittedSender,
      },
    });
  }

  const existingSubmission = await prisma.paymentTxSubmission.findFirst({
    where: {
      submittedTxHash: txHash,
    },
    select: {
      orderId: true,
    },
  });
  if (existingSubmission && existingSubmission.orderId !== order.id) {
    await toManualReview(order.id, "duplicate_tx_submission", {
      tx_hash: txHash,
      existing_order_id: existingSubmission.orderId,
      order_reference: order.reference,
    });
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.MANUAL_REVIEW,
      verification: "MANUAL_REVIEW",
      reason: "Transaction hash already submitted for another order",
    };
  }
  if (!existingSubmission) {
    await prisma.paymentTxSubmission.create({
      data: {
        orderId: order.id,
        submittedTxHash: txHash,
        submittedSenderAddress: normalizedSubmittedSender || null,
      },
    });
  }

  const txInfo = await getSolidifiedTxInfo(config.solidityNodeUrl, txHash, config.apiKey);
  if (!txInfo) {
    await toManualReview(
      order.id,
      "pending_chain_visibility",
      buildPendingChainManualReviewDetails({
        txHash,
        orderReference: order.reference,
        submittedSenderAddress: input.submittedSenderAddress || normalizedSubmittedSender,
      }),
    );
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.MANUAL_REVIEW,
      verification: "MANUAL_REVIEW",
      reason: "Transaction not yet visible on solidified chain",
    };
  }

  const events = parseTransferEventsFromTxInfo({
    txHash,
    txInfo,
  });
  for (const event of events) {
    await upsertChainPayment(event);
  }

  const toMerchant = events.filter(
    (event) =>
      event.tokenContractHex === config.usdtContractHex &&
      event.toAddressHex === config.merchantAddressHex &&
      event.success,
  );
  if (!toMerchant.length) {
    await toManualReview(order.id, "wrong_token_or_destination", {
      tx_hash: txHash,
      order_reference: order.reference,
      event_count: events.length,
    });
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.MANUAL_REVIEW,
      verification: "MANUAL_REVIEW",
      reason: "No successful USDT-TRC20 transfer to merchant wallet was found",
    };
  }

  const exactMatches = toMerchant.filter((event) => event.amountMicros === order.invoiceAmountMicros);
  if (exactMatches.length !== 1) {
    await toManualReview(order.id, "amount_mismatch_or_ambiguous", {
      tx_hash: txHash,
      order_reference: order.reference,
      expected_amount_micros: order.invoiceAmountMicros.toString(),
      matched_events: exactMatches.length,
      candidate_amounts_micros: toMerchant.map((event) => event.amountMicros.toString()),
    });
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.MANUAL_REVIEW,
      verification: "MANUAL_REVIEW",
      reason: "Transfer amount did not uniquely match the reserved invoice amount",
    };
  }

  const matched = exactMatches[0];
  if (
    !isTransferWithinOrderWindow(order, matched.blockTimestamp)
  ) {
    await toManualReview(order.id, "timestamp_outside_invoice_window", {
      tx_hash: txHash,
      tx_time: matched.blockTimestamp.toISOString(),
      order_created_at: order.createdAt.toISOString(),
      order_grace_expires_at: order.graceExpiresAt.toISOString(),
    });
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.MANUAL_REVIEW,
      verification: "MANUAL_REVIEW",
      reason: "Transfer timestamp is outside invoice validity window",
    };
  }

  const expectedSender = correctingReceiver ? normalizedSubmittedSender : order.declaredSenderAddress || normalizedSubmittedSender;
  if (!expectedSender || matched.fromAddressHex === receiver || matched.fromAddressHex === config.merchantAddressHex) throw new Error(SENDER_WALLET_WARNING);
  if (expectedSender && matched.fromAddressHex !== expectedSender) {
    await toManualReview(order.id, "declared_sender_mismatch", {
      tx_hash: txHash,
      expected_sender: expectedSender,
      onchain_sender: matched.fromAddressHex,
    });
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.MANUAL_REVIEW,
      verification: "MANUAL_REVIEW",
      reason: "Declared sender address does not match on-chain sender",
    };
  }

  try {
    const state = await finalizeTransferCredit({
      orderId: order.id,
      event: matched,
      dryRun: input.dryRun,
      reasonNote: "direct_tx_hash_verification",
    });
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.PAID,
      verification: state,
    };
  } catch (error) {
    await toManualReview(order.id, "replay_or_duplicate_transfer", {
      tx_hash: txHash,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return {
      reference: order.reference,
      orderStatus: PaymentOrderStatus.MANUAL_REVIEW,
      verification: "MANUAL_REVIEW",
      reason: "Transfer was already consumed or replayed",
    };
  }
}

async function attemptAutoMatchForEvent(input: {
  event: ParsedTransferEvent;
  dryRun?: boolean;
}): Promise<{ autoCredited: number; manualReviewQueued: number }> {
  const pendingCandidates = await prisma.paymentOrder.findMany({
    where: {
      OR: [{ status: PaymentOrderStatus.PENDING }, { status: PaymentOrderStatus.MANUAL_REVIEW, manualReviewReason: "pending_chain_visibility" }],
      invoiceAmountMicros: input.event.amountMicros,
      createdAt: {
        lte: input.event.blockTimestamp,
      },
      graceExpiresAt: {
        gte: input.event.blockTimestamp,
      },
    },
    select: {
      id: true,
      declaredSenderAddress: true,
    },
    take: 50,
  });
  if (!pendingCandidates.length) {
    return {
      autoCredited: 0,
      manualReviewQueued: 0,
    };
  }

  const senderFiltered = pendingCandidates.filter((order) => {
    if (!order.declaredSenderAddress) {
      return true;
    }
    return order.declaredSenderAddress === input.event.fromAddressHex;
  });

  if (senderFiltered.length === 1) {
    try {
      const state = await finalizeTransferCredit({
        orderId: senderFiltered[0].id,
        event: input.event,
        dryRun: input.dryRun,
        reasonNote: "watcher_auto_match",
      });
      if (state === "PAID") {
        return { autoCredited: 1, manualReviewQueued: 0 };
      }
      return { autoCredited: 0, manualReviewQueued: 0 };
    } catch (error) {
      await toManualReview(senderFiltered[0].id, "replay_or_duplicate_transfer", {
        tx_hash: input.event.txHash,
        parsed_event_index: input.event.parsedEventIndex,
        error: error instanceof Error ? error.message : "unknown_error",
      });
      return { autoCredited: 0, manualReviewQueued: 1 };
    }
  }

  let manualCount = 0;
  const targets = senderFiltered.length > 1 ? senderFiltered : pendingCandidates;
  for (const order of targets) {
    await toManualReview(order.id, "duplicate_amount_ambiguity", {
      tx_hash: input.event.txHash,
      parsed_event_index: input.event.parsedEventIndex,
      amount_micros: input.event.amountMicros.toString(),
      pending_match_count: targets.length,
    });
    manualCount += 1;
  }
  return {
    autoCredited: 0,
    manualReviewQueued: manualCount,
  };
}

export async function createPaymentInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const config = await getTronConfig();
  if (input.declaredSenderAddress) await assertFundingSender(input.declaredSenderAddress);
  const baseAmountMicros = parseUsdtToMicros(input.baseAmountUsdt);
  const metadata = parseOrderMetadata((input.metadata ?? null) as Prisma.JsonValue | null);
  const incomingFingerprint = invoiceReuseFingerprint({
    baseAmountMicros,
    metadata,
  });
  const now = new Date();

  const existingCandidates = input.userId && input.allowReuse !== false
    ? await prisma.paymentOrder.findMany({
        where: {
          userId: input.userId,
          status: PaymentOrderStatus.PENDING,
          graceExpiresAt: {
            gte: now,
          },
          baseAmountMicros,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      })
    : [];
  const existing =
    existingCandidates.find((candidate) => {
      const candidateFingerprint = invoiceReuseFingerprint({
        baseAmountMicros: candidate.baseAmountMicros,
        metadata: parseOrderMetadata(candidate.metadataJson),
      });
      return candidateFingerprint === incomingFingerprint;
    }) || null;
  if (existing && input.allowReuse !== false) {
    return {
      reference: existing.reference,
      status: existing.status,
      amountUsdt: microsToUsdt(existing.invoiceAmountMicros),
      amountMicros: existing.invoiceAmountMicros.toString(),
      receiveAddress: existing.merchantReceiveAddress,
      token: "USDT",
      network: "TRC20",
      expiresAt: existing.expiresAt.toISOString(),
      graceExpiresAt: existing.graceExpiresAt.toISOString(),
      qrPayload: `tron:${existing.merchantReceiveAddress}?token=USDT&amount=${microsToUsdt(existing.invoiceAmountMicros)}`,
    };
  }

  const declaredSenderAddress = input.declaredSenderAddress
    ? await resolveAddressHex(input.declaredSenderAddress, config.fullNodeUrl, config.apiKey).catch(() => null)
    : null;
  if (input.declaredSenderAddress && !declaredSenderAddress) {
    throw new Error("Invalid declared sender address");
  }

  const expiresAt = new Date(now.getTime() + config.invoiceTtlMs);
  const graceExpiresAt = new Date(expiresAt.getTime() + config.invoiceGraceMs);
  const releaseAt = new Date(graceExpiresAt.getTime() + config.reservationCooldownMs);
  const slotOffsetMicros = MICROS_PER_CENT;

  for (let slot = 1; slot <= config.invoiceOffsetSlots; slot += 1) {
    const invoiceAmountMicros = baseAmountMicros + BigInt(slot) * slotOffsetMicros;
    try {
      const reference = (input.reference || uniqueReference()).trim();
      const created = await prisma.$transaction(async (tx) => {
        const order = await tx.paymentOrder.create({
          data: {
            userId: input.userId || null,
            reference,
            baseAmountMicros,
            invoiceAmountMicros,
            currency: "USDT",
            network: "TRC20",
            merchantReceiveAddress: config.merchantAddressRaw,
            declaredSenderAddress: declaredSenderAddress || null,
            status: PaymentOrderStatus.PENDING,
            createdAt: now,
            expiresAt,
            graceExpiresAt,
            metadataJson: input.metadata ? asInputJson(input.metadata) : Prisma.JsonNull,
          },
        });
        await tx.invoiceAmountReservation.create({
          data: {
            invoiceAmountMicros,
            orderId: order.id,
            reservedAt: now,
            releaseAt,
            status: InvoiceAmountReservationStatus.RESERVED,
          },
        });
        return order;
      });

      return {
        reference: created.reference,
        status: created.status,
        amountUsdt: microsToUsdt(created.invoiceAmountMicros),
        amountMicros: created.invoiceAmountMicros.toString(),
        receiveAddress: created.merchantReceiveAddress,
        token: "USDT",
        network: "TRC20",
        expiresAt: created.expiresAt.toISOString(),
        graceExpiresAt: created.graceExpiresAt.toISOString(),
        qrPayload: `tron:${created.merchantReceiveAddress}?token=USDT&amount=${microsToUsdt(created.invoiceAmountMicros)}`,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to reserve a unique invoice amount at this time");
}

export async function submitTxForPayment(input: SubmitTxInput): Promise<SubmitTxResult> {
  const txHash = normalizeTxHash(input.txHash);
  if (!isValidTxHash(txHash)) {
    throw new Error("Invalid transaction hash format");
  }
  return await verifySingleOrderTransfer({
    orderReference: String(input.reference || "").trim(),
    txHash,
    submittedSenderAddress: input.submittedSenderAddress,
  });
}

export async function getPaymentStatusByReference(reference: string, userId?: string) {
  const now = new Date();

  const order = await prisma.paymentOrder.findUnique({
    where: {
      reference: String(reference || "").trim(),
    },
    include: {
      submissions: {
        orderBy: {
          submittedAt: "desc",
        },
        take: 5,
      },
      manualReviews: {
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      },
    },
  });
  if (!order) {
    return null;
  }
  if (userId && order.userId !== userId) {
    return null;
  }
  const effectiveStatus = getEffectivePaymentOrderStatus(order, now);
  return {
    reference: order.reference,
    status: effectiveStatus,
    amountUsdt: microsToUsdt(order.invoiceAmountMicros),
    amountMicros: order.invoiceAmountMicros.toString(),
    receiveAddress: order.merchantReceiveAddress,
    token: "USDT" as const,
    network: "TRC20" as const,
    qrPayload: `tron:${order.merchantReceiveAddress}?token=USDT&amount=${microsToUsdt(order.invoiceAmountMicros)}`,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
    graceExpiresAt: order.graceExpiresAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    message: effectiveStatus === PaymentOrderStatus.MANUAL_REVIEW ? "Your transfer is awaiting confirmation or a payment review. Keep your reference for support." : null,

  };
}

export async function scanSolidifiedPayments(input: ScanWatcherInput = {}): Promise<ScanWatcherResult> {
  const config = await getTronConfig();
  const maxBlocks = Math.max(1, Math.min(500, Math.trunc(input.maxBlocks || config.watcherMaxBlocks)));
  const latestSolidBlock = await getSolidifiedHeadBlock(config.solidityNodeUrl, config.apiKey);
  const cursor = await prisma.paymentWatcherCursor.upsert({
    where: {
      watchKey: WATCHER_KEY,
    },
    create: {
      watchKey: WATCHER_KEY,
      lastScannedBlock: BigInt(Math.max(0, latestSolidBlock - 1)),
    },
    update: {},
  });

  const startBlock = Number(cursor.lastScannedBlock) + 1;
  const endBlock = Math.min(latestSolidBlock, startBlock + maxBlocks - 1);
  if (endBlock < startBlock) {
    return {
      scannedBlocks: 0,
      latestSolidBlock,
      lastProcessedBlock: Number(cursor.lastScannedBlock),
      ingestedEvents: 0,
      autoCredited: 0,
      manualReviewQueued: 0,
    };
  }

  let ingestedEvents = 0;
  let autoCredited = 0;
  let manualReviewQueued = 0;
  let lastProcessedBlock = Number(cursor.lastScannedBlock);

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber += 1) {
    const txInfos = await getSolidifiedTxInfosByBlock(config.solidityNodeUrl, blockNumber, config.apiKey);

    for (const txInfo of txInfos) {
      const txHash = normalizeTxHash(String(txInfo.id || ""));
      if (!isValidTxHash(txHash)) {
        continue;
      }
      const events = parseTransferEventsFromTxInfo({ txHash, txInfo });
      for (const event of events) {
        if (
          event.tokenContractHex !== config.usdtContractHex ||
          event.toAddressHex !== config.merchantAddressHex ||
          event.fromAddressHex === config.merchantAddressHex ||
          !event.success
        ) {
          continue;
        }
        ingestedEvents += 1;
        await upsertChainPayment(event);
        const result = await attemptAutoMatchForEvent({
          event,
          dryRun: Boolean(input.dryRun),
        });
        autoCredited += result.autoCredited;
        manualReviewQueued += result.manualReviewQueued;
      }
    }

    if (!input.dryRun) {
      await prisma.paymentWatcherCursor.update({
        where: {
          watchKey: WATCHER_KEY,
        },
        data: {
          lastScannedBlock: BigInt(blockNumber),
        },
      });
    }
    lastProcessedBlock = blockNumber;
  }

  return {
    scannedBlocks: Math.max(0, endBlock - startBlock + 1),
    latestSolidBlock,
    lastProcessedBlock,
    ingestedEvents,
    autoCredited,
    manualReviewQueued,
  };
}

export const __test = {
  normalizeTxHash,
  isValidTxHash,
  normalizeHexAddress,
  decodeTopicAddress,
  parseAmountMicrosFromLogData,
  parseUsdtToMicros,
  microsToUsdt,
  parseTransferEventsFromTxInfo,
  buildPendingChainManualReviewDetails,
  finalizeTransferCredit,
};


export function isTronAddress(address: string): boolean {
  return Boolean(deriveTronHexFromBase58(address));
}

// Operators send payouts from the existing treasury. The website holds no keys.
export async function verifyOutgoingUsdtTransfer(txHash: string, recipient: string, amountCents: number, requestedAt: Date) {
  const config = await getTronConfig();
  const destination = deriveTronHexFromBase58(recipient);
  const treasury = deriveTronHexFromBase58(process.env.TRON_PAYOUT_ADDRESS?.trim() || config.merchantAddressRaw);
  if (!isValidTxHash(txHash) || !destination || !treasury || destination === treasury) throw new Error("Invalid payout transaction or destination.");
  const receipt = await getSolidifiedTxInfo(config.solidityNodeUrl, txHash, config.apiKey);
  if (!receipt || receipt.id?.toLowerCase() !== txHash.toLowerCase()) throw new Error("The transaction is not yet confirmed on the solidified chain. Retry the same hash later.");
  const events = parseTransferEventsFromTxInfo({ txHash, txInfo: receipt });
  const match = events.find(event => event.success && event.tokenContractHex === config.usdtContractHex && event.fromAddressHex === treasury && event.toAddressHex === destination && event.amountMicros === BigInt(amountCents) * BigInt(10000) && event.blockTimestamp >= requestedAt);
  if (!match) throw new Error("The confirmed transfer must match this withdrawal's USDT token, treasury, recipient, full amount and request time.");
  return { txHash: txHash.toLowerCase(), blockNumber: match.blockNumber.toString() };
}

export function verifiedPaymentCreditCents(amountMicros: bigint, quotedCents?: number | null) {
  const confirmedCents = microsToCentsFloor(amountMicros);
  return Math.max(0, Math.min(confirmedCents, quotedCents ?? confirmedCents));
}

export const SENDER_WALLET_WARNING = "That is our receiving wallet. Enter your own sending wallet address instead.";

export function isReceivingWalletAsSender(sender: string, receiver: string) {
  const from = deriveTronHexFromBase58(sender.trim()) || normalizeHexAddress(sender.trim());
  const to = deriveTronHexFromBase58(receiver.trim()) || normalizeHexAddress(receiver.trim());
  return !!from && !!to && from === to;
}

export async function depositReceiveAddress() {
  const settings = await prisma.platformSetting.findUnique({ where: { id: 1 }, select: { tronMerchantReceiveAddress: true } });
  return (settings?.tronMerchantReceiveAddress || process.env.TRON_MERCHANT_RECEIVE_ADDRESS || "").trim();
}

export async function assertFundingSender(sender: string, invoiceReceiver?: string) {
  if (!isTronAddress(sender)) throw new Error("Enter a valid sending TRON wallet address.");
  const receiver = await depositReceiveAddress();
  if (isReceivingWalletAsSender(sender, receiver) || (invoiceReceiver && isReceivingWalletAsSender(sender, invoiceReceiver))) throw new Error(SENDER_WALLET_WARNING);
}

export async function assertWithdrawalDestination(address: string) {
  if (!isTronAddress(address)) throw new Error("Enter a valid TRON wallet address for USDT on TRC20.");
  const receiver = await depositReceiveAddress();
  if (isReceivingWalletAsSender(address, receiver) || isReceivingWalletAsSender(address, process.env.TRON_PAYOUT_ADDRESS || "")) throw new Error("Choose your own withdrawal wallet. This address belongs to the platform.");
}
