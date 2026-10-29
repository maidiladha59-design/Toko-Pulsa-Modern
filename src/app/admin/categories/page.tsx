"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Icon from "@/components/icons/Icon";
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
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Katalog</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Kelola Kategori</h1>
        <p className="mt-1 text-sm text-app-muted">Tambah kategori baru agar produk lebih mudah ditemukan dan dikelompokkan.</p>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{isEditing ? "Edit Kategori" : "Tambah Kategori Baru"}</CardTitle>
          {isEditing && (
            <Button type="button" variant="outline" onClick={resetForm}>
              Batal
            </Button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            label="Nama Kategori"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Contoh: Jasa Sosial Media"
            className="bg-app-inset"
          />
          <Input
            label="Slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="jasa-sosial-media"
            className="bg-app-inset"
          />
          <div className="sm:col-span-2">
            <Button type="submit" loading={saving}>
              {isEditing ? "Simpan Perubahan" : "Tambah Kategori"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-0">
        <div className="p-5">
          <CardTitle>Daftar Kategori</CardTitle>
          <CardDescription>{categories.length} kategori tersimpan</CardDescription>
        </div>
        {loading ? (
          <div className="p-5">
            <LoadingSkeleton rows={5} />
          </div>
        ) : categories.length === 0 ? (
          <EmptyState icon="office" title="Belum ada kategori" className="m-4" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-app-border text-left text-xs font-bold uppercase tracking-widest text-app-subtle">
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-app-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-bold text-app-text">{c.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-app-subtle">/{c.slug}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-app-muted">{productCounts[c.id] || 0} produk</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(c)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(c)}>
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
