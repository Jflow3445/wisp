import { Prisma, UserFundsState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_BALANCE } from "@/lib/flight-math";

export function computeNextAvailableFundsUsdCents(current: number | null | undefined, credit: number) {
  return Math.max(0, (current ?? 0) + (Number.isFinite(credit) ? Math.max(0, Math.round(credit)) : 0));
}

export async function creditUserAvailableFunds(input: { tx: Prisma.TransactionClient | typeof prisma; userId: string; creditUsdCents: number; fundsState?: UserFundsState; reference?: string }) {
  const { tx, userId } = input, credit = input.creditUsdCents;
  if (!Number.isSafeInteger(credit) || credit <= 0) throw new Error("Invalid wallet credit.");
  await tx.$queryRaw`SELECT id FROM FlightControl WHERE id = 1 FOR UPDATE`;
  await tx.userTradingProfile.upsert({ where: { userId }, create: { userId, availableFundsUsdCents: 0 }, update: {} });
  await tx.userTradingProfile.updateMany({ where: { userId, availableFundsUsdCents: null }, data: { availableFundsUsdCents: 0 } });
  const [active, holds] = await Promise.all([
    tx.flightRound.findUnique({ where: { activeUserId: userId }, select: { capCents: true } }),
    tx.flightWithdrawal.aggregate({ where: { userId, status: { in: ["PENDING", "APPROVED"] } }, _sum: { amountCents: true } }),
  ]);
  const room = MAX_BALANCE - credit - (active?.capCents ?? 0) - (holds._sum.amountCents ?? 0);
  const updated = await tx.userTradingProfile.updateMany({ where: { userId, availableFundsUsdCents: { lte: room } }, data: { availableFundsUsdCents: { increment: credit }, fundsState: input.fundsState ?? UserFundsState.FUNDED } });
  if (updated.count !== 1) throw new Error("Wallet capacity exceeded. Payment remains uncredited for review.");
  if (input.reference) await tx.flightWalletEntry.create({ data: { userId, reference: input.reference, amountCents: credit, kind: "CRYPTO_DEPOSIT" } });
  return (await tx.userTradingProfile.findUniqueOrThrow({ where: { userId } })).availableFundsUsdCents;
}
