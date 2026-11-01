// Server-only: otorisasi, audit, dan streaming CSV untuk panel admin.
// Query tetap memakai service role setelah sesi + izin granular diperiksa,
// lalu dibaca bertahap 1.000 baris (batas PostgREST) supaya tidak memuat
// seluruh hasil ke memori.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPORT_BATCH_SIZE,
  EXPORT_MAX_ROWS,
  EXPORT_PAGE_PERMISSIONS,
  EXPORT_PERMISSION,
  EXPORT_STATUS_OPTIONS,
  EXPORT_TITLES,
  csvHeader,
  csvLine,
  exportColumns,
  exportFilename,
  exportRowLimitMessage,
  isExportKind,
  parseExportRange,
  type ExportKind,
  type ExportRow,
} from "@/lib/admin-export";

export type ExportFilters = {
  from: string;
  to: string;
  startIso: string;
  endIso: string;
  status: string;
  q: string;
};

type Authorized = { ok: true; userId: string; admin: SupabaseClient };
type Denied = { ok: false; status: number; message: string };

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];
const PROFILE_SEARCH_LIMIT = 80;

/** Buang karakter yang bisa merusak sintaks or()/ilike PostgREST. */
export function normalizeExportSearch(raw: string | null): string {
  return String(raw || "")
    .trim()
    .slice(0, 80)
    .replace(/[%,()*\\"]/g, " ")
    .trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function tableFor(kind: ExportKind): string {
  switch (kind) {
    case "orders":
      return "orders";
    case "users":
      return "profiles";
    case "topups":
      return "topups";
    case "finance":
      return "financial_ledger";
  }
}

function rangeColumnFor(kind: ExportKind): string {
  return kind === "finance" ? "occurred_at" : "created_at";
}

function selectFor(kind: ExportKind): string {
  switch (kind) {
    case "orders":
      return "id, user_id, order_number, total_amount, status, payment_method, created_at";
    case "users":
      return "id, full_name, email, role, account_status, created_at";
    case "topups":
      return "id, user_id, amount, admin_fee, gateway_fee, gateway_total_payment, payment_amount, status, payment_method, provider, created_at";
    case "finance":
      return "id, event_type, source_type, source_id, user_id, gross_amount, provider_cost, gateway_cost, fee_revenue, net_profit, occurred_at";
  }
}

async function authorizeExport(kind: ExportKind): Promise<Authorized | Denied> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Silakan login sebagai admin." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return { ok: false, status: 503, message: "Data admin belum bisa dimuat. Coba lagi." };
  }
  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    return { ok: false, status: 403, message: "Akses ekspor hanya untuk admin." };
  }

  const [exportPermission, pagePermission] = await Promise.all([
    supabase.rpc("can_admin_permission", { p_actor: user.id, p_permission: EXPORT_PERMISSION }),
    supabase.rpc("can_admin_permission", {
      p_actor: user.id,
      p_permission: EXPORT_PAGE_PERMISSIONS[kind],
    }),
  ]);
  if (exportPermission.error || pagePermission.error) {
    return {
      ok: false,
      status: 503,
      message: "Izin admin belum bisa diperiksa. Coba lagi sebentar lagi.",
    };
  }
  if (!exportPermission.data) {
    return {
      ok: false,
      status: 403,
      message: "Anda tidak memiliki izin ekspor. Hubungi SUPER_ADMIN untuk membuka akses ini.",
    };
  }
  if (!pagePermission.data) {
    return {
      ok: false,
      status: 403,
      message: `Anda tidak memiliki izin melihat data ${EXPORT_TITLES[kind].toLowerCase()}.`,
    };
  }

  return { ok: true, userId: user.id, admin: createAdminClient() };
}

async function matchingProfileIds(admin: SupabaseClient, q: string): Promise<string[]> {
  if (!q) return [];
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(PROFILE_SEARCH_LIMIT);
  if (error) return [];
  return (data || []).map((row: { id: string }) => row.id);
}

const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

async function filteredQuery(
  admin: SupabaseClient,
  kind: ExportKind,
  filters: ExportFilters,
  options: { count: true } | { count: false; offset: number; limit: number }
) {
  const table = tableFor(kind);
  let query: any = options.count
    ? admin.from(table).select("id", { count: "exact", head: true })
    : admin.from(table).select(selectFor(kind));

  const rangeColumn = rangeColumnFor(kind);
  query = query.gte(rangeColumn, filters.startIso).lte(rangeColumn, filters.endIso);
  if (!options.count) {
    query = query.order(rangeColumn, { ascending: false }).order("id", { ascending: false });
  }

  if (kind === "finance") {
    if (filters.status) query = query.eq("event_type", filters.status);
    if (filters.q) {
      const parts = [`source_id.ilike.%${filters.q}%`];
      if (isUuid(filters.q)) parts.push(`user_id.eq.${filters.q}`);
      query = query.or(parts.join(","));
    }
  } else if (kind === "users") {
    if (filters.status) query = query.eq("account_status", filters.status);
    if (filters.q) {
      const parts = [`full_name.ilike.%${filters.q}%`, `email.ilike.%${filters.q}%`];
      if (isUuid(filters.q)) parts.push(`id.eq.${filters.q}`);
      query = query.or(parts.join(","));
    }
  } else {
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.q) {
      const profileIds = await matchingProfileIds(admin, filters.q);
      const parts: string[] = [];
      if (kind === "orders") parts.push(`order_number.ilike.%${filters.q}%`);
      if (isUuid(filters.q)) parts.push(`id.eq.${filters.q}`);
      if (profileIds.length) parts.push(`user_id.in.(${profileIds.join(",")})`);
      query = parts.length ? query.or(parts.join(",")) : query.eq("id", NO_MATCH_ID);
    }
  }

  return options.count ? query : query.range(options.offset, options.offset + options.limit - 1);
}

