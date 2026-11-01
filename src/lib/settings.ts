import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BANNER_CACHE_TAGS,
  CATALOG_CACHE_TAGS,
  allSettingsCacheTags,
  getManagedSetting,
  settingCacheTags,
  type ManagedSettingDefinition,
  type ManagedSettingState,
  type SettingHistoryEntry,
} from "@/lib/managed-settings";

// Sisi server "Pengaturan Terkelola" (migrasi v105).
//  - getSetting: cache() per request + unstable_cache lintas request dengan
//    tag "settings:<key>". Gagal/kosong selalu mengembalikan default.
//  - Fungsi admin memakai service role dan RPC dengan pemeriksaan versi.

const readers = new Map<string, () => Promise<Record<string, unknown> | null>>();

// Fallback ke default tidak boleh terjadi diam-diam: tanpa log, nilai terbit
// yang rusak/kosong terlihat sama dengan nilai default dan sulit dilacak.
function logSettingFallback(key: string, reason: string, detail?: unknown): void {
  if (detail === undefined) {
    console.error(`[settings] ${key}: ${reason}. Memakai nilai default.`);
  } else {
    console.error(`[settings] ${key}: ${reason}. Memakai nilai default.`, detail);
  }
}

function readerFor(key: string): () => Promise<Record<string, unknown> | null> {
  let reader = readers.get(key);
  if (!reader) {
    const def = getManagedSetting(key);
    const tags = settingCacheTags(key);
    const publicRead = Boolean(def?.publicRead);
    reader = unstable_cache(
      async (): Promise<Record<string, unknown> | null> => {
        if (!publicRead) return null;
        try {
          const sb = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
              auth: { autoRefreshToken: false, persistSession: false },
              global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
            }
          );
          const { data, error } = await sb
            .from("site_settings")
            .select("value")
            .eq("key", key)
            .maybeSingle();
          if (error) {
            console.error(`[settings] ${key}: gagal membaca site_settings.`, error.message);
            return null;
          }
          if (!data?.value) return null;
          return data.value as Record<string, unknown>;
        } catch (error) {
          console.error(`[settings] ${key}: gagal membaca site_settings.`, error);
          return null;
        }
      },
      ["managed-setting", key],
      { revalidate: 60, tags }
    );
    readers.set(key, reader);
  }
  return reader;
}

const readSettingOnce = cache(async (key: string) => readerFor(key)());

/**
 * Baca pengaturan privat (publicRead:false) memakai service role.
 * Dipakai mesin notifikasi; tidak pernah dipanggil dari komponen client.
 */
export async function getAdminSetting<T>(key: string, defaults: T): Promise<T> {
  const def = getManagedSetting(key);
  if (!def) {
    logSettingFallback(key, "pengaturan tidak terdaftar");
    return defaults;
  }
  const raw = await adminReaderFor(key)();
  if (!raw) {
    logSettingFallback(key, "nilai terbit tidak terbaca");
    return defaults;
  }
  try {
    const merged = { ...(defaults as Record<string, unknown>), ...raw };
    const parsed = def.schema.safeParse(merged);
    if (!parsed.success) {
      logSettingFallback(
        key,
        "nilai terbit tidak lolos validasi",
        parsed.error.issues.map((issue) => issue.message)
      );
      return defaults;
    }
    return (def.normalize ? def.normalize(parsed.data) : parsed.data) as T;
  } catch (error) {
    logSettingFallback(key, "gagal menormalkan nilai terbit", error);
    return defaults;
  }
}

const adminReaders = new Map<string, () => Promise<Record<string, unknown> | null>>();

function adminReaderFor(key: string): () => Promise<Record<string, unknown> | null> {
  let reader = adminReaders.get(key);
  if (!reader) {
    const tags = settingCacheTags(key);
    reader = unstable_cache(
      async (): Promise<Record<string, unknown> | null> => {
        try {
          const { data, error } = await createAdminClient()
            .from("site_settings")
            .select("value")
            .eq("key", key)
            .maybeSingle();
          if (error) {
            console.error(`[settings] ${key}: gagal membaca site_settings.`, error.message);
            return null;
          }
          if (!data?.value) return null;
          return data.value as Record<string, unknown>;
        } catch (error) {
          console.error(`[settings] ${key}: gagal membaca site_settings.`, error);
          return null;
        }
      },
      ["managed-setting-admin", key],
      { revalidate: 60, tags }
    );
    adminReaders.set(key, reader);
  }
  return reader;
}

/**
 * Baca pengaturan publik dengan default aman.
 * Tidak pernah melempar error ke pemanggil: data rusak/kosong = defaults.
 */
