# Nister Flight

The crypto-only Flight application for `nisterai.com`, added to the WISP `commerce` branch. The existing Wi-Fi portal remains a separate service. This application retains the current Nister MySQL database, user IDs, email addresses, password hashes, session cookie, session secret, email verification, password reset and configured social sign-in. New rounds use random selection and the accepted settlement pool condition, with a short flight reveal. Accepted engine-5/6/7 flights retain their original settlement rules.

## Member and administrator surfaces

- `/dashboard`: live Flight, server offers, held stakes and recoverable receipts.
- `/dashboard/wallet`: USDT-TRC20 invoices, local QR codes, chain verification and crypto withdrawal requests. No MoMo, Paystack, phone-number payout or fiat conversion exists in this app.
- `/dashboard/referrals`: private invite link, native/WhatsApp sharing, earned and pending referral totals.
- `/dashboard/activity`: wallet ledger and commitment/seed verification receipts.
- `/dashboard/settings` and `/dashboard/help`: account status and game rules.
- `/admin`: operational overview and withdrawal queue.
- `/admin/users`: eligibility review, member restrictions and account access.
- `/admin/payments`: deposit invoices and payout history. Approve a request, send the full amount from the treasury wallet, then submit the outgoing transaction hash. The server verifies the successful solidified USDT transfer, treasury sender, destination, amount and request time before marking paid. No wallet private key is stored by the website.
- `/admin/settings`: independently pause flights, deposits or new withdrawals; set limits and private retained-revenue allocations; record treasury reserve allocations; configure the three referral percentages (combined maximum 3% of stake); preview and confirm the one-time public launch.
- `/admin/audit`: durable operator changes and withdrawal decisions.

New installations start paused with no reserve. The owner authorized a one-time $100 internal reserve allocation and a separate $100 non-withdrawable test credit to the designated test account. These are recorded as bookkeeping entries, not blockchain transfers. Before public launch only administrators and designated test accounts can play. The initial launch in Admin > Game controls requires typing START LIVE GAME, previews cleared balances, and blocks active flights, pending withdrawals and funded customer balances. It retains accounts and all financial history, clears test wallets/fee counters, and restores the opening house reserve. Once live, this reset cannot run again. Administrators are exempt from member email and eligibility verification; member verification remains required. A game block prevents new flights while preserving withdrawals; suspension of the entire account restricts account operations.

## Payment and wallet invariants

Balances, stakes, game returns, reserves and withdrawal requests are integer USD cents. Crypto settlement uses a fixed accounting rate of **1 USDT = $1.00 USD**, rather than a live exchange quote. On-chain USDT amounts are represented in integer microtokens. Deposit invoice offsets identify incoming transfers. Credits are bounded by confirmed chain value. A singleton row lock orders financial mutations, and serializable game/withdrawal transactions retry write conflicts. Unique deposit-event, round-request and withdrawal-request references prevent duplicate credits or debits. Withdrawal requests reserve funds immediately; a pending rejection refunds once. Approved transfers cannot be refunded from the dashboard while a payout may be in flight. Pauses do not prevent recovering accepted receipts or settling accepted rounds.

Every flight charges **3% on top of the stake**, rounded up to a cent, exactly once whether it wins or loses. The fee and total cost appear before play. Fees are held separately from the game reserve. Level 1 retains its existing administrator-set rate. Levels 2 and 3 start at 0% until configured. A confirmed crypto deposit qualifies the player but never pays a commission by itself. Each accepted bet freezes three ancestor allocations as a percentage of stake, rounded down to cents; all three settle whether the player wins or loses. The sum cannot exceed the 3% play fee. Deferred recipients do not prevent player settlement or payment to other levels. Compound round/level and round/recipient uniqueness and per-level ledger references prevent duplicate credits. Existing accepted one-level allocations remain recoverable. Cyclic ancestry, canonical Gmail self-referrals and manual-only funding do not qualify.

The private referral map uses paginated, owner-scoped branches through exactly three levels. It sorts each branch by rewards earned by the viewing user and distinguishes direct, branch and pending totals. Encrypted expiring node references and ancestry checks prevent traversal into another user's network. Aliases replace member names, emails, referral codes and database IDs; balances and other members' earnings never leave the API.

The homepage shows only profitable completed flights from the live season in the previous 30 minutes. Profit excludes stake and fee. Per-flight HMAC aliases replace all identifying account data; test wins never appear publicly. Receiving wallets are rejected as sending wallets in both deposit steps and the server. Confirmation-pending invoices remain retryable.

Future flight steps and random seeds stay on the server until settlement. Each flight publishes a commitment and reveals its seed, rules and path after settlement. `flight-math.test.ts` compares the port against 250 executions of the original PHP engine. PHP is needed for that comparison test, but is not needed to run the new website.

