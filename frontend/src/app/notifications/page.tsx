import type { Metadata } from "next";
import { LiveAlerts } from "@/components/live-alerts";
export const metadata: Metadata = { title: "Live alerts" };
export default function NotificationsPage() {
  return <><div className="page-heading"><h1>Live mint alerts</h1><p>Follow new NFTs minted through Name &amp; Mint on Sepolia.</p></div><LiveAlerts /></>;
}
