import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioScreen } from "@/components/studio-screen";
import { NFTGallery } from "@/components/nft-gallery";
export const metadata: Metadata = { title: "NFT Studio" };
export default function StudioPage() {
  return <><div className="page-heading"><h1>NFT Studio</h1><p>Turn an image, profile card, certificate, or PDF document into an NFT.</p></div><Suspense fallback={<p>Loading NFT Studio…</p>}><StudioScreen /></Suspense><NFTGallery /></>;
}
