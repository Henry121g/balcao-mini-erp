"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { parseMoneyToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export interface SaleState {
  error?: string;
}

const saleSchema = z.object({
  items: z
    .array(z.object({ product_id: z.uuid(), quantity: z.number().int().min(1).max(10_000) }))
    .min(1, "Adicione ao menos um item.")
    .max(100),
  customer: z.string().trim().max(100).optional(),
  discount: z.string().optional(),
});

export async function createSale(_: SaleState, formData: FormData): Promise<SaleState> {
  const viewer = await requireViewer("/vendas/nova", ["admin", "vendedor"]);
  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Itens inválidos. Recarregue a página." };
  }
  const parsed = saleSchema.safeParse({
    items,
    customer: formData.get("customer") || undefined,
    discount: formData.get("discount") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const discount = parsed.data.discount ? parseMoneyToCents(parsed.data.discount) : 0;
  if (discount === null) return { error: "Desconto inválido. Use o formato 5,00." };

  // Preços NÃO vêm do navegador: o banco usa o preço atual do produto e congela no item.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_org: viewer.org.orgId,
    p_items: parsed.data.items,
    p_customer: parsed.data.customer ?? null,
    p_discount_cents: discount,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/vendas");
  revalidatePath("/painel");
  redirect(`/vendas/${data}?nova=1`);
}

export interface CancelState {
  error?: string;
}

export async function cancelSale(_: CancelState, formData: FormData): Promise<CancelState> {
  await requireViewer("/vendas", ["admin"]);
  const parsed = z
    .object({ saleId: z.uuid(), reason: z.string().trim().min(3, "Informe o motivo do cancelamento.").max(300) })
    .safeParse({ saleId: formData.get("saleId"), reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sale", { p_sale: parsed.data.saleId, p_reason: parsed.data.reason });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/vendas/${parsed.data.saleId}`);
  revalidatePath("/vendas");
  revalidatePath("/painel");
  redirect(`/vendas/${parsed.data.saleId}?cancelada=1`);
}
