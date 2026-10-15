"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { verifiedEnsName } from "@/lib/ens";
import type { EnsNetwork } from "@/lib/clients";
import { shortAddress } from "@/lib/format";

export function AddressText({ address, network = "sepolia", copy = false }: { address: Address; network?: EnsNetwork; copy?: boolean }) {
  const { data: name } = useQuery({ queryKey: ["ens-name", network, address.toLowerCase()], queryFn: () => verifiedEnsName(address, network), staleTime: 60_000, retry: false });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return <span className="address-wrap">
    <span title={address} className="address">{name || shortAddress(address)}</span>
    {copy && <button type="button" className="text-button" aria-label={`Copy address for ${name || shortAddress(address)}`} onClick={async () => {
      try { await navigator.clipboard.writeText(address); setCopied(true); setCopyError(false); setTimeout(() => setCopied(false), 2000); }
      catch { setCopyError(true); }
    }}>{copied ? "Copied" : "Copy"}</button>}
    {copyError && <span role="status" className="muted">Copy unavailable in this browser. You can copy the address from your wallet.</span>}
  </span>;
}
