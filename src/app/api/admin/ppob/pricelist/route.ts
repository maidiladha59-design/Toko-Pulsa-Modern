import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrepaidPriceList, getPostpaidPriceList } from "@/lib/ppob/digiflazz";
import { resolvePricingRule, type PricingRule } from "@/lib/ppob/pricing";

type ProviderRow = {
  buyer_sku_code?: string;
  product_name?: string;
  category?: string;
  brand?: string;
  type?: string;
  price?: number;
  buyer_product_status?: boolean;
  seller_product_status?: boolean;
  [key: string]: unknown;
};

const CATEGORY_NAMES: Record<string, string> = {
  pulsa: "Pulsa", "paket-data": "Paket Data", "top-up-game": "Games", voucher: "Voucher", pln: "PLN",
  "china-topup": "China TOPUP", "malaysia-topup": "Malaysia TOPUP", "philippines-topup": "Philippines TOPUP",
  "singapore-topup": "Singapore TOPUP", "thailand-topup": "Thailand TOPUP", "sms-telpon": "Paket SMS & Telpon",
  "vietnam-topup": "Vietnam Topup", streaming: "Streaming", tv: "TV", "aktivasi-voucher": "Aktivasi Voucher",
  "masa-aktif": "Masa Aktif", bundling: "Bundling", "aktivasi-perdana": "Aktivasi Perdana", gas: "Gas",
  "media-sosial": "Media Sosial", hotel: "Hotel", "e-wallet": "E-Wallet", bpjs: "BPJS", internet: "Internet",
  pdam: "PDAM", pascabayar: "HP PASCABAYAR", "tagihan-lainnya": "Tagihan Lainnya", pbb: "PBB",
  "pln-pascabayar": "PLN PASCABAYAR", "hp-pascabayar": "HP PASCABAYAR", "internet-pascabayar": "INTERNET PASCABAYAR",
  "bpjs-kesehatan": "BPJS KESEHATAN", multifinance: "MULTIFINANCE", "gas-negara": "GAS NEGARA",
  "tv-pascabayar": "TV PASCABAYAR", samsat: "SAMSAT", "bpjs-ketenagakerjaan": "BPJS KETENAGAKERJAAN",
  "pln-nontaglis": "PLN NONTAGLIS", "telkomsel-omni": "Telkomsel Omni", "indosat-only4u": "Indosat Only4u",
  "tri-cuanmax": "Tri CuanMax", "xl-axis-cuanku": "XL Axis Cuanku", byu: "by.U",
};

// Kategori penampung untuk SKU yang kategorinya belum dikenali pemetaan.
const FALLBACK_CATEGORY = "tagihan-lainnya";

type ServiceKind = "prepaid" | "postpaid";
type SkipReason =
  | "invalid_data"
  | "price_zero"
  | "duplicate_sku"
  | "slug_collision"
  | "product_upsert_error"
  | "service_upsert_error";
const SKIP_REASONS: SkipReason[] = ["invalid_data", "price_zero", "duplicate_sku", "slug_collision", "product_upsert_error", "service_upsert_error"];

