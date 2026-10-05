import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { buttonStyles } from "@/components/ui";
import { can, requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteCategory, deleteSupplier } from "./actions";
import { CategoryForm, SupplierForm } from "./forms";

export const metadata: Metadata = { title: "Cadastros" };

export default async function RegistriesPage() {
  const viewer = await requireViewer("/cadastros");
  const supabase = await createClient();
  const orgId = viewer.org.orgId;
  const [{ data: categories }, { data: suppliers }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("org_id", orgId).order("name"),
    supabase.from("suppliers").select("id, name, document, email, phone").eq("org_id", orgId).order("name"),
  ]);
  const editable = can(viewer, "catalogo");

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-bold">Cadastros</h1>
      {!editable && <p className="text-sm text-muted">Seu perfil pode consultar, mas não alterar cadastros.</p>}

      <section aria-labelledby="categorias" className="flex flex-col gap-4">
        <h2 id="categorias" className="text-lg font-semibold">Categorias</h2>
        {editable && <CategoryForm />}
        {categories?.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-end justify-between gap-3 p-3">
                {editable ? <CategoryForm id={c.id} name={c.name} /> : <span>{c.name}</span>}
                {editable && (
                  <form action={deleteCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className={buttonStyles.danger}>
                      Excluir <span className="sr-only">categoria {c.name}</span>
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhuma categoria." />
        )}
        {editable && <p className="text-xs text-muted">Excluir uma categoria deixa seus produtos sem categoria; nada é apagado.</p>}
      </section>

      <section aria-labelledby="fornecedores" className="flex flex-col gap-4">
        <h2 id="fornecedores" className="text-lg font-semibold">Fornecedores</h2>
        {editable && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <SupplierForm />
          </div>
        )}
        {suppliers?.length ? (
          <ul className="flex flex-col gap-3">
            {suppliers.map((s) => (
              <li key={s.id} className="rounded-xl border border-border bg-surface p-4">
                {editable ? (
                  <details>
                    <summary className="cursor-pointer font-semibold">{s.name}</summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <SupplierForm {...s} />
                      <form action={deleteSupplier}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className={buttonStyles.danger}>
                          Excluir <span className="sr-only">fornecedor {s.name}</span>
                        </button>
                      </form>
                    </div>
                  </details>
                ) : (
                  <p>
                    <span className="font-semibold">{s.name}</span>
                    <span className="block text-sm text-muted">{[s.document, s.email, s.phone].filter(Boolean).join(" · ")}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhum fornecedor." />
        )}
      </section>
    </div>
  );
}
