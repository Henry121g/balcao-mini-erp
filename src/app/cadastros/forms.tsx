"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui";
import { saveCategory, saveSupplier, type CrudState } from "./actions";

function Feedback({ state }: { state: CrudState }) {
  if (state.error) return <Alert kind="error">{state.error}</Alert>;
  if (state.success) return <Alert kind="success">{state.success}</Alert>;
  return null;
}

export function CategoryForm({ id, name }: { id?: string; name?: string }) {
  const [state, action] = useActionState(saveCategory, {});
  const key = id ?? "nova";
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {id && <input type="hidden" name="id" value={id} />}
        <Field label={id ? "Nome da categoria" : "Nova categoria"} name="name" id={`cat-${key}`} defaultValue={name} required maxLength={60} />
        <SubmitButton variant={id ? "secondary" : "primary"} pendingLabel="Salvando…">
          {id ? "Renomear" : "Adicionar"} <span className="sr-only">{name ?? "categoria"}</span>
        </SubmitButton>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function SupplierForm(props: { id?: string; name?: string; document?: string | null; email?: string | null; phone?: string | null }) {
  const [state, action] = useActionState(saveSupplier, {});
  const key = props.id ?? "novo";
  return (
    <form action={action} className="flex flex-col gap-3">
      {props.id && <input type="hidden" name="id" value={props.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" name="name" id={`for-nome-${key}`} defaultValue={props.name} required maxLength={100} />
        <Field label="CNPJ/CPF (opcional)" name="document" id={`for-doc-${key}`} defaultValue={props.document ?? ""} />
        <Field label="E-mail (opcional)" name="email" id={`for-email-${key}`} type="email" defaultValue={props.email ?? ""} />
        <Field label="Telefone (opcional)" name="phone" id={`for-tel-${key}`} type="tel" defaultValue={props.phone ?? ""} />
      </div>
      <Feedback state={state} />
      <SubmitButton variant={props.id ? "secondary" : "primary"} pendingLabel="Salvando…" className="self-start">
        {props.id ? "Salvar" : "Cadastrar fornecedor"}
      </SubmitButton>
    </form>
  );
}