export async function countExportRows(
  admin: SupabaseClient,
  kind: ExportKind,
  filters: ExportFilters
): Promise<number | null> {
  const { count, error } = await filteredQuery(admin, kind, filters, { count: true });
  if (error) return null;
  return Number(count || 0);
}

// PostgREST menerima filter in() lewat query string; 1.000 UUID sekaligus bisa
// melewati batas panjang URL, jadi lookup pendamping dipecah menjadi potongan kecil.
const LOOKUP_CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function attachProfiles(admin: SupabaseClient, rows: ExportRow[]): Promise<ExportRow[]> {
  const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  if (!ids.length) return rows.map((row) => ({ ...row, profiles: null }));
  const map = new Map<string, { full_name: string | null; email: string | null }>();
  for (const group of chunk(ids, LOOKUP_CHUNK_SIZE)) {
    const { data } = await admin.from("profiles").select("id, full_name, email").in("id", group);
    for (const profile of data || []) map.set(profile.id, profile);
  }
  return rows.map((row) => ({ ...row, profiles: map.get(row.user_id) || null }));
}

async function attachBalances(admin: SupabaseClient, rows: ExportRow[]): Promise<ExportRow[]> {
  const ids = [...new Set(rows.map((row) => row.id).filter(Boolean))];
  if (!ids.length) return rows;
  const map = new Map<string, number>();
  for (const group of chunk(ids, LOOKUP_CHUNK_SIZE)) {
    const { data } = await admin.from("wallets").select("user_id, balance").in("user_id", group);
    for (const wallet of data || []) map.set(wallet.user_id, Number(wallet.balance) || 0);
  }
  return rows.map((row) => ({ ...row, balance: map.get(row.id) || 0 }));
}

async function fetchExportPage(
  admin: SupabaseClient,
  kind: ExportKind,
  filters: ExportFilters,
  offset: number,
  limit: number
): Promise<ExportRow[] | null> {
  const { data, error } = await filteredQuery(admin, kind, filters, { count: false, offset, limit });
  if (error) return null;
  const rows = (data || []) as ExportRow[];
  if (kind === "users") return attachBalances(admin, rows);
  if (kind === "orders" || kind === "topups") return attachProfiles(admin, rows);
  return rows;
}

async function recordExportAudit(
  admin: SupabaseClient,
  userId: string,
  kind: ExportKind,
  filters: ExportFilters,
  rowCount: number,
  columns: string[]
): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      actor_id: userId,
      action: "admin.export",
      target_type: "export",
      target_id: kind,
      metadata: {
        kind,
        label: EXPORT_TITLES[kind],
        from: filters.from,
        to: filters.to,
        status: filters.status || null,
        search: filters.q || null,
        row_count: rowCount,
        columns,
        format: "csv",
      },
    });
  } catch {
    // Audit tidak boleh menggagalkan ekspor yang sudah lolos izin.
  }
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ message }, { status });
}

/** Dipakai route handler ekspor dan alias lama /api/admin/finance/export. */
export async function handleAdminExport(
  request: Request,
  kindParam: string
): Promise<Response> {
  if (!isExportKind(kindParam)) return jsonError("Jenis ekspor tidak dikenal.", 404);
  const kind = kindParam;

  const url = new URL(request.url);
  const range = parseExportRange(url.searchParams.get("from"), url.searchParams.get("to"));
  if (!range.ok) return jsonError(range.message, 400);

  const status = String(url.searchParams.get("status") || "").trim();
  if (status && !EXPORT_STATUS_OPTIONS[kind].some((option) => option.value === status)) {
    return jsonError("Filter status tidak dikenal.", 400);
  }
  const q = normalizeExportSearch(url.searchParams.get("q"));

  const authorized = await authorizeExport(kind);
  if (!authorized.ok) return jsonError(authorized.message, authorized.status);

  const filters: ExportFilters = {
    from: range.from,
    to: range.to,
    startIso: range.startIso,
    endIso: range.endIso,
    status,
    q,
  };
  const { admin, userId } = authorized;

  let total: number | null;
  try {
    total = await countExportRows(admin, kind, filters);
  } catch {
    total = null;
  }
  if (total === null) {
    return jsonError("Data belum bisa dimuat. Coba lagi sebentar lagi.", 503);
  }
  if (total > EXPORT_MAX_ROWS) return jsonError(exportRowLimitMessage(total), 413);

  const columns = exportColumns(kind);
  await recordExportAudit(admin, userId, kind, filters, total, columns.map((column) => column.header));

  const headerLine = csvHeader(columns);
  const utf8 = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (text: string) => controller.enqueue(utf8.encode(text));
      try {
        enqueue(`\uFEFF${headerLine}\r\n`);
        let offset = 0;
        while (offset < EXPORT_MAX_ROWS) {
          const limit = Math.min(EXPORT_BATCH_SIZE, EXPORT_MAX_ROWS - offset);
          const rows = await fetchExportPage(admin, kind, filters, offset, limit);
          if (!rows) {
            controller.error(new Error("export_failed"));
            return;
          }
          if (!rows.length) break;
          for (const row of rows) enqueue(`${csvLine(row, columns)}\r\n`);
          offset += rows.length;
          if (rows.length < limit) break;
        }
        controller.close();
      } catch {
        controller.error(new Error("export_failed"));
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(kind, range.from, range.to)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
