"use client";
import { useRef, useState } from "react";
import { useConnection, useSwitchChain } from "wagmi";
import type { Hash, TransactionReceipt } from "viem";
import { sepolia } from "viem/chains";
import { sepoliaClient } from "@/lib/clients";
import { explainError } from "@/lib/format";

export function useTransaction() {
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hash>();
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  async function run(send: (setPhase: (value: string) => void) => Promise<Hash>): Promise<TransactionReceipt | null> {
    if (locked.current) return null;
    locked.current = true;
    setBusy(true); setError(""); setSuccess(false); setHash(undefined);
    try {
      if (!address) throw new Error("Connect a wallet to continue.");
      if (chainId !== sepolia.id) { setPhase("Switch to Sepolia in your wallet…"); await switchChain({ chainId: sepolia.id }); }
      setPhase("Preparing transaction…");
      const txHash = await send(setPhase);
      setHash(txHash); setPhase("Transaction submitted. Waiting for confirmation…");
      let cancelled = false;
      const receipt = await sepoliaClient.waitForTransactionReceipt({
        hash: txHash, timeout: 180_000,
        onReplaced: ({ reason, transaction }) => { setHash(transaction.hash); if (reason === "cancelled") cancelled = true; },
      });
      if (cancelled) throw new Error("The transaction was cancelled in your wallet.");
      if (receipt.status !== "success") throw new Error("The transaction reverted on-chain. Check the transaction details before retrying.");
      setSuccess(true); setPhase("Confirmed on Sepolia.");
      return receipt;
    } catch (cause) {
      setError(explainError(cause)); setPhase(""); return null;
    } finally { setBusy(false); locked.current = false; }
  }
  return { run, phase, error, hash, success, busy };
}
export type TransactionState = ReturnType<typeof useTransaction>;
