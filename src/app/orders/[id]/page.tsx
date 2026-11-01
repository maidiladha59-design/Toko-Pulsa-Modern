import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import DownloadButton from "@/components/DownloadButton";
import GatewayPayment from "@/components/GatewayPayment";
import PPOBReceiptButton from "@/components/PPOBReceiptButton";
import PPOBStatusPoller from "@/components/PPOBStatusPoller";
import ProductImage from "@/components/ProductImage";
import CopyButton from "@/components/CopyButton";
import RefreshStatusButton from "@/components/RefreshStatusButton";
import { renderQrImage } from "@/lib/qr-image";
import { containsInternalTerm, paymentMethodLabel, statusLabel, safeProductName, GENERIC_ERRORS } from "@/lib/labels";
import { normalizeBrandKey, normalizeCategoryKey, resolveProductImage } from "@/lib/product-image";
import Icon from "@/components/icons/Icon";

const ORDER_MESSAGE: Record<string, string> = {
  PENDING: "Pesanan Anda sedang menunggu pembayaran.",
  PROCESSING: "Pembayaran sudah terdeteksi. Pesanan sedang diproses.",
  COMPLETED: "Pembayaran berhasil dan produk siap diambil.",
  FAILED: "Pesanan gagal diproses.",
  CANCELLED: "Pesanan telah dibatalkan.",
  REFUNDED: "Dana telah dikembalikan ke saldo Anda.",
};

