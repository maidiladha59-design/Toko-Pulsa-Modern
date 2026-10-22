"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import { formatRupiah, humanizeError } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  thumbnail_url: string | null;
  digital_file_path: string | null;
  is_active: boolean;
  product_type: string;
  category_id: string | null;
  stock: number | null;
};

type Category = { id: string; name: string };

type FormState = {
  name: string;
  slug: string;
  price: string;
  description: string;
  product_type: string;
  category_id: string;
  stock: string;
};

const emptyForm: FormState = {
  name: "",
  slug: "",
  price: "",
  description: "",
  product_type: "digital",
  category_id: "",
  stock: "",
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extFromFile(file: File) {
  const nameExt = file.name.split(".").pop()?.toLowerCase();
  return nameExt || "bin";
}

function storagePathFromUrl(url: string | null) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/product-thumbnails/";
  const index = url.indexOf(marker);
  return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : null;
}

export default function AdminProductsPage() {
  const supabase = createClient();
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [digitalFile, setDigitalFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => `${p.name} ${p.slug}`.toLowerCase().includes(q));
  }, [products, search]);

  async function load() {
    setLoading(true);
    const [{ data: productData, error: productError }, { data: categoryData }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, slug, description, price, thumbnail_url, digital_file_path, is_active, product_type, category_id, stock")
        .order("created_at", { ascending: false }),
      supabase.from("categories").select("id, name").order("name"),
    ]);

    if (productError) toast.show(humanizeError(productError.message), "error");
    setProducts((productData as Product[]) || []);
    setCategories((categoryData as Category[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setImageFile(null);
    setDigitalFile(null);
    setImagePreview(null);
    setEditingId(null);
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      slug: product.slug,
      price: String(product.price),
      description: product.description || "",
      product_type: product.product_type || "digital",
      category_id: product.category_id || "",
      stock: product.stock === null ? "" : String(product.stock),
    });
    setImageFile(null);
    setDigitalFile(null);
    setImagePreview(product.thumbnail_url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.show("Gambar harus JPG, PNG, atau WEBP.", "error");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.show("Ukuran gambar maksimal 5 MB.", "error");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function chooseDigitalFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.show("File produk maksimal 100 MB.", "error");
      return;
    }
    setDigitalFile(file);
  }

  async function uploadThumbnail(productId: string, file: File) {
    const path = `products/${productId}/${Date.now()}.${extFromFile(file)}`;
    const { error } = await supabase.storage.from("product-thumbnails").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;

    const { data } = supabase.storage.from("product-thumbnails").getPublicUrl(path);
    return { url: data.publicUrl, path };
  }

  async function uploadDigitalFile(productId: string, file: File) {
    const path = `products/${productId}/${Date.now()}-${slugify(file.name)}`;
    const { error } = await supabase.storage.from("digital-products").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw error;
    return path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim() || !form.price) {
      toast.show("Nama, slug, dan harga wajib diisi.", "error");
      return;
    }

    const price = Number(form.price);
    const stock = form.stock.trim() === "" ? null : Number(form.stock);
    if (!Number.isFinite(price) || price < 0) {
      toast.show("Harga tidak valid.", "error");
      return;
    }
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
      toast.show("Stok harus berupa angka bulat 0 atau lebih.", "error");
      return;
    }

    setSaving(true);
    try {
      let productId = editingId;
      let oldThumbnailUrl: string | null = null;
      let oldDigitalPath: string | null = null;

      if (editingId) {
        const old = products.find((p) => p.id === editingId);
        oldThumbnailUrl = old?.thumbnail_url || null;
        oldDigitalPath = old?.digital_file_path || null;

        const { error } = await supabase
          .from("products")
          .update({
            name: form.name.trim(),
            slug: form.slug.trim(),
            price,
            description: form.description.trim() || null,
            product_type: form.product_type,
            category_id: form.category_id || null,
            stock,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({
            name: form.name.trim(),
            slug: form.slug.trim(),
            price,
            description: form.description.trim() || null,
            product_type: form.product_type,
            category_id: form.category_id || null,
            stock,
            is_active: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        productId = data.id;
      }

      if (!productId) throw new Error("ID produk tidak ditemukan.");

      setUploading(Boolean(imageFile || digitalFile));
      const updates: Record<string, string> = {};

      if (imageFile) {
        const uploaded = await uploadThumbnail(productId, imageFile);
        updates.thumbnail_url = uploaded.url;

        const oldPath = storagePathFromUrl(oldThumbnailUrl);
        if (oldPath) await supabase.storage.from("product-thumbnails").remove([oldPath]);
      }

      if (digitalFile) {
        const newPath = await uploadDigitalFile(productId, digitalFile);
        updates.digital_file_path = newPath;
        if (oldDigitalPath) await supabase.storage.from("digital-products").remove([oldDigitalPath]);
      }

      if (Object.keys(updates).length) {
        const { error } = await supabase.from("products").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", productId);
        if (error) throw error;
      }

      toast.show(editingId ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan.", "success");
      resetForm();
      await load();
    } catch (error: any) {
      toast.show(humanizeError(error?.message || "Gagal menyimpan produk."), "error");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  async function removeThumbnail(product: Product) {
    if (!product.thumbnail_url) return;
    if (!window.confirm(`Hapus gambar produk "${product.name}"?`)) return;
    const path = storagePathFromUrl(product.thumbnail_url);
    if (path) await supabase.storage.from("product-thumbnails").remove([path]);
    const { error } = await supabase.from("products").update({ thumbnail_url: null, updated_at: new Date().toISOString() }).eq("id", product.id);
    if (error) toast.show(humanizeError(error.message), "error");
    else {
      toast.show("Gambar produk dihapus.", "success");
      if (editingId === product.id) setImagePreview(null);
      load();
    }
  }

  async function removeDigitalFile(product: Product) {
    if (!product.digital_file_path) return;
    if (!window.confirm(`Hapus file digital "${product.name}"?`)) return;
    await supabase.storage.from("digital-products").remove([product.digital_file_path]);
    const { error } = await supabase.from("products").update({ digital_file_path: null, updated_at: new Date().toISOString() }).eq("id", product.id);
    if (error) toast.show(humanizeError(error.message), "error");
    else {
      toast.show("File digital dihapus.", "success");
      load();
    }
  }

  async function toggleActive(p: Product) {
    const { error } = await supabase.from("products").update({ is_active: !p.is_active, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) toast.show(humanizeError(error.message), "error");
    else {
      toast.show(p.is_active ? "Produk dinonaktifkan." : "Produk diaktifkan.", "success");
      load();
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Katalog</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Kelola Produk</h1>
        <p className="mt-1 text-sm text-app-muted">Tambah, edit, aktifkan/nonaktifkan, pasang gambar produk, dan upload file digital dari satu tempat.</p>
      </div>

      <Card className="p-4 sm:p-6">
        <form onSubmit={handleSubmit}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <CardTitle>{editingId ? "Edit Produk" : "Tambah Produk Baru"}</CardTitle>
              <p className="mt-1 text-xs text-app-muted">Gambar JPG/PNG/WEBP maksimal 5 MB. File digital maksimal 100 MB.</p>
            </div>
            {editingId && <Button type="button" variant="outline" size="sm" onClick={resetForm}>Batal Edit</Button>}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
            <div>
              <p className="text-sm font-bold text-app-text">Gambar Produk</p>
              <label className="mt-2 flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-app-border bg-app-inset text-center transition hover:border-gold-400">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="Preview produk" className="h-full w-full object-cover" />
                ) : (
                  <><span className="text-4xl">🖼️</span><span className="mt-2 px-4 text-xs text-app-muted">Klik untuk pilih gambar</span></>
                )}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => chooseImage(e.target.files?.[0])} />
              </label>
              <div className="mt-2 flex gap-2">
                {imageFile && <span className="truncate text-xs text-success-600 dark:text-success-400">✓ {imageFile.name}</span>}
                {!imageFile && editingId && products.find((p) => p.id === editingId)?.thumbnail_url && <button type="button" onClick={() => { const p = products.find((x) => x.id === editingId); if (p) removeThumbnail(p); }} className="text-xs font-bold text-danger-600 dark:text-danger-400">Hapus gambar</button>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Nama Produk" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-app-inset" placeholder="Contoh: Template Desain Premium" />
              <Input label="Slug" required value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} className="bg-app-inset" placeholder="template-desain-premium" />
              <Input label="Harga (Rp)" required min="0" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="bg-app-inset" placeholder="15000" />
              <Select label="Kategori" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="bg-app-inset"><option value="">Tanpa kategori</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Input label="Stok" min="0" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} hint="Kosong = unlimited" className="bg-app-inset" placeholder="Unlimited" />
              <Select label="Tipe Produk" value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })} hint="Jasa cocok untuk subscribe channel, joki, request custom, dll." className="bg-app-inset">
                <option value="digital">📥 Ambil Produk (Digital) — file langsung diunduh pembeli</option>
                <option value="jasa">🎯 Upload Target (Jasa) — pembeli kirim link/file, dikerjakan admin</option>
              </Select>
              <label className="text-sm font-bold text-app-text sm:col-span-2">Deskripsi<textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2 w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20" placeholder="Jelaskan isi, format file, lisensi, dan informasi penting produk..." /></label>

              <div className="rounded-2xl border border-app-border bg-app-inset p-3 sm:col-span-2">
                <p className="text-sm font-bold text-app-text">File Produk Digital {form.product_type === "jasa" && <span className="font-normal text-app-subtle">(opsional untuk Jasa)</span>}</p>
                <p className="mt-1 text-xs text-app-muted">{form.product_type === "jasa" ? "Untuk produk Jasa, file di sini opsional (misal contoh hasil). Target pesanan dikirim pembeli sendiri saat checkout." : "File disimpan privat dan hanya dapat diakses pembeli yang berhak melalui link aman."}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <input type="file" onChange={(e) => chooseDigitalFile(e.target.files?.[0])} className="block w-full text-sm text-app-text sm:max-w-md" />
                  {digitalFile && <span className="text-xs font-bold text-success-600 dark:text-success-400">✓ {digitalFile.name}</span>}
                  {editingId && products.find((p) => p.id === editingId)?.digital_file_path && <button type="button" onClick={() => { const p = products.find((x) => x.id === editingId); if (p) removeDigitalFile(p); }} className="text-xs font-bold text-danger-600 dark:text-danger-400">Hapus file tersimpan</button>}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="submit" loading={saving}>{uploading ? "Mengunggah..." : editingId ? "Simpan Perubahan" : "Tambah Produk"}</Button>
            {editingId && <Button type="button" variant="outline" onClick={resetForm}>Reset</Button>}
          </div>
        </form>
      </Card>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-app-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>Daftar Produk</CardTitle><p className="mt-1 text-xs text-app-muted">{products.length} produk tersimpan</p></div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk..." className="sm:w-64" />
        </div>
        {loading ? <div className="p-4"><LoadingSkeleton rows={5} /></div> : filteredProducts.length === 0 ? <EmptyState icon="📦" title="Belum ada produk" description="Tambahkan produk pertama lewat formulir di atas." className="m-4" /> : (
          <div className="divide-y divide-app-border">
            {filteredProducts.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-app-inset">
                  {p.thumbnail_url ? <img src={p.thumbnail_url} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl">🛍️</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-bold text-app-text">{p.name}</p>
                    <Badge tone={p.product_type === "jasa" ? "warning" : "gold"}>{p.product_type === "jasa" ? "🎯 Jasa" : "📥 Digital"}</Badge>
                    <Badge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "Aktif" : "Nonaktif"}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-black tabular-nums text-app-kicker">{formatRupiah(p.price)}</p>
                  <p className="text-xs text-app-subtle">/{p.slug} · {p.product_type === "jasa" ? "Target dikirim pembeli saat checkout" : p.digital_file_path ? "✓ File digital" : "Belum ada file"}</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button variant="outline" size="sm" onClick={() => startEdit(p)}>Edit</Button>
                  <Button variant={p.is_active ? "destructive" : "secondary"} size="sm" onClick={() => toggleActive(p)}>{p.is_active ? "Nonaktifkan" : "Aktifkan"}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
