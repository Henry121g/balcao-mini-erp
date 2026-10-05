"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { parseMoneyToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export interface MovementState {
  error?: string;
  success?: string;
}

const schema = z
  .object({
    productId: z.uuid("Escolha um produto."),
    type: z.enum(["entrada", "saida", "ajuste"], { message: "Escolha o tipo." }),
    quantity: z.coerce.number({ message: "Informe a quantidade." }).int("Use um número inteiro.").min(0).max(1_000_000),
    reason: z.string().trim().max(200).optional(),
    cost: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.type !== "ajuste" && d.quantity <= 0) ctx.addIssue({ code: "custom", message: "A quantidade deve ser maior que zero." });
    if (d.type !== "entrada" && !d.reason) ctx.addIssue({ code: "custom", message: "Informe o motivo." });
    if (d.cost && parseMoneyToCents(d.cost) === null) ctx.addIssue({ code: "custom", message: "Custo inválido. Use o formato 7,50." });
  });

export async function registerMovement(_: MovementState, formData: FormData): Promise<MovementState> {
  const viewer = await requireViewer("/estoque", ["admin", "estoquista"]);
  const parsed = schema.safeParse({
    productId: formData.get("productId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason") || undefined,
    cost: formData.get("cost") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_movement", {
    p_org: viewer.org.orgId,
    p_product: d.productId,
    p_type: d.type,
    p_quantity: d.quantity,
    p_reason: d.reason ?? null,
    p_unit_cost_cents: d.type === "entrada" && d.cost ? parseMoneyToCents(d.cost) : null,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/estoque");
  revalidatePath("/painel");
  revalidatePath("/produtos");
  const verb = d.type === "entrada" ? "Entrada registrada" : d.type === "saida" ? "Saída registrada" : "Ajuste registrado";
  return { success: `${verb}. O saldo e o histórico foram atualizados.` };
}
