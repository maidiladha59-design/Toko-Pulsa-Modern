import { z } from "zod";

// Skema Split Bill — harus sejalan dengan validasi RPC di
// supabase/migrations_v76_split_bill.sql (judul 3-100, nominal integer
// positif, peserta 1-20, mode CUSTOM wajib jumlah bagian = total).
export const createSplitBillSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    total_amount: z.coerce.number().int().positive(),
    mode: z.enum(["EQUAL", "CUSTOM"]),
    participants: z
      .array(
        z.object({
          user_id: z.string().uuid(),
          share_amount: z.coerce.number().int().positive().optional(),
        })
      )
      .min(1)
      .max(20),
  })
  .superRefine((data, ctx) => {
    const ids = data.participants.map((p) => p.user_id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["participants"], message: "Peserta tidak boleh duplikat." });
    }
    if (data.mode === "CUSTOM") {
      const missing = data.participants.some((p) => p.share_amount === undefined);
      const sum = data.participants.reduce((acc, p) => acc + (p.share_amount ?? 0), 0);
      if (missing) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["participants"], message: "Nominal custom wajib diisi untuk semua peserta." });
      } else if (sum !== data.total_amount) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["total_amount"], message: `Jumlah bagian (${sum}) harus sama dengan total tagihan (${data.total_amount}).` });
      }
    }
  });

export const paySplitBillSchema = z.object({
  pin: z.string().min(1),
  idempotency_key: z.string().trim().min(10).max(128),
});

export const remindParticipantSchema = z.object({
  participant_user_id: z.string().uuid(),
});

export const billIdParamSchema = z.string().uuid();

export type CreateSplitBillInput = z.infer<typeof createSplitBillSchema>;
export type SplitBillParticipantInput = z.infer<typeof createSplitBillSchema>["participants"][number];
