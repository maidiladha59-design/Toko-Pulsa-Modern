import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StaticPageView from "@/components/StaticPageView";
import { getSetting } from "@/lib/settings";
import {
  DEFAULT_PAGES_SETTINGS,
  PAGES_SETTINGS_KEY,
  STATIC_PAGE_SLUGS,
  pageFor,
  type PagesSettings,
  type StaticPageSlug,
} from "@/lib/pages-settings";

// Halaman statis publik (/halaman/<slug>) yang isinya dikelola admin.
// Isi hanya blok teks/daftar/tautan; tidak ada HTML bebas (lihat StaticPageView).

type PageProps = { params: { slug: string } };

function isSlug(value: string): value is StaticPageSlug {
  return (STATIC_PAGE_SLUGS as readonly string[]).includes(value);
}

async function loadPage(slug: string) {
  if (!isSlug(slug)) return null;
  const settings = await getSetting<PagesSettings>(PAGES_SETTINGS_KEY, DEFAULT_PAGES_SETTINGS);
  return pageFor(settings, slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await loadPage(params.slug);
  if (!page) return { title: "Halaman tidak ditemukan" };
  return {
    title: page.title,
    description: page.intro.slice(0, 160) || undefined,
  };
}

export default async function PublicStaticPage({ params }: PageProps) {
  const page = await loadPage(params.slug);
  if (!page) notFound();
  const contact =
    params.slug === "kontak"
      ? (await getSetting<PagesSettings>(PAGES_SETTINGS_KEY, DEFAULT_PAGES_SETTINGS)).contact
      : undefined;
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
      <StaticPageView page={page} contact={contact} />
    </main>
  );
}
