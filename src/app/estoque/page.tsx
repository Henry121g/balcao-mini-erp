import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Pagination, parsePage } from "@/components/pagination";
import { Alert } from "@/components/ui";
import { buttonStyles } from "@/components/button-styles";
import { can, requireViewer } from "@/lib/auth";
import { formatDateTime, MOVEMENT_LABEL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { MovementForm } from "./movement-form";

export const metadata: Metadata = { title: "Estoque" };

const PAGE_SIZE = 25;
const TYPES = ["entrada", "saida", "ajuste", "venda", "estorno_venda"];

export default async function StockPage({ searchParams }: PageProps<"/estoque">) {
  const viewer = await requireViewer("/estoque");
  const sp = await searchParams;
  const produto = typeof sp.produto === "string" && /^[0-9a-f-]{36}$/i.test(sp.produto) ? sp.produto : "";
  const tipo = typeof sp.tipo === "string" && TYPES.includes(sp.tipo) ? sp.tipo : "";
  const page = parsePage(sp.pagina);
  const supabase = await createClient();
  const orgId = viewer.org.orgId;

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, stock")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("name");

  let query = supabase
    .from("stock_movements")
    .select("id, type, quantity, stock_after, reason, created_at, sale_id, products(sku, name), sales(number)", { count: "exact" })
    .eq("org_id", orgId)
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (produto) query = query.eq("product_id", produto);
  if (tipo) query = query.eq("type", tipo as never);
  const { data: moves, count, error } = await query;

  const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2";

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Estoque</h1>

      {can(viewer, "estoque") ? (
        <section aria-labelledby="nova-mov">
          <h2 id="nova-mov" className="mb-3 text-lg font-semibold">Nova movimentação</h2>
          <MovementForm products={products ?? []} defaultProduct={produto || undefined} />
        </section>
      ) : (
        <p className="text-sm text-muted">Seu perfil pode consultar o histórico, mas não registrar movimentações.</p>
      )}

      <section aria-labelledby="historico" className="flex flex-col gap-4">
        <h2 id="historico" className="text-lg font-semibold">Histórico de movimentações</h2>
        <form className="flex flex-wrap items-end gap-3" action="/estoque">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Produto
            <select name="produto" defaultValue={produto} className={select}>
              <option value="">Todos</option>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tipo
            <select name="tipo" defaultValue={tipo} className={select}>
              <option value="">Todos</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonStyles.secondary}>Filtrar</button>
        </form>

        {error && <Alert kind="error">Não foi possível carregar o histórico. Atualize a página.</Alert>}

        {moves?.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Movimentações de estoque, mais recentes primeiro</caption>
              <thead className="border-b border-border text-left text-muted">
                <tr>
                  <th scope="col" className="p-3">Quando</th>
                  <th scope="col" className="p-3">Produto</th>
                  <th scope="col" className="p-3">Tipo</th>
                  <th scope="col" className="p-3 text-right">Qtd.</th>
                  <th scope="col" className="p-3 text-right">Saldo após</th>
                  <th scope="col" className="p-3">Motivo / origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {moves.map((m) => {
                  const prod = m.products as unknown as { sku: string; name: string };
                  const sale = m.sales as unknown as { number: number } | null;
                  return (
                    <tr key={m.id}>
                      <td className="p-3 capitalize">{formatDateTime(m.created_at, viewer.org.timezone)}</td>
                      <td className="p-3"><span className="font-mono text-xs text-muted">{prod.sku}</span> {prod.name}</td>
                      <td className="p-3">{MOVEMENT_LABEL[m.type]}</td>
                      <td className={`p-3 text-right font-semibold ${m.quantity < 0 ? "text-danger" : "text-success"}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="p-3 text-right">{m.stock_after}</td>
                      <td className="p-3">
                        {m.sale_id && sale ? (
                          <Link href={`/vendas/${m.sale_id}`} className="underline">{m.reason ?? `Venda nº ${sale.number}`}</Link>
                        ) : (
                          m.reason ?? "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          !error && <EmptyState title="Nenhuma movimentação com esses filtros." />
        )}
        <Pagination basePath="/estoque" params={{ produto, tipo }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </section>
    </div>
  );
}
