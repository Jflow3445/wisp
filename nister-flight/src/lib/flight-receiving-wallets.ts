import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { tronAddressHex } from "./flight-tron-address";
import { validateWalletImage } from "./flight-wallet-image";

type Db = Prisma.TransactionClient | typeof prisma;
export async function legacyReceivingAddress(db: Db = prisma) {
  const settings = await db.platformSetting.findUnique({ where: { id: 1 }, select: { tronMerchantReceiveAddress: true } });
  return (settings?.tronMerchantReceiveAddress || process.env.TRON_MERCHANT_RECEIVE_ADDRESS || "").trim();
}
export async function listReceivingWallets(includeInactive = false, db: Db = prisma) {
  const rows = await db.flightReceivingWallet.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ defaultKey: "desc" }, { createdAt: "asc" }], select: { id: true, label: true, address: true, active: true, defaultKey: true, updatedAt: true, hasCustomQr: true } });
  if (!rows.length && !await db.flightReceivingWallet.count()) {
    const address = await legacyReceivingAddress(db);
    return address ? [{ id: "legacy", label: "Primary USDT wallet", address, active: true, isDefault: true, qrImageUrl: null as string | null }] : [];
  }
  return rows.map(row => ({ id: row.id, label: row.label, address: row.address, active: row.active, isDefault: row.defaultKey === "DEFAULT", qrImageUrl: row.hasCustomQr ? `/api/flight/wallets/${encodeURIComponent(row.id)}/image?v=${row.updatedAt.getTime()}` : null }));
}
export async function selectReceivingWallet(db: Db, id?: string) {
  const wallets = await listReceivingWallets(false, db), wallet = id ? wallets.find(w => w.id === id) : wallets.find(w => w.isDefault) ?? wallets[0];
  if (!wallet) throw new Error("This receiving wallet is unavailable. Refresh and select an active wallet.");
  return wallet;
}
export async function knownReceivingAddresses(db: Db = prisma) {
  const [wallets, historic, legacy] = await Promise.all([
    db.flightReceivingWallet.findMany({ select: { address: true } }),
    db.$queryRaw<Array<{ merchantReceiveAddress: string }>>`SELECT DISTINCT merchantReceiveAddress FROM PaymentOrder`,
    legacyReceivingAddress(db),
  ]);
  return [...new Set([legacy, ...wallets.map(w => w.address), ...historic.map(o => o.merchantReceiveAddress)].filter(Boolean))];
}
export async function invoiceWalletImage(walletId: string | null) {
  if (!walletId) return null;
  const wallet = await prisma.flightReceivingWallet.findUnique({ where: { id: walletId }, select: { hasCustomQr: true, updatedAt: true } });
  return wallet?.hasCustomQr ? `/api/flight/wallets/${encodeURIComponent(walletId)}/image?v=${wallet.updatedAt.getTime()}` : null;
}
export async function bootstrapReceivingWallet(db: Db = prisma) {
  if (await db.flightReceivingWallet.count()) return;
  const address = await legacyReceivingAddress(db);
  if (!tronAddressHex(address)) throw new Error("Configure a valid existing receiving wallet first.");
  await db.flightReceivingWallet.create({ data: { label: "Primary USDT wallet", address, defaultKey: "DEFAULT" } });
}

export type WalletChange = { action: "save"; id?: string; label: string; address: string; makeDefault: boolean; qrImageData?: string | null; note: string } | { action: "disable"; id: string; note: string };
export async function changeReceivingWallet(actorId: string, input: WalletChange) {
  if (input.action === "save" && !tronAddressHex(input.address)) throw new Error("Enter a valid TRON receiving address with its correct checksum.");
  const image = input.action === "save" && input.qrImageData ? await validateWalletImage(input.qrImageData, input.address) : input.action === "save" ? input.qrImageData : undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM FlightControl WHERE id=1 FOR UPDATE`;
        const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true, tradingProfile: { select: { accountState: true } } } });
        if (actor.role !== "ADMIN" || ["SUSPENDED", "CLOSED"].includes(actor.tradingProfile?.accountState ?? "")) throw new Error("Administrator access required.");
        await bootstrapReceivingWallet(tx);
        const source = "id" in input && input.id ? await tx.flightReceivingWallet.findUniqueOrThrow({ where: input.id === "legacy" ? { address: await legacyReceivingAddress(tx) } : { id: input.id } }) : null;
        if (input.action === "disable") {
          if (!source) throw new Error("Receiving wallet not found.");
          if (source.defaultKey) throw new Error("Choose another default wallet before disabling this wallet.");
          await tx.flightReceivingWallet.update({ where: { id: source.id }, data: { active: false } });
          await tx.flightAudit.create({ data: { actorId, action: "RECEIVING_WALLET_DISABLED", subjectId: source.id, details: { note: input.note, address: source.address } } });
          return { id: source.id };
        }
        const target = await tx.flightReceivingWallet.findUnique({ where: { address: input.address } });
        if (target && target.id !== source?.id && target.active) throw new Error("That receiving address is already configured. Edit its existing wallet.");
        const rotating = !!source && source.address !== input.address;
        const makeDefault = input.makeDefault || !!source?.defaultKey;
        if (makeDefault) await tx.flightReceivingWallet.updateMany({ where: { defaultKey: "DEFAULT" }, data: { defaultKey: null } });
        if (rotating) await tx.flightReceivingWallet.update({ where: { id: source.id }, data: { active: false, defaultKey: null } });
        if ((!source?.active || rotating) && await tx.flightReceivingWallet.count({ where: { active: true } }) >= 12) throw new Error("Up to 12 receiving wallets can be active. Disable an unused wallet first.");
        const previous = rotating ? target : source;
        const values = { label: input.label, active: true, ...(makeDefault ? { defaultKey: "DEFAULT" } : {}), ...(image !== undefined ? { qrImageData: image, hasCustomQr: !!image } : {}) };
        const saved = previous
          ? await tx.flightReceivingWallet.update({ where: { id: previous.id }, data: values })
          : await tx.flightReceivingWallet.create({ data: { ...values, address: input.address } });
        await tx.flightAudit.create({ data: { actorId, action: rotating ? "RECEIVING_WALLET_ROTATED" : "RECEIVING_WALLET_SAVED", subjectId: saved.id, details: { note: input.note, address: input.address, previousAddress: source?.address ?? null, isDefault: makeDefault, customQrChanged: image !== undefined } } });
        return { id: saved.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 });
    } catch (error) {
      if (attempt >= 3 || !["P2034", "P2002"].includes((error as { code?: string }).code ?? "")) throw error;
    }
  }
}
