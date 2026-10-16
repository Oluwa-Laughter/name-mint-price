"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Wallet } from "./wallet";
import { usePrice } from "@/hooks/use-price";
import { ageLabel, usd } from "@/lib/format";

const routes = [["/ens", "ENS"], ["/profile", "Profile"], ["/studio", "NFT Studio"], ["/price", "Live price"], ["/aa", "Smart account"], ["/notifications", "Live alerts"]] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const price = usePrice();
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <div className="header-row">
        <Link className="brand" href="/ens">Name & Mint<span className="network-label">Sepolia</span></Link>
        <nav aria-label="Main navigation" className="desktop-nav">{routes.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</nav>
        <div className="header-actions"><Wallet /><button type="button" className="button secondary menu-toggle" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "Close" : "Menu"}</button></div>
      </div>
      {menuOpen && <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">{routes.map(([href, label]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</nav>}
    </header>
    <div className="price-strip"><div className="container strip-inner"><span>Testnet workspace · Sepolia ETH has no real monetary value</span><Link href="/price">{price.usable && price.data ? `ETH / USD ${usd(price.data.answer * (BigInt(10) ** BigInt(18 - price.data.decimals)))} · ${ageLabel(price.quoteAge)} old` : price.isPending ? "Loading Chainlink price…" : "Chainlink price unavailable or stale"}</Link></div></div>
    <main id="main" className="container main-content">{children}</main>
    <footer className="container footer"><a href="https://sepolia.app.ens.domains/" target="_blank" rel="noreferrer">Register a Sepolia ENS name ↗</a></footer>
  </>;
}
