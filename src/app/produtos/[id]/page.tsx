import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { formatDateTime, MOVEMENT_LABEL } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditProductPage({ params }: PageProps<"/produtos/[id]">) {
  const viewer = await requireViewer("/produtos", ["admin", "estoquista"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const orgId = viewer.org.orgId;

  const [{ data: p }, { data: categories }, { data: suppliers }, { data: moves }] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, name, category_id, supplier_id, price_cents, cost_cents, min_stock, active, stock")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase.from("categories").select("id, name").eq("org_id", orgId).order("name"),
    supabase.from("suppliers").select("id, name").eq("org_id", orgId).order("name"),
    supabase
      .from("stock_movements")
      .select("id, type, quantity, stock_after, reason, created_at")
      .eq("product_id", id)
      .order("id", { ascending: false })
      .limit(10),
  ]);
  if (!p) notFound();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Editar {p.name}</h1>
        <p className="text-sm text-muted">
          Saldo atual: <strong>{p.stock}</strong> — alterado apenas por movimentações em{" "}
          <Link href={`/estoque?produto=${p.id}`} className="underline">Estoque</Link>.
        </p>
      </header>
      <ProductForm
        categories={categories ?? []}
        suppliers={suppliers ?? []}
        initial={{
          id: p.id,
          sku: p.sku,
          name: p.name,
          category_id: p.category_id,
          supplier_id: p.supplier_id,
          price: centsToInput(Number(p.price_cents)),
          cost: centsToInput(Number(p.cost_cents)),
          min_stock: p.min_stock,
          active: p.active,
        }}
      />
      <section aria-labelledby="ultimas-mov">
        <h2 id="ultimas-mov" className="mb-3 text-lg font-semibold">Últimas movimentações</h2>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface text-sm">
          {(moves ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap justify-between gap-2 p-3">
              <span className="capitalize">{formatDateTime(m.created_at, viewer.org.timezone)}</span>
              <span>
                {MOVEMENT_LABEL[m.type]} {m.quantity > 0 ? `+${m.quantity}` : m.quantity} → saldo {m.stock_after}
                {m.reason && <span className="text-muted"> · {m.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
