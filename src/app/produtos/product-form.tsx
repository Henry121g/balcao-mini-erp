"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, buttonStyles, Field, SubmitButton } from "@/components/ui";
import { saveProduct } from "./actions";

interface Option {
  id: string;
  name: string;
}

export function ProductForm(props: {
  categories: Option[];
  suppliers: Option[];
  initial?: {
    id: string;
    sku: string;
    name: string;
    category_id: string | null;
    supplier_id: string | null;
    price: string;
    cost: string;
    min_stock: number;
    active: boolean;
  };
}) {
  const [state, action] = useActionState(saveProduct, {});
  const p = props.initial;
  const fe = state.fieldErrors ?? {};
  const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base";

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4" noValidate>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código (SKU)" name="sku" defaultValue={p?.sku} required error={fe.sku} hint="Ex.: BEB-010" autoCapitalize="characters" />
        <Field label="Nome" name="name" defaultValue={p?.name} required error={fe.name} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Categoria
          <select name="categoryId" defaultValue={p?.category_id ?? ""} className={select}>
            <option value="">Sem categoria</option>
            {props.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Fornecedor
          <select name="supplierId" defaultValue={p?.supplier_id ?? ""} className={select}>
            <option value="">Sem fornecedor</option>
            {props.suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <Field label="Preço de venda (R$)" name="price" inputMode="decimal" placeholder="12,90" defaultValue={p?.price} required error={fe.price} />
        <Field label="Custo (R$)" name="cost" inputMode="decimal" placeholder="7,50" defaultValue={p?.cost} error={fe.cost} hint="Atualizado também nas entradas com custo." />
        <Field label="Estoque mínimo" name="minStock" type="number" min={0} step={1} defaultValue={p?.min_stock ?? 0} required error={fe.minStock} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="size-5" /> Ativo (disponível para venda)
      </label>
      {!p && (
        <p className="text-sm text-muted">
          O produto começa com saldo zero. Registre a entrada em <strong>Estoque</strong> depois de salvar.
        </p>
      )}
      <div className="flex gap-3">
        <SubmitButton pendingLabel="Salvando…">{p ? "Salvar alterações" : "Cadastrar produto"}</SubmitButton>
        <Link href="/produtos" className={buttonStyles.secondary}>Cancelar</Link>
      </div>
    </form>
  );
}
