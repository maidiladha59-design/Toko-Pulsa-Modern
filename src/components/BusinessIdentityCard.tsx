import { getBusinessIdentity } from "@/lib/business";

const pseLabel: Record<string, string> = {
  REGISTERED: "Terdaftar di PSE Kominfo",
  PENDING: "Dalam proses pendaftaran PSE Kominfo",
  NOT_SET: "Status pendaftaran PSE belum diisi",
};

const pseTone: Record<string, string> = {
  REGISTERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  NOT_SET: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function BusinessIdentityCard({ compact = false }: { compact?: boolean }) {
  const biz = getBusinessIdentity();

  if (compact) {
    return (
      <div className="text-xs text-white/60">
        <p className="font-bold text-white/80">{biz.legalName}</p>
        {biz.entityType !== "Belum ditentukan" && <p>{biz.entityType}</p>}
        {biz.address !== "Segera dilengkapi" && <p className="mt-1">{biz.address}</p>}
        <p className="mt-1">
          {biz.email && <>{biz.email}</>}
          {biz.email && biz.phone && " · "}
          {biz.phone}
        </p>
        <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${pseTone[biz.pseStatus]}`}>
          {pseLabel[biz.pseStatus]}
          {biz.pseNumber ? ` · ${biz.pseNumber}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-gold-600">Identitas Pelaku Usaha</p>
      <h1 className="mt-2 text-2xl font-black">{biz.legalName}</h1>
      {!biz.isConfigured && (
        <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          Data identitas usaha di bawah ini belum lengkap. Pemilik platform wajib mengisi environment
          variable NEXT_PUBLIC_BUSINESS_* sebelum platform ini digunakan oleh publik.
        </p>
      )}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Bentuk usaha</dt>
          <dd className="mt-0.5 text-slate-700">{biz.entityType}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">NIB</dt>
          <dd className="mt-0.5 text-slate-700">{biz.nib || "Segera dilengkapi"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-bold uppercase text-slate-400">Alamat usaha</dt>
          <dd className="mt-0.5 text-slate-700">{biz.address}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Email resmi</dt>
          <dd className="mt-0.5 text-slate-700">{biz.email || "Segera dilengkapi"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Telepon/WhatsApp resmi</dt>
          <dd className="mt-0.5 text-slate-700">{biz.phone || "Segera dilengkapi"}</dd>
        </div>
      </dl>
      <div className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${pseTone[biz.pseStatus]}`}>
        {pseLabel[biz.pseStatus]}
        {biz.pseNumber ? ` · No. ${biz.pseNumber}` : ""}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-400">
        Ditampilkan sesuai kewajiban keterbukaan identitas Penyelenggara Sistem Elektronik (PSE) lingkup
        privat berdasarkan PP 71/2019 dan Permendag 50/2020 tentang Perdagangan Melalui Sistem Elektronik.
      </p>
    </div>
  );
}
