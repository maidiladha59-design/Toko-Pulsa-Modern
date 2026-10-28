// Tiga jaminan layanan yang sama di semua halaman kategori (Games, Pulsa, PLN,
// TV, dst.) — satu komponen agar teks dan tampilannya tidak bisa berbeda.
// Teks singkat ("Aman", "Otomatis", "Riwayat") supaya tidak pernah melipat aneh
// di lebar 360px; ikon di atas teks, tinggi kolom sama rata.

const BADGES = [
  {
    label: "Aman",
    icon: (
      <path
        d="M12 3.2 5.5 5.6v5.3c0 4.1 2.7 7.2 6.5 8.4 3.8-1.2 6.5-4.3 6.5-8.4V5.6L12 3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: "Otomatis",
    icon: (
      <path
        d="M13 3 5.5 13.2h5L10 21l7.8-10.4h-5.2L13 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: "Riwayat",
    icon: (
      <path
        d="M7 3.6h10v16.8l-2.5-1.6-2.5 1.6-2.5-1.6L7 20.4V3.6Zm2.6 4.2h4.8M9.6 11h4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export default function ServiceTrustBadges({ className = "" }: { className?: string }) {
  return (
    <div
      className={`mt-6 grid gap-2 [grid-template-columns:repeat(3,minmax(0,1fr))] ${className}`}
    >
      {BADGES.map((badge) => (
        <div
          key={badge.label}
          className="flex h-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl bg-white/10 px-2 py-3 text-center"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gold-400">
            {badge.icon}
          </svg>
          <span className="block max-w-full truncate text-[12px] font-bold leading-tight whitespace-nowrap text-zinc-100">
            {badge.label}
          </span>
        </div>
      ))}
    </div>
  );
}
