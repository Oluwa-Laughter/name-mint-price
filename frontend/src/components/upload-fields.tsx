"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MAX_NFT_IMAGE_BYTES } from "@/lib/ipfs";
import { Notice } from "./feedback";

export function UploadSetup() {
  const query = useQuery({ queryKey: ["upload-config"], queryFn: async () => {
    const response = await fetch("/api/upload");
    if (!response.ok) throw new Error("Could not check upload configuration.");
    return response.json() as Promise<{ configured: boolean }>;
  }, refetchInterval: 30_000 });
  if (query.data && !query.data.configured) return <Notice>Uploads are temporarily unavailable. Please try again later.</Notice>;
  if (query.isError) return <Notice>Upload availability could not be checked. You can retry when submitting.</Notice>;
  return null;
}
export function FilePicker({ file, onChange, document = false, id }: { file: File | null; onChange: (file: File | null) => void; document?: boolean; id: string }) {
  const [preview, setPreview] = useState<string>();
  const maxBytes = MAX_NFT_IMAGE_BYTES;
  const invalidSize = Boolean(file && (!file.size || file.size > maxBytes));
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function pick(selected: File | null) {
    setPreview(selected?.type.startsWith("image/") && selected.size <= maxBytes ? URL.createObjectURL(selected) : undefined);
    onChange(selected);
  }
  return <div className="stack-sm"><div className="field"><label htmlFor={id}>{document ? "PDF document" : "Picture"}</label><input id={id} name="file" type="file" aria-invalid={invalidSize} aria-describedby={`${id}-hint${invalidSize ? ` ${id}-error` : ""}`} accept={document ? "application/pdf" : "image/png,image/jpeg,image/webp,image/gif"} required onChange={(e) => pick(e.target.files?.[0] || null)} /><p id={`${id}-hint`} className="hint">{document ? "PDF" : "PNG, JPEG, WebP or GIF"} · Up to 1 MB (1,000,000 bytes)</p></div>
    {invalidSize && <p id={`${id}-error`} className="error-text" role="alert">{file?.size === 0 ? "The selected file is empty." : "This file is too large. Choose a file no larger than 1 MB (1,000 KB)."}</p>}
    {file && <p className="file-caption">{file.name} · {(file.size / 1000).toFixed(0)} KB</p>}
    {file?.type.startsWith("image/") && !invalidSize && preview && <LocalPreview key={`${file.name}:${file.lastModified}`} src={preview} />}
  </div>;
}
function LocalPreview({ src }: { src: string }) {
  // This is a local blob URL and cannot be passed through Next's remote image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="upload-preview" src={src} alt="Preview of your selected picture" />;
}
