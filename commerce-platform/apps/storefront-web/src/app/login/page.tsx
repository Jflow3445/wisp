import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export default function Page() {
  return <AuthShell title="Sign in" alternate={{ label: "New to NISTER?", href: "/register", action: "Create an account" }}><LoginForm /></AuthShell>;
}
