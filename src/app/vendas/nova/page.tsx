import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SaleForm } from "./sale-form";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NewSalePage() {
  const viewer = await requireViewer("/vendas/nova", ["admin", "vendedor"]);
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, price_cents, stock")
    .eq("org_id", viewer.org.orgId)
    .eq("active", true)
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Nova venda</h1>
      <SaleForm products={(products ?? []).map((p) => ({ ...p, price_cents: Number(p.price_cents) }))} />
    </div>
  );
}
