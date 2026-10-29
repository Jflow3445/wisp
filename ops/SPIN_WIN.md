# NISTER Flight operations
Updated 2026-10-28. Flight replaces the wheel at the existing `/spin.php` URL. Existing wallet, purchases, authentication and historical game records remain in place.

## Customer experience

The plane follows server-issued returns that can rise, fall, recover from below break-even, or reach zero. Every displayed currency amount is payable. The multiplier is marked approximate when two decimals cannot represent the exact return. The chart labels the 1x break-even line.

The visual renderer in `assets/flight-motion.js` glides forward continuously within each known offer, eases into altitude changes, banks through climbs/dips and draws a curved contrail. It animates only revealed values. Collection freezes it, expired offers wait for fresh data, hidden tabs pause rendering, and reduced-motion mode uses static positions. Player-facing copy omits pool/funding explanations, including in the first confirmation. Existing logged consents retain their original text and are not requested again for this copy edit.

Visual speed now rises through the existing flight duration: forward travel follows 0.6t + 0.4t^3, wind accelerates and altitude changes become more responsive. Motion paints on animation frames. Start/end time, offer lifetimes and financial draws are unchanged; microsecond cash-out windows would be unusable. The collect button is brown below break-even and gold for a net profit, with a stake/profit or recovery/loss summary.

Takeoff immediately deducts and holds the stake. Stop & Collect accepts one exact, unexpired offer. A completed flight automatically settles its last return; zero ends the flight immediately. Closing the page does not pause it. The customer can resume after refresh. Accepted flights can still collect/settle when new play is paused, ghosted or restricted.

The ordinary wallet receives only the total return. There is no second credit balance or per-round confirmation. The first consent for flight version v3 is saved once per account, including the exact displayed text, hash, time and HMAC audit event. Future ordinary configuration changes do not repeat that consent.

Existing WISP users reuse their normal login/session and regular wallet. The game does not register new customer credentials or create a separate spendable balance. A direct game link retains its destination through the existing login page. The one-time confirmation includes an 18+ declaration; known underage accounts and existing restrictions remain blocked, while a separate game identity review is optional. Game preferences are keyed to the existing account number. Administrators see the existing WISP wallet-account directory.

Customer copy stays simple. Administrative movement probabilities, configurations, formulas and operational limits do not appear in the game. Administrators configure the minimum stake; there is no per-flight maximum. Previously chosen personal exclusions and optional administrative daily controls remain enforced.

## Money and the pool ceiling

All amounts are integer pesewas. With wallet W, stake S, pool P and total return R:

- Takeoff: available wallet = W - S; held stake = S; pool remains P.
- Settlement: wallet = W - S + R; held stake = 0; pool = P + S - R.
- Return ceiling: R <= min(2S, floor(P * 10%)). This caps the ENTIRE return, including returned stake.
- Stake larger than the ceiling remains playable. The plane never shows an unsupported return or profit.

Example: wallet GHS 1,000, stake GHS 150, pool GHS 1,000. The largest permitted total return is GHS 100. Collecting GHS 98 leaves wallet GHS 948 and pool GHS 1,052. A zero return leaves wallet GHS 850 and pool GHS 1,150. The held GHS 150 is never added to the return or prematurely added to the pool.

A winning return includes the FULL principal. With wallet GHS 572.18, stake GHS 50 and profit GHS 43.06, hold leaves GHS 522.18, the credit is GHS 93.06, and the wallet finishes at GHS 615.24. A GHS 1,000 pool finishes at GHS 956.94: the held GHS 50 returns to the customer and only GHS 43.06 profit comes from the pool. This net-pool model was explicitly confirmed by the user.

The API derives separate stake_returned_cents, profit_cents, loss_cents and total_return_cents. Receipts show these amounts and the complete wallet equation. Other purchases/deposits during the flight are shown separately, so a concurrent purchase is not misrepresented as another stake deduction. No retrospective extra stake credit was issued: the reported winning ledger already paid principal plus profit.

Active flights reserve gross return envelopes. To keep every concurrent offer funded even after other flights settle, total reservations fit within the smallest active pool percentage. A new envelope is:

`max(0, min(2S, floor(P * effective_bps / 10000) - existing_reservations, wallet_capacity))`

The effective percentage is the smaller of current configuration and existing active-flight percentages. The hard maximum is 1,000 basis points (10%). This conservative shared allowance can reduce a new flight's ceiling. If other flights occupy the entire allowance, or the pool is empty, a valid stake still starts with a zero envelope and immediately settles at zero. Funding never introduces a pool-dependent stake rejection.

Manual withdrawals that invalidate active reservations are rejected. Configuration changes never replace an accepted flight's version or envelope. Positive pool adjustments are allowed. Rare wallet integer-capacity conflicts freeze the exact accepted payout as PAYOUT_PENDING, retaining its stake and reservation until credit can complete. No return is truncated.

