"use client";
/* IPFS and ENS media are external, user-provided URLs, rendered directly without Next's image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { mediaUrl } from "@/lib/ipfs";
export function Media({ src, alt, className = "", fallback = "Image unavailable" }: { src: unknown; alt: string; className?: string; fallback?: string }) {
  const url = mediaUrl(src);
  const [failed, setFailed] = useState(false);
  return url && !failed ? <img src={url} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <div className={`media-fallback ${className}`} role="img" aria-label={fallback}>{fallback}</div>;
}
