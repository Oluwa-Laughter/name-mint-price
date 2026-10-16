"use client";
import { useRef, useState, type FormEvent } from "react";
import { deserialize, serialize, useConfig, useConnection, useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { decodeEventLog, type Address, type Hex } from "viem";
import { getUserOperationHash, type SendUserOperationParameters } from "viem/account-abstraction";
import { sepolia } from "viem/chains";
import { buildBatchMintCalls } from "@/lib/aa/batch";
import { mintAccountClient, operationClient, smartAccount } from "@/lib/aa/client";
import { ENTRY_POINT } from "@/lib/aa/constants";
import { sepoliaClient } from "@/lib/clients";
import { classNFTAbi, CLASSNFT_ADDRESS, sepoliaContracts } from "@/lib/contracts";
import { resolveRecipient } from "@/lib/ens";
import { eth, explainError, explorer } from "@/lib/format";
import { MAX_NFT_IMAGE_BYTES, type PinnedAsset, type UploadKind } from "@/lib/ipfs";
import { uploadAsset } from "@/lib/upload";
import { AddressText } from "./address";
import { Notice } from "./feedback";
import { FilePicker, UploadSetup } from "./upload-fields";

type Pending = { hash: Hex; sender: Address; owner: Address; signed?: string };
type Result = Pending & { transactionHash: Hex; success: boolean; tokens: string[]; paymaster?: Address; gasCost: bigint };
const storageKey = (owner: Address) => `name-mint:pending-userop:${sepolia.id}:${CLASSNFT_ADDRESS}:${owner.toLowerCase()}`;
function savedOperation(owner: Address): Pending | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(owner)) || "null");
    if (saved?.owner?.toLowerCase() === owner.toLowerCase() && /^0x[\da-f]{64}$/i.test(saved.hash) && /^0x[\da-f]{40}$/i.test(saved.sender)) return saved;
  } catch { /* Storage can be unavailable in private browsers. */ }
}