## Movement mathematics and offer timing

New flights use engine 5 with balanced movements. Defaults remain eight base movements, 1,500 ms each, a 150 basis-point zero-event setting, and uniform whole movement percentages from 10 to 40. Administrators select **Minimum expected house edge (%)** under Game rules, from 0 to 99.9999% in increments of 0.0001%. It is a minimum expected margin per accepted stake across stopping strategies, not guaranteed realised profit or a winning probability. The old configurable upward-direction probability is retired for new profiles.

The nonzero opening is derived from the selected minimum and opening zero hazard. Let H be the minimum in integer parts per million and Z the zero setting in basis points:

`A = min(999999, floor((1000000 - H) * 10000 / (10000 - Z)))`

With Z = 10000, A is zero. Opening returns zero on a zero event; otherwise it returns `floor(min(stake, funded ceiling) * A / 1000000)`. It always starts below the stake. A 10% minimum with a 1.5% opening zero hazard derives a 91.3705% nonzero opening. The preserved 6.4250% default derives 95%, with expected opening return at most 93.575% of stake. A selected minimum below the zero hazard cannot remove that hazard. Pool restrictions and currency rounding can increase the effective edge.

Subsequent ordinary moves preserve their current expected value instead of repeatedly charging a downward bias and uncompensated zero risk. Choose movement percentage k independently with the configured weights. With current integer return x and envelope C, let delta = max(1, floor(x*k/100)), U = min(C,x+delta), D = max(0,x-delta). For 0 < x < C, choose a zero-event probability Q in basis points:

`Q = min(Z, floor((U-x)*10000/U))`

After the zero draw, a surviving return is U with integer probability numerator `N = x*10000 - D*(10000-Q)` and denominator `T = (U-D)*(10000-Q)`; otherwise it is D. Since Q <= 1-x/U, 0 <= N <= T. Thus `E(next | x,k) = (D*(10000-Q)+N)/10000 = x` exactly. All products fit signed 64-bit integers within the supported wallet/envelope limits. Zero is absorbing. Direction probabilities are calculated from funded outcomes and are independent of customer history or recent platform wins.

At a ceiling x = C, the next movement is C-1: a **one-pesewa** dip, with no additional zero draw. A 2x offer lasts at most 1,000 ms before this dip. A final 2x offer may settle at the nominal deadline when no more than one second remains. These tiny mandatory dips are the only later negative drift. They replace the old large percentage rebounds. The number of offers remains bounded and the nominal deadline unchanged, so optional stopping cannot raise expected payout above the opening expectation.

For automatic completion, `E(final return) = E(opening) - E(number of ceiling dips in pesewas)`. The admin preview estimates this small dip cost directly, rather than estimating calibration from noisy full payouts. A 50,000-path default preview gives approximately 92.9212% automatic return for GHS 1, 93.5069% for GHS 10, and 93.5613% for GHS 50. The expected dip cost is below one pesewa in these cases. This replaces roughly 62.5% automatic return for a funded GHS 10 stake under the former defaults. Smaller stakes are more sensitive to currency-sized costs. Separate policy simulations still show actual sampled returns and standard errors for immediate, first-profit, target and end strategies.

The preview uses the **unsaved form** and current reservations without changing active rules. It displays the selected minimum, derived opening, exact opening/stake bound, calibrated automatic-completion return/edge, expected ceiling cost, reachable return and whether profit is possible. Review includes automatic-completion calibration before the existing administrator's reason and confirmation. Saves append signed immutable configurations. Accepted flights retain their original path, offer deadlines and financial terms.

