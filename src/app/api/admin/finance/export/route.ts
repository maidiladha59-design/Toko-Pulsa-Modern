import { handleAdminExport } from "@/lib/admin-export-server";

// Alias lama dipertahankan agar tautan lama tetap berfungsi, tetapi sekarang
// memakai jalur ekspor yang sama: izin "export", audit log, batas 31 hari /
// 50.000 baris, dan format CSV yang aman.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAdminExport(request, "finance");
}
