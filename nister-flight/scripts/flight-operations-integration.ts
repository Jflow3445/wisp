import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "../src/lib/prisma";
import { bootstrapReceivingWallet, changeReceivingWallet, listReceivingWallets } from "../src/lib/flight-receiving-wallets";
import { tronAddressHex } from "../src/lib/flight-tron-address";
import { assertFundingSender, assertWithdrawalDestination, clearTronConfigCache, createPaymentInvoice, getPaymentStatusByReference, scanSolidifiedPayments, submitTxForPayment, verifyOutgoingUsdtTransfer, __test as chain } from "../src/lib/tron-payments";
import { requestWithdrawal, decideWithdrawal } from "../src/lib/flight-service";
import { enqueueWalletEmail, enqueueFlightEmail, deliverFlightEmail } from "../src/lib/flight-email";
import { sendVerificationEmail, verifyEmailToken } from "../src/lib/email-verification";
import { getEmailSettings, saveEmailSettings } from "../src/lib/email";
import { sendPasswordResetEmail } from "../src/lib/password-reset";
import { decryptSecret } from "../src/lib/secret-box";
const database = new URL(process.env.DATABASE_URL || "");
if (database.pathname !== "/nister_flight_test" || !["localhost", "127.0.0.1"].includes(database.hostname)) throw Error("Operations tests require the isolated loopback test database.");
let checks = 0;
function check(condition: unknown, label: string) { assert.ok(condition, label); console.log(`PASS ${label}`); checks++; }
function address(seed: string) {
  const payload = Buffer.concat([Buffer.from([0x41]), createHash("sha256").update(seed).digest().subarray(0,20)]);
  const sum = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest().subarray(0,4);
  let value = BigInt("0x" + Buffer.concat([payload,sum]).toString("hex")), encoded = "";
  while (value) { encoded = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Number(value % BigInt(58))] + encoded; value /= BigInt(58); }
  return encoded;
}
async function main() {
  const admin = "flight-test-admin", member = "flight-test-member", originalFetch = global.fetch;
  const sender = address("OPS-SENDER"), second = address("OPS-RECEIVER-2"), rotated = address("OPS-RECEIVER-3"), recipient = address("OPS-WITHDRAWAL");
  await prisma.platformSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const originals = await prisma.platformSetting.findUniqueOrThrow({ where: { id: 1 }, select: { tronMerchantReceiveAddress: true, tronSolidityNodeUrl: true, tronFullNodeUrl: true } });
  await prisma.paymentOrder.deleteMany({ where: { reference: { startsWith: "OPS-" } } });
  await prisma.flightReceivingWallet.updateMany({ data: { defaultKey: null } });
  await prisma.flightReceivingWallet.deleteMany({ where: { label: { startsWith: "TEST OPERATIONS" } } });
  await prisma.platformSetting.update({ where: { id: 1 }, data: { tronMerchantReceiveAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8", tronSolidityNodeUrl: "https://tron-test.invalid", tronFullNodeUrl: "https://tron-test.invalid" } });
  await bootstrapReceivingWallet();
  const primary = await prisma.flightReceivingWallet.findUniqueOrThrow({ where: { address: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8" } });
  await prisma.flightReceivingWallet.update({ where: { id: primary.id }, data: { defaultKey: "DEFAULT", active: true } });
  clearTronConfigCache();
  const receipts = new Map<string, unknown>(), block: unknown[] = [], topic = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", token = tronAddressHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")!;
  function receipt(destination: string, amount: bigint, from = sender, id = createHash("sha256").update(randomUUID()).digest("hex")) {
    const value = { id, blockNumber: 500, blockTimeStamp: Date.now(), receipt: { result: "SUCCESS" }, log: [{ address: token.slice(2), topics: [topic, tronAddressHex(from)!.slice(2).padStart(64,"0"), tronAddressHex(destination)!.slice(2).padStart(64,"0")], data: amount.toString(16).padStart(64,"0") }] };
    receipts.set(id, value); return value;
  }
  global.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    const path = new URL(String(url)).pathname, body = JSON.parse(String(options?.body || "{}"));
    const value = path.endsWith("gettransactioninfobyid") ? receipts.get(body.value) ?? {} : path.endsWith("getnowblock") ? { block_header: { raw_data: { number: 500 } } } : path.endsWith("gettransactioninfobyblocknum") ? block : null;
    if (value === null) throw Error("Unexpected network request in isolated operations tests.");
    return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    check((await listReceivingWallets())[0].address === primary.address, "wallet management retains the existing merchant address as its default");
    await assert.rejects(() => changeReceivingWallet(member, { action: "save", label: "TEST OPERATIONS unauthorized", address: second, makeDefault: false, note: "Unauthorized fixture must fail" }), /Administrator/);
    check(await prisma.flightReceivingWallet.count() === 1, "a member cannot modify receiving wallets");
    const custom = await QRCode.toDataURL(second, { width: 256, margin: 3 });
    const added = await changeReceivingWallet(admin, { action: "save", label: "TEST OPERATIONS secondary", address: second, makeDefault: false, qrImageData: custom, note: "Add isolated receiving wallet and matching QR" });
    const row = await prisma.flightReceivingWallet.findUniqueOrThrow({ where: { id: added.id } });
    check(row.hasCustomQr && row.qrImageData?.startsWith("data:image/png;base64,") && (await listReceivingWallets()).length === 2, "an additional receiving wallet stores only its validated normalized QR image");
    const old = await createPaymentInvoice({ userId: member, baseAmountUsdt: "7.00", declaredSenderAddress: sender, receivingWalletId: added.id, reference: "OPS-OLD-ADDRESS", metadata: { source: "flight_topup" }, allowReuse: false });
    check(old.receiveAddress === second && !!old.qrImageUrl && old.receivingWalletId === added.id, "a member-selected wallet is bound to its invoice and QR image");
    await changeReceivingWallet(admin, { action: "save", id: added.id, label: row.label, address: second, makeDefault: true, note: "Set isolated secondary wallet as default" });
    check((await createPaymentInvoice({ userId: member, baseAmountUsdt: "8.00", declaredSenderAddress: sender, reference: "OPS-DEFAULT", metadata: { source: "flight_topup" }, allowReuse: false })).receiveAddress === second, "new invoices use the administrator's current default wallet");
    const updated = await changeReceivingWallet(admin, { action: "save", id: added.id, label: "TEST OPERATIONS rotated", address: rotated, makeDefault: true, note: "Rotate the isolated receiving address" });
    const recovered = await getPaymentStatusByReference(old.reference, member);
    const retired = await prisma.flightReceivingWallet.findUniqueOrThrow({ where: { id: added.id } });
    check(updated.id !== added.id && recovered?.receiveAddress === second && recovered?.qrImageUrl?.split("?")[0] === old.qrImageUrl?.split("?")[0] && !retired.active && retired.qrImageData === row.qrImageData, "address rotation preserves pending invoices and their original QR while retiring the old destination");
    await assert.rejects(() => createPaymentInvoice({ userId: member, baseAmountUsdt: "9.00", declaredSenderAddress: sender, receivingWalletId: added.id }), /unavailable/);
    check((await listReceivingWallets()).every(w => w.address !== second), "retired wallets cannot receive newly created invoices");
    for (const owned of [primary.address, second, rotated]) { await assert.rejects(() => assertFundingSender(owned), /our receiving wallet/); await assert.rejects(() => assertWithdrawalDestination(owned), /belongs to the platform/); }
    check(true, "both active and retired platform wallets are rejected as member senders and withdrawal destinations");
    const before = (await prisma.userTradingProfile.findUniqueOrThrow({ where: { userId: member } })).availableFundsUsdCents ?? 0;
    const event = receipt(second, BigInt(old.amountMicros));
    check((await submitTxForPayment({ reference: old.reference, txHash: event.id, submittedSenderAddress: sender })).verification === "PAID", "a confirmed transfer to a retired invoice address still credits after wallet rotation");
    const after = (await prisma.userTradingProfile.findUniqueOrThrow({ where: { userId: member } })).availableFundsUsdCents ?? 0;
    check(after - before === Number(BigInt(old.amountMicros) / BigInt(10000)), "multi-wallet deposits credit exactly their confirmed chain value");
    await submitTxForPayment({ reference: old.reference, txHash: event.id, submittedSenderAddress: sender });
    const stored = await prisma.paymentOrder.findUniqueOrThrow({ where: { reference: old.reference } });
    check(await prisma.flightEmail.count({ where: { reference: `deposit:${stored.id}` } }) === 1 && (await prisma.userTradingProfile.findUniqueOrThrow({ where: { userId: member } })).availableFundsUsdCents === after, "deposit retries create one credit and one durable confirmation email");
    const invoice = await createPaymentInvoice({ userId: member, baseAmountUsdt: "9.00", declaredSenderAddress: sender, reference: "OPS-WATCHER", metadata: { source: "flight_topup" }, allowReuse: false });
    const chainEvent = receipt(rotated, BigInt(invoice.amountMicros)); block.push(chainEvent);
    await prisma.paymentWatcherCursor.upsert({ where: { watchKey: "usdt_trc20_default" }, create: { watchKey: "usdt_trc20_default", lastScannedBlock: BigInt(499) }, update: { lastScannedBlock: BigInt(499) } });
    const watched = await scanSolidifiedPayments({ maxBlocks: 1 });
    check(watched.autoCredited === 1 && (await prisma.paymentOrder.findUniqueOrThrow({ where: { reference: invoice.reference } })).status === "PAID", "the retained chain watcher credits newly configured receiving wallets automatically");
    const wrong = await createPaymentInvoice({ userId: member, baseAmountUsdt: "11.00", declaredSenderAddress: sender, reference: "OPS-WRONG-DESTINATION", metadata: { source: "flight_topup" }, allowReuse: false });
    const wrongReceipt = receipt(second, BigInt(wrong.amountMicros)), parsed = chain.parseTransferEventsFromTxInfo({ txHash: wrongReceipt.id, txInfo: wrongReceipt });
    const wrongOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { reference: wrong.reference } });
    await assert.rejects(() => chain.finalizeTransferCredit({ orderId: wrongOrder.id, event: parsed[0] }), /does not match/);
    check((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: wrongOrder.id } })).status === "PENDING", "even a valid transfer to another platform wallet cannot credit the wrong invoice");
    const payout = receipt(recipient, BigInt(1000000), rotated);
    check((await verifyOutgoingUsdtTransfer(payout.id, recipient, 100, new Date(Date.now()-10000))).txHash === payout.id, "withdrawal proofs can use an administrator-configured treasury wallet");
    await prisma.flightControl.update({ where: { id: 1 }, data: { minWithdrawalCents: 100, withdrawalsEnabled: true } });
    const withdrawal = await requestWithdrawal(member, 100, recipient, "OPS-WITHDRAW-" + randomUUID());
    await requestWithdrawal(member, 100, recipient, withdrawal.requestKey);
    check(await prisma.flightEmail.count({ where: { reference: `withdrawal:${withdrawal.id}:PENDING` } }) === 1, "a withdrawal request queues one receipt even when its response is retried");
    await decideWithdrawal(admin, withdrawal.id, "APPROVE", "Isolated payment approval"); await decideWithdrawal(admin, withdrawal.id, "APPROVE", "Isolated repeated approval");
    await decideWithdrawal(admin, withdrawal.id, "PAID", "Isolated confirmed payment", payout.id); await decideWithdrawal(admin, withdrawal.id, "PAID", "Isolated repeat payment", payout.id);
    check(await prisma.flightEmail.count({ where: { reference: { in: [`withdrawal:${withdrawal.id}:APPROVED`, `withdrawal:${withdrawal.id}:PAID`] } } }) === 2, "withdrawal approval and confirmed payment each queue one notification");
    const declined = await requestWithdrawal(member, 100, recipient, "OPS-REJECT-" + randomUUID()); await decideWithdrawal(admin, declined.id, "REJECT", "Isolated declined request");
    check(await prisma.flightEmail.count({ where: { reference: `withdrawal:${declined.id}:REJECTED` } }) === 1, "declined withdrawals queue a confirmation of the returned balance");
    const mailRef = "OPS:EMAIL:" + randomUUID(); await enqueueWalletEmail(prisma, { userId: member, reference: mailRef, subject: "Isolated deposit confirmation", body: "A confirmed deposit is available." });
    check(!await deliverFlightEmail(mailRef, async () => { throw Error("Synthetic SMTP outage"); }) && (await prisma.flightEmail.findUniqueOrThrow({ where: { reference: mailRef } })).status === "PENDING", "SMTP failure retains the message without reversing the financial operation");
    await prisma.flightEmail.update({ where: { reference: mailRef }, data: { nextAttemptAt: new Date(0) } }); let sends = 0;
    await Promise.all(Array.from({ length: 4 }, () => deliverFlightEmail(mailRef, async () => { sends++; return true; })));
    check(sends === 1 && (await prisma.flightEmail.findUniqueOrThrow({ where: { reference: mailRef } })).status === "SENT", "concurrent delivery workers claim a queued email once");
    const expired = "OPS:EXPIRED:" + randomUUID(); await enqueueFlightEmail(prisma, { userId: member, reference: expired, expiresAt: new Date(0), content: { subject: "Expired fixture", text: "expired", html: "expired" } });
    check(!await deliverFlightEmail(expired, async () => { throw Error("Expired mail must not send"); }) && (await prisma.flightEmail.findUniqueOrThrow({ where: { reference: expired } })).status === "CANCELLED", "security links that expire in the queue are not sent later");
    const smtp = { enabled: false, host: "smtp.example.test", port: 587, username: "fixture@example.test", password: "isolated-only-not-a-live-password", fromEmail: "fixture@example.test", fromName: "Nister Flight", secure: false, note: "Configure isolated test SMTP without contacting a real server" };
    await saveEmailSettings(admin, smtp); const secret = await prisma.emailSetting.findUniqueOrThrow({ where: { id: 1 } });
    check(secret.password !== smtp.password && decryptSecret(secret.password, secret.passwordKeyVersion).plaintext === smtp.password && (await getEmailSettings()).hasPassword && !JSON.stringify(await getEmailSettings()).includes(smtp.password), "SMTP passwords remain encrypted and never appear in the administrator response");
    await saveEmailSettings(admin, { ...smtp, password: "" }); const kept = await prisma.emailSetting.findUniqueOrThrow({ where: { id: 1 } });
    check(decryptSecret(kept.password, kept.passwordKeyVersion).plaintext === smtp.password, "saving SMTP settings with an empty password preserves the saved credential");
    await assert.rejects(() => saveEmailSettings(member, smtp), /Administrator/); check(true, "members cannot reconfigure SMTP");
    const id = "ops-unverified-account";
    await prisma.user.upsert({ where: { id }, create: { id, email: "ops-verification@example.test", name: "Verification fixture", passwordHash: "isolated-fixture-only" }, update: { emailVerifiedAt: null } });
    await prisma.authRateLimit.deleteMany({ where: { key: { startsWith: "flight:verify-email:" } } });
    await sendVerificationEmail({ userId: id, email: "ops-verification@example.test", name: "Verification fixture" });
    const verification = await prisma.flightEmail.findFirstOrThrow({ where: { userId: id, reference: { startsWith: "verify:" }, status: "PENDING" }, orderBy: { createdAt: "desc" } });
    const link = verification.text.match(/https?:\/\/[^\s]*\/verify-email\/confirm\?token=([a-f0-9]+)/)?.[1];
    check(!!link && !(await prisma.user.findUniqueOrThrow({ where: { id } })).emailVerifiedAt && !!verification.expiresAt, "normal account verification queues an expiring first-party link without auto-verifying the email");
    check((await verifyEmailToken(link!)).ok && !!(await prisma.user.findUniqueOrThrow({ where: { id } })).emailVerifiedAt, "the confirmation link verifies its intended account");
    check(!(await verifyEmailToken(link!)).ok && await prisma.flightEmail.count({ where: { reference: `welcome:${createHash("sha256").update(id).digest("hex")}` } }) === 1, "a verification link cannot be reused and creates one account-confirmed email");
    await sendPasswordResetEmail({ userId: id, email: "ops-verification@example.test", name: "Verification fixture" });
    check(await prisma.flightEmail.count({ where: { userId: id, reference: { startsWith: "reset:" }, status: "PENDING", expiresAt: { gt: new Date() } } }) === 1, "password reset messages also remain queued through SMTP outages with a one-hour expiry");
    await changeReceivingWallet(admin, { action: "save", id: primary.id, address: primary.address, label: "Primary USDT wallet", makeDefault: true, note: "Restore original isolated receiving default" });
    await changeReceivingWallet(admin, { action: "disable", id: updated.id, note: "Retain isolated old invoice history without offering this wallet" });
    console.log(`Completed ${checks} wallet and email operations checks against isolated MariaDB.`);
  } finally { global.fetch = originalFetch; await prisma.platformSetting.update({ where: { id: 1 }, data: originals }); clearTronConfigCache(); }
}
main().finally(() => prisma.$disconnect());
