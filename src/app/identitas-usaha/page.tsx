import type { Metadata } from "next";
import BusinessIdentityCard from "@/components/BusinessIdentityCard";

export const metadata: Metadata = {
  title: "Identitas Usaha — AIDIL STORE",
  description: "Identitas resmi pelaku usaha, NIB, kontak resmi, dan status pendaftaran PSE Kominfo AIDIL STORE.",
};

export default function IdentitasUsahaPage() {
  return (
    <div className="mx-auto max-w-3xl animate-page-in">
      <BusinessIdentityCard />
    </div>
  );
}
