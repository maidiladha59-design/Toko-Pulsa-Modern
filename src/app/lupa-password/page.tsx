import type { Metadata } from "next";
import LupaPasswordForm from "./LupaPasswordForm";

export const metadata: Metadata = {
  title: "Lupa Password — AIDIL STORE",
  description: "Minta kode verifikasi 6 digit untuk mengatur ulang password akun AIDIL STORE.",
};

export default function LupaPasswordPage() {
  return <LupaPasswordForm />;
}
