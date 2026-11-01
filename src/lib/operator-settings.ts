import { z } from "zod";
import { assetUrlSchema } from "@/lib/setting-primitives";

// Peta operator & prefix (site_settings.operator_settings, migrasi v107).
// Fallback bawaan tetap sama dengan peta lama di src/lib/ppob/target-guide.ts.

export const OPERATOR_SETTINGS_KEY = "operator_settings";

export type OperatorEntry = {
  id: string;
  name: string;
  prefixes: string[];
  logoUrl: string;
  active: boolean;
};

export type OperatorSettings = { operators: OperatorEntry[] };

export const DEFAULT_OPERATOR_SETTINGS: OperatorSettings = {
  operators: [
    {
      id: "telkomsel",
      name: "Telkomsel",
      prefixes: ["0811", "0812", "0813", "0821", "0822", "0823", "0852", "0853"],
      logoUrl: "",
      active: true,
    },
    { id: "byu", name: "by.U", prefixes: ["0851"], logoUrl: "", active: true },
    {
      id: "indosat",
      name: "Indosat",
      prefixes: ["0814", "0815", "0816", "0855", "0856", "0857", "0858"],
      logoUrl: "",
      active: true,
    },
    {
      id: "xl-axis",
      name: "XL/AXIS",
      prefixes: ["0817", "0818", "0819", "0859", "0877", "0878", "0831", "0832", "0833", "0838"],
      logoUrl: "",
      active: true,
    },
    {
      id: "tri",
      name: "Tri",
      prefixes: ["0895", "0896", "0897", "0898", "0899"],
      logoUrl: "",
      active: true,
    },
    {
      id: "smartfren",
      name: "Smartfren",
      prefixes: ["0881", "0882", "0883", "0884", "0885", "0886", "0887", "0888", "0889"],
      logoUrl: "",
      active: true,
    },
  ],
};

const operatorSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "ID operator tidak valid.")
    .max(32, "ID operator terlalu panjang.")
    .regex(/^[a-z0-9_-]+$/, "ID operator hanya huruf kecil, angka, dan tanda hubung."),
  name: z.string().trim().min(1, "Nama operator wajib diisi.").max(40, "Nama operator maksimal 40 karakter."),
  prefixes: z
    .array(
      z
        .string()
        .trim()
        .regex(/^0\d{3}$/, "Prefix harus 4 digit dan diawali 0, contoh 0812.")
    )
    .max(40, "Maksimal 40 prefix per operator.")
    .default([]),
  logoUrl: assetUrlSchema.default(""),
  active: z.boolean().default(true),
});

export const operatorSettingsInputSchema = z.object({
  operators: z
    .array(operatorSchema)
    .min(1, "Minimal satu operator.")
    .max(15, "Maksimal 15 operator.")
    .default(DEFAULT_OPERATOR_SETTINGS.operators),
});

export function normalizeOperatorSettings(
  value: z.infer<typeof operatorSettingsInputSchema>
): OperatorSettings {
  return {
    operators: value.operators.map((operator) => ({
      id: operator.id.trim(),
      name: operator.name.trim(),
      prefixes: [...new Set(operator.prefixes.map((prefix) => prefix.trim()))],
      logoUrl: operator.logoUrl.trim(),
      active: operator.active,
    })),
  };
}

/** 62812xxx / +62 812 / 812xxx -> 0812xxx */
export function normalizePhone(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith("8")) digits = `0${digits}`;
  return digits;
}

/** "0811-0813, 0821 0823" -> daftar prefix 4 digit; range hanya diperluas bila 4 digit. */
export function parsePrefixInput(raw: string): { prefixes: string[]; invalid: string[] } {
  const prefixes = new Set<string>();
  const invalid: string[] = [];
  const parts = String(raw || "")
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const range = /^(\d{4})\s*[-–]\s*(\d{4})$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end < start || end - start > 50) {
        invalid.push(part);
        continue;
      }
      for (let value = start; value <= end; value += 1) {
        const prefix = String(value).padStart(4, "0");
        if (/^0\d{3}$/.test(prefix)) prefixes.add(prefix);
        else invalid.push(prefix);
      }
      continue;
    }
    const digits = part.replace(/\D/g, "");
    if (/^0\d{3}$/.test(digits)) prefixes.add(digits);
    else invalid.push(part);
  }
  return { prefixes: [...prefixes].sort(), invalid };
}

export function detectOperatorEntry(
  raw: string,
  settings: OperatorSettings = DEFAULT_OPERATOR_SETTINGS
): OperatorEntry | null {
  const phone = normalizePhone(raw);
  if (phone.length < 4) return null;
  const prefix = phone.slice(0, 4);
  for (const operator of settings.operators) {
    if (!operator.active) continue;
    if (operator.prefixes.includes(prefix)) return operator;
  }
  return null;
}

export function operatorFamily(name: string): string {
  const value = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (value.includes("telkomsel") || value.includes("byu") || value.includes("simpati") || value.includes("kartuas")) {
    return "telkomsel";
  }
  if (value.includes("indosat") || value.includes("im3")) return "indosat";
  if (value.includes("xl") || value.includes("axis")) return "xl";
  if (value.includes("tri") || value.includes("three")) return "tri";
  if (value.includes("smartfren")) return "smartfren";
  return value;
}

/** Cocok untuk peringatan nomor vs produk, mis. by.U dianggap satu keluarga Telkomsel. */
export function sameOperatorFamily(a: string, b: string): boolean {
  return operatorFamily(a) === operatorFamily(b);
}

/** Prefix yang dipakai lebih dari satu operator (tampil sebagai peringatan admin). */
export function duplicatePrefixes(settings: OperatorSettings): Array<{ prefix: string; operators: string[] }> {
  const map = new Map<string, string[]>();
  for (const operator of settings.operators) {
    for (const prefix of operator.prefixes) {
      map.set(prefix, [...(map.get(prefix) ?? []), operator.name]);
    }
  }
  return [...map.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([prefix, names]) => ({ prefix, operators: names }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix));
}

export function operatorSettingsValidate(value: OperatorSettings): string | null {
  const ids = new Set<string>();
  for (const operator of value.operators) {
    if (ids.has(operator.id)) return `ID operator "${operator.id}" dipakai lebih dari satu kali.`;
    ids.add(operator.id);
    if (!operator.name.trim()) return "Nama operator wajib diisi.";
    for (const prefix of operator.prefixes) {
      if (!/^0\d{3}$/.test(prefix)) return `Prefix "${prefix}" pada ${operator.name} harus 4 digit dan diawali 0.`;
    }
  }
  return null;
}

export function operatorSettingsPublishError(value: OperatorSettings): string | null {
  return operatorSettingsValidate(value);
}

/** Dipakai pratinjau panel admin: nomor contoh + hasil deteksi. */
export function operatorDetectSummary(raw: string, settings: OperatorSettings): string {
  const operator = detectOperatorEntry(raw, settings);
  if (!normalizePhone(raw)) return "Ketik nomor untuk melihat operator terdeteksi.";
  return operator ? `Operator terdeteksi: ${operator.name}` : "Prefix belum terdaftar pada operator aktif.";
}
