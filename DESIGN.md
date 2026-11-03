# Nister product simplicity

The standing product direction is the clarity of Linear and Apple Notes:
simple purpose, architecture, design and implementation. Apply it to every
first-party screen, whether public, private, signed in, signed out, customer,
operator or administrator. This is a development contract, not homepage copy.

## Before adding anything

1. Name the task the person came to complete.
2. Put the task in the title and the action in the control. Use direct terms
   such as Sign in, Wallet, Plans, Withdrawals and Settings.
3. Arrange the information in decision order. Use spacing and grouping before
   adding a caption, badge, tooltip, introduction or second heading.
4. Delete text that repeats a title, label, button or visible state. Authentication
   needs a form, not a marketing sidebar. A footer needs destinations, not a slogan.
5. Keep information that changes a decision: amount, currency, network, fee,
   minimum, expiry, eligibility, consent, destructive consequences and recovery.
   Put it beside the relevant action. Help pages and legal documents may explain
   substantive rules; they still need direct headings.

## UX, DX and AX together

| Experience | Required outcome |
| --- | --- |
| User | The task, current state and next action are clear on a phone and desktop. Loading, empty, error and success states remain useful. |
| Developer | Existing layouts and tokens handle the change. Unused markup and CSS are removed. No new dependency or abstraction is needed for a copy/layout change. |
| Agent | Real headings, labelled inputs, named buttons, navigation landmarks, current-page state and stable form IDs expose the same workflow to assistive tools and automation. |

Use one page title per visible task, persistent field labels, visible keyboard
focus and comfortable touch targets. Avoid placeholder-only names, ambiguous
icon buttons, decorative status claims, moving buttons and unnecessary motion.
Use optional factual metadata only where it identifies the record or decision.
Menu text must maintain at least 4.5:1 contrast in its normal and selected states.
Changing a surface color also requires checking every foreground on that surface.
Parse styles and inspect rendered screens: a successful build alone cannot catch
an invisible menu or a responsive rule swallowed by an unclosed style block.
Use structural tools or exact, bounded edits for nested HTML and CSS. Broad text
replacement across nested blocks can remove working controls or closing braces.

## Surface ownership

| Surface | Source of presentation |
| --- | --- |
| Router captive login, signup, reset, status, logout, results and redirects | `hotspot/*.html`, `hotspot/common.css`; copy changed assets to `nister-org/public/router-sync/` |
| Public coverage and network sites | `nister-org/src/components`, `nister-org/src/app/globals.css` |
| Static public fallback | `wifi-portal/index.html` |
| Customer portal and signed-out account pages | `pay-portal/index.php`, `login.php`, `register.php`, `assets/` |
| WISP administration and game management | `pay-portal/admin/`, `views/admin-shell.php`, `views/spin*.php`, shared assets |
| Flight public, account, recovery and administration | `nister-flight/src/components/flight`, route pages and `flight.css` |
| Marketplace storefront, vendor, admin and mobile roles | `commerce-platform/apps/`; keep its services and WISP isolated |

Vendor libraries, router XML protocol responses and backend endpoints are not
presentation templates. Do not rewrite them to enforce a visual preference.

## Required review

- Check the affected public, signed-out, signed-in and admin states. On a phone
  and desktop, complete the primary action and verify navigation, labels, focus,
  overflow, loading, errors and recovery. Use local fixtures for account/payment
  flows; never mutate production just to test presentation.
- Run `bash tests/regression/run.sh` for captive or payment changes. Its mirror
  check must pass. Preserve authentication, OTP, remembered-device behavior,
  payment verification, game consent, ledger rules and all root guardrails.
- Run each affected app's typecheck, tests and build. Marketplace also requires
  its lint and integration checks when the dependencies are available. Use the
  existing browser suites for public and authenticated flows.
- Record what was verified and any limitation. Do not claim that a source sync
  is a live deployment. Follow existing backup and host/router verification
  rules whenever deployment is separately performed.
- Before replacing a public release, inventory its routes as well as its files.
  Preserve live request forms, information pages and role-specific destinations
  even when the current development branch lacks them. Keep their source in the
  repository so the next build does not silently remove them.

Reject a change that only looks simpler because it hides information or makes
the implementation harder to understand. Review new work against this contract
instead of gradually restoring taglines and helper paragraphs.
