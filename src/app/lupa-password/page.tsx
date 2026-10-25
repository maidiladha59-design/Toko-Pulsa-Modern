import type { Metadata } from "next";
import LupaPasswordForm from "./LupaPasswordForm";

export const metadata: Metadata = {
  title: "Lupa Password — AIDIL STORE",
  description: "Minta link reset password untuk akun AIDIL STORE.",
};

export default function LupaPasswordPage() {
  return <LupaPasswordForm />;
}
