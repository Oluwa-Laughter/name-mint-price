"use client";
import { useSearchParams } from "next/navigation";
import { EnsLookup } from "./ens-lookup";
import Link from "next/link";
export function ProfileScreen() {
  const params = useSearchParams();
  const name = params.get("name") || "";
  const network = params.get("network") === "mainnet" ? "mainnet" : "sepolia";
  return <><EnsLookup key={`${network}:${name}`} profile initialName={name} initialNetwork={network} /><section className="section stack-lg"><div><h2>Make my card</h2><p className="muted">Upload your picture and bio, then mint them as an NFT. The card is separate from your live ENS records.</p></div><Link className="button secondary" href="/studio?type=profile">Create a profile card</Link></section></>;
}
