export type PricingRule = {
  id: string;
  name: string;
  scope_type: "GLOBAL" | "CATEGORY" | "BRAND" | "SKU";
  scope_key: string;
  fee_type: "FIXED" | "PERCENTAGE";
  fee_value: number;
  min_fee?: number | null;
  max_fee?: number | null;
  min_amount?: number | null;
  max_amount?: number | null;
  priority: number;
  is_active: boolean;
};

export function calculateRuleFee(amount: number, rule: PricingRule) {
  if (!rule.is_active || amount < Number(rule.min_amount || 0)) return 0;
  if (rule.max_amount != null && amount > Number(rule.max_amount)) return 0;
  let fee = rule.fee_type === "PERCENTAGE"
    ? Math.round(amount * Number(rule.fee_value || 0) / 100)
    : Math.round(Number(rule.fee_value || 0));
  if (rule.min_fee != null) fee = Math.max(fee, Number(rule.min_fee));
  if (rule.max_fee != null) fee = Math.min(fee, Number(rule.max_fee));
  return Math.max(0, fee);
}

export function resolvePricingRule(rules: PricingRule[], input: { category?: string | null; brand?: string | null; sku?: string | null; amount: number }) {
  const keys: Array<[PricingRule["scope_type"], string]> = [
    ["SKU", String(input.sku || "")],
    ["BRAND", String(input.brand || "").toLowerCase()],
    ["CATEGORY", String(input.category || "").toLowerCase()],
    ["GLOBAL", "*"],
  ];
  for (const [scope, key] of keys) {
    const candidates = rules
      .filter(r => r.is_active && r.scope_type === scope && r.scope_key.toLowerCase() === key.toLowerCase())
      .sort((a,b) => Number(b.priority) - Number(a.priority));
    for (const rule of candidates) {
      const fee = calculateRuleFee(input.amount, rule);
      if (fee || (rule.fee_value === 0 && input.amount >= Number(rule.min_amount || 0) && (rule.max_amount == null || input.amount <= Number(rule.max_amount)))) return { rule, fee };
    }
  }
  return { rule: null, fee: 0 };
}
