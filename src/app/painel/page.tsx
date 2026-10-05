import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Alert, buttonStyles } from "@/components/ui";
import { can, requireViewer } from "@/lib/auth";
import { formatDateTime, formatInt, formatMoney, localDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Painel" };

interface Daily {
  day: string;
  sales_count: number;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
}

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  const viewer = await requireViewer("/painel");
  const sp = await searchParams;
  const supabase = await createClient();
  const { orgId, timezone } = viewer.org;
  const today = localDate(new Date(), timezone);
  const monthStart = `${today.slice(0, 8)}01`;

  const [daily, low, recent] = await Promise.all([
    supabase.rpc("report_daily", { p_org: orgId, p_from: monthStart, p_to: today }),
    supabase.from("low_stock").select("id, sku, name, stock, min_stock").eq("org_id", orgId).order("stock"),
    supabase
      .from("sales")
      .select("id, number, total_cents, status, created_at, customer_name")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const rows = (daily.data ?? []) as Daily[];
  const sum = (list: Daily[], key: keyof Daily) => list.reduce((acc, r) => acc + Number(r[key]), 0);
  const todayRows = rows.filter((r) => r.day === today);
  const kpis = [
    ["Vendas hoje", formatInt(sum(todayRows, "sales_count"))],
    ["Faturamento hoje", formatMoney(sum(todayRows, "revenue_cents"))],
    ["Faturamento no mês", formatMoney(sum(rows, "revenue_cents"))],
    ["Margem bruta no mês", formatMoney(sum(rows, "margin_cents"))],
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{viewer.org.orgName}</h1>
          <p className="text-sm text-muted">Olá, {viewer.fullName}.</p>
        </div>
        {can(viewer, "vender") && (
          <Link href="/vendas/nova" className={buttonStyles.primary}>
            Nova venda
          </Link>
        )}
      </header>

      {sp["sem-permissao"] && <Alert kind="error">Seu perfil não tem acesso a essa página.</Alert>}
      {daily.error && <Alert kind="error">Não foi possível carregar os indicadores. Atualize a página.</Alert>}

      <section aria-labelledby="indicadores">
        <h2 id="indicadores" className="sr-only">Indicadores</h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">
          Vendas canceladas não entram nos totais. Margem = faturamento − custo dos itens (custo congelado na venda).
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="alertas">
          <h2 id="alertas" className="mb-3 text-lg font-semibold">
            Estoque mínimo {low.data?.length ? <span className="text-danger">({low.data.length})</span> : null}
          </h2>
          {low.data?.length ? (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
              {low.data.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name}
                  </span>
                  <span className={p.stock === 0 ? "font-semibold text-danger" : "font-semibold"}>
                    {p.stock} <span className="font-normal text-muted">/ mín. {p.min_stock}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum produto abaixo do estoque mínimo." />
          )}
          {low.data?.length && can(viewer, "estoque") ? (
            <Link href="/estoque" className="mt-2 inline-block text-sm font-semibold text-brand underline">
              Registrar entrada
            </Link>
          ) : null}
        </section>

        <section aria-labelledby="ultimas">
          <h2 id="ultimas" className="mb-3 text-lg font-semibold">Últimas vendas</h2>
          {recent.data?.length ? (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
              {recent.data.map((s) => (
                <li key={s.id}>
                  <Link href={`/vendas/${s.id}`} className="flex justify-between gap-3 p-3 text-sm hover:bg-background">
                    <span>
                      Nº {s.number} · <span className="capitalize">{formatDateTime(s.created_at, timezone)}</span>
                      {s.status === "cancelada" && <span className="ml-1 text-danger">(cancelada)</span>}
                    </span>
                    <span className="font-semibold">{formatMoney(Number(s.total_cents))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhuma venda ainda." />
          )}
        </section>
      </div>
    </div>
  );
}
