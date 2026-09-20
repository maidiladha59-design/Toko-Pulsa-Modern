// Identitas resmi pelaku usaha AIDIL STORE.
// Wajib diisi lewat environment variable sebelum go-live — lihat .env.example.
// Ini bukan cuma formalitas: Permendag 50/2020 (revisi PMSE) dan UU PDP mewajibkan
// PSE menampilkan identitas pelaku usaha yang jelas kepada konsumen, bukan cuma
// halaman Terms & Privacy generik.

export type BusinessIdentity = {
  legalName: string;
  entityType: string;
  nib: string;
  address: string;
  email: string;
  phone: string;
  pseStatus: "REGISTERED" | "PENDING" | "NOT_SET";
  pseNumber: string;
  isConfigured: boolean;
};

function clean(v: string | undefined, fallback: string) {
  const t = (v || "").trim();
  return t.length > 0 ? t : fallback;
}

export function getBusinessIdentity(): BusinessIdentity {
  const legalName = clean(process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME, "Segera dilengkapi oleh pemilik usaha");
  const entityType = clean(process.env.NEXT_PUBLIC_BUSINESS_ENTITY_TYPE, "Belum ditentukan");
  const nib = clean(process.env.NEXT_PUBLIC_BUSINESS_NIB, "");
  const address = clean(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS, "Segera dilengkapi");
  const email = clean(process.env.NEXT_PUBLIC_BUSINESS_EMAIL, "");
  const phone = clean(process.env.NEXT_PUBLIC_BUSINESS_PHONE, "");
  const pseNumber = clean(process.env.NEXT_PUBLIC_PSE_NUMBER, "");
  const rawStatus = (process.env.NEXT_PUBLIC_PSE_STATUS || "").trim().toUpperCase();
  const pseStatus: BusinessIdentity["pseStatus"] =
    rawStatus === "REGISTERED" ? "REGISTERED" : rawStatus === "PENDING" ? "PENDING" : "NOT_SET";

  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME &&
      process.env.NEXT_PUBLIC_BUSINESS_NIB &&
      process.env.NEXT_PUBLIC_BUSINESS_ADDRESS &&
      process.env.NEXT_PUBLIC_BUSINESS_EMAIL
  );

  return { legalName, entityType, nib, address, email, phone, pseStatus, pseNumber, isConfigured };
}
