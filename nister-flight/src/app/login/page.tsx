import { AuthPage } from "@/components/flight/auth-page";
export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; email?: string; next?: string }> }) { return <AuthPage params={await searchParams}/>; }
