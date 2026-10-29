import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { validateWalletImage } from "../flight-wallet-image";
const address = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8", other = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
test("wallet images must encode the configured address and are normalized to PNG", async () => {
  const data = await QRCode.toDataURL(address, { width: 256, margin: 3 });
  assert.ok((await validateWalletImage(data, address)).startsWith("data:image/png;base64,"));
  await assert.rejects(() => validateWalletImage(data, other), /exact TRON address/);
  const wrongAmount = await QRCode.toDataURL(`tron:${address}?token=USDT&amount=10`, { width: 256 });
  await assert.rejects(() => validateWalletImage(wrongAmount, address), /fixed payment amount/);
});
test("wallet image validation rejects executable, malformed and oversized input", async () => {
  await assert.rejects(() => validateWalletImage("data:image/svg+xml;base64,PHN2Zz4=", address), /PNG/);
  await assert.rejects(() => validateWalletImage("data:image/png;base64,aGVsbG8=", address), /readable QR/);
  await assert.rejects(() => validateWalletImage("data:image/png;base64," + "A".repeat(550001), address), /smaller/);
});
