"use client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { sepoliaClient } from "@/lib/clients";
import { sepoliaContracts } from "@/lib/contracts";
import { ipfsUrl, mediaUrl } from "@/lib/ipfs";
import { eth, usd, explainError, explorer } from "@/lib/format";
import { usePrice } from "@/hooks/use-price";
import { AddressText } from "./address";
import { Media } from "./media";
import { Notice } from "./feedback";

type GalleryItem = { tokenId: bigint; owner: `0x${string}`; creator: `0x${string}`; valueWei: bigint; mintedAt: bigint; metadataURI: string; imageURI: string };
export function NFTGallery() {
  const gallery = useInfiniteQuery({
    queryKey: ["nft-gallery"], initialPageParam: BigInt(0),
    queryFn: async ({ pageParam }) => {
      const [[items, nextOffset], total] = await Promise.all([
        sepoliaClient.readContract({ ...sepoliaContracts.classNFT, functionName: "getTokens", args: [pageParam, BigInt(12)] }),
        sepoliaClient.readContract({ ...sepoliaContracts.classNFT, functionName: "totalSupply" }),
      ]);
      return { items, nextOffset, total };
    },
    getNextPageParam: (last) => last.nextOffset < last.total ? last.nextOffset : undefined,
    refetchInterval: 30_000,
  });
  const items = gallery.data?.pages.flatMap((page) => page.items) || [];
  return <section className="section stack-lg" aria-labelledby="gallery-title">
    <div className="section-heading"><div><h2 id="gallery-title">Minted gallery</h2><p className="muted">{gallery.data ? `${gallery.data.pages[0].total.toString()} minted` : "All images, profile cards and documents"} · Current owners · Refreshes every 30 seconds</p></div><button type="button" className="button secondary" disabled={gallery.isFetching} onClick={() => void gallery.refetch()}>{gallery.isFetching ? "Refreshing…" : "Refresh gallery"}</button></div>
    {gallery.isError && <Notice tone="error">{explainError(gallery.error)} <button type="button" className="text-button" onClick={() => void gallery.refetch()}>Retry</button></Notice>}
    {gallery.isPending && <p role="status">Loading NFTs from Sepolia…</p>}
    {!gallery.isPending && !gallery.isError && !items.length && <div className="empty-state"><h3>No NFTs minted yet</h3><p>Mint the first piece using the form above. Its image and owner will appear here after confirmation.</p></div>}
    <div className="gallery">{items.map((item) => <NFTCard key={item.tokenId.toString()} item={item} />)}</div>
    {gallery.hasNextPage && <button type="button" className="button secondary" disabled={gallery.isFetchingNextPage} onClick={() => void gallery.fetchNextPage()}>{gallery.isFetchingNextPage ? "Loading…" : "Load more NFTs"}</button>}
    <p className="hint">USD amounts show the original mint payment converted at today’s ETH/USD quote. They are not resale prices or NFT appraisals.</p>
  </section>;
}
function NFTCard({ item }: { item: GalleryItem }) {
  const price = usePrice();
  const dollars = price.convert(item.valueWei);
  const metadata = useQuery({ queryKey: ["nft-metadata", item.metadataURI], queryFn: async ({ signal }) => {
    const response = await fetch(ipfsUrl(item.metadataURI), { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) throw new Error("Metadata unavailable from the gateway.");
    const text = await response.text();
    if (text.length > 64_000) throw new Error("Metadata is too large.");
    const json: unknown = JSON.parse(text);
    if (!json || typeof json !== "object") throw new Error("Invalid NFT metadata.");
    const data = json as Record<string, unknown>;
    const properties = data.properties && typeof data.properties === "object" ? data.properties as Record<string, unknown> : null;
    return { documentUrl: properties?.mime_type === "application/pdf" ? mediaUrl(properties.file) : null, name: typeof data.name === "string" ? data.name.slice(0, 80) : null, description: typeof data.description === "string" ? data.description.slice(0, 1000) : null };
  }, retry: false, staleTime: Infinity });
  return <article className="nft-card">
    <Media key={item.imageURI} src={item.imageURI} alt={metadata.data?.name || `NFT #${item.tokenId}`} className="nft-image" />
    <div className="nft-content stack-sm"><div className="section-heading"><h3>{metadata.data?.name || `NFT #${item.tokenId}`}</h3><span className="muted">#{item.tokenId.toString()}</span></div>
      {metadata.data?.description && <p className="card-description">{metadata.data.description}</p>}
      {metadata.isError && <p className="hint">NFT details could not be loaded. <button type="button" className="text-button" onClick={() => void metadata.refetch()}>Retry</button></p>}
      <dl className="detail-list"><div><dt>Owner</dt><dd><AddressText address={item.owner} /></dd></div><div><dt>Creator</dt><dd><AddressText address={item.creator} /></dd></div><div><dt>Mint payment</dt><dd>{eth(item.valueWei)} ETH</dd></div><div><dt>At today’s price</dt><dd>{dollars !== null ? usd(dollars) : "Quote unavailable"}</dd></div></dl>
      <div className="inline-actions">{metadata.data?.documentUrl && <a href={metadata.data.documentUrl} target="_blank" rel="noreferrer">View document ↗</a>}{mediaUrl(item.imageURI) && <a href={mediaUrl(item.imageURI)!} target="_blank" rel="noreferrer">View image ↗</a>}<a href={`${explorer}/token/${sepoliaContracts.classNFT.address}?a=${item.tokenId}`} target="_blank" rel="noreferrer">Etherscan ↗</a></div>
    </div>
  </article>;
}