export function BatchMint() {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const switchChain = useSwitchChain();
  const cache = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [kind, setKind] = useState<UploadKind>("artwork");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [sponsored, setSponsored] = useState(true);
  const [pinned, setPinned] = useState<{ file: File; fingerprint: string; asset: PinnedAsset }>();
  const [pending, setPending] = useState<Pending>();
  const [result, setResult] = useState<Result>();
  const [minted, setMinted] = useState("");
  const fingerprint = JSON.stringify([kind, name.trim(), description.trim(), address, file?.name, file?.lastModified, file?.size]);
  const submission = fingerprint + JSON.stringify([first.trim(), second.trim()]);
  const available = useQuery({ queryKey: ["bundler-config"], queryFn: async () => {
    const response = await fetch("/api/bundler");
    if (!response.ok) throw new Error("Could not check smart-account availability.");
    return response.json() as Promise<{ configured: boolean }>;
  }, refetchInterval: 30_000 });
  const account = useQuery({ queryKey: ["smart-account", address], enabled: Boolean(address), queryFn: async () => {
    const owner = await getWalletClient(config);
    return (await smartAccount(owner)).address;
  }, staleTime: Infinity });
  const balance = useQuery({ queryKey: ["smart-account-balance", account.data], enabled: Boolean(account.data), queryFn: () => sepoliaClient.getBalance({ address: account.data! }), refetchInterval: 15_000 });
  const fee = useQuery({ queryKey: ["mint-fee"], queryFn: () => sepoliaClient.readContract({ ...sepoliaContracts.classNFT, functionName: "mintFee" }) });
  // Restore through a query rather than accessing localStorage during server rendering.
  const restored = useQuery({ queryKey: ["pending-userop", address], enabled: Boolean(address), queryFn: () => savedOperation(address!) || null, staleTime: Infinity });
  const activePending = pending?.owner === address ? pending : restored.data || undefined;

  async function checkReceipt(operation: Pending, wait: boolean) {
    const client = operationClient();
    const receipt = wait ? await client.waitForUserOperationReceipt({ hash: operation.hash, timeout: 120_000, pollingInterval: 4_000 }) : await client.getUserOperationReceipt({ hash: operation.hash });
    if (!receipt) { setPhase("Still pending or not yet indexed. Check again before trying another mint."); return; }
    const tokens: string[] = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== CLASSNFT_ADDRESS.toLowerCase()) continue;
      try { tokens.push(decodeEventLog({ abi: classNFTAbi, eventName: "NFTMinted", data: log.data, topics: log.topics }).args.tokenId.toString()); } catch { /* Other events. */ }
    }
    setResult({ ...operation, transactionHash: receipt.receipt.transactionHash, success: receipt.success, tokens, paymaster: receipt.paymaster, gasCost: receipt.actualGasCost });
    try { localStorage.removeItem(storageKey(operation.owner)); } catch { /* The receipt still proves completion. */ }
    setPending(undefined);
    cache.setQueryData(["pending-userop", operation.owner], null);
    setPhase(receipt.success ? "Both mint calls confirmed in one operation." : "The operation reverted. Neither NFT was minted; gas may still have been charged.");
    if (receipt.success) setMinted(submission);
    await Promise.all([cache.invalidateQueries({ queryKey: ["nft-gallery"] }), cache.invalidateQueries({ queryKey: ["smart-account-balance"] })]);
  }
  async function check(resubmit = false) {
    if (!activePending || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (resubmit && activePending.signed) {
        setPhase("Resubmitting the same signed operation; this cannot create a second batch with a new nonce.");
        await operationClient().sendUserOperation(deserialize<SendUserOperationParameters>(activePending.signed));
      }
      await checkReceipt(activePending, resubmit);
    } catch (cause) { setError(explainError(cause)); } finally { lock.current = false; setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !address || !file || activePending || restored.isPending || savedOperation(address) || minted === submission) return;
    lock.current = true; setBusy(true); setError(""); setResult(undefined);
    let recorded: Pending | undefined;
    try {
      if (chainId !== sepolia.id) await switchChain.mutateAsync({ chainId: sepolia.id });
      const wallet = await getWalletClient(config, { chainId: sepolia.id });
      const client = await mintAccountClient(wallet, sponsored);
      setPhase("Checking recipients, smart account balance, and mint payment…");
      const recipients = await Promise.all([first.trim() ? resolveRecipient(first) : address, second.trim() ? resolveRecipient(second) : address]) as [Address, Address];
      const mintFee = await sepoliaClient.readContract({ ...sepoliaContracts.classNFT, functionName: "mintFee" });
      const funds = await sepoliaClient.getBalance({ address: client.account.address });
      if (funds < mintFee * 2n || (!sponsored && funds === 0n)) throw new Error("Fund your smart account with Sepolia ETH first. Sponsorship covers gas, not NFT payments.");
      let asset = pinned?.file === file && pinned.fingerprint === fingerprint ? pinned.asset : undefined;
      if (!asset) {
        asset = await uploadAsset({ file, kind, name, description, address, phase: setPhase });
        setPinned({ file, fingerprint, asset });
      }
      if (!asset.metadataURI) throw new Error("Missing NFT details. Please upload again.");
      setPhase(sponsored ? "Preparing two mints and requesting gas sponsorship…" : "Estimating gas for your smart account…");
      const prepared = await client.prepareUserOperation({ calls: buildBatchMintCalls({ recipients, metadataURI: asset.metadataURI, imageURI: asset.imageURI, mintFee }) });
      if (!sponsored) {
        const gas = prepared.callGasLimit + prepared.verificationGasLimit + prepared.preVerificationGas;
        if (funds < mintFee * 2n + gas * prepared.maxFeePerGas) throw new Error("Your smart account needs more Sepolia ETH for both mint payments and network gas.");
      }
      setPhase("Confirm one signature in your wallet for both mints…");
      const signature = await client.account.signUserOperation(prepared);
      const signed = { ...prepared, signature };
      const hash = getUserOperationHash({ userOperation: signed, entryPointAddress: ENTRY_POINT.address, entryPointVersion: ENTRY_POINT.version, chainId: sepolia.id });
      const sendParameters = { ...signed, entryPointAddress: ENTRY_POINT.address };
      recorded = { hash, sender: client.account.address, owner: address, signed: serialize(sendParameters) };
      // Save before sending: a dropped response must never cause an accidental second batch.
      localStorage.setItem(storageKey(address), JSON.stringify(recorded));
      setPending(recorded); cache.setQueryData(["pending-userop", address], recorded);
      setPhase("Submitting your signed operation…");
      await operationClient().sendUserOperation(sendParameters);
      setPhase("Operation submitted. Waiting for both mint calls to confirm…");
      await checkReceipt(recorded, true);
    } catch (cause) {
      setError(recorded ? `The outcome has not been confirmed. Use “Check operation” before submitting another batch. ${explainError(cause)}` : explainError(cause));
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className="stack-lg">
    <UploadSetup />
    {available.data?.configured === false && <Notice>Smart account minting is unavailable in this environment. Try the deployed app.</Notice>}
    {available.isError && <Notice tone="error">Smart-account availability could not be checked. <button className="text-button" onClick={() => void available.refetch()}>Retry</button></Notice>}
    {address && <div className="pin-result stack-sm"><strong>Your smart account</strong>{account.data ? <><AddressText address={account.data} copy /><p className="hint">Balance: {balance.data !== undefined ? `${eth(balance.data)} Sepolia ETH` : balance.isError ? "Unavailable" : "Loading…"}. Send funds to this address if you choose to pay gas yourself.</p></> : <p>{account.isError ? "Could not load your smart account." : "Loading account…"}</p>}{account.isError && <button className="text-button" onClick={() => void account.refetch()}>Retry account</button>}<p className="hint">Controlled by <AddressText address={address} />. Your existing wallet signs; the smart account executes both calls.</p></div>}
    <form className="stack" onSubmit={submit}><fieldset className="stack" disabled={busy || Boolean(activePending)}>
      <div className="field"><label htmlFor="batch-kind">File type</label><select id="batch-kind" value={kind} onChange={(e) => { setKind(e.target.value as UploadKind); setFile(null); }}><option value="artwork">Image / artwork</option><option value="profile">Profile card</option><option value="document">Certificate / PDF document</option></select></div>
      <FilePicker key={kind} id="batch-file" file={file} onChange={setFile} document={kind === "document"} />
      <div className="field"><label htmlFor="batch-name">NFT name</label><input id="batch-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></div>
      <div className="field"><label htmlFor="batch-description">Description / bio</label><textarea id="batch-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} required={kind === "profile"} rows={3} /></div>
      <div className="field"><label htmlFor="batch-first">First NFT recipient</label><input id="batch-first" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Leave blank for your connected wallet" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
      <div className="field"><label htmlFor="batch-second">Second NFT recipient</label><input id="batch-second" value={second} onChange={(e) => setSecond(e.target.value)} placeholder="Sepolia ENS name or address; blank for your wallet" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
      <div className="field"><label htmlFor="batch-gas">Network gas</label><select id="batch-gas" value={sponsored ? "sponsored" : "self"} onChange={(e) => setSponsored(e.target.value === "sponsored")}><option value="sponsored">Request gas sponsorship</option><option value="self">Pay from my smart account balance</option></select><p className="hint">Sponsorship depends on availability and policy limits. If unavailable, fund your smart account and choose to pay gas yourself.</p></div>
      <p>Two NFTs · total mint payment: <strong>{fee.data !== undefined ? `${eth(fee.data * 2n)} ETH` : "Loading…"}</strong></p>
      <p className="hint">This creates two separate NFTs with the same file and details. Both calls succeed together or revert together. Uploading costs no gas.</p>
      <button className="button primary" type="submit" disabled={!address || restored.isPending || !account.data || !available.data?.configured || !file || file.size === 0 || file.size > MAX_NFT_IMAGE_BYTES || fee.data === undefined || minted === submission}>{busy ? "Processing…" : minted === submission ? "Two NFTs confirmed" : "Upload and mint two NFTs"}</button>
      {!address && <p className="hint">Connect your browser wallet to continue.</p>}
    </fieldset></form>
    {phase && <Notice>{phase}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {activePending && <div className="pin-result stack-sm"><strong>Operation awaiting confirmation</strong><p className="hash-text">{activePending.hash}</p><p className="hint">An unconfirmed operation is saved in this browser to prevent duplicate mints.</p><button type="button" className="button secondary" disabled={busy} onClick={() => void check()}>Check operation</button>{activePending.signed && <button type="button" className="button secondary" disabled={busy} onClick={() => void check(true)}>Resubmit same operation</button>}</div>}
    {result && <Notice tone={result.success ? "success" : "error"}><p>{result.success ? `Minted NFTs ${result.tokens.map((id) => `#${id}`).join(" and ")}.` : "Both mint calls reverted."}</p><a href={`${explorer}/tx/${result.transactionHash}`} target="_blank" rel="noreferrer">View bundled transaction ↗</a><p className="hash-text">UserOperation: {result.hash}</p><p>Gas paid by {result.paymaster && !/^0x0{40}$/i.test(result.paymaster) ? <>paymaster <AddressText address={result.paymaster} /></> : <>your smart account <AddressText address={result.sender} /></>} · {eth(result.gasCost)} ETH</p></Notice>}
  </section>;
}
