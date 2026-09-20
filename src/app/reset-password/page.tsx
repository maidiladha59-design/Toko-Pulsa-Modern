"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import { humanizeError } from "@/lib/utils";

export default function ResetPasswordPage() {
  const supabase = createClient(); const router = useRouter(); const toast = useToast();
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [loading, setLoading] = useState(false);
  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); if (password.length < 6) { toast.show("Password minimal 6 karakter.", "error"); return; } if (password !== confirm) { toast.show("Konfirmasi password tidak sama.", "error"); return; } setLoading(true); const { error } = await supabase.auth.updateUser({ password }); setLoading(false); if (error) { toast.show(humanizeError(error.message), "error"); return; } toast.show("Password berhasil diubah.", "success"); router.push("/login"); }
  return <div className="mx-auto max-w-md animate-page-in"><div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-900/5"><div className="bg-gradient-to-br from-slate-950 via-zinc-950 to-gold-700 p-7 text-white"><img src="/aidil-logo.png" alt="Aidil Store" className="h-12 w-12 rounded-2xl bg-white p-2" /><p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-gold-200">AIDIL STORE</p><h1 className="mt-2 text-2xl font-black">Buat password baru</h1><p className="mt-2 text-sm text-gold-100">Gunakan password yang mudah kamu ingat dan tidak dibagikan kepada orang lain.</p></div><form onSubmit={handleSubmit} className="space-y-4 p-7 sm:p-8"><label className="block"><span className="text-sm font-bold text-slate-700">Password baru</span><input type="password" required minLength={6} value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="new-password" placeholder="Minimal 6 karakter" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100" /></label><label className="block"><span className="text-sm font-bold text-slate-700">Konfirmasi password</span><input type="password" required minLength={6} value={confirm} onChange={(e)=>setConfirm(e.target.value)} autoComplete="new-password" placeholder="Ulangi password" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100" /></label><Button type="submit" loading={loading} className="w-full">Simpan Password</Button><Link href="/login" className="block text-center text-sm font-bold text-slate-500 hover:text-gold-600">Kembali ke Login</Link></form></div></div>;
}
