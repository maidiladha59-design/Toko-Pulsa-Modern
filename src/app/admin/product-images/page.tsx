"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Icon from "@/components/icons/Icon";
import ProductImage from "@/components/ProductImage";
import { useToast } from "@/components/ToastProvider";
import { compressProductImage } from "@/lib/product-image-client";
import { brandKeyFromFilename, normalizeBrandKey, resolveProductImage, type ProductImageSource } from "@/lib/product-image";

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  image_url: string | null;
  brand: string | null;
  brand_logo_url: string | null;
  category_key: string | null;
  category_image_url: string | null;
  is_active: boolean;
};

type AdminBrand = {
  brand_key: string;
  brand_name: string;
  logo_url: string | null;
  product_count: number;
};

type Pending = {
  file: File;
  preview: string;
  scope: "product" | "brand";
  ref: string;
  label: string;
  alt: string;
};

const SOURCE_LABEL: Record<ProductImageSource, string> = {
  product: "Gambar produk",
  brand: "Gambar brand",
  category: "Gambar kategori",
  default: "Belum ada gambar",
};

const SOURCE_TONE: Record<ProductImageSource, "success" | "gold" | "warning" | "neutral"> = {
  product: "success",
  brand: "gold",
  category: "warning",
  default: "neutral",
};

const ACCEPT = "image/png,image/jpeg,image/webp";
// Logo vektor/dokumen tidak bisa dikompres WEBP; diunggah apa adanya lewat API media yang sudah ada.
const RAW_ACCEPT = "image/svg+xml,application/pdf";

