"use client";
import type { ReactNode } from "react";
import { explorer } from "@/lib/format";
import type { TransactionState } from "@/hooks/use-transaction";
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" | "success" }) {
  return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}
export function TransactionFeedback({ tx }: { tx: TransactionState }) {
  if (!tx.phase && !tx.error && !tx.hash) return null;
  return <div className="stack-sm" aria-live="polite">
    {tx.error && <Notice tone="error">{tx.error}</Notice>}
    {tx.phase && <Notice tone={tx.success ? "success" : "info"}>{tx.phase}</Notice>}
    {tx.hash && <a className="external-link" href={`${explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer">View transaction on Etherscan ↗</a>}
  </div>;
}
