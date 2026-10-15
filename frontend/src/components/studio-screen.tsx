"use client";
import { useSearchParams } from "next/navigation";
import { MintForm } from "./mint-form";

export function StudioScreen() {
  const params = useSearchParams();
  const kind = params.get("type") === "profile" ? "profile" : params.get("type") === "document" ? "document" : "artwork";
  return <MintForm key={kind} kind={kind} />;
}
