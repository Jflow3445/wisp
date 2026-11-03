import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";

export default function Page() {
  return <AuthShell title="Create your account" alternate={{ label: "Already have an account?", href: "/login", action: "Sign in" }}><RegisterForm /></AuthShell>;
}
