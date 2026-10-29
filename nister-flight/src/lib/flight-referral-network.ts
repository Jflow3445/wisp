import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { referralRates } from "./flight-referral";

export class ReferralBranchError extends Error {}
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("Referral network is temporarily unavailable.");
  return value;
}
function key() { return createHash("sha256").update(`referral-network:v1:${secret()}`).digest(); }
export function referralNodeKey(viewerId: string, userId: string) {
  return createHmac("sha256", secret()).update(JSON.stringify(["referral-network:v1", viewerId, userId])).digest("hex").slice(0, 16);
}
export function referralNodeRef(viewerId: string, userId: string, depth: number) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.from(JSON.stringify({ viewerId, userId, depth, expires: Date.now() + 86400000 }));
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function readReferralNodeRef(viewerId: string, reference: string) {
  try {
    if (!/^[a-zA-Z0-9_-]{40,1200}$/.test(reference)) throw new Error();
    const bytes = Buffer.from(reference, "base64url"), cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString());
    if (value.viewerId !== viewerId || typeof value.userId !== "string" || value.userId.length > 191 || !Number.isInteger(value.depth) || value.depth < 1 || value.depth > 3 || !Number.isFinite(value.expires) || value.expires < Date.now()) throw new Error();
    return value as { userId: string; depth: number };
  } catch { throw new ReferralBranchError("This referral branch is unavailable."); }
}

const PAGE_SIZE = 12;
type BranchRow = { branchId: string; ownPaid: number | bigint; ownPending: number | bigint; branchPaid: number | bigint; branchPending: number | bigint; descendants: number | bigint; children: number | bigint; rewardingPlays: number | bigint; totalBranches: number | bigint };
export async function referralNetwork(viewerId: string, reference: string | null, requestedPage: number) {
  const parent = reference ? readReferralNodeRef(viewerId, reference) : { userId: viewerId, depth: 0 };
  if (parent.depth >= 3) throw new ReferralBranchError("Your network includes three referral levels.");
  const page = Math.min(100000, Math.max(0, Math.trunc(requestedPage) || 0));
  return prisma.$transaction(async tx => {
    // An encrypted link is also checked against current ancestry. Old links cannot
    // keep access to a member who no longer belongs to this viewer's network.
    let ancestor: string | null = parent.userId;
    for (let i = 0; i < parent.depth; i++) {
      ancestor = (await tx.user.findUnique({ where: { id: ancestor! }, select: { referredById: true } }))?.referredById ?? null;
      if (!ancestor) throw new ReferralBranchError("This referral branch is unavailable.");
    }
    if (ancestor !== viewerId) throw new ReferralBranchError("This referral branch is unavailable.");
    const control = await tx.flightControl.findUniqueOrThrow({ where: { id: 1 } });
    const tree = Prisma.sql`WITH RECURSIVE network AS (
      SELECT u.id, u.referredById, u.id AS branchId, CAST(${parent.depth + 1} AS SIGNED) AS depth,
      CAST(CONCAT('|', ${viewerId}, '|', u.id, '|') AS CHAR(1000) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS trail
      FROM User u WHERE u.referredById=${parent.userId} AND u.id<>${viewerId}
      UNION ALL
      SELECT child.id, child.referredById, n.branchId, n.depth+1, CONCAT(n.trail, child.id, '|')
      FROM User child JOIN network n ON child.referredById=n.id
      WHERE n.depth<3 AND LOCATE(CAST(CONCAT('|',child.id,'|') AS BINARY),CAST(n.trail AS BINARY))=0
    )`;
    const rows = await tx.$queryRaw<BranchRow[]>(Prisma.sql`${tree}, commissions AS (
      SELECT reward.referredUserId,
      SUM(CASE WHEN reward.status='PAID' THEN reward.amountCents ELSE 0 END) AS paid,
      SUM(CASE WHEN reward.status='PENDING' THEN reward.amountCents ELSE 0 END) AS pending,
      SUM(CASE WHEN reward.status IN ('PAID','PENDING') THEN 1 ELSE 0 END) AS plays
      FROM FlightReferralReward reward JOIN FlightRound flight ON flight.id=reward.roundId
      WHERE reward.userId=${viewerId} AND flight.season=${control.season}
      GROUP BY reward.referredUserId
    ), branches AS (
      SELECT n.branchId,
      SUM(CASE WHEN n.id=n.branchId THEN COALESCE(c.paid,0) ELSE 0 END) AS ownPaid,
      SUM(CASE WHEN n.id=n.branchId THEN COALESCE(c.pending,0) ELSE 0 END) AS ownPending,
      SUM(COALESCE(c.paid,0)) AS branchPaid, SUM(COALESCE(c.pending,0)) AS branchPending,
      COUNT(*)-1 AS descendants, SUM(CASE WHEN n.depth=${parent.depth + 2} THEN 1 ELSE 0 END) AS children,
      SUM(CASE WHEN n.id=n.branchId THEN COALESCE(c.plays,0) ELSE 0 END) AS rewardingPlays
      FROM network n LEFT JOIN commissions c ON c.referredUserId=n.id GROUP BY n.branchId
    ) SELECT branches.*, COUNT(*) OVER() AS totalBranches FROM branches
    ORDER BY branchPaid DESC, branchPending DESC, branchId ASC LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`);
    const levels = await tx.$queryRaw<Array<{ depth: number; members: bigint }>>(Prisma.sql`${tree} SELECT depth, COUNT(*) AS members FROM network GROUP BY depth ORDER BY depth`);
    const total = rows.length ? Number(rows[0].totalBranches) : await tx.user.count({ where: { referredById: parent.userId, id: { not: viewerId } } });
    return { level: parent.depth + 1, page, pageSize: PAGE_SIZE, total, enabled: control.referralsEnabled, ratesBps: referralRates(control), levels: [1, 2, 3].map(depth => ({ level: depth, count: Number(levels.find(row => Number(row.depth) === depth)?.members ?? 0) })), nodes: rows.map(row => {
      const code = referralNodeKey(viewerId, row.branchId);
      return { key: code, label: `Pilot ${code.slice(0, 8).toUpperCase()}`, reference: referralNodeRef(viewerId, row.branchId, parent.depth + 1), level: parent.depth + 1, earnedCents: Number(row.ownPaid), pendingCents: Number(row.ownPending), branchEarnedCents: Number(row.branchPaid), branchPendingCents: Number(row.branchPending), descendants: Number(row.descendants), children: Number(row.children), rewardingPlays: Number(row.rewardingPlays) };
    }) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
