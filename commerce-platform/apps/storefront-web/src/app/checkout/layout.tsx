import { CheckoutShell } from "@/components/checkout-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <CheckoutShell>{children}</CheckoutShell>;
}
