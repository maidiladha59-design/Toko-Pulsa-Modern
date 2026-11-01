"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Icon from "@/components/icons/Icon";
import SettingsForm, { type SettingsFormRenderArgs } from "@/components/admin/SettingsForm";
import StaticPageView from "@/components/StaticPageView";
import { isInternalPathOrHttps } from "@/lib/setting-primitives";
import {
  PAGES_SETTINGS_KEY,
  STATIC_PAGE_SLUGS,
  STATIC_PAGE_TITLES,
  pageFor,
  pagesPublishError,
  pagesValidate,
  type PageBlock,
  type PagesSettings,
  type StaticPage,
  type StaticPageSlug,
} from "@/lib/pages-settings";

// Panel "Teks & Halaman". Halaman disimpan sebagai blok JSON (judul,
// paragraf, daftar, tautan) dan dirender sebagai teks React — tidak ada HTML
// atau Markdown bebas, sehingga aman dari XSS. Perubahan baru tampil setelah
// diterbitkan, tanpa deploy ulang.

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20";

type SetPages = SettingsFormRenderArgs<PagesSettings>["set"];

const BLOCK_LABEL: Record<PageBlock["type"], string> = {
  heading: "Judul bagian",
  paragraph: "Paragraf",
  list: "Daftar",
  link: "Tautan",
};

