"use client";
import { useState } from "react";
import { parseEther } from "viem";
import { usePrice } from "@/hooks/use-price";
import { ageLabel, usd, explainError, explorer } from "@/lib/format";
import { sepoliaDeployment } from "@/lib/contracts";
import { Notice } from "./feedback";
export function PriceScreen() {
  const price = usePrice();
  const [amount, setAmount] = useState("1");
  let conversion: bigint | null = null;
  let invalid = false;
  try { if (amount) { if (!/^\d+(\.\d{0,18})?$/.test(amount) || amount.length > 40) throw new Error(); conversion = price.convert(parseEther(amount)); } } catch { invalid = true; }
  const data = price.data;
  return <div className="stack-lg">
    {price.isError && <Notice tone="error">{explainError(price.error)}</Notice>}
    {price.isPending && <p role="status">Reading the Chainlink feed on Sepolia…</p>}
    {data && <><div className="price-display"><span className="eyebrow">ETH / USD · Chainlink on Sepolia</span><p className="price-number">{data.valid ? usd(data.answer * (BigInt(10) ** BigInt(18 - data.decimals))) : "Invalid quote"}</p><p className={price.usable ? "success-text" : "error-text"}>{price.usable ? "Fresh quote" : "Quote unavailable for conversion"} · {ageLabel(price.quoteAge)} old</p></div>
      {!price.usable && <Notice>The feed is stale, invalid, or could not be refreshed. USD conversions stay unavailable until there is a valid fresh quote.</Notice>}
      <dl className="detail-list"><div><dt>Feed updated</dt><dd>{data.updatedAt > BigInt(0) ? new Date(Number(data.updatedAt) * 1000).toLocaleString() : "No update"}</dd></div><div><dt>Maximum quote age</dt><dd>{ageLabel(Number(data.maxAge))}</dd></div><div><dt>Round</dt><dd className="mono">{data.roundId.toString()}</dd></div><div><dt>Feed decimals</dt><dd>{data.decimals}</dd></div></dl>
    </>}
    <div className="inline-actions"><button type="button" className="button secondary" disabled={price.isFetching} onClick={() => void price.refetch()}>{price.isFetching ? "Refreshing…" : "Refresh price"}</button><a className="external-link" href={`${explorer}/address/${sepoliaDeployment.chainlinkEthUsdAggregator}`} target="_blank" rel="noreferrer">Chainlink source feed ↗</a></div>
    <p className="hint">Checked automatically every 30 seconds while this page is open. The age follows the feed’s actual update timestamp; refreshing does not force Chainlink to publish a new price.</p>
    <section className="section stack"><div><h2>ETH to USD</h2><p className="muted">This same quote converts profile balances and NFT mint payments across the app.</p></div><div className="field converter"><label htmlFor="eth-amount">ETH amount</label><input id="eth-amount" name="eth-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={invalid} aria-describedby="conversion-output" /></div><p id="conversion-output" className="conversion-result" aria-live="polite">{invalid ? "Enter a positive ETH amount with up to 18 decimal places." : conversion !== null ? usd(conversion) : "A fresh quote is needed for conversion."}</p><p className="hint">Sepolia ETH is a test token with no real monetary value. These USD amounts are illustrative conversions.</p></section>
  </div>;
}
