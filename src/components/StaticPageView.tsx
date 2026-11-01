import Link from "next/link";
import type { ContactSettings, PageBlock, StaticPage } from "@/lib/pages-settings";
import { safeLinkHref, whatsappHref } from "@/lib/pages-settings";
import Icon from "@/components/icons/Icon";

// Renderer aman untuk halaman statis: teks selalu dirender sebagai teks React
// (tanpa dangerouslySetInnerHTML), tautan hanya path internal atau https.
// Tidak ada Markdown/HTML bebas yang dieksekusi.

function Block({ block }: { block: PageBlock }) {
  if (block.type === "heading") {
    return <h2 className="mt-7 text-xl font-black text-app-text">{block.text}</h2>;
  }
  if (block.type === "paragraph") {
    return <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-app-muted">{block.text}</p>;
  }
  if (block.type === "list") {
    const items = block.items.filter((item) => item.trim());
    if (!items.length) return null;
    return (
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-app-muted">
        {items.map((item, index) => (
          <li key={index} className="break-words">{item}</li>
        ))}
      </ul>
    );
  }
  const href = safeLinkHref(block.href);
  if (!href) return null;
  const isInternal = href.startsWith("/");
  const className = "mt-3 inline-flex break-words font-bold text-app-kicker underline underline-offset-2";
  return isInternal ? (
    <p className="mt-3">
      <Link href={href} className={className}>{block.text}</Link>
    </p>
  ) : (
    <p className="mt-3">
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {block.text}
      </a>
    </p>
  );
}

function ContactPanel({ contact }: { contact: ContactSettings }) {
  const channels: Array<{ label: string; href: string | null; icon: string }> = [];
  const wa1 = whatsappHref(contact.whatsapp1);
  const wa2 = whatsappHref(contact.whatsapp2);
  if (wa1) channels.push({ label: `WhatsApp ${contact.whatsapp1}`, href: wa1, icon: "chat" });
  if (wa2) channels.push({ label: `WhatsApp ${contact.whatsapp2}`, href: wa2, icon: "chat" });
  if (contact.email) channels.push({ label: contact.email, href: `mailto:${contact.email}`, icon: "send" });
  if (contact.hours.trim()) channels.push({ label: contact.hours, href: null, icon: "timer" });
  if (contact.address.trim()) channels.push({ label: contact.address, href: null, icon: "office" });
  if (!channels.length) return null;

  return (
    <section className="mt-6 border-t border-app-border pt-5">
      <h2 className="text-sm font-black text-app-text">Hubungi langsung</h2>
      <ul className="mt-3 grid gap-2">
        {channels.map((channel) => (
          <li key={channel.label} className="flex min-w-0 items-start gap-2 text-sm text-app-muted">
            <Icon name={channel.icon} size={16} className="mt-0.5 shrink-0 text-app-kicker" />
            {channel.href ? (
              <a
                href={channel.href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 break-words font-bold text-app-kicker underline underline-offset-2"
              >
                {channel.label}
              </a>
            ) : (
              <span className="min-w-0 break-words">{channel.label}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function StaticPageView({ page, contact }: { page: StaticPage; contact?: ContactSettings }) {
  return (
    <article className="mx-auto w-full max-w-3xl min-w-0 rounded-3xl border border-app-border bg-app-surface p-5 text-app-text shadow-sm sm:p-7">
      <h1 className="break-words text-2xl font-black leading-tight sm:text-3xl">{page.title}</h1>
      {page.intro && (
        <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-app-muted">{page.intro}</p>
      )}
      <div className="mt-2">
        {page.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </div>
      {contact && <ContactPanel contact={contact} />}
    </article>
  );
}