const bankNames: Record<string, string> = {
  bca_va: "BCA Virtual Account",
  bri_va: "BRI Virtual Account", bni_va: "BNI Virtual Account",
  cimb_niaga_va: "CIMB Niaga Virtual Account", sampoerna_va: "Sampoerna Virtual Account",
  bnc_va: "BNC Virtual Account", maybank_va: "Maybank Virtual Account",
  permata_va: "Permata Virtual Account", atm_bersama_va: "ATM Bersama Virtual Account",
  artha_graha_va: "Artha Graha Virtual Account",
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase.from("orders")
    .select("id, order_number, total_amount, status, created_at, user_id, payment_method, gateway_method, gateway_txn_id, payment_number, qris_payload, qris_expired_at, gateway_fee, gateway_total_payment")
    .eq("id", params.id).single();

  if (!order || order.user_id !== user.id) notFound();

  const [{ data: items }, { data: ppobTransactions }, { data: submission }, { data: brandMediaRows }, { data: categoryMediaRows }] = await Promise.all([
    supabase.from("order_items")
      .select("id, product_id, product_name, unit_price, quantity, subtotal, products(product_type, thumbnail_url, categories(slug))")
      .eq("order_id", order.id),
    supabase.from("ppob_transactions")
      .select("id, order_item_id, customer_no, status, response_code, serial_number, provider_message, completed_at")
      .eq("order_id", order.id),
    supabase.from("order_submissions")
      .select("target_text, target_file_path, created_at")
      .eq("order_id", order.id).maybeSingle(),
    supabase.from("brand_media").select("brand_key, logo_url"),
    supabase.from("category_media").select("category_key, icon_url"),
  ]);

  const rows = (items || []) as any[];
  const itemIds = rows.map((item) => item.id);
  const productIds = rows.map((item) => item.product_id).filter(Boolean) as string[];

  const [{ data: ppobTargets }, { data: ppobServices }, { data: ownImages }, { data: refund }] = await Promise.all([
    itemIds.length
      ? supabase.from("ppob_order_targets").select("order_item_id, customer_no").in("order_item_id", itemIds)
      : Promise.resolve({ data: [] as any[] }),
    productIds.length
      ? supabase.from("ppob_services").select("product_id, brand").in("product_id", productIds)
      : Promise.resolve({ data: [] as any[] }),
    productIds.length
      ? supabase.from("product_images").select("product_id, image_url").in("product_id", productIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("refunds").select("amount, status").eq("order_id", order.id).maybeSingle(),
  ]);

  const ppobTxMap = new Map((ppobTransactions || []).map((tx) => [tx.order_item_id, tx]));
  const ppobTargetMap = new Map((ppobTargets || []).map((target) => [target.order_item_id, target]));
  const brandMap = new Map((ppobServices || []).map((service) => [service.product_id, service.brand]));
  const ownImageMap = new Map((ownImages || []).map((image) => [image.product_id, image.image_url]));
  const brandLogoMap = new Map((brandMediaRows || []).map((row) => [normalizeBrandKey(row.brand_key), row.logo_url]));
  const categoryImageMap = new Map((categoryMediaRows || []).map((row) => [normalizeCategoryKey(row.category_key), row.icon_url]));

  function itemView(item: any) {
    const product = relation<any>(item.products);
    const category = product ? relation<any>(product.categories) : null;
    const rawBrand = String(brandMap.get(item.product_id) || "").trim();
    const brand = rawBrand && !containsInternalTerm(rawBrand) ? rawBrand : "";
    const image = resolveProductImage(
      ownImageMap.get(item.product_id) || null,
      product?.thumbnail_url || null,
      brand ? brandLogoMap.get(normalizeBrandKey(brand)) || null : null,
      category?.slug ? categoryImageMap.get(normalizeCategoryKey(category.slug)) || null : null
    );
    const tx = ppobTxMap.get(item.id);
    const target = ppobTargetMap.get(item.id)?.customer_no || tx?.customer_no || "";
    return { product, brand, image: image.src, tx, target };
  }

  const primary = rows[0] ? itemView(rows[0]) : null;
  const primaryName = safeProductName(rows[0]?.product_name, "Pesanan AIDIL STORE");
  const heading = rows.length > 1 ? `${primaryName} +${rows.length - 1} lainnya` : primaryName;
  const total = Number(order.gateway_total_payment || order.total_amount);
  const adminFee = Number(order.gateway_fee || 0);
  const refundAmount = refund?.status === "COMPLETED" ? Number(refund.amount || 0) : 0;
  const isProcessing = ["PENDING", "PROCESSING"].includes(order.status);
  const methodLabel = order.payment_method === "BANK_VA"
    ? bankNames[order.gateway_method || ""] || "Virtual Account"
    : paymentMethodLabel(order.payment_method);

  const showGateway = ["QRIS", "BANK_VA"].includes(order.payment_method) &&
    order.status === "PENDING" && order.payment_number && order.qris_expired_at &&
    new Date(order.qris_expired_at).getTime() > Date.now();

  const qrisImage = showGateway && order.payment_method === "QRIS" && order.qris_payload
    ? await renderQrImage(order.qris_payload as string, 360)
    : null;

  const rebuyHref = rows[0]?.product_id
    ? `/checkout?product=${encodeURIComponent(rows[0].product_id)}&qty=${rows[0].quantity || 1}${primary?.target ? `&target=${encodeURIComponent(primary.target)}` : ""}`
    : null;
  const helpHref = `/bantuan?order=${encodeURIComponent(order.id)}&invoice=${encodeURIComponent(order.order_number)}`;

  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] animate-page-in lg:max-w-4xl">
        <div className="mb-5 flex items-start gap-3">
          <ProductImage
            src={primary?.image}
            alt={heading}
            className="h-14 w-14 shrink-0 rounded-2xl border border-app-border"
            iconSize={26}
            fallbackIcon="receipt"
            priority
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Rincian Transaksi</p>
            <h1 className="mt-1 break-words text-xl font-black leading-7 text-app-text sm:text-2xl">{heading}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="break-all text-xs text-app-subtle">{order.order_number}</p>
              <span className="text-app-subtle">·</span>
              <p className="text-xs text-app-subtle">{formatDate(order.created_at)}</p>
              <StatusBadge status={refund ? "REFUNDED" : order.status} />
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-app-border bg-app-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge status={refund ? "REFUNDED" : order.status} />
                <p className="min-w-0 flex-1 text-sm text-app-muted">
                  {refund ? ORDER_MESSAGE.REFUNDED : ORDER_MESSAGE[order.status]}
                </p>
              </div>
              {isProcessing && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-500/25 bg-warning-500/10 p-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-black text-app-text"><Icon name="activity" size={16} />Transaksi sedang diproses</p>
                    <p className="mt-1 text-xs text-app-muted">Status diperbarui otomatis. Anda juga bisa memeriksa sekarang.</p>
                    <PPOBStatusPoller active />
                  </div>
                  <RefreshStatusButton orderId={order.id} />
                </div>
              )}
              {refundAmount > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/25 bg-app-accent-soft p-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-black text-app-text"><Icon name="undo" size={16} />Dikembalikan ke saldo</p>
                    <p className="mt-1 text-xs text-app-muted">Nominal refund sudah masuk kembali ke Saldo AIDIL STORE.</p>
                  </div>
                  <b className="shrink-0 tabular-nums text-app-kicker">{formatRupiah(refundAmount)}</b>
                </div>
              )}
            </div>

            {showGateway && (
              <GatewayPayment
                orderId={order.id}
                paymentMethod={order.payment_method as "QRIS" | "BANK_VA"}
                gatewayMethod={order.gateway_method || "qris"}
                paymentNumber={order.payment_number as string}
                qrisImage={qrisImage}
                amount={Number(order.gateway_total_payment || order.total_amount)}
                expiredAt={order.qris_expired_at as string}
              />
            )}

            {ppobTransactions && ppobTransactions.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/25 bg-app-accent-soft p-4 text-app-kicker">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-black text-app-text"><Icon name="receipt" size={16} />Struk Transaksi</p>
                  <p className="mt-1 text-xs text-app-kicker/80">Nomor tujuan, status, dan kode SN tersedia di struk.</p>
                </div>
                <div>
                  <PPOBReceiptButton orderId={order.id} />
                  {ppobTransactions.some((tx) => ["WAITING", "PROCESSING"].includes(tx.status)) && <PPOBStatusPoller active />}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {rows.map((item) => {
                const view = itemView(item);
                const price = Number(item.subtotal);
                return (
                  <div key={item.id} className="rounded-3xl border border-app-border bg-app-surface p-5">
                    <div className="flex items-start gap-3">
                      <ProductImage
                        src={view.image}
                        alt={item.product_name}
                        className="h-12 w-12 shrink-0 rounded-xl border border-app-border"
                        iconSize={22}
                        fallbackIcon="bag"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 break-words font-black leading-5 text-app-text">{safeProductName(item.product_name)}</p>
                          <b className="shrink-0 tabular-nums text-app-text">{formatRupiah(price)}</b>
                        </div>
                        <p className="mt-1 text-sm tabular-nums text-app-subtle">{item.quantity} × {formatRupiah(item.unit_price)}</p>
                        {view.brand && <p className="mt-0.5 break-words text-xs text-app-muted">{view.brand}</p>}
                      </div>
                    </div>

                    {(view.target || view.tx?.status || view.tx?.serial_number) && (
                      <div className="mt-4 space-y-3 rounded-2xl bg-app-inset p-4">
                        {view.target && (
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-app-subtle">Nomor Tujuan</p>
                              <p className="mt-0.5 break-all text-sm font-black text-app-text">{view.target}</p>
                            </div>
                            <CopyButton value={view.target} label="Salin" />
                          </div>
                        )}
                        {view.tx?.status && (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-app-subtle">Status Layanan</p>
                            <p className="text-sm font-bold text-app-text">{statusLabel(view.tx.status)}</p>
                          </div>
                        )}
                        {view.tx?.serial_number && (
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-app-subtle">SN / Token / Voucher</p>
                              <CopyButton value={view.tx.serial_number} label="Salin" />
                            </div>
                            <p className="mt-1 break-all rounded-xl border border-app-border bg-app-surface p-3 font-black tracking-wide text-app-text">{view.tx.serial_number}</p>
                          </div>
                        )}
                        {view.tx?.provider_message && view.tx.status !== "SUCCESS" && (
                          <p className="text-xs text-app-muted">{GENERIC_ERRORS.serviceDown}</p>
                        )}
                      </div>
                    )}

                    {order.status === "COMPLETED" && view.product?.product_type === "digital" && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-success-500/10 p-4 text-success-600 dark:text-success-400">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-black"><Icon name="check" size={16} />Produk siap diambil</p>
                          <p className="text-xs text-success-600/80 dark:text-success-400/80">Link download dibuat aman dan sementara.</p>
                        </div>
                        <DownloadButton productId={item.product_id} />
                      </div>
                    )}

                    {view.product?.product_type === "jasa" && (
                      <div className="mt-4 rounded-2xl border border-gold-400/25 bg-app-accent-soft p-4 text-app-kicker">
                        <p className="flex items-center gap-1.5 font-black">
                          <Icon name="target" size={16} />Status jasa: {order.status === "PROCESSING" ? "sedang dikerjakan" : order.status === "COMPLETED" ? "selesai" : "menunggu diproses"}
                        </p>
                        {submission?.target_text && <p className="mt-2 break-words text-xs text-app-kicker/80">Target: {submission.target_text}</p>}
                        {submission?.target_file_path && <p className="mt-1 flex items-center gap-1.5 text-xs text-app-kicker/80"><Icon name="paperclip" size={14} />File target sudah dikirim.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="h-fit rounded-3xl border border-app-border bg-app-surface p-6 lg:sticky lg:top-24">
            <p className="text-xs font-black uppercase tracking-widest text-app-subtle">Rincian Pembayaran</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-app-subtle">Waktu</span><b className="text-right text-app-text">{formatDate(order.created_at)}</b></div>
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-app-subtle">Invoice</span>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                  <b className="break-all text-right text-app-text">{order.order_number}</b>
                  <CopyButton value={order.order_number} label="Salin" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3"><span className="text-app-subtle">Status</span><StatusBadge status={refund ? "REFUNDED" : order.status} /></div>
              <div className="flex justify-between gap-3 border-t border-app-border pt-4"><span className="text-app-subtle">Harga produk</span><b className="tabular-nums text-app-text">{formatRupiah(order.total_amount)}</b></div>
              {adminFee > 0 && (
                <div className="flex justify-between gap-3"><span className="text-app-subtle">Biaya Admin</span><b className="tabular-nums text-app-text">{formatRupiah(adminFee)}</b></div>
              )}
              <div className="flex justify-between gap-3"><span className="text-app-subtle">Total dibayar</span><b className="tabular-nums text-app-text">{formatRupiah(total)}</b></div>
              <div className="flex justify-between gap-3"><span className="text-app-subtle">Metode</span><b className="text-right text-app-text">{methodLabel}</b></div>
              {refundAmount > 0 && (
                <div className="flex justify-between gap-3 border-t border-app-border pt-4">
                  <span className="text-app-subtle">Dikembalikan</span>
                  <b className="tabular-nums text-app-kicker">+{formatRupiah(refundAmount)}</b>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-2">
              {rebuyHref ? (
                <Link href={rebuyHref} className="btn-gold flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition">
                  <Icon name="undo" size={16} />Beli Lagi
                </Link>
              ) : (
                <Link href="/" className="btn-gold flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition">
                  <Icon name="bag" size={16} />Belanja Lagi
                </Link>
              )}
              <Link href={helpHref} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-app-border px-4 py-3 text-sm font-black text-app-text transition hover:border-gold-400/60 hover:text-app-kicker">
                <Icon name="help" size={16} />Bantuan
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