Paths use [PHP random_int](https://www.php.net/manual/en/function.random-int.php). Preview uses a separate reproducible rejection-sampled 52-bit analysis stream, which supports the wider integer probability denominator and is never used for paid rounds. A keyed HMAC commits to the round, owner, idempotency reference, path, schedule, configuration hash, stake, ceiling and deadlines before takeoff commits. Only past/current history_ms offsets reach the browser; future points, schedules and early-zero deadlines stay private. Existing accepted engine-1/2/3/4 rounds retain their original data and commitment format.

Offers do not overlap. Each server-generated offer ID identifies a fixed amount and expiry. The browser polls while active and disables collection shortly before expiry to allow network transit. It freezes the displayed offer during collection. A late request receives `offer_expired`, updates the current view and requires another deliberate click; it never silently pays a different amount. After flight expiry, only the automatic final receipt is returned.

Start and collect requests have persistent idempotency references. Browser recovery retains these across transport failure and refresh. Out-of-order responses cannot resurrect an ended flight. On mobile the active collect button remains fixed within reach. The browser polls near offer boundaries and never rounds a below-2x return up to 2.00x.

Reads are limited per authenticated account to 20/second and 600/minute. Starts have a separate 30/minute bucket; collection has its own 120/minute bucket, so exhausted start/read quotas do not consume collection allowance. Preferences have 10/minute. Unknown actions share one fixed bucket; arbitrary action strings cannot manufacture unlimited rate-limit keys. The API rejects extra start/collect fields, including client-supplied payouts.

Ownership, authenticated offer amount, issue/expiry times and exact schedule position are rechecked on the server after obtaining the financial lock. Browser clocks, frozen animation, stale tokens, repeated polls and duplicate requests cannot renew an offer or set its payout. These controls follow [OWASP transaction authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html).

## Accounting, migration and audit

Migrate the existing PAY database with `php pay-portal/cron/migrate_spin.php`.

1. `001_spin_win.sql`: legacy wheel, state, pool, journals, audit, game preferences and idempotency. The unused legacy authenticator-counter table is retained only for migration compatibility; no authenticator is provisioned or required.
2. `002_spin_wallet_experience.sql`: monetary payout destination, upgrade version and consent.
3. `003_spin_flight.sql`: immutable flight configurations, held rounds, exact offers and collection requests.
4. `004_spin_flight_safety.sql`: per-round engine version, authenticated schedule and payout retry cursor.

The migration runner resumes interrupted column additions. With a configured audit key it appends signed experience upgrades. The house-edge and balanced-movement upgrades need no new SQL schema: it appends an explicit-edge flight configuration preserving the previous 95% opening for its configured hazard, leaving historical versions and accepted rounds intact. The balanced upgrade then appends a prospective balanced profile preserving the selected minimum, zero setting, movement range, timing and operational limits. New starts require the explicit edge and balanced model; historical records remain valid. Reruns preserve balances, configurations and receipts and do not refresh the admin inactivity clock. New play fails closed until initialization completes.

Takeoff writes `ledger.type=flight_stake`, a balanced cash/held journal, the persisted round and signed commitment in one InnoDB transaction. Settlement writes `flight_return` when positive, a pool movement of S-R, a balanced held/cash/pool journal, final receipt and audit event in one transaction. Both serialize on the existing game-state lock; ordinary wallet writes also lock the account row. Failed writes roll back the entire transition. One active/pending flight per customer is enforced by a unique index.

Reconciliation checks held liability, gross reservations, wallet/pool links, exact collected offers and acceptance times, configurations, path commitments, receipts and the HMAC chain. Legacy wheel receipts, credit transfers and corrections remain verifiable. Public quote/spin mutations are retired; old receipt reads remain available.

Existing separate credits consolidate once into the regular wallet with matched journals. Old credit-page links redirect to wallet activity. Normal Paystack verification, manual MoMo review and subscription provisioning keep their existing paths.

## Jobs and operational state

Merge `pay-portal/spin.env.example` into the existing configuration. The example defaults paid play OFF. Production uses the existing WISP administrator session, manager allowlist, CSRF, a reason, idempotency references and signed audit records. No second authenticator or game login is required. Per the administrator's 2026-10-28 instruction, a qualifying existing administrator login authorizes play for the configured inactivity window; no separate authorization-reference or expiry setting is required. Keep the operational kill switches and a stable backed-up audit key outside the database.

Install these units through the existing deployment process, adjusting the default checkout path only if necessary:

- `systemd/nister-flight-settle.{service,timer}`: settle due rounds every second.
- `systemd/nister-spin-watchdog.{service,timer}`: inactivity/health watchdog every minute, with a settlement backstop.
- `systemd/nister-spin-reconcile.{service,timer}`: financial reconciliation every 15 minutes.

Enable/start all three timers. The timer runs one second after the previous settlement invocation completes. Its service explicitly allows 20 starts per 10 seconds so systemd's default five-start burst limit cannot stop a healthy one-second worker. The one-second settlement job is required for prompt completion without a connected browser. Monitor job errors and pending payouts; do not rely only on browser polling. Due active flights take priority over pending wallet-capacity retries, which rotate using last_retry_ms. One full wallet cannot starve unrelated due settlements. The job is CLI-only and may safely run concurrently with collection or another worker. Restart long-running local workers after upgrading source.

Only a successful interactive manager password login refreshes inactivity. At the default 48 hours without one, state persists as GHOSTED. A later login does not restore new play; explicit restoration through the existing administrator session is required. New play also fails closed on stale watchdog/reconciliation, missing signing configuration or an expired administrator authorization window. An already authenticated WISP admin session is recognized using its original `admin_at` timestamp; requests do not renew it. Accepted money obligations still settle. Ordinary wallet and internet access continue.

For rollback, ghost/disable NEW play and keep the settlement worker running until all holds/pending returns resolve. Preserve migrations, journals and signed records. Do not roll back by deleting flight tables or replaying financial transitions.

## Captive announcement

Both router status-page copies load the matching `spin-notice.js`. Authenticated users see a dismissible Flight notice once per account/device when play is available. It offers Try Flight and Keep browsing, supports keyboard dismissal, and does not redirect or force another captive login.

The notice reads only public feature availability from `https://pay.nister.org/spin-feature.php`. Existing hotspot API actions/candidates remain on `api.nister.org` or permitted router-local routes. The 2026-10-28 rollout uploaded the notice and the two-line status-page hook to the live router, verified by exact content hash, byte size and last-modified timestamp. The public Next.js runtime mirror was updated separately from the source checkout, with its existing service restarted to discover the new static asset. No VPN, Winbox, cookie-policy or forensic retention changes are needed.

## Local testing

From the repository root:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\spin\local.ps1 -Action Start`

Customer: http://127.0.0.1:8037/login.php — `0201234567` / `test-customer-password`. Game: http://127.0.0.1:8037/spin.php.

Admin: http://127.0.0.1:8037/admin/login.php — `operator` / `test-operator-password`. Management: `/admin/spin.php`.

The launcher preserves history and applies migrations. It runs the local settlement worker each second. Game management uses the existing administrator login; the old `-Action Mfa` command now explains that separate codes are unnecessary. Use `-Action Stop` to stop, or `-Action Reset` only to deliberately erase the isolated fixture.

PHP uses loopback port 8037; MariaDB uses 33079 and schema `nister_spin_test`. Runtime and logs live under `%TEMP%\nister-spin-tools`. Fresh fixtures start with a GHS 1,000 wallet and pool. Funds and permissions are test-only; external payments and CoA are disabled. Flight direction probabilities are derived from each funded up/down pair; the selected edge controls the opening expectation.

The original interactive database was backed up before the flight migration to `%TEMP%\nister-spin-tools\before-flight-upgrade.sql`. Its 10 historical spins and GHS 928.40 wallet were preserved. No reset was used.

## Verification

Destructive tests used a separate MariaDB instance on 33080 and web server on 8038. Never run fixture reset suites against an interactive user's database.

Set `SPIN_TEST_DSN`, `SPIN_TEST_USER`, `SPIN_TEST_PASS` for an isolated schema named exactly `nister_spin_test`, then run:

- `php -d extension=pdo_mysql tests/spin/run.php` — 190 legacy/integration checks.
- `php -d extension=pdo_mysql tests/spin/flight.php` — 768 flight checks.
- `php -d extension=pdo_mysql tests/spin/flight_safety.php` — 7,053 safety checks for conditional drift, integer stakes, one-second peaks, timing/ownership tampering, nonrenewable offers and settlement priority.
- `php -d extension=pdo_mysql tests/spin/house_edge.php` — 2,781 checks for integer edge calibration, boundaries, historical profiles, draft previews, accepted-round isolation, upgrade integrity and reconciliation.
- `php -d extension=pdo_mysql tests/spin/flight_balance.php` — 25,182 checks for fair integer draws, completion calibration, stopping strategies, one-pesewa peaks and immutable upgrades.
- `php -d extension=pdo_mysql tests/spin/job_smoke.php` — unattended settlement CLI, after web_setup.php prepares the isolated runtime.
- Configure `SPIN_TEST_RUNTIME`, run `web_setup.php` and `router.php`; use `SPIN_TEST_BASE_URL` for Playwright.
- `node nister-org/node_modules/@playwright/test/cli.js test -c tests/spin/playwright.config.cjs` — 40 desktop/mobile cases, including existing-customer access, login return paths, draft previews, server validation and session-authorized activation.
- `tests/regression/run.sh` — 234 existing regression checks after captive changes.
- `php -d extension=pdo_mysql tests/spin/admin_presence.php` — 19 administrator-presence and existing-session checks.
- PHP syntax and JavaScript ESLint checks.

Coverage includes exact partial/full/2x returns, held funds, no future path exposure, stale offers, duplicate requests, multi-process concurrency, rollback, empty-pool play, pending wallet capacity, signed-path tampering, one consent, refresh, lost responses, ghost completion, normal purchases, existing admin sessions, origin/CSRF and captive notices. Screenshots: `artifacts/spin/flight-*.png` and `admin-flight-*.png`, plus `admin-house-edge-*.png` for the new control.

Production deployment completed 2026-10-28. See `ops/flight-deployment-2026-10-28.txt`. The game is active at https://pay.nister.org/spin.php with an administrator-authorized GHS 100 opening pool and GHS 5 prefilled stake. Existing authenticated administrator presence was reused without resetting its original login time. No real customer wager or payment was submitted during deployment verification.

Production wallet/purchase tables use a different collation from the game tables. Cross-module identifier comparisons use explicit binary comparison; the existing tables were not altered. The isolated fixture now models this mixed-collation boundary.
