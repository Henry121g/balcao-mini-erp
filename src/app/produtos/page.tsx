import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Pagination, parsePage } from "@/components/pagination";
import { Alert } from "@/components/ui";
import { buttonStyles } from "@/components/button-styles";
import { can, requireViewer } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Produtos" };

const PAGE_SIZE = 20;

export default async function ProductsPage({ searchParams }: PageProps<"/produtos">) {
  const viewer = await requireViewer("/produtos");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const categoria = typeof sp.categoria === "string" ? sp.categoria : "";
  const situacao = sp.situacao === "inativos" ? "inativos" : sp.situacao === "todos" ? "todos" : "ativos";
  const page = parsePage(sp.pagina);
  const supabase = await createClient();
  const orgId = viewer.org.orgId;

  const { data: categories } = await supabase.from("categories").select("id, name").eq("org_id", orgId).order("name");

  let query = supabase
    .from("products")
    .select("id, sku, name, price_cents, cost_cents, stock, min_stock, active, categories(name)", { count: "exact" })
    .eq("org_id", orgId)
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) {
    // Remove curingas do ILIKE e caracteres de sintaxe do filtro `or` do PostgREST.
    const term = q.replace(/[%_\\,()*"]/g, " ").trim();
    if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }
  if (categoria) query = query.eq("category_id", categoria);
  if (situacao !== "todos") query = query.eq("active", situacao === "ativos");
  const { data, count, error } = await query;

  const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Produtos</h1>
        {can(viewer, "catalogo") && (
          <Link href="/produtos/novo" className={buttonStyles.primary}>Novo produto</Link>
        )}
      </header>

      {typeof sp.salvo === "string" && <Alert kind="success">Produto {sp.salvo} salvo.</Alert>}

      <form role="search" className="flex flex-wrap items-end gap-3" action="/produtos">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Buscar por nome ou código
          <input type="search" name="q" defaultValue={q} className={`${select} w-64`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Categoria
          <select name="categoria" defaultValue={categoria} className={select}>
            <option value="">Todas</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Situação
          <select name="situacao" defaultValue={situacao} className={select}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <button type="submit" className={buttonStyles.secondary}>Filtrar</button>
      </form>

      {error && <Alert kind="error">Não foi possível carregar os produtos. Atualize a página.</Alert>}

      {data?.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Produtos</caption>
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th scope="col" className="p-3">Código</th>
                <th scope="col" className="p-3">Nome</th>
                <th scope="col" className="p-3">Categoria</th>
                <th scope="col" className="p-3 text-right">Preço</th>
                <th scope="col" className="p-3 text-right">Custo</th>
                <th scope="col" className="p-3 text-right">Estoque</th>
                {can(viewer, "catalogo") && <th scope="col" className="p-3"><span className="sr-only">Ações</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((p) => {
                const low = p.stock <= p.min_stock;
                return (
                  <tr key={p.id} className={p.active ? "" : "text-muted"}>
                    <td className="p-3 font-mono text-xs">{p.sku}</td>
                    <td className="p-3">
                      {p.name} {!p.active && <span className="text-xs">(inativo)</span>}
                    </td>
                    <td className="p-3">{(p.categories as unknown as { name: string } | null)?.name ?? "—"}</td>
                    <td className="p-3 text-right">{formatMoney(Number(p.price_cents))}</td>
                    <td className="p-3 text-right">{formatMoney(Number(p.cost_cents))}</td>
                    <td className={`p-3 text-right font-semibold ${low ? "text-danger" : ""}`}>
                      {p.stock}
                      {low && <span className="sr-only"> (abaixo ou no mínimo de {p.min_stock})</span>}
                    </td>
                    {can(viewer, "catalogo") && (
                      <td className="p-3 text-right">
                        <Link href={`/produtos/${p.id}`} className="font-semibold text-brand underline">
                          Editar <span className="sr-only">{p.name}</span>
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <EmptyState title={q || categoria ? "Nenhum produto encontrado com esses filtros." : "Nenhum produto cadastrado."} />
      )}

      <Pagination basePath="/produtos" params={{ q, categoria, situacao }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
