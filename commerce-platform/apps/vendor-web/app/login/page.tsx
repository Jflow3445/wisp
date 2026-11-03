import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Vendor sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-5">
      <section className="w-full max-w-md rounded-xl border border-line bg-white p-6 sm:p-8">
        <div className="mb-8 font-semibold">NISTER <span className="font-normal text-slate-500">Vendor</span></div>
        <h1 className="text-2xl font-semibold">Vendor sign in</h1>
        <LoginForm />
      </section>
    </main>
  );
}
