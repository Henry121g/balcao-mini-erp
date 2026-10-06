import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonStyles } from "@/components/button-styles";
import { getViewer } from "@/lib/auth";

export default async function HomePage() {
  if (await getViewer()) redirect("/painel");

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-start gap-4 py-6">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Estoque e vendas que sempre batem com a prateleira.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Registre vendas, entradas e ajustes; o saldo se atualiza sozinho, nunca fica negativo e cada
          movimentação fica no histórico.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/cadastrar" className={buttonStyles.primary}>
            Criar conta de teste
          </Link>
          <Link href="/entrar" className={buttonStyles.secondary}>
            Entrar com conta demo
          </Link>
        </div>
        <p className="text-sm text-muted">
          Cada conta nova recebe uma empresa fictícia própria, com catálogo e 30 dias de vendas de exemplo.
        </p>
      </section>

      <section aria-labelledby="destaques" className="grid gap-4 sm:grid-cols-3">
        <h2 id="destaques" className="sr-only">
          Destaques
        </h2>
        {[
          ["Venda e estoque juntos", "Cada venda baixa o estoque na mesma transação. Se um item faltar, nada é gravado."],
          ["Sem saldo negativo", "Duas vendas do último item ao mesmo tempo: uma conclui, a outra é avisada."],
          ["Centavos exatos", "Preços, descontos e totais calculados em centavos inteiros, sem arredondamento."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
