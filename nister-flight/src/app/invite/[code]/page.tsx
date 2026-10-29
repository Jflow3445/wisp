import { notFound } from "next/navigation";
import Landing from "@/app/page";
import { flightShareMetadata } from "@/lib/flight-brand";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ code: string }> };
export async function generateMetadata({ params }: Props) {
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z0-9]{4,24}$/.test(code)) notFound();
  return flightShareMetadata(`https://nisterai.com/invite/${code}`);
}
export default async function Page({ params }: Props) {
  if (!/^[A-Za-z0-9]{4,24}$/.test((await params).code)) notFound();
  return <Landing/>;
}
