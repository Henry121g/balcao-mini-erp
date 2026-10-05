"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface CrudState {
  error?: string;
  success?: string;
}

export async function saveCategory(_: CrudState, formData: FormData): Promise<CrudState> {
  const viewer = await requireViewer("/cadastros", ["admin", "estoquista"]);
  const parsed = z
    .object({ id: z.uuid().optional(), name: z.string().trim().min(2, "Nome muito curto.").max(60) })
    .safeParse({ id: formData.get("id") || undefined, name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { id, name } = parsed.data;
  const { error } = id
    ? await supabase.from("categories").update({ name }).eq("id", id).eq("org_id", viewer.org.orgId)
    : await supabase.from("categories").insert({ name, org_id: viewer.org.orgId });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/cadastros");
  return { success: id ? "Categoria renomeada." : "Categoria criada." };
}

export async function deleteCategory(formData: FormData) {
  const viewer = await requireViewer("/cadastros", ["admin", "estoquista"]);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  // Produtos da categoria ficam "sem categoria" (FK com SET NULL).
  await supabase.from("categories").delete().eq("id", id.data).eq("org_id", viewer.org.orgId);
  revalidatePath("/cadastros");
}

const supplierSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Nome muito curto.").max(100),
  document: z
    .string()
    .trim()
    .regex(/^[0-9./-]{11,18}$/, "CNPJ/CPF inválido (use apenas números, pontos, barra e hífen).")
    .optional(),
  email: z.email("E-mail inválido.").optional(),
  phone: z.string().trim().regex(/^[0-9 ()+-]{8,20}$/, "Telefone inválido.").optional(),
});

export async function saveSupplier(_: CrudState, formData: FormData): Promise<CrudState> {
  const viewer = await requireViewer("/cadastros", ["admin", "estoquista"]);
  const parsed = supplierSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    document: formData.get("document") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...d } = parsed.data;
  const row = { name: d.name, document: d.document ?? null, email: d.email ?? null, phone: d.phone ?? null };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("suppliers").update(row).eq("id", id).eq("org_id", viewer.org.orgId)
    : await supabase.from("suppliers").insert({ ...row, org_id: viewer.org.orgId });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/cadastros");
  return { success: id ? "Fornecedor atualizado." : "Fornecedor cadastrado." };
}

export async function deleteSupplier(formData: FormData) {
  const viewer = await requireViewer("/cadastros", ["admin", "estoquista"]);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("suppliers").delete().eq("id", id.data).eq("org_id", viewer.org.orgId);
  revalidatePath("/cadastros");
}
