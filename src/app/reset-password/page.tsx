import type { Metadata } from "next";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password — AIDIL STORE",
  description: "Buat password baru untuk akun AIDIL STORE.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
