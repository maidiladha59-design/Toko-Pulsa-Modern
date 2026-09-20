"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { humanizeError } from "@/lib/utils";

type Category = { id: string; name: string; slug: string; created_at: string };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function AdminCategoriesPage() {
  const supabase = createClient();
  const toast = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const isEditing = editingId !== null;

  async function load() {
    setLoading(true);
    const [{ data: categoryData, error }, { data: products }] = await Promise.all([
      supabase.from("categories").select("id, name, slug, created_at").order("name"),
      supabase.from("products").select("category_id"),
    ]);
    if (error) toast.show(humanizeError(error.message), "error");
    setCategories((categoryData as Category[]) || []);
    const counts: Record<string, number> = {};
    (products || []).forEach((p: any) => {
      if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
    });
    setProductCounts(counts);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setSlug("");
    setSlugTouched(false);
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setName(c.name);
    setSlug(c.slug);
    setSlugTouched(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.show("Nama dan slug kategori wajib diisi.", "error");
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        const { error } = await supabase
          .from("categories")
          .update({ name: name.trim(), slug: slugify(slug) })
          .eq("id", editingId);
        if (error) throw error;
        toast.show("Kategori berhasil diperbarui.", "success");
      } else {
        const { error } = await supabase.from("categories").insert({ name: name.trim(), slug: slugify(slug) });
        if (error) throw error;
        toast.show("Kategori baru berhasil ditambahkan.", "success");
      }
      resetForm();
      await load();
    } catch (error: any) {
      const msg = String(error?.message || "");
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.show("Slug kategori sudah dipakai. Gunakan slug lain.", "error");
      } else {
        toast.show(humanizeError(msg), "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Category) {
    const count = productCounts[c.id] || 0;
    if (count > 0) {
      toast.show(`Kategori "${c.name}" masih dipakai ${count} produk. Pindahkan produk itu dulu sebelum menghapus.`, "error");
      return;
    }
    if (!window.confirm(`Hapus kategori "${c.name}"?`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) toast.show(humanizeError(error.message), "error");
    else {
      toast.show("Kategori dihapus.", "success");
      if (editingId === c.id) resetForm();
      load();
    }
  }

  return (
    <div className="animate-page-in space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">Katalog</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Kelola Kategori</h1>
        <p className="mt-1 text-sm text-slate-500">Tambah kategori baru agar produk lebih mudah ditemukan dan dikelompokkan.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900">{isEditing ? "Edit Kategori" : "Tambah Kategori Baru"}</h2>
          {isEditing && <Button type="button" variant="secondary" onClick={resetForm}>Batal</Button>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Nama Kategori
            <input
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Contoh: Jasa Sosial Media"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-gold-400"
            />
          </label>
          <label className="text-sm font-medium">
            Slug
            <input
              required
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
              placeholder="jasa-sosial-media"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-gold-400"
            />
          </label>
        </div>
        <div className="mt-4">
          <Button type="submit" loading={saving}>{isEditing ? "Simpan Perubahan" : "Tambah Kategori"}</Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-bold text-slate-900">Daftar Kategori</h2>
          <p className="text-xs text-slate-500">{categories.length} kategori tersimpan</p>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Memuat...</p>
        ) : categories.length === 0 ? (
          <EmptyState title="Belum ada kategori" />
        ) : (
          <div className="divide-y divide-slate-100">
            {categories.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-400">/{c.slug} · {productCounts[c.id] || 0} produk</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => startEdit(c)}>Edit</Button>
                  <Button variant="danger" onClick={() => handleDelete(c)}>Hapus</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
