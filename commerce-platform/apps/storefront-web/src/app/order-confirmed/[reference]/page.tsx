import { OrderConfirmation } from "@/components/order-confirmation";

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <OrderConfirmation reference={reference} />;
}