## Pool-conditioned flight draws (engine 9)

The member flow remains stake, start, eight-second flight reveal, confirmed result. The entry screen displays the standard winning prize of twice the stake. The current Terms require both random selection and a full payout no greater than 10% of the available pool at settlement; otherwise the round returns zero. Pool eligibility is evaluated under the finance lock and recorded for private audit. The pool condition is described in the Terms, and updated version-6 consent is required before new entries. The entry screen does not expose pool figures or internal selection settings.

A 256-bit secret is committed before the client's request UUID is generated. HMAC-SHA256 and rejection sampling determine random selection under frozen parameters. Pool conditions are applied separately at settlement. Identity, prior losses and controls never alter selection. Old engine-5/6/7/8 entries retain their accepted settlement rules and reserved liabilities.

Every new stake enters the shared house balance. The 3% fee is separate and funds the combined referral allocations and remaining insurance. New stakes no longer classify a fixed operator share as protected funds. The private configured margin controls the mathematical random-selection return. Historical protected revenue and earlier reserved liabilities are excluded from the available pool. A losing stake stays fully in the pool; a qualifying winner receives its entire 2x prize. New conditional entries do not reserve an unconditional prize. SQL checks bound settled engine-9 payouts to the recorded 10% pool allowance.

Settlement, wallet mutations, referrals and recovery remain atomic and idempotent. A lost response recovers the same accepted entry. Member receipts show the result and entry commitment while omitting internal pool and operating parameters. Administrators can monitor pool-limited round counts. A free preview never writes financial records.

## Local development

Use Node 22 and the existing MySQL schema. Copy `.env.example` to an ignored `.env.local`, retain the real `DATABASE_URL` and `SESSION_SECRET` when operating an existing account database, then:

```powershell
npm ci
npm run db:generate
npm run dev
```

Apply the additive Flight migrations only after a private database backup and schema review. Migration 001 adds the original six tables; 002 adds fee/referral/season fields and rewards; 003 adds money constraints; 004 adds versioned physics state and input logs; 005 adds mission offers, paired contests, shared reservations and protected-revenue constraints; 006 permits the original draw engine without aircraft state; 007 adds three-level allocations, indexed reward uniqueness, pool audit fields and pool-result constraints. They preserve registration records. Production migrations run through the root deployment helper; the runtime database account cannot alter schemas. The owner-allocation script is explicit, prelaunch-only and idempotent; it never runs at application startup. Do not run test schema or fixture resets against production.

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
node --env-file=.env.test --import tsx scripts/flight-draw-integration.ts
node --env-file=.env.test --import tsx scripts/flight-mlm-integration.ts
npm run test:risk
```

`scripts/flight-browser.mjs` checks desktop/mobile rendering and, with `FLIGHT_BROWSER_AUTH=1`, fixture member/admin views, real password login, member denial at the admin API and cross-origin rejection. Screenshots stay under ignored `artifacts/browser`.

## Archiving and release operations

The source before this work is archived locally under `../../archives/`. A protected live release/database backup is at `/home/nisterai.com/archives/before-flight-2026-10-29/`, with checksums and the previous release in `manifest.json`. It contains secrets and must stay private.

`ops/remote.py` uses the saved SSH host key and the separately stored private key. Override `FLIGHT_DEPLOY_HOST`, `FLIGHT_DEPLOY_USER` or `FLIGHT_DEPLOY_KEY` as needed; it never disables host-key verification. `ops/stage.py` uploads only source to a separate release, copies existing production secrets on the server, and excludes generated files, local test secrets and runtime data. `ops/build_staged.py` validates that candidate before cutover. Keep the original release and its database backup for rollback.

Activation also isolates the web service with systemd, limits its memory/process count, restricts the database to table-level runtime operations and makes wallet/audit records append-only for the application. Nonce-based CSP, private API responses, strict request schemas, origin validation and per-account rate budgets protect the web surface. These controls do not replace ongoing patching, monitoring and backups.

The new service uses the existing `nisterai-web` systemd unit and origin port. The dormant legacy chain cursor is archived and rebased to a recent finalized window only when no invoice is active, so new deposits do not wait behind months of expired invoices. Historical invoice hashes remain verifiable.

Flight settlement and crypto scanning use separately named `nisterai-*` timers. Existing WISP `nister-flight-settle`, spin, account, router, payment and forensic-log services must remain untouched.

Rollback changes only the `app` symlink back to the saved release, restarts `nisterai-web`, and restores the previous timer state. Do not restore an old database over newer financial activity. The additive Flight tables can remain during rollback.
