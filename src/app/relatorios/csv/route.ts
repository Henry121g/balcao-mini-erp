import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { centsToCsv, toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { parsePeriod } from "../period";

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const tipo = sp.get("tipo") === "produto" ? "produto" : "dia";
  const { from, to } = parsePeriod(sp.get("de"), sp.get("ate"), viewer.org.timezone);
  const supabase = await createClient();
  const args = { p_org: viewer.org.orgId, p_from: from, p_to: to };

  let csv: string;
  if (tipo === "dia") {
    const { data, error } = await supabase.rpc("report_daily", args);
    if (error) return NextResponse.json({ error: "falha ao gerar relatório" }, { status: 500 });
    csv = toCsv(
      ["Dia", "Vendas", "Faturamento (R$)", "Custo (R$)", "Margem (R$)"],
      (data ?? []).map((d: Record<string, number | string>) => [
        String(d.day),
        Number(d.sales_count),
        centsToCsv(Number(d.revenue_cents)),
        centsToCsv(Number(d.cost_cents)),
        centsToCsv(Number(d.margin_cents)),
      ]),
    );
  } else {
    const { data, error } = await supabase.rpc("report_products", args);
    if (error) return NextResponse.json({ error: "falha ao gerar relatório" }, { status: 500 });
    csv = toCsv(
      ["Código", "Produto", "Quantidade", "Receita bruta (R$)", "Margem (R$)"],
      (data ?? []).map((d: Record<string, number | string>) => [
        String(d.sku),
        String(d.name),
        Number(d.quantity),
        centsToCsv(Number(d.revenue_cents)),
        centsToCsv(Number(d.margin_cents)),
      ]),
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${tipo}-${from}-a-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
