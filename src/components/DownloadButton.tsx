"use client";

import { useState } from "react";
import Button from "./Button";
import { useToast } from "./ToastProvider";

export default function DownloadButton({ productId }: { productId: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch(`/api/products/download/${productId}`);
      const json = await res.json();

      if (!res.ok) {
        toast.show(json.message || "Gagal mengunduh produk.", "error");
        return;
      }

      window.open(json.url, "_blank");
    } catch {
      toast.show("Koneksi bermasalah. Periksa internet Anda.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button className="mt-2" onClick={handleDownload} loading={loading}>
      Download
    </Button>
  );
}
