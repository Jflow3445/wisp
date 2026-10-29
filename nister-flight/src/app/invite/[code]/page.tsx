import { notFound } from "next/navigation";
import Landing from "@/app/page";
import { flightShareMetadata, flightPublicShareUrl } from "@/lib/flight-brand";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ share?: string }> };
export async function generateMetadata({ params, searchParams }: Props) {
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z0-9]{4,24}$/.test(code)) notFound();
  return flightShareMetadata(flightPublicShareUrl(`/invite/${code}`, (await searchParams).share));
}
export default async function Page({ params }: Props) {
  if (!/^[A-Za-z0-9]{4,24}$/.test((await params).code)) notFound();
  return <Landing/>;
}
