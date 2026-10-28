# SMS delivery and admin registration

Open **https://pay.nister.org/admin/sms.php** from the admin menu.

- **Pause all SMS** stops new sends from OTP, signup, payment messages, quota/expiry
  notifications and admin broadcasts. Already accepted messages cannot be recalled.
  Paused messages are skipped; they are not held for a later bulk replay. OTP-based
  signup and password reset cannot finish while SMS is paused.
- Each gateway has its own enable switch, API key, approved Sender ID and priority.
  Lower priority numbers are tried first. Disabled or incomplete gateways are not
  contacted. A blank key field preserves a saved key; removal is explicit. Keys are
  never returned in the rendered page or general settings JSON.
- The existing legacy `MNOTIFY_*` settings remain compatible. They originally
  selected either PiloSMS or mNotify by API hostname. The new gateway page saves
  independent `SMS_PILOSMS_*`, `SMS_MNOTIFY_*` and `SMS_ARKESEL_*` settings. Manage
  credentials on that page, not the general portal settings form.
- Multiple enabled gateways provide failover, not duplicate sends. Explicit
  gateway rejections (including bad credentials, insufficient credit or an
  unapproved sender) and connection failures can fall back immediately. Timeout,
  malformed responses and server errors can have an uncertain delivery outcome;
  the current message is not resent, and subsequent messages can use a backup.
  Partial broadcasts are not replayed through another gateway. Accepted counts
  are reported so an admin can avoid resending a whole list.
- Gateway failures open a persistent cooldown starting at 60 seconds, increasing
  to 15 minutes. The gateway becomes eligible again afterward. Updating its
  credentials invalidates stale health state. Recipient/message rejections do not
  penalize an otherwise healthy gateway.
- `nister-sms-health.timer` checks enabled, configured gateways every two minutes
  using balance endpoints. It never sends test SMS and skips checks while globally
  paused. A healthy balance response does not prove handset delivery or override
  an unresolved sender/delivery rejection. Admins can explicitly check a gateway
  after correcting its configuration.

Arkesel uses the supplied HTTPS V1 `/sms/api` contract, with URL encoding,
`action=send-sms`, `api_key`, `to`, `from`, and `sms`. Only a JSON `code: ok` response
counts as acceptance. Checks use `action=check-balance&response=json`.
Reference: [Arkesel API](https://docs-staging.arkesel.com/),
[PiloSMS API](https://pilosms.com/developers/),
[mNotify API](https://developer.bms.africa/).

## Registering users

Open **https://pay.nister.org/admin/register.php**. Enter the customer's name,
Ghana phone number, Wi-Fi password and site. Admin registration does not require
an OTP. It creates local and international login aliases, a zero-balance wallet,
name and site profile in one database transaction. Both aliases receive
`Simultaneous-Use=2`, `HS_NOPAID` and the unpaid address list. No plan, free data,
payment credit or active internet entitlement is granted by registration.

Duplicate accounts are rejected without changing their credentials or balances.
An optional welcome SMS follows the normal delivery switches and failover policy;
its failure does not undo registration. Passwords are not included in welcome SMS.
The admin session and CSRF protections apply to both new pages.

## Validation and rollback

Run `bash tests/regression/run.sh`. Behavioral coverage includes gateway failover,
pause, disabled providers, uncertain delivery, bulk partial responses, cooldown
recovery, legacy configuration and atomic registration rollback.

Production rollout evidence and exact-file rollback are held in the root-only
directory named by `/root/.nister-sms-task-dir`. `rollback.py` restores the previous
live variants and ownership, removes the new files and disables the new timer.
Health metadata is retained. SMS gateway secrets are stored in the existing
application settings database; they are never checked into Git.
