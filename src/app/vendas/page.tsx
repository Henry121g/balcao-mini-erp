import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Pagination, parsePage } from "@/components/pagination";
import { Alert, buttonStyles } from "@/components/ui";
import { can, requireViewer } from "@/lib/auth";
import { formatDateTime, formatMoney, localDate, SALE_STATUS_LABEL, zonedToUtcIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Vendas" };

const PAGE_SIZE = 20;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function SalesPage({ searchParams }: PageProps<"/vendas">) {
  const viewer = await requireViewer("/vendas");
  const sp = await searchParams;
  const tz = viewer.org.timezone;
  const today = localDate(new Date(), tz);
  const de = isDate(sp.de) ? sp.de : addDays(today, -30);
  const ate = isDate(sp.ate) ? sp.ate : today;
  const page = parsePage(sp.pagina);
  const supabase = await createClient();

  const { data, count, error } = await supabase
    .from("sales")
    .select("id, number, customer_name, status, total_cents, created_at", { count: "exact" })
    .eq("org_id", viewer.org.orgId)
    .gte("created_at", zonedToUtcIso(de, "00:00", tz))
    .lt("created_at", zonedToUtcIso(addDays(ate, 1), "00:00", tz))
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const input = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Vendas</h1>
        {can(viewer, "vender") && <Link href="/vendas/nova" className={buttonStyles.primary}>Nova venda</Link>}
      </header>

      <form className="flex flex-wrap items-end gap-3" action="/vendas">
        <label className="flex flex-col gap-1 text-sm font-medium">
          De
          <input type="date" name="de" defaultValue={de} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Até
          <input type="date" name="ate" defaultValue={ate} className={input} />
        </label>
        <button type="submit" className={buttonStyles.secondary}>Filtrar</button>
      </form>

      {error && <Alert kind="error">Não foi possível carregar as vendas. Atualize a página.</Alert>}

      {data?.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {data.map((s) => (
            <li key={s.id}>
              <Link href={`/vendas/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm hover:bg-background">
                <span>
                  <span className="font-semibold">Nº {s.number}</span> ·{" "}
                  <span className="capitalize">{formatDateTime(s.created_at, tz)}</span>
                  {s.customer_name && <span className="text-muted"> · {s.customer_name}</span>}
                </span>
                <span className="flex items-center gap-3">
                  {s.status === "cancelada" && <span className="text-danger">{SALE_STATUS_LABEL[s.status]}</span>}
                  <span className={`font-semibold ${s.status === "cancelada" ? "line-through text-muted" : ""}`}>
                    {formatMoney(Number(s.total_cents))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        !error && <EmptyState title="Nenhuma venda no período." />
      )}

      <Pagination basePath="/vendas" params={{ de, ate }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