export async function getSetting<T>(key: string, defaults: T): Promise<T> {
  const raw = await readSettingOnce(key);
  if (!raw) {
    logSettingFallback(key, "nilai terbit tidak terbaca");
    return defaults;
  }
  const def = getManagedSetting(key);
  try {
    const merged = { ...(defaults as Record<string, unknown>), ...raw };
    if (!def) {
      logSettingFallback(key, "pengaturan tidak terdaftar");
      return merged as T;
    }
    const parsed = def.schema.safeParse(merged);
    if (!parsed.success) {
      logSettingFallback(
        key,
        "nilai terbit tidak lolos validasi",
        parsed.error.issues.map((issue) => issue.message)
      );
      return defaults;
    }
    return (def.normalize ? def.normalize(parsed.data) : parsed.data) as T;
  } catch (error) {
    logSettingFallback(key, "gagal menormalkan nilai terbit", error);
    return defaults;
  }
}

// =========================================================
// State admin
// =========================================================

type SettingRow = {
  key: string;
  value: Record<string, unknown> | null;
  draft: Record<string, unknown> | null;
  version: number;
  updated_at: string | null;
  updated_by: string | null;
  draft_updated_at: string | null;
  draft_updated_by: string | null;
};

export class SettingConflictError extends Error {
  constructor() {
    super("SETTING_VERSION_CONFLICT");
    this.name = "SettingConflictError";
  }
}

export class SettingNotFoundError extends Error {
  constructor() {
    super("SETTING_NOT_FOUND");
    this.name = "SettingNotFoundError";
  }
}

export class SettingHistoryNotFoundError extends Error {
  constructor() {
    super("SETTING_HISTORY_NOT_FOUND");
    this.name = "SettingHistoryNotFoundError";
  }
}

function mapRpcError(message: string): never {
  if (message.includes("SETTING_VERSION_CONFLICT")) throw new SettingConflictError();
  if (message.includes("SETTING_HISTORY_NOT_FOUND")) throw new SettingHistoryNotFoundError();
  if (message.includes("SETTING_NOT_FOUND")) throw new SettingNotFoundError();
  throw new Error("SETTING_WRITE_FAILED");
}

async function withRow(key: string) {
  const def = getManagedSetting(key);
  if (!def) throw new SettingNotFoundError();
  const admin = createAdminClient();
  const select = () =>
    admin
      .from("site_settings")
      .select("key,value,draft,version,updated_at,updated_by,draft_updated_at,draft_updated_by")
      .eq("key", key)
      .maybeSingle();

  let { data, error } = await select();
  if (error) throw new Error("SETTING_READ_FAILED");
  if (!data) {
    const { error: insertError } = await admin.from("site_settings").upsert(
      { key, value: def.defaults, version: 1 },
      { onConflict: "key", ignoreDuplicates: true }
    );
    if (insertError) throw new Error("SETTING_WRITE_FAILED");
    const again = await select();
    if (again.error) throw new Error("SETTING_READ_FAILED");
    data = again.data;
  }
  if (!data) throw new SettingNotFoundError();
  return { admin, def, row: data as SettingRow };
}

function normalizeForState(
  def: ManagedSettingDefinition,
  value: Record<string, unknown> | null
): Record<string, unknown> {
  if (!value) return { ...def.defaults };
  try {
    const merged = { ...def.defaults, ...value };
    const parsed = def.schema.safeParse(merged);
    if (!parsed.success) {
      console.error(
        `[settings] ${def.key}: nilai tersimpan tidak lolos validasi; ditampilkan apa adanya.`,
        parsed.error.issues.map((issue) => issue.message)
      );
      return value;
    }
    return (def.normalize ? def.normalize(parsed.data) : parsed.data) as Record<string, unknown>;
  } catch (error) {
    console.error(`[settings] ${def.key}: gagal menormalkan nilai tersimpan.`, error);
    return value;
  }
}

