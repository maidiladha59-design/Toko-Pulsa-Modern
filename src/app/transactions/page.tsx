import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TransactionCenter, { type TransactionEntry } from "@/components/TransactionCenter";
import { containsInternalTerm, safeProductName } from "@/lib/labels";
import { maskTarget, transactionStatusKind } from "@/lib/transaction-view";
import { normalizeBrandKey, normalizeCategoryKey, resolveProductImage } from "@/lib/product-image";

type AnyRow = Record<string, any>;

const WALLET_ICONS: Record<string, string> = {
  TOPUP: "plus",
  PURCHASE: "bag",
  REFUND: "undo",
  TRANSFER: "transfer",
  ADJUSTMENT: "settings",
};

function categoryIcon(slug: string | null | undefined, fallback: string) {
  const key = String(slug || "").toLowerCase();
  if (key.includes("game")) return "game";
  if (key.includes("voucher") || key.includes("tiket")) return "voucher";
  if (key.includes("pln") || key.includes("listrik") || key.includes("token")) return "bolt";
  if (key.includes("tv") || key.includes("streaming")) return "tv";
  if (key.includes("data") || key.includes("internet")) return "data";
  if (key.includes("pulsa") || key.includes("telepon") || key.includes("sms") || key.includes("hp")) return "phone";
  if (key.includes("ewallet") || key.includes("e-money") || key.includes("dompet")) return "wallet";
  if (key.includes("tagihan")) return "receipt";
  return fallback;
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function TransactionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: orderRows }, { data: wallet }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, total_amount, status, created_at, payment_method, order_items(id, product_id, product_name, unit_price, quantity, subtotal, products(thumbnail_url, categories(slug)))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase.from("wallets").select("id, balance").eq("user_id", user.id).maybeSingle(),
  ]);

  const orders = (orderRows || []) as AnyRow[];
  const orderItems = orders.flatMap((order) => (Array.isArray(order.order_items) ? order.order_items : [])) as AnyRow[];
  const orderIds = orders.map((order) => order.id);
  const itemIds = orderItems.map((item) => item.id);
  const productIds = Array.from(new Set(orderItems.map((item) => item.product_id).filter(Boolean)));

  const [
    { data: walletTxRows },
    { data: ppobRows },
    { data: targetRows },
    { data: brandRows },
    { data: ownImageRows },
    { data: brandMediaRows },
    { data: categoryMediaRows },
  ] = await Promise.all([
    wallet
      ? supabase
          .from("wallet_transactions")
          .select("id, type, amount, reference_type, reference_id, description, created_at")
          .eq("wallet_id", wallet.id)
          .order("created_at", { ascending: false })
          .limit(120)
      : Promise.resolve({ data: [] as AnyRow[] }),
    orderIds.length
      ? supabase
          .from("ppob_transactions")
          .select("id, order_id, order_item_id, customer_no, status, serial_number")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as AnyRow[] }),
    itemIds.length
      ? supabase.from("ppob_order_targets").select("order_item_id, customer_no").in("order_item_id", itemIds)
      : Promise.resolve({ data: [] as AnyRow[] }),
    productIds.length
      ? supabase.from("ppob_services").select("product_id, brand").in("product_id", productIds)
      : Promise.resolve({ data: [] as AnyRow[] }),
    productIds.length
      ? supabase.from("product_images").select("product_id, image_url").in("product_id", productIds)
      : Promise.resolve({ data: [] as AnyRow[] }),
    supabase.from("brand_media").select("brand_key, logo_url"),
    supabase.from("category_media").select("category_key, icon_url"),
  ]);

  const walletTx = (walletTxRows || []) as AnyRow[];
  const ppobByItem = new Map((ppobRows || []).map((row: AnyRow) => [row.order_item_id, row]));
  const targetByItem = new Map((targetRows || []).map((row: AnyRow) => [row.order_item_id, row]));
  const brandByProduct = new Map((brandRows || []).map((row: AnyRow) => [row.product_id, row.brand]));
  const ownImageByProduct = new Map((ownImageRows || []).map((row: AnyRow) => [row.product_id, row.image_url]));
  const brandLogoByKey = new Map(
    (brandMediaRows || []).map((row: AnyRow) => [normalizeBrandKey(row.brand_key), row.logo_url])
  );
  const categoryImageByKey = new Map(
    (categoryMediaRows || []).map((row: AnyRow) => [normalizeCategoryKey(row.category_key), row.icon_url])
  );

  const refundByOrder = new Map<string, AnyRow>();
  for (const row of walletTx) {
    if (row.type === "REFUND" && row.reference_type === "order" && row.reference_id) {
      refundByOrder.set(row.reference_id, row);
    }
  }

  function orderImage(item: AnyRow | null) {
    if (!item) return { src: null as string | null, icon: "bag" };
    const product = relation<AnyRow>(item.products);
    const category = product ? relation<AnyRow>(product.categories) : null;
    const rawBrand = String(brandByProduct.get(item.product_id) || "").trim();
    const brand = rawBrand && !containsInternalTerm(rawBrand) ? rawBrand : "";
    const resolved = resolveProductImage(
      ownImageByProduct.get(item.product_id) || null,
      product?.thumbnail_url || null,
      brand ? brandLogoByKey.get(normalizeBrandKey(brand)) || null : null,
      category?.slug ? categoryImageByKey.get(normalizeCategoryKey(category.slug)) || null : null
    );
    const fallback = Boolean(ppobByItem.get(item.id)) ? "bolt" : "bag";
    return { src: resolved.src, icon: categoryIcon(category?.slug, fallback) };
  }

  const orderEntries: TransactionEntry[] = orders.map((order) => {
    const items = (Array.isArray(order.order_items) ? order.order_items : []) as AnyRow[];
    const first = items[0] || null;
    const ppob = first ? ppobByItem.get(first.id) : null;
    const target = first ? targetByItem.get(first.id)?.customer_no || ppob?.customer_no || "" : "";
    const productType = first ? relation<AnyRow>(first.products)?.product_type : null;
    const rawBrand = String(first ? brandByProduct.get(first.product_id) || "" : "").trim();
    const brand = rawBrand && !containsInternalTerm(rawBrand) ? rawBrand : "";
    const refund = refundByOrder.get(order.id);
    const image = orderImage(first);
    const title = safeProductName(
      first?.product_name,
      productType === "jasa" ? "Layanan jasa" : "Pembelian digital"
    );
    const subtitleParts: string[] = [];
    if (target) subtitleParts.push(maskTarget(target));
    if (brand) subtitleParts.push(brand);
    if (items.length > 1) subtitleParts.push(`${items.length} produk`);
    if (!subtitleParts.length) subtitleParts.push(productType === "jasa" ? "Layanan jasa" : "Produk digital");

    return {
      id: order.id,
      kind: "order",
      title,
      subtitle: subtitleParts.join(" · "),
      target,
      invoice: order.order_number,
      amount: -Number(order.total_amount || 0),
      status: refund ? "REFUNDED" : order.status,
      date: order.created_at,
      href: `/orders/${order.id}`,
      image: image.src,
      icon: image.icon,
      refundAmount: refund ? Number(refund.amount || 0) : null,
    };
  });

  const visibleOrderIds = new Set(orders.map((order) => order.id));
  const referencedOrderIds = Array.from(
    new Set(
      walletTx
        .filter((row) => row.reference_type === "order" && row.reference_id)
        .map((row) => String(row.reference_id))
    )
  );

  // Refund/pembelian saldo untuk order lama bisa berada di luar 120 order
  // terbaru. Ambil hanya referensi yang belum ada agar nama produk tetap jelas.
  const missingRefIds = referencedOrderIds.filter((id) => !visibleOrderIds.has(id));
  const extraOrderMap = new Map<string, AnyRow>();
  if (missingRefIds.length) {
    const { data: extraOrders } = await supabase
      .from("orders")
      .select("id, order_number, order_items(product_name)")
      .in("id", missingRefIds);
    for (const order of (extraOrders || []) as AnyRow[]) {
      extraOrderMap.set(order.id, order);
    }
  }

  const orderById = new Map<string, AnyRow>();
  for (const order of orders) orderById.set(order.id, order);
  for (const [id, order] of extraOrderMap) orderById.set(id, order);

  const walletEntries: TransactionEntry[] = walletTx
    .filter((row) => {
      const linked = row.reference_type === "order" && row.reference_id && visibleOrderIds.has(row.reference_id);
      return !(linked && (row.type === "PURCHASE" || row.type === "REFUND"));
    })
    .map((row) => {
      const refOrder = row.reference_id ? orderById.get(row.reference_id) : null;
      const refItems = refOrder && Array.isArray(refOrder.order_items) ? refOrder.order_items : [];
      const refProduct = refItems[0]?.product_name ? safeProductName(refItems[0].product_name, "") : "";
      const amount = Number(row.amount || 0);
      let title = "Perubahan Saldo";
      if (row.type === "TOPUP") title = "Top Up Saldo";
      else if (row.type === "REFUND") title = refProduct ? `Refund: ${refProduct}` : "Pengembalian Dana";
      else if (row.type === "PURCHASE") title = refProduct ? `Pembayaran saldo: ${refProduct}` : "Pembayaran Saldo";
      else if (row.type === "TRANSFER") title = amount < 0 ? "Transfer Saldo Keluar" : "Transfer Saldo Masuk";
      else if (row.type === "ADJUSTMENT") title = "Penyesuaian Saldo";

      return {
        id: row.id,
        kind: "wallet",
        title,
        subtitle: "Saldo AIDIL STORE",
        invoice: refOrder?.order_number || null,
        amount,
        status: "COMPLETED",
        date: row.created_at,
        href: `/transactions/wallet/${row.id}`,
        icon: WALLET_ICONS[row.type] || "wallet",
        walletType: row.type,
      };
    });

  const entries = [...orderEntries, ...walletEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const successCount = entries.filter((entry) => transactionStatusKind(entry.status) === "success").length;
  const processingCount = entries.filter((entry) => transactionStatusKind(entry.status) === "processing").length;
  const hasTopup = walletTx.some((row) => row.type === "TOPUP");

  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] animate-page-in">
        <TransactionCenter
          entries={entries}
          balance={Number(wallet?.balance || 0)}
          successCount={successCount}
          processingCount={processingCount}
          hasTopup={hasTopup}
        />
      </div>
    </div>
  );
}
