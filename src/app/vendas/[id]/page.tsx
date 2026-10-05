import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { can, requireViewer } from "@/lib/auth";
import { formatDateTime, formatMoney, SALE_STATUS_LABEL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CancelSaleForm } from "./cancel-form";

export const metadata: Metadata = { title: "Venda" };

export default async function SalePage({ params, searchParams }: PageProps<"/vendas/[id]">) {
  const viewer = await requireViewer("/vendas");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const tz = viewer.org.timezone;

  const { data: sale } = await supabase
    .from("sales")
    .select(
      "id, number, customer_name, status, subtotal_cents, discount_cents, total_cents, created_at, cancelled_at, cancel_reason, sale_items(id, quantity, unit_price_cents, line_total_cents, products(sku, name))",
    )
    .eq("id", id)
    .eq("org_id", viewer.org.orgId)
    .maybeSingle();
  if (!sale) notFound();
  const items = sale.sale_items as unknown as {
    id: number;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    products: { sku: string; name: string };
  }[];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/vendas" className="text-sm underline">← Vendas</Link>
      <header>
        <h1 className="text-2xl font-bold">Venda nº {sale.number}</h1>
        <p className="text-sm text-muted">
          <span className="capitalize">{formatDateTime(sale.created_at, tz)}</span>
          {sale.customer_name && ` · ${sale.customer_name}`} · {SALE_STATUS_LABEL[sale.status]}
        </p>
      </header>

      {sp.nova && <Alert kind="success">Venda registrada. O estoque de cada item já foi baixado.</Alert>}
      {sp.cancelada && <Alert kind="success">Venda cancelada. Os itens voltaram ao estoque.</Alert>}
      {sale.status === "cancelada" && (
        <Alert kind="error">
          Cancelada em <span className="capitalize">{formatDateTime(sale.cancelled_at!, tz)}</span>. Motivo: {sale.cancel_reason}
        </Alert>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">Itens da venda</caption>
          <thead className="border-b border-border text-left text-muted">
            <tr>
              <th scope="col" className="p-3">Produto</th>
              <th scope="col" className="p-3 text-right">Qtd.</th>
              <th scope="col" className="p-3 text-right">Preço unit.</th>
              <th scope="col" className="p-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="p-3"><span className="font-mono text-xs text-muted">{i.products.sku}</span> {i.products.name}</td>
                <td className="p-3 text-right">{i.quantity}</td>
                <td className="p-3 text-right">{formatMoney(Number(i.unit_price_cents))}</td>
                <td className="p-3 text-right">{formatMoney(Number(i.line_total_cents))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border">
            <tr>
              <th scope="row" colSpan={3} className="p-3 text-right font-normal text-muted">Subtotal</th>
              <td className="p-3 text-right">{formatMoney(Number(sale.subtotal_cents))}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={3} className="p-3 text-right font-normal text-muted">Desconto</th>
              <td className="p-3 text-right">− {formatMoney(Number(sale.discount_cents))}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={3} className="p-3 text-right">Total</th>
              <td className="p-3 text-right text-base font-bold">{formatMoney(Number(sale.total_cents))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {sale.status === "concluida" && can(viewer, "cancelar") && <CancelSaleForm saleId={sale.id} />}
    </div>
  );
}
