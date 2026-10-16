"use client";
import { useEffect, useRef, useState } from "react";
import { parseAbiItem, type Address, type Hex } from "viem";
import { sepoliaClient } from "@/lib/clients";
import { CLASSNFT_ADDRESS } from "@/lib/contracts";
import { eth, explainError, explorer } from "@/lib/format";
import { AddressText } from "./address";
import { Notice } from "./feedback";

const mintEvent = parseAbiItem("event NFTMinted(uint256 indexed tokenId,address indexed creator,address indexed recipient,string metadataURI,string imageURI,uint256 valueWei)");
// The configured Sepolia RPC rejects larger eth_getLogs ranges; keep each request small.
export const LOG_CHUNK_SIZE = 8n;
const HISTORY_BLOCKS = 120n;
type MintAlert = { id: string; tokenId: bigint; creator: Address; recipient: Address; valueWei: bigint; transactionHash: Hex; blockNumber: bigint };

export function LiveAlerts() {
  const [alerts, setAlerts] = useState<MintAlert[]>([]);
  const [status, setStatus] = useState("Connecting to Sepolia…");
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [restart, setRestart] = useState(0);
  const seen = useRef(new Set<string>());
  const cursorRef = useRef<bigint | undefined>(undefined);

  useEffect(() => {
    // Retire the old local-notification worker without altering other workers.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration("/").then((registration) => {
        if (registration?.active?.scriptURL.endsWith("/notifications-sw.js")) return registration.unregister();
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let cursor: bigint = cursorRef.current ?? -1n;
    let initialHistory = cursor === undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const latest = await sepoliaClient.getBlockNumber({ cacheTime: 0 });
        const head = latest > 2n ? latest - 2n : 0n;
        if (cursor === -1n) cursor = head > HISTORY_BLOCKS ? head - HISTORY_BLOCKS : 0n;
        // Catch up without requesting an unsupported block range or flooding the RPC.
        for (let i = 0; i < 4 && cursor <= head; i++) {
          const toBlock = cursor + LOG_CHUNK_SIZE - 1n < head ? cursor + LOG_CHUNK_SIZE - 1n : head;
          const logs = await sepoliaClient.getLogs({ address: CLASSNFT_ADDRESS, event: mintEvent, fromBlock: cursor, toBlock, strict: true });
          if (stopped) return;
          const fresh: MintAlert[] = [];
          for (const log of logs) {
            if (!log.transactionHash || log.logIndex === null || log.blockNumber === null) continue;
            const id = `${log.transactionHash}:${log.logIndex}`;
            if (seen.current.has(id)) continue;
            fresh.push({ id, transactionHash: log.transactionHash, blockNumber: log.blockNumber,
              tokenId: log.args.tokenId, creator: log.args.creator, recipient: log.args.recipient, valueWei: log.args.valueWei });
          }
          for (const alert of fresh) seen.current.add(alert.id);
          if (fresh.length) {
            setAlerts((existing) => [...fresh.reverse(), ...existing].slice(0, 100));
            if (!initialHistory) setUnread((count) => count + fresh.length);
          }
          cursor = toBlock + 1n;
          cursorRef.current = cursor;
        }
        if (stopped) return;
        if (cursor > head) initialHistory = false;
        setStatus(cursor <= head
          ? `Loading confirmed mint activity · checked through block ${(cursor - 1n).toString()}…`
          : `Live · confirmed through block ${head.toString()} · checked ${new Date().toLocaleTimeString()}`);
        setError("");
      } catch (cause) {
        if (!stopped) {
          setError(explainError(cause));
          setStatus("Sepolia connection interrupted. Automatically retrying without skipping events…");
        }
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), 5_000);
      }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [restart]);

  return <section className="stack-lg">
    <div className="pin-result stack-sm" role="status">
      <strong>Mint activity feed</strong>
      <p>{status}</p>
      <p className="hint">New mint events appear here after two Sepolia block confirmations. No browser notification permission is needed. Keep the page open for live updates.</p>
      {unread > 0 && <p><strong>{unread} new mint {unread === 1 ? "event" : "events"}</strong> · <button type="button" className="text-button" onClick={() => setUnread(0)}>Mark seen</button></p>}
    </div>
    {error && <Notice tone="error">Connection issue: {error} <button type="button" className="text-button" onClick={() => setRestart((value) => value + 1)}>Retry now</button></Notice>}
    <p className="hint">Watching <AddressText address={CLASSNFT_ADDRESS} /> · Up to 100 confirmed mint events · Recent history and live updates</p>
    {!alerts.length && <p>No confirmed mints found in the recent blocks scanned so far. New mints will appear automatically when confirmed.</p>}
    <ol className="alert-list" aria-label="Confirmed NFT mint events">{alerts.map((alert) => <li key={alert.id} className="stack-sm">
      <strong>NFT #{alert.tokenId.toString()} minted</strong>
      <p>Created by <AddressText address={alert.creator} /></p>
      <p>Received by <AddressText address={alert.recipient} /></p>
      <p className="hint">Mint payment: {eth(alert.valueWei)} ETH · Block {alert.blockNumber.toString()}</p>
      <a href={`${explorer}/tx/${alert.transactionHash}`} target="_blank" rel="noreferrer">View transaction ↗</a>
    </li>)}</ol>
  </section>;
}
