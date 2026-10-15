import type { Metadata } from "next";
import { EnsLookup } from "@/components/ens-lookup";
export const metadata: Metadata = { title: "ENS lookup" };
export default function EnsPage() {
  return <><div className="page-heading"><h1>ENS lookup</h1><p>Find the wallet behind a name, or the name behind a wallet.</p></div><EnsLookup /></>;
}
