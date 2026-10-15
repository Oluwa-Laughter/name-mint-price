import type { Metadata } from "next";
import { PriceScreen } from "@/components/price-screen";
export const metadata: Metadata = { title: "Live ETH price" };
export default function PricePage() {
  return <><div className="page-heading"><h1>Live ETH price</h1><p>The latest ETH/USD quote, read directly from our Chainlink consumer on Sepolia.</p></div><PriceScreen /></>;
}
