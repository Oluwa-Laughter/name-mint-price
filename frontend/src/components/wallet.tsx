"use client";
import { useRef } from "react";
import { useConnection, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "viem/chains";
import { AddressText } from "./address";
import { explainError } from "@/lib/format";

export function Wallet() {
  const { address, chainId, isConnected } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const error = connect.error || switchChain.error || disconnect.error;
  return <details className="wallet-menu" ref={disclosure}>
    <summary className="button secondary">{isConnected && address ? <AddressText address={address} /> : "Connect wallet"}</summary>
    <div className="wallet-panel stack-sm">
      {isConnected && address ? <>
        <strong>Connected wallet</strong><AddressText address={address} copy />
        <p className="muted">{chainId === sepolia.id ? "Sepolia network" : "Switch to Sepolia to mint or save records."}</p>
        {chainId !== sepolia.id && <button type="button" className="button secondary" disabled={switchChain.isPending} onClick={() => switchChain.mutate({ chainId: sepolia.id })}>Switch to Sepolia</button>}
        <button type="button" className="button secondary" onClick={() => { disconnect.mutate({}); if (disclosure.current) disclosure.current.open = false; }}>Disconnect</button>
      </> : <>
        <strong>Choose your browser wallet</strong>
        {connectors.map((connector) => <button key={connector.uid} type="button" className="button secondary" disabled={connect.isPending} onClick={async () => {
          try { await connect.mutateAsync({ connector, chainId: sepolia.id }); if (disclosure.current) disclosure.current.open = false; } catch { /* Render mutation error below. */ }
        }}>{connect.isPending && connect.variables?.connector === connector ? "Connecting…" : connector.name === "Injected" ? "Browser wallet" : connector.name}</button>)}
        <p className="muted">No wallet extension? On mobile, open this site in your wallet’s browser.</p>
      </>}
      {error && <p className="error-text" role="alert">{explainError(error)}</p>}
    </div>
  </details>;
}
