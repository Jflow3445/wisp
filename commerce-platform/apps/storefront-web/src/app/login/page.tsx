import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export default function Page() {
  return <AuthShell title="Welcome back" description="Sign in to see orders, receipts and delivery updates." alternate={{ label: "New to NISTER?", href: "/register", action: "Create an account" }}><LoginForm /></AuthShell>;
}
