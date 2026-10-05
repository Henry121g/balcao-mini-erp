import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const viewer = await requireViewer("/produtos/novo", ["admin", "estoquista"]);
  const supabase = await createClient();
  const [{ data: categories }, { data: suppliers }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("org_id", viewer.org.orgId).order("name"),
    supabase.from("suppliers").select("id, name").eq("org_id", viewer.org.orgId).order("name"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Novo produto</h1>
      <ProductForm categories={categories ?? []} suppliers={suppliers ?? []} />
    </div>
  );
}
