import { handleAdminExport } from "@/lib/admin-export-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { kind: string } }) {
  return handleAdminExport(request, params.kind);
}