function moveBlock(blocks: PageBlock[], index: number, delta: number): PageBlock[] {
  const next = blocks.slice();
  const target = index + delta;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function LabelsCard({ value, set }: { value: PagesSettings; set: SetPages }) {
  const labels = value.labels;
  return (
    <Card>
      <CardTitle>Teks label penting</CardTitle>
      <CardDescription>
        Digunakan di beranda dan daftar pesanan. Judul hero kosong berarti memakai judul dari
        Pengaturan Beranda.
      </CardDescription>
      <div className="mt-4 space-y-4">
        <Input
          label="Judul hero (opsional)"
          value={labels.heroTitle}
          maxLength={120}
          placeholder="Kosong = ikuti Pengaturan Beranda"
          onChange={(event) => set("labels", { ...labels, heroTitle: event.target.value })}
        />
        <Input
          label="Teks tombol utama"
          value={labels.guestCta}
          maxLength={40}
          hint="Tampil pada tombol di kartu hero saat pengunjung belum masuk."
          onChange={(event) => set("labels", { ...labels, guestCta: event.target.value })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Judul daftar pesanan kosong"
            value={labels.emptyOrdersTitle}
            maxLength={80}
            onChange={(event) => set("labels", { ...labels, emptyOrdersTitle: event.target.value })}
          />
          <Input
            label="Penjelasan daftar pesanan kosong"
            value={labels.emptyOrdersDescription}
            maxLength={240}
            onChange={(event) =>
              set("labels", { ...labels, emptyOrdersDescription: event.target.value })
            }
          />
        </div>
      </div>
    </Card>
  );
}

function ContactCard({ value, set }: { value: PagesSettings; set: SetPages }) {
  const contact = value.contact;
  const emailError =
    contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)
      ? "Email belum valid. Contoh: cs@contoh.com."
      : null;

  return (
    <Card>
      <CardTitle>Kontak</CardTitle>
      <CardDescription>
        Ditampilkan di footer dan halaman Kontak. Nomor WhatsApp otomatis menjadi tautan wa.me.
      </CardDescription>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input
          label="WhatsApp 1"
          value={contact.whatsapp1}
          maxLength={24}
          placeholder="0858xxxxxxx"
          onChange={(event) => set("contact", { ...contact, whatsapp1: event.target.value })}
        />
        <Input
          label="WhatsApp 2 (opsional)"
          value={contact.whatsapp2}
          maxLength={24}
          placeholder="0895xxxxxxx"
          onChange={(event) => set("contact", { ...contact, whatsapp2: event.target.value })}
        />
        <Input
          label="Email"
          type="email"
          value={contact.email}
          maxLength={120}
          error={emailError}
          onChange={(event) => set("contact", { ...contact, email: event.target.value })}
        />
        <Input
          label="Jam layanan"
          value={contact.hours}
          maxLength={120}
          placeholder="Setiap hari, 08.00–22.00 WIB"
          onChange={(event) => set("contact", { ...contact, hours: event.target.value })}
        />
      </div>
      <div className="mt-3">
        <Input
          label="Alamat (opsional)"
          value={contact.address}
          maxLength={240}
          onChange={(event) => set("contact", { ...contact, address: event.target.value })}
        />
      </div>
    </Card>
  );
}

function FooterCard({ value, set }: { value: PagesSettings; set: SetPages }) {
  const footer = value.footer;
  return (
    <Card>
      <CardTitle>Footer</CardTitle>
      <CardDescription>Teks tambahan di bagian bawah beranda. Tautan sah hanya path internal atau https.</CardDescription>
      <div className="mt-4 space-y-3">
        <Input
          label="Slogan singkat"
          value={footer.tagline}
          maxLength={160}
          onChange={(event) => set("footer", { ...footer, tagline: event.target.value })}
        />
        <div className="min-w-0">
          <label htmlFor="footer-description" className="mb-2 block text-sm font-bold text-app-text">
            Deskripsi
          </label>
          <textarea
            id="footer-description"
            rows={3}
            value={footer.description}
            maxLength={600}
            className={TEXTAREA_CLASS}
            onChange={(event) => set("footer", { ...footer, description: event.target.value })}
          />
        </div>
        <Input
          label="Hak cipta"
          value={footer.copyright}
          maxLength={160}
          onChange={(event) => set("footer", { ...footer, copyright: event.target.value })}
        />
      </div>
    </Card>
  );
}

function BlockEditor({
  block,
  index,
  length,
  onChange,
  onMove,
  onRemove,
}: {
  block: PageBlock;
  index: number;
  length: number;
  onChange: (next: PageBlock) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-app-border bg-app-inset/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-black uppercase tracking-widest text-app-kicker">
          {index + 1}. {BLOCK_LABEL[block.type]}
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" aria-label={`Naikkan ${BLOCK_LABEL[block.type]}`} disabled={index === 0} onClick={() => onMove(-1)} className="px-2">
            <Icon name="arrow_up" size={14} />
          </Button>
          <Button type="button" size="sm" variant="ghost" aria-label={`Turunkan ${BLOCK_LABEL[block.type]}`} disabled={index === length - 1} onClick={() => onMove(1)} className="px-2">
            <Icon name="arrow_down" size={14} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-danger-600 dark:text-danger-400"
            onClick={onRemove}
          >
            Hapus
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {block.type === "heading" && (
          <Input
            label="Teks judul bagian"
            value={block.text}
            maxLength={120}
            onChange={(event) => onChange({ type: "heading", text: event.target.value })}
          />
        )}

        {block.type === "paragraph" && (
          <div className="min-w-0">
            <label className="mb-2 block text-sm font-bold text-app-text">Isi paragraf</label>
            <textarea
              rows={4}
              value={block.text}
              maxLength={2000}
              className={TEXTAREA_CLASS}
              onChange={(event) => onChange({ type: "paragraph", text: event.target.value })}
            />
            <p className="mt-1 text-xs text-app-subtle">{block.text.length}/2.000 karakter</p>
          </div>
        )}

        {block.type === "list" && (
          <div className="min-w-0">
            <label className="mb-2 block text-sm font-bold text-app-text">Butir daftar</label>
            <textarea
              rows={4}
              value={block.items.join("\n")}
              className={TEXTAREA_CLASS}
              onChange={(event) =>
                onChange({ type: "list", items: event.target.value.split("\n") })
              }
            />
            <p className="mt-1 text-xs text-app-subtle">Satu butir per baris. Maksimal 30 butir.</p>
          </div>
        )}

        {block.type === "link" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Teks tautan"
              value={block.text}
              maxLength={120}
              onChange={(event) => onChange({ ...block, text: event.target.value })}
            />
            <Input
              label="Tujuan"
              value={block.href}
              placeholder="/halaman/kontak atau https://contoh.com"
              error={
                block.href && !isInternalPathOrHttps(block.href)
                  ? "Hanya path internal (diawali /) atau https."
                  : null
              }
              onChange={(event) => onChange({ ...block, href: event.target.value })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PagesCard({
  value,
  set,
  activeSlug,
  onSlugChange,
}: {
  value: PagesSettings;
  set: SetPages;
  activeSlug: StaticPageSlug;
  onSlugChange: (slug: StaticPageSlug) => void;
}) {
  const page = value.pages[activeSlug];

  function updatePage(next: StaticPage) {
    set("pages", { ...value.pages, [activeSlug]: next });
  }

  function patchBlock(index: number, next: PageBlock) {
    updatePage({ ...page, blocks: page.blocks.map((block, i) => (i === index ? next : block)) });
  }

  function removeBlock(index: number) {
    updatePage({ ...page, blocks: page.blocks.filter((_, i) => i !== index) });
  }

  function addBlock(type: PageBlock["type"]) {
    if (page.blocks.length >= 60) return;
    const block: PageBlock =
      type === "heading"
        ? { type: "heading", text: "Judul bagian baru" }
        : type === "paragraph"
          ? { type: "paragraph", text: "Tulis paragraf di sini." }
          : type === "list"
            ? { type: "list", items: ["Butir pertama."] }
            : { type: "link", text: "Teks tautan", href: "/" };
    updatePage({ ...page, blocks: [...page.blocks, block] });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Halaman statis</CardTitle>
          <CardDescription>
            Empat halaman publik: <code>/halaman/&lt;slug&gt;</code>. Tanpa HTML bebas; tautan hanya
            path internal atau https.
          </CardDescription>
        </div>
        <Badge tone={page.blocks.length > 60 ? "warning" : "neutral"} className="px-2 py-0.5">
          {page.blocks.length}/60 blok
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATIC_PAGE_SLUGS.map((slug) => (
          <Button
            key={slug}
            type="button"
            size="sm"
            variant={slug === activeSlug ? "primary" : "outline"}
            onClick={() => onSlugChange(slug)}
          >
            {STATIC_PAGE_TITLES[slug]}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <Input
          label="Judul halaman"
          value={page.title}
          maxLength={120}
          onChange={(event) => updatePage({ ...page, title: event.target.value })}
        />
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-bold text-app-text">Pengantar</label>
          <textarea
            rows={2}
            value={page.intro}
            maxLength={600}
            className={TEXTAREA_CLASS}
            onChange={(event) => updatePage({ ...page, intro: event.target.value })}
          />
        </div>

        <div className="space-y-3">
          {page.blocks.length === 0 && (
            <p className="rounded-xl bg-app-inset px-3 py-4 text-center text-xs text-app-subtle">
              Halaman ini belum memiliki isi. Tambahkan blok di bawah.
            </p>
          )}
          {page.blocks.map((block, index) => (
            <BlockEditor
              key={index}
              block={block}
              index={index}
              length={page.blocks.length}
              onChange={(next) => patchBlock(index, next)}
              onMove={(delta) => updatePage({ ...page, blocks: moveBlock(page.blocks, index, delta) })}
              onRemove={() => removeBlock(index)}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("heading")}>
            Tambah judul
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("paragraph")}>
            Tambah paragraf
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("list")}>
            Tambah daftar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addBlock("link")}>
            Tambah tautan
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function AdminPagesSettingsPage() {
  const [activeSlug, setActiveSlug] = useState<StaticPageSlug>("syarat-ketentuan");

  return (
    <SettingsForm<PagesSettings>
      settingKey={PAGES_SETTINGS_KEY}
      title="Teks & Halaman"
      description="Edit Syarat & Ketentuan, Kebijakan Privasi, Tentang Kami, Kontak, footer, dan teks label penting. Isi dirender sebagai teks biasa, bukan HTML."
      validate={pagesValidate}
      publishError={pagesPublishError}
      renderPreview={(value) => <StaticPageView page={pageFor(value, activeSlug)} />}
      previewTitle="Pratinjau halaman"
      previewDescription="Lebar 360px, teks tampil sama seperti halaman publik."
      previewHint="Halaman publik dibuka di /halaman/<slug>. Halaman lama /terms dan /privacy menampilkan isi yang sama."
    >
      {({ value, set }) => (
        <>
          <LabelsCard value={value} set={set} />
          <ContactCard value={value} set={set} />
          <FooterCard value={value} set={set} />
          <PagesCard value={value} set={set} activeSlug={activeSlug} onSlugChange={setActiveSlug} />
        </>
      )}
    </SettingsForm>
  );
}
