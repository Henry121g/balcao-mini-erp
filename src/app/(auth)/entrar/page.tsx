import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/safe-next";
import { signIn } from "../actions";
import { SignInForm } from "../auth-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const { proximo } = await searchParams;
  const next = safeNext(typeof proximo === "string" ? proximo : null);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Entrar</h1>
      <SignInForm action={signIn} next={next} />
      <p className="mt-6 text-sm">
        Não tem conta?{" "}
        <Link href="/cadastrar" className="font-semibold text-brand underline">
          Cadastre-se
        </Link>
      </p>
      <section aria-labelledby="demo" className="mt-8 rounded-xl border border-border bg-surface p-4 text-sm">
        <h2 id="demo" className="font-semibold">
          Contas de demonstração
        </h2>
        <p className="mt-1 text-muted">
          Empresa compartilhada “Mercadinho Bom Preço (demo)”. Senha de todas: <code>demo12345</code>
        </p>
        <ul className="mt-2 list-inside list-disc">
          <li>Vendedor: <code>vendedor@erp.demo.test</code></li>
          <li>Estoquista: <code>estoquista@erp.demo.test</code></li>
          <li>Somente leitura: <code>leitura@erp.demo.test</code></li>
        </ul>
        <p className="mt-2 text-muted">
          Para testar como administrador, <Link href="/cadastrar" className="underline">crie uma conta</Link>: você
          recebe uma empresa fictícia só sua.
        </p>
      </section>
    </div>
  );
}