export async function loadSettingState(key: string): Promise<ManagedSettingState> {
  const { admin, def, row } = await withRow(key);

  const { data: historyRows, error: historyError } = await admin
    .from("site_settings_history")
    .select("id,value,version,action,created_at,created_by")
    .eq("key", key)
    .order("created_at", { ascending: false })
    .limit(30);
  if (historyError) throw new Error("SETTING_HISTORY_READ_FAILED");

  const actorIds = [
    ...new Set(
      (historyRows || [])
        .map((entry: any) => (entry.created_by ? String(entry.created_by) : ""))
        .filter(Boolean)
    ),
  ];
  const names = new Map<string, string | null>();
  if (actorIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", actorIds);
    for (const profile of profiles || []) {
      names.set(
        String(profile.id),
        String(profile.full_name || "").trim() || String(profile.email || "").trim() || null
      );
    }
  }

  const history: SettingHistoryEntry[] = (historyRows || []).map((entry: any) => ({
    id: Number(entry.id),
    value: (entry.value || {}) as Record<string, unknown>,
    version: Number(entry.version || 0),
    action: entry.action === "restore" ? "restore" : "publish",
    created_at: String(entry.created_at),
    created_by: entry.created_by ? String(entry.created_by) : null,
    created_by_name: entry.created_by ? names.get(String(entry.created_by)) ?? null : null,
  }));

  return {
    key,
    label: def.label,
    permission: def.permission,
    published: normalizeForState(def, row.value),
    draft: row.draft ? normalizeForState(def, row.draft) : null,
    version: Number(row.version || 1),
    hasDraft: Boolean(row.draft),
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    draft_updated_at: row.draft_updated_at,
    draft_updated_by: row.draft_updated_by,
    history,
  };
}

// =========================================================
// Aksi tulis (dipanggil hanya dari route handler admin)
// =========================================================

export async function saveSettingDraft(
  key: string,
  value: Record<string, unknown>,
  baseVersion: number,
  actorId: string
): Promise<ManagedSettingState> {
  const { admin } = await withRow(key);
  const { error } = await admin.rpc("save_site_setting_draft", {
    p_key: key,
    p_value: value,
    p_base_version: baseVersion,
    p_actor: actorId,
  });
  if (error) mapRpcError(error.message);
  return loadSettingState(key);
}

export async function publishSetting(
  key: string,
  value: Record<string, unknown>,
  baseVersion: number,
  actorId: string
): Promise<ManagedSettingState> {
  const { admin } = await withRow(key);
  const { error } = await admin.rpc("publish_site_setting", {
    p_key: key,
    p_value: value,
    p_base_version: baseVersion,
    p_actor: actorId,
  });
  if (error) mapRpcError(error.message);
  return loadSettingState(key);
}

export async function discardSettingDraft(
  key: string,
  baseVersion: number,
  actorId: string
): Promise<ManagedSettingState> {
  const { admin } = await withRow(key);
  const { error } = await admin.rpc("discard_site_setting_draft", {
    p_key: key,
    p_base_version: baseVersion,
    p_actor: actorId,
  });
  if (error) mapRpcError(error.message);
  return loadSettingState(key);
}

export async function restoreSettingVersion(
  key: string,
  historyId: number,
  baseVersion: number,
  actorId: string
): Promise<ManagedSettingState> {
  const { admin } = await withRow(key);
  const { error } = await admin.rpc("restore_site_setting_version", {
    p_key: key,
    p_history_id: historyId,
    p_base_version: baseVersion,
    p_actor: actorId,
  });
  if (error) mapRpcError(error.message);
  return loadSettingState(key);
}

// =========================================================
// Cache + audit
// =========================================================

/** Invalidasi satu kunci; mengembalikan tag yang dipakai (untuk respons API). */
export function revalidateSetting(key: string): string[] {
  const tags = settingCacheTags(key);
  for (const tag of tags) revalidateTag(tag);
  return tags;
}

/** Bersihkan semua tag settings + katalog + banner. */
export function clearAllCaches(): string[] {
  const tags = [
    ...new Set([...allSettingsCacheTags(), ...CATALOG_CACHE_TAGS, ...BANNER_CACHE_TAGS]),
  ];
  for (const tag of tags) revalidateTag(tag);
  return tags;
}

export async function recordSettingAudit(
  actorId: string,
  action: string,
  key: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await createAdminClient().from("audit_logs").insert({
      actor_id: actorId,
      action,
      target_type: "site_settings",
      target_id: key,
      metadata,
    });
    if (error) {
      console.error(`[settings] ${key}: gagal menulis audit ${action}.`, error.message);
    }
  } catch (error) {
    // Audit tidak boleh menggagalkan aksi utama, tetapi kegagalannya wajib terlihat.
    console.error(`[settings] ${key}: gagal menulis audit ${action}.`, error);
  }
}

export async function recordSystemAudit(
  actorId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await createAdminClient().from("audit_logs").insert({
      actor_id: actorId,
      action,
      target_type: "system",
      target_id: "cache",
      metadata,
    });
    if (error) {
      console.error(`[settings] system: gagal menulis audit ${action}.`, error.message);
    }
  } catch (error) {
    // Sama seperti recordSettingAudit: aksi utama tidak dibatalkan.
    console.error(`[settings] system: gagal menulis audit ${action}.`, error);
  }
}
