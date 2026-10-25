import type { Metadata } from "next";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password — AIDIL STORE",
  description: "Buat password baru setelah kode verifikasi email dikonfirmasi.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
