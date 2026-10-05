"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { parseMoneyToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const money = (label: string) =>
  z.string().transform((v, ctx) => {
    const cents = parseMoneyToCents(v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label} inválido. Use o formato 12,90.` });
      return z.NEVER;
    }
    return cents;
  });

const productSchema = z.object({
  id: z.uuid().optional(),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,30}$/, "Código: 2 a 30 caracteres (letras, números e hífen)."),
  name: z.string().trim().min(2, "Informe o nome.").max(100),
  categoryId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  supplierId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  price: money("Preço de venda"),
  cost: money("Custo"),
  minStock: z.coerce.number().int("Use um número inteiro.").min(0).max(1_000_000),
  active: z.boolean(),
});

export async function saveProduct(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer("/produtos", ["admin", "estoquista"]);
  const parsed = productSchema.safeParse({
    id: formData.get("id") || undefined,
    sku: formData.get("sku"),
    name: formData.get("name"),
    categoryId: formData.get("categoryId") ?? "",
    supplierId: formData.get("supplierId") ?? "",
    price: formData.get("price"),
    cost: formData.get("cost") || "0",
    minStock: formData.get("minStock"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const d = parsed.data;
  const row = {
    sku: d.sku,
    name: d.name,
    category_id: d.categoryId,
    supplier_id: d.supplierId,
    price_cents: d.price,
    cost_cents: d.cost,
    min_stock: d.minStock,
    active: d.active,
  };
  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("products").update({ ...row, updated_at: new Date().toISOString() }).eq("id", d.id).eq("org_id", viewer.org.orgId)
    : await supabase.from("products").insert({ ...row, org_id: viewer.org.orgId });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/produtos");
  redirect(`/produtos?salvo=${encodeURIComponent(d.sku)}`);
}
