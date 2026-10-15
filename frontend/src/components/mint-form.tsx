"use client";
import { useState, type FormEvent } from "react";
import { useConnection, useWriteContract } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { decodeEventLog } from "viem";
import { sepoliaClient } from "@/lib/clients";
import { sepoliaContracts, classNFTAbi } from "@/lib/contracts";
import { resolveRecipient } from "@/lib/ens";
import { uploadAsset } from "@/lib/upload";
import { ipfsUrl, MAX_NFT_IMAGE_BYTES, type UploadKind, type PinnedAsset } from "@/lib/ipfs";
import { eth, usd, explainError } from "@/lib/format";
import { usePrice } from "@/hooks/use-price";
import { useTransaction } from "@/hooks/use-transaction";
import { FilePicker, UploadSetup } from "./upload-fields";
import { TransactionFeedback, Notice } from "./feedback";
import { AddressText } from "./address";

export function MintForm({ kind: initialKind = "artwork" }: { kind?: UploadKind }) {
  const [kind, setKind] = useState<UploadKind>(initialKind);
  const { address } = useConnection();
  const { mutateAsync: writeContract } = useWriteContract();
  const cache = useQueryClient();
  const price = usePrice();
  const tx = useTransaction();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState("");
  const [localError, setLocalError] = useState("");
  const [pinned, setPinned] = useState<{ file: File; fingerprint: string; asset: PinnedAsset }>();
  const [minted, setMinted] = useState<{ file: File; fingerprint: string; tokenId?: string }>();
  const fee = useQuery({ queryKey: ["mint-fee"], queryFn: () => sepoliaClient.readContract({ ...sepoliaContracts.classNFT, functionName: "mintFee" }), staleTime: 300_000 });
  const fingerprint = JSON.stringify([kind, file?.name, file?.size, file?.lastModified, name.trim(), description.trim(), address]);
  const fullFingerprint = fingerprint + recipient.trim();
  const alreadyMinted = minted?.fingerprint === fullFingerprint && minted.file === file;
  const feeUsd = fee.data !== undefined ? price.convert(fee.data) : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLocalError("");
    if (!file) { setLocalError("Choose a file first."); return; }
    if (!address) { setLocalError("Connect your wallet to mint."); return; }
    if (alreadyMinted) return;
    let uploaded = pinned?.fingerprint === fingerprint && pinned.file === file ? pinned.asset : undefined;
    const receipt = await tx.run(async (setPhase) => {
      setPhase("Resolving recipient and checking the mint fee…");
      const to = recipient.trim() ? await resolveRecipient(recipient) : address;
      const mintFee = await sepoliaClient.readContract({ ...sepoliaContracts.classNFT, functionName: "mintFee" });
      // Check the recipient and mint call before uploading. Use a placeholder URI only for this read-only simulation.
      await sepoliaClient.simulateContract({ ...sepoliaContracts.classNFT, functionName: "mint", args: [to, "ipfs://preflight-metadata", "ipfs://preflight-image"], value: mintFee, account: address });
      if (!uploaded) {
        uploaded = await uploadAsset({ file, kind, name, description, address, phase: setPhase });
        setPinned({ file, fingerprint, asset: uploaded });
      }
      if (!uploaded.metadataURI) throw new Error("NFT details are missing. Upload the file again.");
      await sepoliaClient.simulateContract({ ...sepoliaContracts.classNFT, functionName: "mint", args: [to, uploaded.metadataURI, uploaded.imageURI], value: mintFee, account: address });
      setPhase("Confirm the NFT mint in your wallet…");
      return writeContract({ ...sepoliaContracts.classNFT, functionName: "mint", args: [to, uploaded.metadataURI, uploaded.imageURI], value: mintFee, account: address });
    });
    if (receipt) {
      let tokenId: string | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== sepoliaContracts.classNFT.address.toLowerCase()) continue;
        try { const event = decodeEventLog({ abi: classNFTAbi, eventName: "NFTMinted", data: log.data, topics: log.topics }); tokenId = event.args.tokenId.toString(); } catch { /* Other ERC721 events. */ }
      }
      setMinted({ file, fingerprint: fullFingerprint, tokenId });
      await cache.invalidateQueries({ queryKey: ["nft-gallery"] });
    }
  }
  return <section className="stack-lg" aria-label={kind === "profile" ? "Mint a profile card" : "Mint an NFT"}>
    <UploadSetup />
    <form onSubmit={submit} className="stack"><fieldset disabled={tx.busy} className="stack">
      <div className="field"><label htmlFor="nft-kind">What are you minting?</label><select id="nft-kind" name="nft-kind" value={kind} onChange={(event) => { setKind(event.target.value as UploadKind); setFile(null); }}><option value="artwork">Image / artwork</option><option value="profile">Profile card</option><option value="document">Certificate / PDF document</option></select></div>
      <FilePicker key={kind} id={`mint-file-${kind}`} file={file} onChange={setFile} document={kind === "document"} />
      <div className="field"><label htmlFor={`mint-name-${kind}`}>{kind === "profile" ? "Card name" : "NFT name"}</label><input id={`mint-name-${kind}`} name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder={kind === "profile" ? "My profile card" : "Give your piece a name"} /></div>
      <div className="field"><label htmlFor={`mint-bio-${kind}`}>{kind === "profile" ? "Bio" : "Description"}</label><textarea id={`mint-bio-${kind}`} name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} required={kind === "profile"} /><span className="hint">{description.length} / 1,000 characters. These details become part of your NFT. The current contract provides no editing feature.</span></div>
      <div className="field"><label htmlFor={`mint-recipient-${kind}`}>Recipient <span className="muted">(optional)</span></label><input id={`mint-recipient-${kind}`} name="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Your wallet, or a Sepolia ENS name / address" autoCapitalize="none" autoCorrect="off" spellCheck={false} /><span className="hint">Leave blank to mint to your connected wallet. ENS recipients are resolved on Sepolia.</span></div>
      {address && !recipient.trim() && <p className="muted">Minting to <AddressText address={address} /></p>}
      <div className="cost-row"><span>Mint payment</span><strong>{fee.data !== undefined ? `${eth(fee.data)} ETH${feeUsd !== null ? ` · ${usd(feeUsd)}` : ""}` : fee.isError ? "Fee unavailable" : "Loading…"}</strong></div>
      <p className="hint">You confirm one mint transaction in your wallet. Uploading costs no gas; network gas is shown by your wallet. The USD conversion is illustrative for Sepolia ETH.</p>
      <button type="submit" className="button primary" disabled={!address || fee.isPending || fee.isError || alreadyMinted || !file || !file.size || file.size > MAX_NFT_IMAGE_BYTES}>{tx.busy ? "Mint in progress…" : alreadyMinted ? "Mint confirmed" : kind === "profile" ? "Make my card" : "Upload and mint NFT"}</button>
      {!address && <p className="hint">Connect a wallet from the navigation to continue.</p>}
      {fee.isError && <button type="button" className="text-button" onClick={() => void fee.refetch()}>Retry loading mint fee</button>}
    </fieldset></form>
    {localError && <Notice tone="error">{explainError(new Error(localError))}</Notice>}
    <TransactionFeedback tx={tx} />
    {pinned?.fingerprint === fingerprint && pinned.file === file && <div className="pin-result stack-sm"><strong>{alreadyMinted ? `NFT${minted?.tokenId ? ` #${minted.tokenId}` : ""} minted` : "File uploaded"}</strong><a href={ipfsUrl(pinned.asset.fileURI)} target="_blank" rel="noreferrer">View uploaded {kind === "document" ? "document" : "image"} ↗</a>{pinned.asset.metadataURI && <a href={ipfsUrl(pinned.asset.metadataURI)} target="_blank" rel="noreferrer">View NFT details ↗</a>}{!alreadyMinted && <p className="hint">The file is uploaded. An NFT exists only after the mint is confirmed. A retry will reuse this upload while the form stays unchanged.</p>}</div>}
  </section>;
}
