import Image from "next/image";
import Link from "next/link";
import { getBusinessIdentity } from "@/lib/business";
import RatingBadge from "@/components/RatingBadge";

const pseLabel: Record<string, string> = {
  REGISTERED: "Terdaftar PSE",
  PENDING: "Pendaftaran PSE dalam proses",
  NOT_SET: "Status pendaftaran PSE belum diisi",
};

const pseTone: Record<string, string> = {
  REGISTERED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
  NOT_SET: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30",
};

export default async function BusinessIdentityCard({ compact = false }: { compact?: boolean }) {
  const biz = await getBusinessIdentity();
  const pseText =
    pseLabel[biz.pseStatus] +
    (biz.pseStatus === "REGISTERED" && biz.pseNumber ? ` — No. ${biz.pseNumber}` : "");
  const contact = [biz.email, biz.phone].filter(Boolean).join(" · ");

  if (compact) {
    return (
      <div className="text-xs text-white/60">
        <div className="flex items-start gap-2">
          {biz.logoUrl ? (
            <Image
              src={biz.logoUrl}
              alt={`Logo ${biz.legalName}`}
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1"
            />
          ) : null}
          <div className="min-w-0">
            <p className="font-bold text-white/80">{biz.legalName}</p>
            {biz.ownerName ? <p className="mt-0.5">Pemilik: {biz.ownerName}</p> : null}
          </div>
        </div>
        {biz.address !== "Segera dilengkapi" && <p className="mt-1">{biz.address}</p>}
        {contact ? <p className="mt-1 break-words">{contact}</p> : null}
        <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${pseTone[biz.pseStatus]}`}>
          {pseText}
        </span>
        <Link href="/identitas-usaha" className="mt-2 block text-[11px] font-black text-gold-400 hover:underline">
          Lihat identitas lengkap →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-app-border bg-app-surface p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-gold-600 dark:text-gold-300">Identitas Pelaku Usaha</p>
      <div className="mt-3 flex items-start gap-4">
        {biz.logoUrl ? (
          <Image
            src={biz.logoUrl}
            alt={`Logo ${biz.legalName}`}
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-2xl border border-app-border bg-white object-contain p-1.5"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-app-text">{biz.legalName}</h1>
          {biz.ownerName ? (
            <p className="mt-1 text-sm text-app-muted">
              Pemilik: <b className="text-app-text">{biz.ownerName}</b>
            </p>
          ) : null}
        </div>
      </div>
      {!biz.isConfigured && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          Data identitas usaha belum lengkap. Pemilik usaha dapat melengkapinya melalui Panel Admin →
          Identitas Usaha.
        </p>
      )}
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-xs font-bold uppercase text-app-subtle">Alamat usaha</dt>
          <dd className="mt-0.5 text-app-text">{biz.address}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-app-subtle">Email resmi</dt>
          <dd className="mt-0.5 break-words text-app-text">{biz.email || "Belum diisi"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-app-subtle">Telepon/WhatsApp resmi</dt>
          <dd className="mt-0.5 text-app-text">{biz.phone || "Belum diisi"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-app-subtle">NIB</dt>
          <dd className="mt-0.5 text-app-text">{biz.nib || "Belum diisi"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-app-subtle">Status pendaftaran PSE</dt>
          <dd className="mt-1">
            <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold ${pseTone[biz.pseStatus]}`}>
              {pseText}
            </span>
          </dd>
        </div>
        {biz.showLegalDocumentPublicly && biz.legalDocumentUrl ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-bold uppercase text-app-subtle">Dokumen legal</dt>
            <dd className="mt-1">
              <a
                href={biz.legalDocumentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-gold-700 underline hover:text-gold-600 dark:text-gold-300"
              >
                Lihat dokumen legal (NIB/SIUP) →
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-5 text-xs leading-5 text-app-subtle">
        Ditampilkan sesuai kewajiban keterbukaan identitas Penyelenggara Sistem Elektronik (PSE) lingkup
        privat berdasarkan PP 71/2019 dan Permendag 50/2020 tentang Perdagangan Melalui Sistem Elektronik.
      </p>
      {biz.updatedAt ? (
        <p className="mt-2 text-[11px] text-app-subtle">
          Diperbarui {new Date(biz.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      ) : null}
      <div className="mt-5 border-t border-app-border pt-4">
        <RatingBadge showEmpty />
      </div>
    </div>
  );
}
