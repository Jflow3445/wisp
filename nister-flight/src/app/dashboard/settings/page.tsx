import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/flight/icons";
export const metadata = { title: "My account" };
export default async function Page() {
  const user = await requireUser(), player = await prisma.flightPlayer.findUnique({ where: { userId: user.id } });
  return <><div className="f-page-heading"><div><div className="f-eyebrow">YOUR PERSONAL AIRSPACE</div><h1>My account<span>.</span></h1><p>One account. Your existing Nister login, carried forward.</p></div></div><div className="f-wallet-grid"><section className="f-panel"><div className="f-panel-heading"><h2>Profile details</h2><Icon name="users"/></div><dl className="f-account-details"><div><dt>Full name</dt><dd>{user.name}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Email status</dt><dd><span className="f-status f-status-paid">{user.emailVerifiedAt ? "VERIFIED" : "UNVERIFIED"}</span></dd></div><div><dt>Flight eligibility</dt><dd>{player?.blocked ? "Restricted" : player?.verifiedAt ? "Verified" : "Awaiting administrator review"}</dd></div><div><dt>Account role</dt><dd>{user.role === "ADMIN" ? "Administrator" : "Member"}</dd></div></dl></section><section className="f-panel f-security-card"><Icon name="shield" size={34}/><h2>A secure place to land.</h2><p>Your existing password remains valid. Use the secure email reset flow whenever you need to change it.</p><Link href="/forgot-password" className="f-button f-button-secondary">Reset my password <Icon name="arrow" size={17}/></Link><p className="f-helper">Need an account review? Contact support with the email address shown on your profile.</p></section></div></>;
}
