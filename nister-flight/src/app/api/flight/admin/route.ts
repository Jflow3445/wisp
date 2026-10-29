import { z } from "zod";
import { UserAccountState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { atomic, controls, decideWithdrawal, settleExpiredFlights } from "@/lib/flight-service";
import { apiError, authorize, body } from "@/lib/flight-http";
import { MAX_BALANCE } from "@/lib/flight-math";
import { verifyOutgoingUsdtTransfer } from "@/lib/tron-payments";
import { launchLiveGame, launchPreview } from "@/lib/flight-launch";
import { clearPublicFlightCache } from "@/lib/flight-public";
import { MAX_REFERRAL_BPS } from "@/lib/flight-economy";

export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), enabled: z.boolean(), depositsEnabled: z.boolean(), withdrawalsEnabled: z.boolean(), minStakeCents: z.number().int().min(2).max(1000000), maxStakeCents: z.number().int().min(1).max(1000000), minWithdrawalCents: z.number().int().min(1).max(1000000), houseEdgePpm: z.number().int().min(0).max(500000), referralsEnabled: z.boolean(), referralBps: z.number().int().min(0).max(MAX_REFERRAL_BPS), referralLevel2Bps: z.number().int().min(0).max(MAX_REFERRAL_BPS), referralLevel3Bps: z.number().int().min(0).max(MAX_REFERRAL_BPS), note: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal("launch"), confirmation: z.string().max(30), previewToken: z.string().length(64) }).strict(),
  z.object({ action: z.literal("reserve"), deltaCents: z.number().int().min(-MAX_BALANCE).max(MAX_BALANCE), note: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal("user"), userId: z.string().max(64), state: z.enum(["ACTIVE", "SUSPENDED"]), verified: z.boolean(), blocked: z.boolean(), note: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal("withdrawal"), id: z.string().max(64), decision: z.enum(["APPROVE", "REJECT", "PAID"]), note: z.string().trim().min(5).max(500), txHash: z.string().regex(/^[a-fA-F0-9]{64}$/).optional() }).strict(),
]);

