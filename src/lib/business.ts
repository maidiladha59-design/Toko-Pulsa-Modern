import { createClient } from "@/lib/supabase/server";

// Identitas resmi pelaku usaha AIDIL STORE.
// Sumber utama: tabel public.business_profile yang diisi admin lewat
// /admin/identitas-usaha. Environment variable NEXT_PUBLIC_BUSINESS_* tetap
// dipakai sebagai fallback agar deployment lama tidak kehilangan data.

export type PseStatus = "REGISTERED" | "PENDING" | "NOT_SET";

export type BusinessIdentity = {
  legalName: string;
  ownerName: string;
  entityType: string;
  nib: string;
  address: string;
  email: string;
  phone: string;
  pseStatus: PseStatus;
  pseNumber: string;
  logoUrl: string | null;
  legalDocumentUrl: string | null;
  showLegalDocumentPublicly: boolean;
  isConfigured: boolean;
  updatedAt: string | null;
};

const DEFAULT_NAME = "Segera dilengkapi oleh pemilik usaha";
const DEFAULT_ADDRESS = "Segera dilengkapi";

function clean(v: string | null | undefined, fallback: string) {
  const t = (v || "").trim();
  return t.length > 0 ? t : fallback;
}

function envIdentity(): BusinessIdentity {
  const legalName = clean(process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME, DEFAULT_NAME);
  const entityType = clean(process.env.NEXT_PUBLIC_BUSINESS_ENTITY_TYPE, "Belum ditentukan");
  const nib = clean(process.env.NEXT_PUBLIC_BUSINESS_NIB, "");
  const address = clean(process.env.NEXT_PUBLIC_BUSINESS_ADDRESS, DEFAULT_ADDRESS);
  const email = clean(process.env.NEXT_PUBLIC_BUSINESS_EMAIL, "");
  const phone = clean(process.env.NEXT_PUBLIC_BUSINESS_PHONE, "");
  const pseNumber = clean(process.env.NEXT_PUBLIC_PSE_NUMBER, "");
  const rawStatus = (process.env.NEXT_PUBLIC_PSE_STATUS || "").trim().toUpperCase();
  const pseStatus: PseStatus =
    rawStatus === "REGISTERED" ? "REGISTERED" : rawStatus === "PENDING" ? "PENDING" : "NOT_SET";

  return {
    legalName,
    ownerName: "",
    entityType,
    nib,
    address,
    email,
    phone,
    pseStatus,
    pseNumber,
    logoUrl: null,
    legalDocumentUrl: null,
    showLegalDocumentPublicly: false,
    isConfigured: Boolean(legalName !== DEFAULT_NAME && address !== DEFAULT_ADDRESS && email),
    updatedAt: null,
  };
}

const PSE_FROM_DB: Record<string, PseStatus> = {
  TERDAFTAR: "REGISTERED",
  DALAM_PROSES: "PENDING",
  BELUM_TERDAFTAR: "NOT_SET",
};

export async function getBusinessIdentity(): Promise<BusinessIdentity> {
  const fallback = envIdentity();

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("business_profile")
      .select(
        "business_name, owner_name, business_address, business_phone, business_email, nib_number, pse_status, pse_registration_number, logo_url, legal_document_url, show_legal_document_publicly, updated_at"
      )
      .eq("id", true)
      .maybeSingle();

    if (error || !data) return fallback;

    const pseStatus = PSE_FROM_DB[String(data.pse_status || "").toUpperCase()] || "NOT_SET";
    const legalName = clean(data.business_name, fallback.legalName);
    const address = clean(data.business_address, fallback.address);
    const email = clean(data.business_email, fallback.email);

    return {
      legalName,
      ownerName: clean(data.owner_name, ""),
      entityType: fallback.entityType,
      nib: clean(data.nib_number, fallback.nib),
      address,
      email,
      phone: clean(data.business_phone, fallback.phone),
      pseStatus,
      pseNumber:
        pseStatus === "REGISTERED"
          ? clean(data.pse_registration_number, fallback.pseNumber)
          : "",
      logoUrl: clean(data.logo_url, "") || null,
      legalDocumentUrl: clean(data.legal_document_url, "") || null,
      showLegalDocumentPublicly: Boolean(data.show_legal_document_publicly),
      isConfigured: Boolean(legalName !== DEFAULT_NAME && address !== DEFAULT_ADDRESS && (email || clean(data.business_phone, fallback.phone))),
      updatedAt: data.updated_at || null,
    };
  } catch {
    return fallback;
  }
}
