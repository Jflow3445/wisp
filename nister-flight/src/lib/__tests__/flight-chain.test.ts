import assert from "node:assert/strict";
import { test } from "node:test";
import { clearTronConfigCache, isTronAddress, verifiedPaymentCreditCents, verifyOutgoingUsdtTransfer } from "../tron-payments";

const merchant = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const recipient = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
function hexAddress(address: string) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let numeric = BigInt(0);
  for (const char of address) numeric = numeric * BigInt(58) + BigInt(alphabet.indexOf(char));
  return numeric.toString(16).padStart(50, "0").slice(0, 42);
}

test("wallet addresses require a valid TRON Base58Check checksum", () => {
  assert.ok(isTronAddress(merchant)); assert.ok(isTronAddress(recipient));
  for (const address of [merchant.slice(0, -1) + "1", "0x" + "a".repeat(40), "T".repeat(34), "", "233201234567"]) assert.equal(isTronAddress(address), false);
});

test("verified deposit credit never exceeds the chain amount", () => {
  assert.equal(verifiedPaymentCreditCents(BigInt(1250000), 999999), 125);
  assert.equal(verifiedPaymentCreditCents(BigInt(1250000), 100), 100);
  assert.equal(verifiedPaymentCreditCents(BigInt(1259999)), 125);
});

test("payout finality checks receipt, token, treasury, destination, amount and request time", async () => {
  process.env.TRON_SOLIDITY_NODE_URL = "https://tron-test.invalid";
  process.env.TRON_FULL_NODE_URL = "https://tron-test.invalid";
  process.env.TRON_MERCHANT_RECEIVE_ADDRESS = merchant;
  process.env.TRON_USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  clearTronConfigCache();
  const hash = "a".repeat(64), requested = new Date("2026-10-29T12:00:00Z");
  const receipt = { id: hash, blockNumber: 123, blockTimeStamp: requested.getTime() + 1000, receipt: { result: "SUCCESS" }, log: [{ address: hexAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").slice(2), topics: ["ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", hexAddress(merchant).slice(2).padStart(64, "0"), hexAddress(recipient).slice(2).padStart(64, "0")], data: BigInt(10000000).toString(16).padStart(64, "0") }] };
  let value: unknown = receipt;
  const original = global.fetch;
  global.fetch = (async (url: string | URL | Request) => {
    assert.ok(String(url).includes("/walletsolidity/gettransactioninfobyid"));
    return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.equal((await verifyOutgoingUsdtTransfer(hash, recipient, 1000, requested)).txHash, hash);
    await assert.rejects(() => verifyOutgoingUsdtTransfer(hash, recipient, 999, requested), /confirmed transfer must match/);
    await assert.rejects(() => verifyOutgoingUsdtTransfer(hash, merchant, 1000, requested), /Invalid payout/);
    for (const change of [
      { ...receipt, receipt: { result: "REVERT" } },
      { ...receipt, blockTimeStamp: requested.getTime() - 1000 },
      { ...receipt, log: [{ ...receipt.log[0], address: "1".repeat(40) }] },
      { ...receipt, log: [{ ...receipt.log[0], topics: [receipt.log[0].topics[0], receipt.log[0].topics[2], receipt.log[0].topics[1]] }] },
    ]) { value = change; await assert.rejects(() => verifyOutgoingUsdtTransfer(hash, recipient, 1000, requested), /confirmed transfer must match/); }
    value = {};
    await assert.rejects(() => verifyOutgoingUsdtTransfer(hash, recipient, 1000, requested), /not yet confirmed/);
  } finally { global.fetch = original; clearTronConfigCache(); }
});
