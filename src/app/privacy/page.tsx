import type { Metadata } from "next";
import StaticPageView from "@/components/StaticPageView";
import { getSetting } from "@/lib/settings";
import { DEFAULT_PAGES_SETTINGS, PAGES_SETTINGS_KEY, pageFor, type PagesSettings } from "@/lib/pages-settings";

export const metadata: Metadata = { title: "Kebijakan Privasi" };

export default async function Privacy() {
  const settings = await getSetting<PagesSettings>(PAGES_SETTINGS_KEY, DEFAULT_PAGES_SETTINGS);
  const page = pageFor(settings, "kebijakan-privasi");
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
      <StaticPageView page={page} />
    </main>
  );
}
