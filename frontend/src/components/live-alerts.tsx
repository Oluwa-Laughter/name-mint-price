"use client";
import { useEffect, useRef, useState } from "react";
import { parseAbiItem, type Address, type Hex } from "viem";
import { sepoliaClient } from "@/lib/clients";
import { CLASSNFT_ADDRESS } from "@/lib/contracts";
import { verifiedEnsName } from "@/lib/ens";
import { eth, explainError, explorer, shortAddress } from "@/lib/format";
import { AddressText } from "./address";
import { Notice } from "./feedback";

const mintEvent = parseAbiItem("event NFTMinted(uint256 indexed tokenId,address indexed creator,address indexed recipient,string metadataURI,string imageURI,uint256 valueWei)");
type MintAlert = { id: string; tokenId: bigint; creator: Address; recipient: Address; valueWei: bigint; transactionHash: Hex; blockNumber: bigint };
async function popup(alert: MintAlert) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const name = await verifiedEnsName(alert.recipient).catch(() => null);
  const options = { body: `NFT #${alert.tokenId} minted to ${name || shortAddress(alert.recipient)}`, tag: alert.id, data: { url: "/notifications" } };
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration) { await registration.showNotification("Name & Mint · New NFT", options); return; }
  }
  new Notification("Name & Mint · New NFT", options);
}
export function LiveAlerts() {
  const [alerts, setAlerts] = useState<MintAlert[]>([]);
  const [status, setStatus] = useState("Connecting to Sepolia…");
  const [error, setError] = useState("");
  const [permission, setPermission] = useState("Check notification availability");
  const [restart, setRestart] = useState(0);
  const [enabling, setEnabling] = useState(false);
  const seen = useRef(new Set<string>());
  const cursorRef = useRef<bigint | undefined>(undefined);
  useEffect(() => {
    let stopped = false;
    let cursor = cursorRef.current;
    let initial = cursor === undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        // Wait two blocks before showing an event rather than reporting it immediately.
        const latest = await sepoliaClient.getBlockNumber({ cacheTime: 0 });
        const head = latest > 2n ? latest - 2n : 0n;
        if (cursor === undefined) cursor = head > 20n ? head - 20n : 0n;
        const toBlock = cursor + 499n < head ? cursor + 499n : head;
        if (cursor <= head) {
          const logs = await sepoliaClient.getLogs({ address: CLASSNFT_ADDRESS, event: mintEvent, fromBlock: cursor, toBlock, strict: true });
          if (stopped) return;
          const fresh = logs.filter((log) => !seen.current.has(`${log.transactionHash}:${log.logIndex}`)).map((log): MintAlert => ({ id: `${log.transactionHash}:${log.logIndex}`, transactionHash: log.transactionHash, blockNumber: log.blockNumber, ...log.args }));
          for (const alert of fresh) seen.current.add(alert.id);
          setAlerts((existing) => [...fresh.reverse(), ...existing].slice(0, 100));
          // Initial history is displayed without producing a burst of old pop-ups.
          if (!initial) {
            for (const alert of fresh) void popup(alert).catch(() => { /* Browser may disallow notifications despite permission. */ });
          }
          cursor = toBlock + 1n;
          cursorRef.current = cursor;
          initial = false;
        }
        if (!stopped) { setStatus(`Listening · confirmed block ${head.toString()} · checked ${new Date().toLocaleTimeString()}`); setError(""); }
      } catch (cause) {
        if (!stopped) { setError(explainError(cause)); setStatus("Reconnecting… Events will resume from the last checked block."); }
      } finally { if (!stopped) timer = setTimeout(() => void poll(), 5_000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [restart]);
  async function enable() {
    if (!("Notification" in window)) { setPermission("This browser does not support notifications. Alerts still appear here."); return; }
    setEnabling(true);
    try {
      // Request permission directly from the click, before any network work.
      const allowed = await Notification.requestPermission();
      if (allowed === "granted" && "serviceWorker" in navigator) await navigator.serviceWorker.register("/notifications-sw.js", { scope: "/" });
      setPermission(allowed === "granted" ? "Browser notifications enabled" : allowed === "denied" ? "Notifications blocked. Change this site’s notification permission in your browser settings." : "Permission was not granted. You can keep using on-page alerts.");
    } catch { setPermission("Notifications are unavailable in this browser. Alerts still appear here."); }
    finally { setEnabling(false); }
  }
  return <section className="stack-lg">
    <div className="pin-result stack"><p role="status">{status}</p><p className="hint">Keep this page open for alerts. New events appear after two block confirmations, usually within a minute. Recent confirmed mints appear below; browser pop-ups are for new events only.</p><button type="button" className="button secondary" onClick={() => void enable()} disabled={enabling}>{enabling ? "Enabling…" : "Enable browser notifications"}</button><p className="hint" role="status">{permission}</p></div>
    {error && <Notice tone="error">{error} <button className="text-button" onClick={() => setRestart((value) => value + 1)}>Reconnect</button></Notice>}
    <p className="hint">Watching <AddressText address={CLASSNFT_ADDRESS} /> · Showing up to 100 recent events.</p>
    {!alerts.length && <p>No recent confirmed mints yet. Mint an NFT while this page stays open to see an alert.</p>}
    <ol className="alert-list">{alerts.map((alert) => <li key={alert.id} className="stack-sm"><strong>NFT #{alert.tokenId.toString()} minted</strong><p>Created by <AddressText address={alert.creator} /></p><p>Received by <AddressText address={alert.recipient} /></p><p className="hint">Mint payment: {eth(alert.valueWei)} ETH · Block {alert.blockNumber.toString()}</p><a href={`${explorer}/tx/${alert.transactionHash}`} target="_blank" rel="noreferrer">View transaction ↗</a></li>)}</ol>
  </section>;
}