export async function GET(request: Request) {
  try {
    const actor = await authorize(request, true);
    const url = new URL(request.url), search = (url.searchParams.get("search") ?? "").slice(0, 100);
    const page = Math.min(10000, Math.max(0, Number(url.searchParams.get("page")) || 0));
    const [control, users, userCount, withdrawals, deposits, audit, total, paid, balance, poolLimited] = await Promise.all([
      controls(), prisma.user.findMany({ where: search ? { OR: [{ email: { contains: search } }, { name: { contains: search } }] } : {}, skip: Math.floor(page) * 25, take: 25, orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, role: true, emailVerifiedAt: true, createdAt: true, tradingProfile: { select: { accountState: true, availableFundsUsdCents: true } }, flightPlayer: true } }),
      prisma.user.count(),
      prisma.flightWithdrawal.findMany({ take: 100, orderBy: { createdAt: "desc" }, include: { user: { select: { email: true } } } }),
      prisma.paymentOrder.findMany({ take: 30, orderBy: { createdAt: "desc" }, select: { reference: true, status: true, invoiceAmountMicros: true, createdAt: true, user: { select: { email: true } } } }),
      prisma.flightAudit.findMany({ take: 30, orderBy: { createdAt: "desc" } }), prisma.flightRound.count(),
      prisma.flightWithdrawal.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true } }),
      prisma.userTradingProfile.aggregate({ _sum: { availableFundsUsdCents: true } }),
      prisma.flightRound.count({ where: { resultReason: "POOL_LIMIT" } }),
    ]);
    return Response.json({ currency: "USD", settlementCurrency: "USDT", usdPerUsdt: "1.00", control, launch: await launchPreview(actor.id), users, userCount, page, withdrawals, deposits: deposits.map(d => ({ ...d, invoiceAmountMicros: d.invoiceAmountMicros.toString() })), audit, stats: { poolLimitedRounds: poolLimited, totalRounds: total, paidCents: paid._sum.amountCents ?? 0, walletCents: balance._sum.availableFundsUsdCents ?? 0 } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request, true), input = schema.parse(await body(request));
    if (input.action === "launch") {
      const result = await launchLiveGame(user.id, input.confirmation, input.previewToken);
      clearPublicFlightCache();
      return Response.json({ result });
    }
    if (input.action === "withdrawal") {
      const hash = input.txHash?.toLowerCase();
      if (input.decision === "PAID") {
        if (!hash) throw new Error("Enter the outgoing transaction hash.");
        const withdrawal = await prisma.flightWithdrawal.findUniqueOrThrow({ where: { id: input.id } });
        if (!["APPROVED", "PAID"].includes(withdrawal.status)) throw new Error("Approve this withdrawal before recording payment.");
        await verifyOutgoingUsdtTransfer(hash, withdrawal.address, withdrawal.amountCents, withdrawal.createdAt);
      }
      return Response.json({ result: await decideWithdrawal(user.id, input.id, input.decision, input.note, hash) });
    }
    if (input.action === "settings" && input.minStakeCents > input.maxStakeCents) throw new Error("Minimum stake must not exceed maximum stake.");
    if (input.action === "settings" && input.referralBps + input.referralLevel2Bps + input.referralLevel3Bps > MAX_REFERRAL_BPS) throw new Error("The combined referral rates must not exceed the 3% play fee.");
    await atomic(async tx => {
      await tx.$queryRaw`SELECT id FROM FlightControl WHERE id = 1 FOR UPDATE`;
      const control = await controls(tx);
      if ((await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { role: true } })).role !== "ADMIN") throw new Error("Administrator access required.");
      if (input.action === "settings") {
        const { enabled, depositsEnabled, withdrawalsEnabled, minStakeCents, maxStakeCents, minWithdrawalCents, houseEdgePpm, referralsEnabled, referralBps, referralLevel2Bps, referralLevel3Bps } = input;
        const settings = { enabled, depositsEnabled, withdrawalsEnabled, minStakeCents, maxStakeCents, minWithdrawalCents, houseEdgePpm, referralsEnabled, referralBps, referralLevel2Bps, referralLevel3Bps };
        await tx.flightControl.update({ where: { id: 1 }, data: settings });
      }
      if (input.action === "reserve") {
        const fresh = await tx.flightControl.findUniqueOrThrow({ where: { id: 1 } });
        const next = fresh.houseBalanceCents + input.deltaCents;
        if (next < fresh.reservedCents + fresh.protectedHouseCents || next < 0 || next > MAX_BALANCE) throw new Error("Reserve adjustment would exceed capacity or remove protected or committed funds.");
        const opening = fresh.liveLaunchedAt ? fresh.launchReserveCents : fresh.launchReserveCents + input.deltaCents;
        if (opening < 0 || opening > MAX_BALANCE) throw new Error("Opening reserve is outside the permitted range.");
        await tx.flightControl.update({ where: { id: 1 }, data: { houseBalanceCents: next, launchReserveCents: opening } });
      }
      if (input.action === "user") {
        if (input.userId === user.id) throw new Error("Use another administrator to change your account controls.");
        const target = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
        if (input.verified && target.role !== "ADMIN" && !target.emailVerifiedAt) throw new Error("The user must verify their email first.");
        await tx.userTradingProfile.upsert({ where: { userId: input.userId }, update: { accountState: input.state as UserAccountState }, create: { userId: input.userId, accountState: input.state as UserAccountState } });
        await tx.flightPlayer.upsert({ where: { userId: input.userId }, update: { blocked: input.blocked, verifiedAt: input.verified ? new Date() : null, verifiedBy: input.verified ? user.id : null }, create: { userId: input.userId, blocked: input.blocked, verifiedAt: input.verified ? new Date() : null, verifiedBy: input.verified ? user.id : null } });
      }
      await tx.flightAudit.create({ data: { actorId: user.id, action: input.action.toUpperCase(), subjectId: input.action === "user" ? input.userId : "control", details: { input, previousControl: { enabled: control.enabled, houseBalanceCents: control.houseBalanceCents, houseEdgePpm: control.houseEdgePpm } } } });
    });
    await settleExpiredFlights();
    clearPublicFlightCache();
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
