"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWriteContract } from "wagmi";
import { getAddress, isAddress } from "viem";
import { namehash } from "viem/ens";
import { lookupEns, type EnsResult } from "@/lib/ens";
import { ensClient, sepoliaClient, type EnsNetwork } from "@/lib/clients";
import { ensResolverAbi } from "@/lib/contracts";
import { eth, usd, explainError } from "@/lib/format";
import { usePrice } from "@/hooks/use-price";
import { useTransaction } from "@/hooks/use-transaction";
import { AddressText } from "./address";
import { Notice, TransactionFeedback } from "./feedback";
import { Media } from "./media";

export function EnsLookup({ profile = false, initialName = "", initialNetwork = "sepolia" }: { profile?: boolean; initialName?: string; initialNetwork?: EnsNetwork }) {
  const [input, setInput] = useState(initialName);
  const [network, setNetwork] = useState<EnsNetwork>(initialNetwork);
  const [submitted, setSubmitted] = useState({ value: initialName, network: initialNetwork });
  const query = useQuery({ queryKey: ["ens-lookup", submitted.network, submitted.value], queryFn: () => lookupEns(submitted.value, submitted.network), enabled: Boolean(submitted.value), retry: false });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.value === input.trim() && submitted.network === network) void query.refetch();
    else setSubmitted({ value: input.trim(), network });
  }
  return <div className="stack-lg">
    <form onSubmit={submit} className="stack" aria-label="ENS lookup">
      <div className="form-row"><div className="field grow"><label htmlFor={`ens-input-${profile}`}>ENS name or wallet address</label><input id={`ens-input-${profile}`} name="ens" required value={input} onChange={(e) => setInput(e.target.value)} placeholder="yourname.eth or 0x…" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
        <div className="field network-field"><label htmlFor={`network-${profile}`}>ENS network</label><select id={`network-${profile}`} name="network" value={network} onChange={(e) => setNetwork(e.target.value as EnsNetwork)}><option value="sepolia">Sepolia testnet</option><option value="mainnet">Ethereum mainnet</option></select></div>
        <button className="button primary" type="submit" disabled={query.isFetching || !input.trim()}>{query.isFetching ? "Looking up…" : "Look up"}</button>
      </div>
      <p className="hint">Sepolia and mainnet have separate ENS names. You can look up names without connecting a wallet.</p>
    </form>
    {query.isError && <Notice tone="error">{explainError(query.error)}</Notice>}
    {query.isFetching && !query.data && <p role="status" className="muted">Resolving the name and fetching its records…</p>}
    {query.data && <div className={query.isFetching ? "stack-lg fetching" : "stack-lg"}>
      <LookupResult result={query.data} profile={profile} />
      {!profile && <EditEnsRecord key={`${query.data.network}:${query.data.name}`} result={query.data} onSaved={() => void query.refetch()} />}
    </div>}
    {!submitted.value && <div className="empty-state"><h2>{profile ? "Find a profile" : "A name, an address, a clear result"}</h2><p>{profile ? "Look up an ENS name to see its avatar, bio, Twitter, and ETH balance." : "Enter a .eth name to find its wallet, or enter a wallet address to find its verified primary name."}</p></div>}
  </div>;
}
function LookupResult({ result, profile }: { result: EnsResult; profile: boolean }) {
  const price = usePrice();
  const dollarValue = result.balance !== null ? price.convert(result.balance) : null;
  const twitter = result.twitter?.replace(/^@/, "");
  return <section className="result stack" aria-label="ENS result">
    <div className="profile-heading"><Media key={result.avatar} src={result.avatar} alt={`Avatar for ${result.name || "wallet"}`} className="avatar" fallback={result.name?.slice(0, 1).toUpperCase() || "0x"} /><div><span className="eyebrow">{result.network === "sepolia" ? "Sepolia ENS" : "Ethereum mainnet ENS"}</span><h2>{result.name || "No primary ENS name"}</h2>{result.address && <AddressText address={result.address} network={result.network} copy />}</div></div>
    {!result.address && <Notice>This name has a resolver but no ETH address record. An authorized wallet can set one below.</Notice>}
    {result.partial && <Notice>Some profile records could not be loaded. The available results are shown; look up again to retry.</Notice>}
    {result.address && <div className="field"><label htmlFor={`resolved-${profile}`}>Resolved address</label><input id={`resolved-${profile}`} name="resolved-address" readOnly value={result.address} className="mono" onFocus={(e) => e.target.select()} /></div>}
    {profile ? <>
      <p>{result.description || "No description set on this ENS profile."}</p>
      {twitter && /^[a-zA-Z0-9_]{1,15}$/.test(twitter) ? <a className="external-link" href={`https://x.com/${encodeURIComponent(twitter)}`} target="_blank" rel="noreferrer">@{twitter} on Twitter / X ↗</a> : <p className="muted">{result.twitter ? `Twitter record: ${result.twitter}` : "No Twitter record set."}</p>}
      <dl className="stats"><div><dt>ETH balance · {result.network === "sepolia" ? "Sepolia" : "Ethereum"}</dt><dd>{result.balance !== null ? `${eth(result.balance)} ETH` : "Unavailable"}</dd></div><div><dt>At the current ETH/USD quote</dt><dd>{dollarValue !== null ? usd(dollarValue) : "Price unavailable"}</dd></div></dl>
      <p className="hint">{result.network === "sepolia" ? "Illustrative conversion only: Sepolia ETH has no real USD value." : "Converted using the Chainlink Sepolia ETH/USD feed. This is an indicative quote."}</p>
    </> : <div className="inline-actions"><Link className="button secondary" href={`/profile?name=${encodeURIComponent(result.name || result.address || "")}&network=${result.network}`}>View profile and balance</Link>{result.name && <a className="external-link" href={`https://${result.network === "sepolia" ? "sepolia.app" : "app"}.ens.domains/${encodeURIComponent(result.name)}`} target="_blank" rel="noreferrer">Manage in ENS ↗</a>}</div>}
  </section>;
}
function EditEnsRecord({ result, onSaved }: { result: EnsResult; onSaved: () => void }) {
  const { address } = useConnection();
  const [target, setTarget] = useState(result.address || "");
  const [localError, setLocalError] = useState("");
  const { mutateAsync: writeContract } = useWriteContract();
  const tx = useTransaction();
  const cache = useQueryClient();
  const permission = useQuery({
    queryKey: ["ens-edit-permission", result.name, result.resolver, address, result.address],
    enabled: Boolean(address && result.name && result.resolver && result.network === "sepolia"),
    retry: false,
    queryFn: async () => {
      if (!address || !result.resolver || !result.name) return false;
      const supported = await sepoliaClient.readContract({ address: result.resolver, abi: ensResolverAbi, functionName: "supportsInterface", args: ["0x3b3b57de"] });
      if (!supported) throw new Error("This resolver does not support editing the ETH address through this form. Use the ENS manager.");
      await sepoliaClient.simulateContract({ address: result.resolver, abi: ensResolverAbi, functionName: "setAddr", args: [namehash(result.name), result.address || address], account: address });
      return true;
    },
  });
  if (!result.name || !result.resolver) return null;
  if (result.network === "mainnet") return <Notice>Editing is enabled for Sepolia ENS. To change a mainnet record, use the official ENS manager.</Notice>;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLocalError("");
    if (!isAddress(target) || /^0x0{40}$/i.test(target)) { setLocalError("Enter a valid, nonzero Ethereum address."); return; }
    const name = result.name!;
    const destination = getAddress(target);
    const receipt = await tx.run(async (setPhase) => {
      const resolver = await ensClient("sepolia").getEnsResolver({ name });
      if (!resolver) throw new Error("The name no longer has a resolver. Look it up again.");
      if (resolver.toLowerCase() !== result.resolver!.toLowerCase()) throw new Error("The name's resolver changed. Look it up again before editing.");
      await sepoliaClient.simulateContract({ address: resolver, abi: ensResolverAbi, functionName: "setAddr", args: [namehash(name), destination], account: address! });
      setPhase("Confirm the ENS address change in your wallet…");
      return writeContract({ address: resolver, abi: ensResolverAbi, functionName: "setAddr", args: [namehash(name), destination], account: address!, chainId: 11155111 });
    });
    if (receipt) { await cache.invalidateQueries({ queryKey: ["ens-name"] }); onSaved(); }
  }
  return <section className="section stack"><div><h2>Update this name’s address</h2><p className="muted">Only a wallet with permission on this resolver can change the record. Setting an address does not set its primary ENS name.</p></div>
    {!address ? <Notice>Connect the name owner’s or authorized manager’s wallet to edit this record.</Notice> : permission.isPending ? <p role="status">Checking this wallet’s permissions…</p> : permission.isError ? <Notice>{explainError(permission.error)} <button type="button" className="text-button" onClick={() => void permission.refetch()}>Check again</button></Notice> : null}
    <form onSubmit={save} className="stack"><fieldset disabled={tx.busy || permission.data !== true} className="stack"><div className="field"><label htmlFor="new-ens-address">New ETH address for {result.name}</label><input id="new-ens-address" name="new-address" value={target} onChange={(e) => setTarget(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} required placeholder="0x…" /></div><button type="submit" className="button secondary" disabled={target.toLowerCase() === result.address?.toLowerCase()}>{tx.busy ? "Updating…" : "Update ENS address"}</button></fieldset></form>
    {localError && <Notice tone="error">{localError}</Notice>}<TransactionFeedback tx={tx} />
  </section>;
}
