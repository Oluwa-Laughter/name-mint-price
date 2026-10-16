import type { Metadata } from "next";
import { BatchMint } from "@/components/batch-mint";
export const metadata: Metadata = { title: "Smart account" };
export default function SmartAccountPage() {
  return <><div className="page-heading"><h1>Mint two, confirm once</h1><p>Create two NFTs from one file, with two mint calls in one smart account operation.</p></div><BatchMint /></>;
}
