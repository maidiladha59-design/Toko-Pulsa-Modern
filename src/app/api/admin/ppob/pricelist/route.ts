import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrepaidPriceList, getPostpaidPriceList } from "@/lib/ppob/digiflazz";
import { calculateRuleFee, resolvePricingRule, type PricingRule } from "@/lib/ppob/pricing";

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

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function normalizeCategory(row: ProviderRow, serviceKind: "prepaid" | "postpaid") {
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
    return "tagihan-lainnya";
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
  return "tagihan-lainnya";
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

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

  try {
    const admin = createAdminClient();
    const { data: syncLog } = await admin.from("ppob_provider_syncs").insert({ provider: "digiflazz", kind: "all", status: "RUNNING", created_by: user.id }).select("id").single();
    const syncId = syncLog?.id;

    const [prepaid, postpaid, rulesResult] = await Promise.all([getPrepaidPriceList(), getPostpaidPriceList(), admin.from("ppob_pricing_rules").select("*").eq("is_active", true)]);
    const pricingRules = ((rulesResult.data || []) as any[]).map((r) => ({ ...r, fee_value: Number(r.fee_value), min_fee: r.min_fee == null ? null : Number(r.min_fee), max_fee: r.max_fee == null ? null : Number(r.max_fee), min_amount: r.min_amount == null ? 0 : Number(r.min_amount), max_amount: r.max_amount == null ? null : Number(r.max_amount), priority: Number(r.priority || 0) })) as PricingRule[];
    const rows: Array<{ row: ProviderRow; serviceKind: "prepaid" | "postpaid" }> = [];
    for (const row of (Array.isArray(prepaid.data) ? prepaid.data : [])) rows.push({ row: row as ProviderRow, serviceKind: "prepaid" });
    for (const row of (Array.isArray(postpaid.data) ? postpaid.data : [])) rows.push({ row: row as ProviderRow, serviceKind: "postpaid" });

    const categoryCache = new Map<string, string>();
    let created = 0, updated = 0, skipped = 0;

    for (const item of rows) {
      const r = item.row;
      const sku = String(r.buyer_sku_code || "").trim();
      const name = String(r.product_name || r.brand || sku).trim();
      const providerBase = item.serviceKind === "postpaid" ? safeNumber(r.price) : safeNumber(r.price);
      if (!sku || !name || (item.serviceKind === "prepaid" && providerBase <= 0)) { skipped++; continue; }
      const category = normalizeCategory(r, item.serviceKind);
      let categoryId = categoryCache.get(category);
      if (!categoryId) {
        const slug = category;
        const { data: existing } = await admin.from("categories").select("id").eq("slug", slug).maybeSingle();
        if (existing?.id) categoryId = existing.id;
        else {
          const { data: inserted, error } = await admin.from("categories").insert({ name: CATEGORY_NAMES[category] || category, slug }).select("id").single();
          if (error) {
            const { data: retry } = await admin.from("categories").select("id").eq("slug", slug).maybeSingle();
            categoryId = retry?.id;
          } else categoryId = inserted?.id;
        }
        if (categoryId) categoryCache.set(category, categoryId);
      }

      const productSlug = `ppob-${slugify(sku)}`;
      const ruleInputAmount = providerBase;
      const resolved = resolvePricingRule(pricingRules, { category, brand: String(r.brand || ""), sku, amount: ruleInputAmount });
      const fallbackFee = Math.max(0, Math.round(providerBase * marginPercent / 100));
      const aidilFee = resolved.rule ? resolved.fee : fallbackFee;
      const sellingPrice = providerBase > 0 ? providerBase + aidilFee : 0;
      const activeFromProvider = r.buyer_product_status !== false && r.seller_product_status !== false;
      const productPayload = {
        name: `${name}${r.brand && !name.toLowerCase().includes(String(r.brand).toLowerCase()) ? ` - ${r.brand}` : ""}`.slice(0, 240),
        slug: productSlug,
        description: `Layanan PPOB ${CATEGORY_NAMES[category] || category}. SKU provider: ${sku}.`,
        price: sellingPrice,
        category_id: categoryId || null,
        product_type: "ppob",
        stock: null,
        is_active: activate ? activeFromProvider : false,
        updated_at: new Date().toISOString(),
      };

      const { data: existingProduct } = await admin.from("products").select("id").eq("slug", productSlug).maybeSingle();
      let productId = existingProduct?.id as string | undefined;
      if (productId) {
        const { error } = await admin.from("products").update(productPayload).eq("id", productId);
        if (error) { skipped++; continue; }
        updated++;
      } else {
        const { data: inserted, error } = await admin.from("products").insert(productPayload).select("id").single();
        if (error || !inserted?.id) { skipped++; continue; }
        productId = inserted.id;
        created++;
      }

      const targetSchema = item.serviceKind === "postpaid"
        ? { fields: [{ name: "customer_no", label: "Nomor Pelanggan", type: "text", required: true }] }
        : { fields: [{ name: "customer_no", label: category === "pln" ? "ID Pelanggan / No. Meter" : "Nomor Tujuan", type: "text", required: true }] };

      const { error: serviceError } = await admin.from("ppob_services").upsert({
        product_id: productId, provider: "digiflazz", provider_sku: sku, service_kind: item.serviceKind,
        category, brand: r.brand || null, cost_price: providerBase, provider_admin: safeNumber(r.admin), provider_selling_price: safeNumber(r.selling_price) || providerBase, margin: aidilFee, pricing_rule_id: resolved.rule?.id || null, target_schema: targetSchema,
        provider_active: activeFromProvider, updated_at: new Date().toISOString(),
      }, { onConflict: "provider,provider_sku" });
      if (serviceError) skipped++;
    }

    if (syncId) await admin.from("ppob_provider_syncs").update({ status: "SUCCESS", fetched: rows.length, created_count: created, updated_count: updated, skipped_count: skipped, finished_at: new Date().toISOString() }).eq("id", syncId);
    return NextResponse.json({ ok: true, fetched: rows.length, created, updated, skipped, marginPercent, activate });
  } catch (error: any) {
    try {
      const admin = createAdminClient();
      await admin.from("ppob_provider_syncs").update({ status: "FAILED", error_message: error?.message || "SYNC_FAILED", finished_at: new Date().toISOString() }).eq("provider", "digiflazz").eq("status", "RUNNING").order("started_at", { ascending: false }).limit(1);
    } catch {}
    return NextResponse.json({ message: error?.message || "Gagal sinkronisasi PPOB." }, { status: 502 });
  }
}
