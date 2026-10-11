// Perhitungan biaya top up per channel — server-only logic, murni
// (tanpa import) agar bisa diuji langsung sebagai unit.
// Semua hasil dibulatkan ke atas ke rupiah utuh (integer, tanpa desimal).
// Total TIDAK pernah dihitung dari angka klien; server menghitung ulang sendiri.

export const FEE_FORMULA_VERSION = 1;

export type FeeType = "flat" | "percent" | "flat_percent";

export interface ChannelFeeInput {
  channel_code: string;
  label: string;
  channel_group: string;
  is_active: boolean;
  gateway_fee_type: FeeType;
  gateway_fee_flat: number;
  gateway_fee_percent: number;
  gateway_fee_tax_percent: number;
  margin_type: FeeType;
  margin_flat: number;
  margin_percent: number;
  min_amount: number | null;
  max_amount: number | null;
  customer_note: string | null;
}

export type FeeBreakdown = {
  ok: true;
  channel_code: string;
  label: string;
  channel_group: string;
  customer_note: string | null;
  saldo_masuk: number;
  biaya_gateway: number;
  biaya_admin: number;
  total_biaya: number;
  total_bayar: number;
  formula_version: number;
};

export type FeeRejection = {
  ok: false;
  error: string;
  code: "CHANNEL_INACTIVE" | "BELOW_MIN" | "ABOVE_MAX";
};

// Baris Supabase (numeric balik sebagai string) → input murni untuk
// calculateTopupFee. Tetap tanpa import supaya lib bisa diuji langsung.
export function toChannelFeeInput(row: Record<string, unknown>): ChannelFeeInput {
  return {
    channel_code: String(row.channel_code),
    label: String(row.label),
    channel_group: String(row.channel_group ?? "Virtual Account"),
    is_active: Boolean(row.is_active),
    gateway_fee_type: (row.gateway_fee_type as FeeType) || "flat",
    gateway_fee_flat: Number(row.gateway_fee_flat ?? 0),
    gateway_fee_percent: Number(row.gateway_fee_percent ?? 0),
    gateway_fee_tax_percent: Number(row.gateway_fee_tax_percent ?? 0),
    margin_type: (row.margin_type as FeeType) || "flat",
    margin_flat: Number(row.margin_flat ?? 0),
    margin_percent: Number(row.margin_percent ?? 0),
    min_amount: row.min_amount == null ? null : Number(row.min_amount),
    max_amount: row.max_amount == null ? null : Number(row.max_amount),
    customer_note: row.customer_note == null ? null : String(row.customer_note),
  };
}

function hasFlat(type: FeeType): boolean {
  return type === "flat" || type === "flat_percent";
}

function hasPercent(type: FeeType): boolean {
  return type === "percent" || type === "flat_percent";
}

function ceilRupiah(value: number): number {
  return Math.ceil(value - 1e-9);
}

export function calculateTopupFee(
  channel: ChannelFeeInput,
  amount: number
): FeeBreakdown | FeeRejection {
  if (!channel.is_active) {
    return {
      ok: false,
      error: "Metode pembayaran ini sedang tidak aktif. Silakan pilih metode lain.",
      code: "CHANNEL_INACTIVE",
    };
  }

  if (channel.min_amount != null && amount < channel.min_amount) {
    return {
      ok: false,
      error: `Minimal top up untuk ${channel.label} adalah Rp${channel.min_amount.toLocaleString("id-ID")}.`,
      code: "BELOW_MIN",
    };
  }

  if (channel.max_amount != null && amount > channel.max_amount) {
    return {
      ok: false,
      error: `Maksimal top up untuk ${channel.label} adalah Rp${channel.max_amount.toLocaleString("id-ID")}.`,
      code: "ABOVE_MAX",
    };
  }

  const gatewayBase =
    (hasFlat(channel.gateway_fee_type) ? channel.gateway_fee_flat : 0) +
    (hasPercent(channel.gateway_fee_type) ? (amount * channel.gateway_fee_percent) / 100 : 0);
  const biayaGateway = ceilRupiah(gatewayBase * (1 + channel.gateway_fee_tax_percent / 100));

  const biayaAdmin = ceilRupiah(
    (hasFlat(channel.margin_type) ? channel.margin_flat : 0) +
      (hasPercent(channel.margin_type) ? (amount * channel.margin_percent) / 100 : 0)
  );

  const totalBiaya = biayaGateway + biayaAdmin;
  const saldoMasuk = Math.ceil(amount);

  return {
    ok: true,
    channel_code: channel.channel_code,
    label: channel.label,
    channel_group: channel.channel_group,
    customer_note: channel.customer_note,
    saldo_masuk: saldoMasuk,
    biaya_gateway: biayaGateway,
    biaya_admin: biayaAdmin,
    total_biaya: totalBiaya,
    total_bayar: saldoMasuk + totalBiaya,
    formula_version: FEE_FORMULA_VERSION,
  };
}
