# Nister Flight

The crypto-only Flight application for `nisterai.com`, added to the WISP `commerce` branch. The existing Wi-Fi portal remains a separate service. This application retains the current Nister MySQL database, user IDs, email addresses, password hashes, session cookie, session secret, email verification, password reset and configured social sign-in. It ports the balanced Flight v5 engine from `pay-portal/lib/spin/flight_math.php` to the retained Next.js payment/account stack.

## Member and administrator surfaces

- `/dashboard`: live Flight, server offers, held stakes and recoverable receipts.
- `/dashboard/wallet`: USDT-TRC20 invoices, local QR codes, chain verification and crypto withdrawal requests. No MoMo, Paystack, phone-number payout or fiat conversion exists in this app.
- `/dashboard/referrals`: private invite link, native/WhatsApp sharing, earned and pending referral totals.
- `/dashboard/activity`: wallet ledger and commitment/seed verification receipts.
- `/dashboard/settings` and `/dashboard/help`: account status and game rules.
- `/admin`: operational overview and withdrawal queue.
- `/admin/users`: eligibility review, member restrictions and account access.
- `/admin/payments`: deposit invoices and payout history. Approve a request, send the full amount from the treasury wallet, then submit the outgoing transaction hash. The server verifies the successful solidified USDT transfer, treasury sender, destination, amount and request time before marking paid. No wallet private key is stored by the website.
- `/admin/settings`: independently pause flights, deposits or new withdrawals; set limits and minimum expected house edge; record treasury reserve allocations; configure referral rewards (0-3% of stake); preview and confirm the one-time public launch.
- `/admin/audit`: durable operator changes and withdrawal decisions.

New installations start paused with no reserve. The owner authorized a one-time $100 internal reserve allocation and a separate $100 non-withdrawable test credit to the designated test account. These are recorded as bookkeeping entries, not blockchain transfers. Before public launch only administrators and designated test accounts can play. The initial launch in Admin > Game controls requires typing START LIVE GAME, previews cleared balances, and blocks active flights, pending withdrawals and funded customer balances. It retains accounts and all financial history, clears test wallets/fee counters, and restores the opening house reserve. Once live, this reset cannot run again. Administrators are exempt from member email and eligibility verification; member verification remains required. A game block prevents new flights while preserving withdrawals; suspension of the entire account restricts account operations.

## Payment and wallet invariants

Balances, stakes, game returns, reserves and withdrawal requests are integer USD cents. Crypto settlement uses a fixed accounting rate of **1 USDT = $1.00 USD**, rather than a live exchange quote. On-chain USDT amounts are represented in integer microtokens. Deposit invoice offsets identify incoming transfers. Credits are bounded by confirmed chain value. A singleton row lock orders financial mutations, and serializable game/withdrawal transactions retry write conflicts. Unique deposit-event, round-request and withdrawal-request references prevent duplicate credits or debits. Withdrawal requests reserve funds immediately; a pending rejection refunds once. Approved transfers cannot be refunded from the dashboard while a payout may be in flight. Pauses do not prevent recovering accepted receipts or settling accepted rounds.

Every flight charges **3% on top of the stake**, rounded up to a cent, exactly once whether it wins or loses. The fee and total cost appear before play. Fees are held separately from the game reserve. Referral rewards default to 1% of a referred member's stake, rounded down to a cent, after a confirmed crypto deposit and flight settlement. The administrator may choose 0-3%; rewards are funded from these play fees, with the remainder retained as insurance. The rate is frozen when each round starts. Manual test credits, self-referrals and Gmail aliases do not qualify. Recipient restrictions/capacity defer rewards without blocking game settlement.

The homepage shows only profitable completed flights from the live season in the previous 30 minutes. Profit excludes stake and fee. Per-flight HMAC aliases replace all identifying account data; test wins never appear publicly. Receiving wallets are rejected as sending wallets in both deposit steps and the server. Confirmation-pending invoices remain retryable.

Future flight steps and random seeds stay on the server until settlement. Each flight publishes a commitment and reveals its seed, rules and path after settlement. `flight-math.test.ts` compares the port against 250 executions of the original PHP engine. PHP is needed for that comparison test, but is not needed to run the new website.

## Local development

Use Node 22 and the existing MySQL schema. Copy `.env.example` to an ignored `.env.local`, retain the real `DATABASE_URL` and `SESSION_SECRET` when operating an existing account database, then:

```powershell
npm ci
npm run db:generate
npm run dev
```

Apply the additive Flight migrations only after a private database backup and schema review. Migration 001 adds the original six tables; 002 adds fee/referral/season fields and rewards; 003 adds money constraints supported by the production MariaDB version. They preserve registration records. Production migrations run through the root deployment helper; the runtime database account cannot alter schemas. The owner-allocation script is explicit, prelaunch-only and idempotent; it never runs at application startup. Do not run test schema or fixture resets against production.

Required production configuration includes the retained database/session values, public app origin, existing SMTP encryption keys/settings, existing TRON merchant/node configuration and `CONTROL_PLANE_INTERNAL_TOKEN`. `TRON_PAYOUT_ADDRESS` can specify a separate treasury payout wallet; otherwise the configured merchant wallet is used. Secrets never belong in Git.

## Validation

```powershell
npm test
npm run typecheck
npm run build
```

Financial integration checks run only when `DATABASE_URL` names **`nister_flight_test` on loopback**. They reset fixtures in that database. Put its connection and `FLIGHT_TEST_PASSWORD` in an ignored `.env.test`, initialize that isolated schema, then run:

```powershell
node --env-file=.env.test scripts/flight-test-schema.cjs
node --env-file=.env.test --import tsx scripts/flight-integration.ts
```

`scripts/flight-browser.mjs` checks desktop/mobile rendering and, with `FLIGHT_BROWSER_AUTH=1`, fixture member/admin views, real password login, member denial at the admin API and cross-origin rejection. Screenshots stay under ignored `artifacts/browser`.

## Archiving and release operations

The source before this work is archived locally under `../../archives/`. A protected live release/database backup is at `/home/nisterai.com/archives/before-flight-2026-10-29/`, with checksums and the previous release in `manifest.json`. It contains secrets and must stay private.

`ops/remote.py` uses the saved SSH host key and the separately stored private key. Override `FLIGHT_DEPLOY_HOST`, `FLIGHT_DEPLOY_USER` or `FLIGHT_DEPLOY_KEY` as needed; it never disables host-key verification. `ops/stage.py` uploads only source to a separate release, copies existing production secrets on the server, and excludes generated files, local test secrets and runtime data. `ops/build_staged.py` validates that candidate before cutover. Keep the original release and its database backup for rollback.

Activation also isolates the web service with systemd, limits its memory/process count, restricts the database to table-level runtime operations and makes wallet/audit records append-only for the application. Nonce-based CSP, private API responses, strict request schemas, origin validation and per-account rate budgets protect the web surface. These controls do not replace ongoing patching, monitoring and backups.

The new service uses the existing `nisterai-web` systemd unit and origin port. The dormant legacy chain cursor is archived and rebased to a recent finalized window only when no invoice is active, so new deposits do not wait behind months of expired invoices. Historical invoice hashes remain verifiable.

Flight settlement and crypto scanning use separately named `nisterai-*` timers. Existing WISP `nister-flight-settle`, spin, account, router, payment and forensic-log services must remain untouched.

Rollback changes only the `app` symlink back to the saved release, restarts `nisterai-web`, and stops the new `nisterai-*` timers. Do not restore an old database over newer financial activity. The additive Flight tables can remain during rollback.
