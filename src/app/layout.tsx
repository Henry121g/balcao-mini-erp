import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { getViewer, ROLE_LABEL } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Balcão — Mini-ERP de estoque e vendas", template: "%s · Balcão" },
  description: "Projeto de portfólio: mini-ERP com Next.js e Supabase. Dados fictícios.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  const navLink = "rounded-md px-2 py-1.5 hover:bg-surface";

  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        <div role="note" className="bg-foreground px-4 py-1.5 text-center text-xs text-background">
          Projeto de portfólio com dados fictícios — nenhuma venda ou empresa é real.
        </div>
        <header className="border-b border-border">
          <nav
            aria-label="Principal"
            className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm"
          >
            <Link href={viewer ? "/painel" : "/"} className="mr-auto text-base font-bold text-brand">
              ▤ Balcão
            </Link>
            {viewer ? (
              <>
                <Link href="/painel" className={navLink}>Painel</Link>
                <Link href="/vendas" className={navLink}>Vendas</Link>
                <Link href="/produtos" className={navLink}>Produtos</Link>
                <Link href="/estoque" className={navLink}>Estoque</Link>
                <Link href="/relatorios" className={navLink}>Relatórios</Link>
                <Link href="/cadastros" className={navLink}>Cadastros</Link>
                <span className="hidden text-xs text-muted md:inline">
                  {viewer.org.orgName} · {ROLE_LABEL[viewer.org.role]}
                </span>
                <form action={signOut}>
                  <button type="submit" className={navLink}>
                    Sair <span className="sr-only">da conta de {viewer.fullName}</span>
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/entrar" className={navLink}>Entrar</Link>
                <Link href="/cadastrar" className={navLink}>Criar conta</Link>
              </>
            )}
          </nav>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted">
          Projeto de portfólio desenvolvido com assistência de IA (Claude Code).
        </footer>
      </body>
    </html>
  );
}