export default function AdminProductImagesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"products" | "brands">("products");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rawBusy, setRawBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/product-images");
      const json = await response.json().catch(() => ({}));
      if (!response.ok) toast.show(json.message || "Gagal memuat daftar gambar.", "error");
      else {
        setProducts(json.products || []);
        setBrands(json.brands || []);
      }
    } catch {
      toast.show("Gagal memuat data karena koneksi bermasalah.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Dibaca setelah mount agar redirect ?tab=brand dari menu lama tetap bekerja tanpa hydration mismatch.
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "brand" || requested === "brands") setTab("brands");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeTab(next: "products" | "brands") {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "brands") url.searchParams.set("tab", "brand");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  }

  function closePending() {
    if (pending) URL.revokeObjectURL(pending.preview);
    setPending(null);
  }

  async function prepare(file: File | undefined, scope: "product" | "brand", ref: string, label: string) {
    if (!file) return;
    setBusy(ref);
    try {
      const compressed = await compressProductImage(file);
      setPending({ file: compressed, preview: URL.createObjectURL(compressed), scope, ref, label, alt: label });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Gambar gagal diproses.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function savePending() {
    if (!pending) return;
    setBusy(pending.ref);
    try {
      const body = new FormData();
      body.append("scope", pending.scope);
      body.append("ref", pending.ref);
      body.append("alt", pending.alt);
      body.append("file", pending.file);
      const response = await fetch("/api/admin/product-images", { method: "POST", body });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.show(json.message || "Gagal menyimpan gambar.", "error");
        return;
      }
      toast.show("Gambar berhasil disimpan.", "success");
      closePending();
      await load();
    } catch {
      toast.show("Jaringan gagal. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function removeImage(scope: "product" | "brand", ref: string, label: string, useBrand: boolean) {
    const message = useBrand
      ? `Hapus gambar khusus "${label}"? Produk akan memakai gambar brand, lalu gambar kategori, lalu ikon default.`
      : `Hapus gambar "${label}"? Tampilan akan memakai gambar kategori atau ikon default.`;
    if (!window.confirm(message)) return;
    setBusy(ref);
    try {
      const response = await fetch(
        `/api/admin/product-images?scope=${scope}&ref=${encodeURIComponent(ref)}`,
        { method: "DELETE" }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) toast.show(json.message || "Gagal menghapus gambar.", "error");
      else {
        toast.show(scope === "product" ? "Gambar produk dihapus." : "Gambar brand dihapus.", "success");
        await load();
      }
    } catch {
      toast.show("Jaringan gagal. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setBusy(null);
    }
  }

  // Multi-upload desktop: nama file dipakai sebagai nama brand.
  async function uploadBrandFiles(files: File[]) {
    if (!files.length) return;
    const matched: { file: File; brand: AdminBrand }[] = [];
    const unmatched: string[] = [];
    for (const file of files) {
      const key = brandKeyFromFilename(file.name);
      const brand = brands.find(
        (item) => item.brand_key === key || normalizeBrandKey(item.brand_name) === key
      );
      if (brand) matched.push({ file, brand });
      else unmatched.push(file.name);
    }
    if (unmatched.length) {
      toast.show(
        `Nama file tidak cocok dengan brand: ${unmatched.slice(0, 3).join(", ")}${unmatched.length > 3 ? ", ..." : ""}. Ganti nama file sesuai nama brand.`,
        "error"
      );
    }
    if (!matched.length) return;

    let saved = 0;
    const failed: string[] = [];
    for (const { file, brand } of matched) {
      setBusy(brand.brand_key);
      try {
        const compressed = await compressProductImage(file);
        const body = new FormData();
        body.append("scope", "brand");
        body.append("ref", brand.brand_key);
        body.append("alt", `Logo ${brand.brand_name}`);
        body.append("file", compressed);
        const response = await fetch("/api/admin/product-images", { method: "POST", body });
        if (response.ok) saved += 1;
        else failed.push(brand.brand_name);
      } catch {
        failed.push(brand.brand_name);
      }
    }
    setBusy(null);
    if (saved) {
      toast.show(`${saved} logo brand berhasil disimpan.`, "success");
      await load();
    }
    if (failed.length) toast.show(`Gagal menyimpan logo: ${failed.join(", ")}.`, "error");
  }

  async function uploadBrandRaw(brand: AdminBrand, file: File | undefined) {
    if (!file) return;
    setRawBusy(brand.brand_key);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "brand-logos");
      const upload = await fetch("/api/admin/media", { method: "POST", body });
      const uploadJson = await upload.json().catch(() => ({}));
      if (!upload.ok || !uploadJson.url) {
        toast.show(uploadJson.message || "Gagal mengunggah logo. Pastikan format SVG/PDF dan maksimal 5 MB.", "error");
        return;
      }
      const response = await fetch("/api/admin/brand-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_key: brand.brand_key, brand_name: brand.brand_name, logo_url: uploadJson.url }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.show(json.message || "Gagal menyimpan logo brand.", "error");
        return;
      }
      toast.show(`Logo ${brand.brand_name} tersimpan.`, "success");
      await load();
    } catch {
      toast.show("Jaringan gagal. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setRawBusy(null);
    }
  }

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const resolved = resolveProductImage(
        product.image_url,
        product.thumbnail_url,
        product.brand_logo_url,
        product.category_image_url
      );
      const matches = !q || `${product.name} ${product.slug} ${product.brand || ""}`.toLowerCase().includes(q);
      return matches && (!missingOnly || !resolved.src);
    });
  }, [products, query, missingOnly]);

  const filteredBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brands.filter((brand) => {
      const matches = !q || `${brand.brand_name} ${brand.brand_key}`.toLowerCase().includes(q);
      return matches && (!missingOnly || !brand.logo_url);
    });
  }, [brands, query, missingOnly]);

  const missingProducts = products.filter(
    (product) => !resolveProductImage(product.image_url, product.thumbnail_url, product.brand_logo_url, product.category_image_url).src
  ).length;
  const missingBrands = brands.filter((brand) => !brand.logo_url).length;

  return (
    <div className="space-y-5 pb-10">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Katalog</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Gambar &amp; Logo Brand</h1>
        <p className="mt-1 text-sm text-app-muted">
          Unggah gambar produk atau logo brand. Gambar otomatis dipotong persegi 1:1, diperkecil ke 512×512, dan dikompres WEBP.
          Produk tanpa gambar khusus otomatis memakai logo brand.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => changeTab("products")}
          className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
            tab === "products" ? "bg-gold-400 text-app-on-primary" : "border border-app-border bg-app-surface text-app-text hover:border-gold-400/60"
          }`}
        >
          <Icon name="box" size={16} /> Produk
        </button>
        <button
          type="button"
          onClick={() => changeTab("brands")}
          className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
            tab === "brands" ? "bg-gold-400 text-app-on-primary" : "border border-app-border bg-app-surface text-app-text hover:border-gold-400/60"
          }`}
        >
          <Icon name="image" size={16} /> Brand
        </button>
        <span className="ml-auto self-center text-xs font-bold text-app-muted">
          {tab === "products" ? `${missingProducts} produk belum ada gambar` : `${missingBrands} brand belum berlogo`}
        </span>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "products" ? "Cari produk atau brand..." : "Cari brand..."}
            className="bg-app-inset sm:max-w-sm"
          />
          <label className="inline-flex min-h-[40px] items-center gap-2 text-sm font-bold text-app-text">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(event) => setMissingOnly(event.target.checked)}
              className="h-4 w-4 rounded border-app-border accent-gold-500"
            />
            {tab === "products" ? "Belum ada gambar" : "Belum berlogo"}
          </label>
        </div>
      </Card>

      {loading ? (
        <Card className="p-4">
          <LoadingSkeleton rows={6} />
        </Card>
      ) : tab === "products" ? (
        filteredProducts.length === 0 ? (
          <EmptyState
            icon="image"
            title="Tidak ada produk yang cocok"
            description="Ubah kata kunci atau matikan filter belum ada gambar."
          />
        ) : (
          <Card className="p-0">
            <div className="divide-y divide-app-border">
              {filteredProducts.map((product) => {
                const resolved = resolveProductImage(
                  product.image_url,
                  product.thumbnail_url,
                  product.brand_logo_url,
                  product.category_image_url
                );
                const hasOwnImage = Boolean(product.image_url || product.thumbnail_url);
                const isBusy = busy === product.id;
                return (
                  <div key={product.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <ProductImage
                      src={resolved.src}
                      alt={product.name}
                      className="h-14 w-14 shrink-0 rounded-xl"
                      iconSize={24}
                      sizes="56px"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="line-clamp-2 break-words text-sm font-bold text-app-text">{product.name}</p>
                        <Badge tone={SOURCE_TONE[resolved.source]}>{SOURCE_LABEL[resolved.source]}</Badge>
                        {!product.is_active && <Badge tone="neutral">Nonaktif</Badge>}
                      </div>
                      <p className="mt-0.5 break-words text-xs text-app-subtle">
                        {product.brand || "Tanpa brand"} · /{product.slug}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <label
                        className={`inline-flex min-h-[36px] cursor-pointer items-center rounded-xl border border-app-border bg-app-surface px-3 text-xs font-bold text-app-text transition hover:border-gold-400/60 ${
                          isBusy ? "pointer-events-none opacity-60" : ""
                        }`}
                      >
                        {isBusy ? "Memproses..." : "Ubah gambar"}
                        <input
                          type="file"
                          accept={ACCEPT}
                          className="hidden"
                          disabled={isBusy}
                          onChange={(event) => {
                            prepare(event.target.files?.[0], "product", product.id, product.name);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <label
                        title="Ambil foto dengan kamera"
                        aria-label="Ambil foto dengan kamera"
                        className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-app-border bg-app-surface text-app-text transition hover:border-gold-400/60 ${
                          isBusy ? "pointer-events-none opacity-60" : ""
                        }`}
                      >
                        <Icon name="camera" size={16} />
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          disabled={isBusy}
                          onChange={(event) => {
                            prepare(event.target.files?.[0], "product", product.id, product.name);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {hasOwnImage && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => removeImage("product", product.id, product.name, Boolean(product.brand))}
                        >
                          {product.brand ? "Gunakan gambar brand" : "Hapus gambar"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )
      ) : (
        <div className="space-y-4">
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              uploadBrandFiles(Array.from(event.dataTransfer.files));
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition ${
              dragActive ? "border-gold-400 bg-app-accent-soft" : "border-app-border bg-app-surface hover:border-gold-400/60"
            }`}
          >
            <Icon name="upload" size={28} className="text-app-kicker" />
            <span className="mt-2 text-sm font-black text-app-text">Tarik beberapa logo ke sini</span>
            <span className="mt-1 max-w-xl text-xs leading-5 text-app-muted">
              Multi-upload desktop: nama file harus sama dengan nama brand (contoh <b>Free Fire.png</b>, <b>XL.webp</b>).
              Maksimal 2 MB per file; semua otomatis dipotong persegi dan dikompres WEBP. Logo SVG/PDF diunggah
              per brand lewat tombol <b>SVG/PDF</b>.
            </span>
            <input
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                uploadBrandFiles(Array.from(event.target.files || []));
                event.target.value = "";
              }}
            />
          </label>

          {filteredBrands.length === 0 ? (
            <EmptyState
              icon="image"
              title="Tidak ada brand yang cocok"
              description="Brand muncul otomatis dari SKU PPOB yang sudah tersinkron."
            />
          ) : (
            <div className="space-y-3">
              {filteredBrands.map((brand) => {
                const isBusy = busy === brand.brand_key || rawBusy === brand.brand_key;
                const isPdf = Boolean(brand.logo_url?.toLowerCase().endsWith(".pdf"));
                return (
                  <Card key={brand.brand_key} className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {isPdf ? (
                        <a
                          href={brand.logo_url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          title="Buka file PDF"
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-zinc-950 leading-none text-gold-300"
                        >
                          <Icon name="doc" size={20} />
                          <span className="mt-0.5 text-[8px] font-black">PDF</span>
                        </a>
                      ) : (
                        <ProductImage
                          src={brand.logo_url}
                          alt={`Logo ${brand.brand_name}`}
                          className="h-14 w-14 shrink-0 rounded-xl"
                          iconSize={22}
                          fit="contain"
                          sizes="56px"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-words text-sm font-black text-app-text">{brand.brand_name}</p>
                        <p className="text-xs text-app-subtle">
                          {brand.product_count} produk · key: <code className="rounded bg-app-inset px-1">{brand.brand_key}</code>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          className={`inline-flex min-h-[36px] cursor-pointer items-center rounded-xl bg-zinc-950 px-3 text-xs font-black text-gold-300 transition hover:bg-zinc-800 ${
                            isBusy ? "pointer-events-none opacity-60" : ""
                          }`}
                        >
                          {isBusy ? "Memproses..." : brand.logo_url ? "Ganti logo" : "Upload logo"}
                          <input
                            type="file"
                            accept={ACCEPT}
                            className="hidden"
                            disabled={isBusy}
                            onChange={(event) => {
                              prepare(event.target.files?.[0], "brand", brand.brand_key, brand.brand_name);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <label
                          title="Unggah logo SVG atau PDF tanpa dikompres"
                          className={`inline-flex min-h-[36px] cursor-pointer items-center rounded-xl border border-app-border bg-app-surface px-3 text-xs font-bold text-app-text transition hover:border-gold-400/60 ${
                            isBusy ? "pointer-events-none opacity-60" : ""
                          }`}
                        >
                          SVG/PDF
                          <input
                            type="file"
                            accept={RAW_ACCEPT}
                            className="hidden"
                            disabled={isBusy}
                            onChange={(event) => {
                              uploadBrandRaw(brand, event.target.files?.[0]);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        {brand.logo_url && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => removeImage("brand", brand.brand_key, brand.brand_name, false)}
                          >
                            Hapus
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {pending && (
        <PreviewModal
          pending={pending}
          busy={busy === pending.ref}
          onCancel={closePending}
          onConfirm={savePending}
        />
      )}
    </div>
  );
}

function PreviewModal({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau gambar"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-zinc-950/70 p-4"
    >
      <div className="w-full max-w-sm rounded-3xl border border-app-border bg-app-surface p-5 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Pratinjau</p>
        <h2 className="mt-1 line-clamp-2 break-words text-lg font-black text-app-text">{pending.label}</h2>
        <p className="mt-1 text-xs text-app-muted">Hasil potong 1:1, ukuran 512×512, format WEBP.</p>
        <div className="mx-auto mt-4 h-48 w-48 overflow-hidden rounded-2xl border border-app-border bg-app-inset">
          <Image
            src={pending.preview}
            alt={`Pratinjau ${pending.label}`}
            width={192}
            height={192}
            unoptimized
            className="h-full w-full object-cover"
          />
        </div>
        <p className="mt-3 break-all text-center text-[11px] text-app-subtle">
          {pending.file.name} · {Math.max(1, Math.round(pending.file.size / 1024))} KB
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
          <Button onClick={onConfirm} loading={busy}>
            Simpan
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
