import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileScreen } from "@/components/profile-screen";
export const metadata: Metadata = { title: "Profile cards" };
export default function ProfilePage() {
  return <><div className="page-heading"><h1>Profile cards</h1><p>Read an ENS profile, or create an NFT card of your own in NFT Studio.</p></div><Suspense fallback={<p>Loading profile…</p>}><ProfileScreen /></Suspense></>;
}