// Upsert dikirim per batch supaya ribuan SKU selesai dalam belasan query, bukan
// 3 query per SKU — loop satu-per-satu lama akan terpotong batas waktu Vercel
// di tengah daftar dan produk di belakangnya tidak pernah tersinkron.
const UPSERT_BATCH = 250;
const SELECT_PAGE = 1000;
const SAMPLE_LIMIT = 15;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function normalizeCategory(row: ProviderRow, serviceKind: ServiceKind) {
  const raw = `${row.category || ""} ${row.brand || ""} ${row.product_name || ""}`.toLowerCase().trim();
  const c = slugify(row.category || "");

  const exact: Array<[RegExp, string]> = [
    [/china[ _-]*top.?up/, "china-topup"], [/malaysia[ _-]*top.?up/, "malaysia-topup"], [/philippines[ _-]*top.?up/, "philippines-topup"],
    [/singapore[ _-]*top.?up/, "singapore-topup"], [/thailand[ _-]*top.?up/, "thailand-topup"], [/vietnam[ _-]*top.?up/, "vietnam-topup"],
    [/paket\s*sms|sms.*telp|sms.*telepon|telp.*sms/, "sms-telpon"], [/aktivasi.*voucher/, "aktivasi-voucher"], [/masa.*aktif/, "masa-aktif"],
    [/bundling/, "bundling"], [/aktivasi.*perdana/, "aktivasi-perdana"], [/media\s*sosial|social\s*media/, "media-sosial"], [/hotel/, "hotel"],
    [/telkomsel.*omni|omni.*telkomsel/, "telkomsel-omni"], [/indosat.*only4u|only4u/, "indosat-only4u"], [/tri.*cuanmax|cuanmax/, "tri-cuanmax"],
    [/xl.*axis.*cuanku|axis.*cuanku|cuanku/, "xl-axis-cuanku"], [/by[._-]?u/, "byu"],
  ];
  for (const [pattern, slug] of exact) if (pattern.test(raw)) return slug;

  if (serviceKind === "postpaid") {
    if (/pln.*(nontaglis|non.?taglis)/.test(raw)) return "pln-nontaglis";
    if (/pln|listrik/.test(raw)) return "pln-pascabayar";
    if (/pdam|air minum|air daerah/.test(raw)) return "pdam";
    if (/bpjs.*kesehatan/.test(raw)) return "bpjs-kesehatan";
    if (/bpjs.*ketenagakerjaan|ketenagakerjaan/.test(raw)) return "bpjs-ketenagakerjaan";
    if (/multifinance|finance|kredit|cicilan/.test(raw)) return "multifinance";
    if (/gas.*negara|pgas|perusahaan gas/.test(raw)) return "gas-negara";
    if (/tv|vision|transvision|mnc play|k-vision|nex parabola/.test(raw)) return "tv-pascabayar";
    if (/samsat|pajak kendaraan|kendaraan bermotor/.test(raw)) return "samsat";
    if (/pbb|pajak bumi|pajak daerah/.test(raw)) return "pbb";
    if (/internet|indihome|wifi|myrepublic|cbn|first media|iconnet/.test(raw)) return "internet-pascabayar";
    if (/telepon|hp|telkom|indosat|xl|tri|smartfren|axis|byu/.test(raw)) return "hp-pascabayar";
    return FALLBACK_CATEGORY;
  }

  if (/voucher/.test(c) && !/aktivasi/.test(raw)) return "voucher";
  if (/streaming|netflix|spotify|viu|vidio|disney|youtube premium/.test(raw)) return "streaming";
  if (/tv|k-vision|nex parabola|transvision/.test(raw)) return "tv";
  if (/gas/.test(raw)) return "gas";
  if (/pln|listrik|token/.test(raw)) return "pln";
  if (/game|games|mobile legends|mlbb|free fire|pubg|valorant|steam|garena|genshin/.test(raw)) return "top-up-game";
  if (/e-money|e money|ewallet|e-wallet|ovo|dana|gopay|shopeepay|linkaja|brizzi|tapcash|mandiri e/.test(raw)) return "e-wallet";
  if (/data|internet|kuota|axis bronet|indosat freedom|telkomsel combo|byu|tri happy/.test(raw)) return "paket-data";
  if (/pulsa|regular|reguler|transfer pulsa/.test(raw)) return "pulsa";
  if (/china|malaysia|philippines|singapore|thailand|vietnam/.test(c)) {
    if (/china/.test(c)) return "china-topup"; if (/malaysia/.test(c)) return "malaysia-topup"; if (/philippines/.test(c)) return "philippines-topup"; if (/singapore/.test(c)) return "singapore-topup"; if (/thailand/.test(c)) return "thailand-topup"; if (/vietnam/.test(c)) return "vietnam-topup";
  }
  return FALLBACK_CATEGORY;
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type PreparedRow = {
  sku: string;
  productSlug: string;
  product: Record<string, unknown>;
  service: Record<string, unknown>;
};

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  let body: { marginPercent?: number; activate?: boolean } = {};
  try { body = await request.json(); } catch {}
  const marginPercent = Math.min(100, Math.max(0, Number(body.marginPercent ?? 10)));
  const activate = body.activate !== false;

  const admin = createAdminClient();
  const { data: syncLog } = await admin.from("ppob_provider_syncs").insert({ provider: "digiflazz", kind: "all", status: "RUNNING", created_by: user.id }).select("id").single();
  const syncId = syncLog?.id ?? null;

  // Kolom v87 dicek sekali: kalau migrasinya belum dijalankan, sinkronisasi tetap
  // jalan penuh — hanya progres/detailnya tidak dipersist ke log.
  let logHasV87 = true;
  if (syncId) {
    const { error: probe } = await admin.from("ppob_provider_syncs").update({ processed_count: 0 }).eq("id", syncId);
    if (probe) logHasV87 = false;
  }

  const skippedReasons: Record<string, number> = {};
  for (const reason of SKIP_REASONS) skippedReasons[reason] = 0;
  const skippedSamples: Record<string, string[]> = {};
  const fallbackCategories = new Set<string>();
  let fallbackCategoryCount = 0;

  function skip(reason: SkipReason, sku: string) {
    skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
    const list = skippedSamples[reason] || (skippedSamples[reason] = []);
    if (sku && list.length < SAMPLE_LIMIT && !list.includes(sku)) list.push(sku);
  }

  const summary = { fetched: 0, processed: 0, created: 0, updated: 0, skipped: 0 };

  async function persistProgress(status: "RUNNING" | "SUCCESS" | "FAILED", processedSoFar: number, errorMessage?: string | null) {
    if (!syncId) return;
    const payload: Record<string, unknown> = {
      fetched: summary.fetched,
      created_count: summary.created,
      updated_count: summary.updated,
      skipped_count: summary.skipped,
      status,
    };
    if (errorMessage != null) payload.error_message = String(errorMessage).slice(0, 500);
    if (status !== "RUNNING") payload.finished_at = new Date().toISOString();
    if (logHasV87) {
      payload.processed_count = processedSoFar;
      if (status !== "RUNNING") {
        payload.details = {
          skippedReasons, skippedSamples,
          fallbackCategory: { count: fallbackCategoryCount, categories: [...fallbackCategories].slice(0, SAMPLE_LIMIT) },
        };
      }
    }
    try { await admin.from("ppob_provider_syncs").update(payload).eq("id", syncId); } catch {}
  }

  try {
    const [prepaid, postpaid, rulesResult] = await Promise.all([getPrepaidPriceList(), getPostpaidPriceList(), admin.from("ppob_pricing_rules").select("*").eq("is_active", true)]);
    // Respons bukan array berarti provider menolak / error — tidak boleh dianggap
    // "0 SKU" karena itu menyembunyikan kegagalan sinkronisasi.
    if (!Array.isArray(prepaid?.data) || !Array.isArray(postpaid?.data)) throw new Error("DIGIFLAZZ_RESPONSE_INVALID");
    const pricingRules = ((rulesResult.data || []) as any[]).map((r) => ({ ...r, fee_value: Number(r.fee_value), min_fee: r.min_fee == null ? null : Number(r.min_fee), max_fee: r.max_fee == null ? null : Number(r.max_fee), min_amount: r.min_amount == null ? 0 : Number(r.min_amount), max_amount: r.max_amount == null ? null : Number(r.max_amount), priority: Number(r.priority || 0) })) as PricingRule[];

    const rows: Array<{ row: ProviderRow; serviceKind: ServiceKind }> = [];
    for (const row of prepaid.data as ProviderRow[]) rows.push({ row, serviceKind: "prepaid" });
    for (const row of postpaid.data as ProviderRow[]) rows.push({ row, serviceKind: "postpaid" });
    summary.fetched = rows.length;

    // Tahap 1 — validasi, normalisasi kategori, dan pricing sepenuhnya di memori
    // (mengikuti logika lama, tanpa query per baris).
    const now = new Date().toISOString();
    const prepared: PreparedRow[] = [];
    const seenSku = new Set<string>();
    const slugOwner = new Map<string, string>();
    const neededCategories = new Set<string>();

    for (const item of rows) {
      const r = item.row;
      const sku = String(r.buyer_sku_code || "").trim();
      const name = String(r.product_name || r.brand || sku).trim();
      const providerBase = safeNumber(r.price);
      if (!sku || !name) { skip("invalid_data", sku || name); continue; }
      if (item.serviceKind === "prepaid" && providerBase <= 0) { skip("price_zero", sku); continue; }
      if (seenSku.has(sku)) { skip("duplicate_sku", sku); continue; }

      const category = normalizeCategory(r, item.serviceKind);
      if (category === FALLBACK_CATEGORY) {
        fallbackCategoryCount++;
        const rawCategory = String(r.category || "").trim();
        if (rawCategory) fallbackCategories.add(rawCategory);
      }

      const productSlug = `ppob-${slugify(sku)}`;
      const owner = slugOwner.get(productSlug);
      if (owner && owner !== sku) { skip("slug_collision", sku); continue; }

      seenSku.add(sku);
      slugOwner.set(productSlug, sku);
      neededCategories.add(category);

      const resolved = resolvePricingRule(pricingRules, { category, brand: String(r.brand || ""), sku, amount: providerBase });
      const fallbackFee = Math.max(0, Math.round(providerBase * marginPercent / 100));
      const aidilFee = resolved.rule ? resolved.fee : fallbackFee;
      const sellingPrice = providerBase > 0 ? providerBase + aidilFee : 0;
      const activeFromProvider = r.buyer_product_status !== false && r.seller_product_status !== false;
      const brandSuffix = r.brand && !name.toLowerCase().includes(String(r.brand).toLowerCase()) ? ` - ${r.brand}` : "";
      const targetSchema = item.serviceKind === "postpaid"
        ? { fields: [{ name: "customer_no", label: "Nomor Pelanggan", type: "text", required: true }] }
        : { fields: [{ name: "customer_no", label: category === "pln" ? "ID Pelanggan / No. Meter" : "Nomor Tujuan", type: "text", required: true }] };

      prepared.push({
        sku,
        productSlug,
        product: {
          name: `${name}${brandSuffix}`.slice(0, 240),
          slug: productSlug,
          description: `Layanan PPOB ${CATEGORY_NAMES[category] || category}. SKU provider: ${sku}.`,
          price: sellingPrice,
          category_id: null,
          product_type: "ppob",
          stock: null,
          is_active: activate ? activeFromProvider : false,
          updated_at: now,
        },
        service: {
          provider: "digiflazz",
          provider_sku: sku,
          service_kind: item.serviceKind,
          category,
          brand: r.brand || null,
          cost_price: providerBase,
          provider_admin: safeNumber(r.admin),
          provider_selling_price: safeNumber(r.selling_price) || providerBase,
          margin: aidilFee,
          pricing_rule_id: resolved.rule?.id || null,
          target_schema: targetSchema,
          provider_active: activeFromProvider,
          updated_at: now,
        },
      });
    }
    summary.processed = prepared.length;

    // Tahap 2 — selesaikan kategori dalam beberapa query (bukan per SKU).
    const categoryIdBySlug = new Map<string, string>();
    const neededList = [...neededCategories];
    for (const part of chunk(neededList, 100)) {
      const { data: existingCats } = await admin.from("categories").select("id,slug").in("slug", part);
      for (const c of existingCats || []) categoryIdBySlug.set(c.slug, c.id);
    }
    const missingCats = neededList.filter((slug) => !categoryIdBySlug.has(slug));
    if (missingCats.length) {
      const { data: insertedCats } = await admin.from("categories").upsert(
        missingCats.map((slug) => ({ name: CATEGORY_NAMES[slug] || slug, slug })),
        { onConflict: "slug", ignoreDuplicates: true }
      ).select("id,slug");
      for (const c of insertedCats || []) categoryIdBySlug.set(c.slug, c.id);
    }
    for (const p of prepared) p.product.category_id = categoryIdBySlug.get(String(p.service.category)) || null;

    // Tahap 3 — daftar slug produk PPOB yang sudah ada (paginasi; PostgREST
    // membatasi 1000 baris per query) untuk membedakan "baru" vs "diperbarui".
    const existingProductSlugs = new Set<string>();
    for (let offset = 0; ; offset += SELECT_PAGE) {
      const { data: page } = await admin.from("products").select("slug").eq("product_type", "ppob").range(offset, offset + SELECT_PAGE - 1);
      const pageRows = page || [];
      for (const p of pageRows) existingProductSlugs.add(p.slug);
      if (pageRows.length < SELECT_PAGE) break;
    }

    // Tahap 4 — upsert products per batch; id hasil upsert dipakai ppob_services.
    const slugToProductId = new Map<string, string>();
    let handled = 0;
    for (const batch of chunk(prepared, UPSERT_BATCH)) {
      const payloads = batch.map((p) => p.product);
      const { data: upserted, error } = await admin.from("products").upsert(payloads, { onConflict: "slug" }).select("id,slug");
      if (error || !upserted || upserted.length !== payloads.length) {
        // Satu baris bermasalah membatalkan satu statement batch; ulangi
        // satu-per-satu supaya baris sehat tetap masuk dan yang bermasalah
        // tercatat sebagai dilewati.
        for (const p of batch) {
          const { data: one } = await admin.from("products").upsert([p.product], { onConflict: "slug" }).select("id,slug").maybeSingle();
          if (one?.id) slugToProductId.set(p.productSlug, one.id);
          else skip("product_upsert_error", p.sku);
        }
      } else {
        for (const row of upserted) slugToProductId.set(row.slug, row.id);
      }
      handled += batch.length;
      await persistProgress("RUNNING", handled);
    }

    // Tahap 5 — upsert ppob_services per batch dengan kunci provider,provider_sku.
    const serviceOk = new Set<string>();
    const withProduct = prepared.filter((p) => slugToProductId.has(p.productSlug));
    for (const batch of chunk(withProduct, UPSERT_BATCH)) {
      const payloads = batch.map((p) => ({ ...p.service, product_id: slugToProductId.get(p.productSlug) }));
      const { error } = await admin.from("ppob_services").upsert(payloads, { onConflict: "provider,provider_sku" });
      if (error) {
        for (const p of batch) {
          const { error: oneError } = await admin.from("ppob_services").upsert({ ...p.service, product_id: slugToProductId.get(p.productSlug) }, { onConflict: "provider,provider_sku" });
          if (oneError) skip("service_upsert_error", p.sku);
          else serviceOk.add(p.sku);
        }
      } else {
        for (const p of batch) serviceOk.add(p.sku);
      }
    }

    for (const p of prepared) {
      if (!serviceOk.has(p.sku)) continue;
      if (existingProductSlugs.has(p.productSlug)) summary.updated++;
      else summary.created++;
    }
    summary.skipped = summary.fetched - summary.created - summary.updated;

    await persistProgress("SUCCESS", summary.processed);
    return NextResponse.json({
      ok: true,
      fetched: summary.fetched,
      processed: summary.processed,
      created: summary.created,
      updated: summary.updated,
      saved: summary.created + summary.updated,
      skipped: summary.skipped,
      skippedReasons,
      skippedSamples,
      fallbackCategory: { count: fallbackCategoryCount, categories: [...fallbackCategories].slice(0, SAMPLE_LIMIT) },
      marginPercent,
      activate,
    });
  } catch (error: any) {
    const message = error?.message === "DIGIFLAZZ_RESPONSE_INVALID"
      ? "Respons pricelist Digiflazz tidak valid — sinkronisasi dibatalkan."
      : error?.message === "DIGIFLAZZ_TIMEOUT"
        ? "Provider Digiflazz tidak merespons dalam waktu yang ditentukan."
        : error?.message || "Gagal sinkronisasi PPOB.";
    await persistProgress("FAILED", summary.processed, `${message} (diproses ${summary.processed}/${summary.fetched} SKU sebelum gagal)`);
    return NextResponse.json({
      message,
      fetched: summary.fetched,
      processed: summary.processed,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
    }, { status: 502 });
  }
}
