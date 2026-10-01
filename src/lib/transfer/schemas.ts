import { z } from "zod";

// Token QR pribadi: 64 karakter hex (hasil RPC ensure/regenerate_user_qr_token).
export const qrTokenSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/);

export const createTransferSchema = z.object({
  recipient_id: z.string().uuid(),
  amount: z.coerce.number().int().positive(),
  note: z.string().trim().max(140).optional(),
  pin: z.string().min(1),
  idempotency_key: z.string().trim().min(10).max(128),
});

export const resolveQrSchema = z.object({
  token: qrTokenSchema,
});

export const transferSearchSchema = z.object({
  q: z.string().trim().min(3).max(160),
});

export const addContactSchema = z.object({
  contact_user_id: z.string().uuid(),
  alias: z.string().trim().max(60).optional(),
});

export const removeContactSchema = z.object({
  contact_user_id: z.string().uuid(),
});
