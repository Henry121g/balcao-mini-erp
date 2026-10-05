"use client";

import { useActionState, useState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui";
import { registerMovement } from "./actions";

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  stock: number;
}

const HELP: Record<string, string> = {
  entrada: "Compra ou devolução de fornecedor. Soma ao saldo.",
  saida: "Perda, avaria ou uso interno. Subtrai do saldo; exige motivo.",
  ajuste: "Informe a contagem física; o sistema calcula a diferença. Exige motivo.",
};

export function MovementForm({ products, defaultProduct }: { products: ProductOption[]; defaultProduct?: string }) {
  const [state, action] = useActionState(registerMovement, {});
  const [type, setType] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [productId, setProductId] = useState(defaultProduct ?? "");
  const current = products.find((p) => p.id === productId);
  const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base";

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Produto
          <select name="productId" required value={productId} onChange={(e) => setProductId(e.target.value)} className={select}>
            <option value="">Selecione…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name} (saldo {p.stock})
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Tipo</legend>
          <div className="flex flex-wrap gap-3 pt-1">
            {(["entrada", "saida", "ajuste"] as const).map((t) => (
              <label key={t} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
                <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
                {t === "entrada" ? "Entrada" : t === "saida" ? "Saída" : "Ajuste"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="text-sm text-muted" aria-live="polite">{HELP[type]}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Field
          key={type}
          label={type === "ajuste" ? "Contagem física" : "Quantidade"}
          name="quantity"
          type="number"
          min={type === "ajuste" ? 0 : 1}
          step={1}
          required
          hint={current ? `Saldo atual: ${current.stock}` : undefined}
        />
        {type === "entrada" && <Field label="Custo unitário (R$, opcional)" name="cost" inputMode="decimal" placeholder="7,50" />}
        <Field label={type === "entrada" ? "Observação (opcional)" : "Motivo"} name="reason" maxLength={200} required={type !== "entrada"} />
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      <SubmitButton pendingLabel="Registrando…" className="self-start">Registrar movimentação</SubmitButton>
    </form>
  );
}
