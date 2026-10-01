import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addContactSchema, removeContactSchema } from "@/lib/transfer/schemas";

function mapContactError(message: string | undefined) {
  const msg = message || "";
  if (msg.includes("UNAUTHENTICATED")) return { message: "Silakan login terlebih dahulu.", status: 401 };
  if (msg.includes("INVALID_CONTACT")) return { message: "Kontak tidak valid.", status: 400 };
  if (msg.includes("CONTACT_NOT_FOUND")) return { message: "Pengguna tidak ditemukan.", status: 404 };
  return { message: "Gagal memproses kontak. Coba lagi.", status: 500 };
}

// Daftar kontak favorit penerima transfer (via RPC security definer).
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("list_transfer_contacts");
  if (error) {
    console.error("transfer/contacts list error:", error);
    return NextResponse.json({ message: "Gagal membaca daftar kontak." }, { status: 500 });
  }

  const contacts = (data || []).map((c: any) => ({
    contact_user_id: c.contact_user_id,
    alias: c.alias || null,
    display_name: c.display_name,
    avatar_url: c.avatar_url || null,
    created_at: c.created_at,
  }));

  return NextResponse.json({ contacts });
}

// Simpan / perbarui kontak favorit.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const parsed = addContactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Data kontak tidak valid." }, { status: 400 });
  }

  const { error } = await supabase.rpc("add_transfer_contact", {
    p_contact_user_id: parsed.data.contact_user_id,
    p_alias: parsed.data.alias && parsed.data.alias.length > 0 ? parsed.data.alias : null,
  });
  if (error) {
    console.error("transfer/contacts add error:", error);
    const mapped = mapContactError(error.message);
    return NextResponse.json({ message: mapped.message }, { status: mapped.status });
  }

  return NextResponse.json({ message: "Kontak berhasil disimpan." }, { status: 201 });
}

// Hapus kontak favorit.
export async function DELETE(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const parsed = removeContactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Data kontak tidak valid." }, { status: 400 });
  }

  const { error } = await supabase.rpc("remove_transfer_contact", {
    p_contact_user_id: parsed.data.contact_user_id,
  });
  if (error) {
    console.error("transfer/contacts remove error:", error);
    const mapped = mapContactError(error.message);
    return NextResponse.json({ message: mapped.message }, { status: mapped.status });
  }

  return NextResponse.json({ message: "Kontak dihapus." });
}
