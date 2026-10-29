import { AuthPage } from "@/components/flight/auth-page";
export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; email?: string; next?: string; ref?: string }> }) { return <AuthPage signup params={await searchParams}/>; }
