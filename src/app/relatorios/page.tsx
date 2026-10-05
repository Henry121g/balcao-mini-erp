import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { Alert, buttonStyles } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { formatInt, formatLocalDay, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { parsePeriod } from "./period";

export const metadata: Metadata = { title: "Relatórios" };

interface Daily {
  day: string;
  sales_count: number;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
}
interface ByProduct {
  product_id: string;
  sku: string;
  name: string;
  quantity: number;
  revenue_cents: number;
  margin_cents: number;
}

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const viewer = await requireViewer("/relatorios");
  const sp = await searchParams;
  const { from, to } = parsePeriod(sp.de, sp.ate, viewer.org.timezone);
  const supabase = await createClient();
  const args = { p_org: viewer.org.orgId, p_from: from, p_to: to };
  const [daily, products] = await Promise.all([
    supabase.rpc("report_daily", args),
    supabase.rpc("report_products", args),
  ]);
  const days = ((daily.data ?? []) as Daily[]).map((d) => ({
    ...d,
    sales_count: Number(d.sales_count),
    revenue_cents: Number(d.revenue_cents),
    cost_cents: Number(d.cost_cents),
    margin_cents: Number(d.margin_cents),
  }));
  const byProduct = (products.data ?? []) as ByProduct[];
  const total = days.reduce(
    (a, d) => ({ n: a.n + d.sales_count, rev: a.rev + d.revenue_cents, cost: a.cost + d.cost_cents, margin: a.margin + d.margin_cents }),
    { n: 0, rev: 0, cost: 0, margin: 0 },
  );
  const maxRev = Math.max(1, ...days.map((d) => d.revenue_cents));
  const input = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2";
  const qs = `de=${from}&ate=${to}`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <form className="flex flex-wrap items-end gap-3" action="/relatorios">
          <label className="flex flex-col gap-1 text-sm font-medium">
            De
            <input type="date" name="de" defaultValue={from} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Até
            <input type="date" name="ate" defaultValue={to} className={input} />
          </label>
          <button type="submit" className={buttonStyles.secondary}>Aplicar</button>
        </form>
      </header>

      {(daily.error || products.error) && <Alert kind="error">Não foi possível gerar o relatório. Tente novamente.</Alert>}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Vendas", formatInt(total.n)],
          ["Faturamento líquido", formatMoney(total.rev)],
          ["Custo dos itens", formatMoney(total.cost)],
          ["Margem bruta", `${formatMoney(total.margin)}${total.rev ? ` (${Math.round((total.margin / total.rev) * 100)}%)` : ""}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="por-dia" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="por-dia" className="text-lg font-semibold">Por dia</h2>
          <a href={`/relatorios/csv?tipo=dia&${qs}`} className={buttonStyles.secondary} download>
            Exportar CSV <span className="sr-only">por dia</span>
          </a>
        </div>
        {days.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Faturamento por dia, de {formatLocalDay(from)} a {formatLocalDay(to)}</caption>
              <thead className="border-b border-border text-left text-muted">
                <tr>
                  <th scope="col" className="p-3">Dia</th>
                  <th scope="col" className="p-3 text-right">Vendas</th>
                  <th scope="col" className="w-1/3 p-3">Faturamento</th>
                  <th scope="col" className="p-3 text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map((d) => (
                  <tr key={d.day}>
                    <td className="p-3 capitalize">{formatLocalDay(d.day)}</td>
                    <td className="p-3 text-right">{d.sales_count}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div aria-hidden="true" className="h-3 rounded bg-brand" style={{ width: `${(d.revenue_cents / maxRev) * 100}%`, minWidth: 2 }} />
                        <span className="whitespace-nowrap">{formatMoney(d.revenue_cents)}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right">{formatMoney(d.margin_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhuma venda concluída no período." />
        )}
      </section>

      <section aria-labelledby="por-produto" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="por-produto" className="text-lg font-semibold">Por produto</h2>
          <a href={`/relatorios/csv?tipo=produto&${qs}`} className={buttonStyles.secondary} download>
            Exportar CSV <span className="sr-only">por produto</span>
          </a>
        </div>
        <p className="text-xs text-muted">Receita bruta por item (antes do desconto da venda, que é aplicado ao total).</p>
        {byProduct.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Vendas por produto</caption>
              <thead className="border-b border-border text-left text-muted">
                <tr>
                  <th scope="col" className="p-3">Produto</th>
                  <th scope="col" className="p-3 text-right">Qtd.</th>
                  <th scope="col" className="p-3 text-right">Receita</th>
                  <th scope="col" className="p-3 text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byProduct.map((p) => (
                  <tr key={p.product_id}>
                    <td className="p-3"><span className="font-mono text-xs text-muted">{p.sku}</span> {p.name}</td>
                    <td className="p-3 text-right">{Number(p.quantity)}</td>
                    <td className="p-3 text-right">{formatMoney(Number(p.revenue_cents))}</td>
                    <td className="p-3 text-right">{formatMoney(Number(p.margin_cents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhum produto vendido no período." />
        )}
      </section>
    </div>
  );
}
