"use client";

import { useActionState, useRef } from "react";
import { Alert, buttonStyles, SubmitButton } from "@/components/ui";
import { cancelSale } from "../actions";

export function CancelSaleForm({ saleId }: { saleId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(cancelSale, {});
  return (
    <>
      <button type="button" className={`${buttonStyles.danger} self-start`} onClick={() => dialog.current?.showModal()}>
        Cancelar venda
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="titulo-cancelar"
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border border-border bg-surface p-5 text-foreground backdrop:bg-black/50"
      >
        <form action={action} className="flex flex-col gap-4">
          <h2 id="titulo-cancelar" className="text-lg font-semibold">Cancelar esta venda?</h2>
          <p className="text-sm text-muted">Os itens voltam ao estoque com uma movimentação de estorno. Não pode ser desfeito.</p>
          <input type="hidden" name="saleId" value={saleId} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Motivo
            <textarea name="reason" required minLength={3} maxLength={300} rows={3} className="rounded-lg border border-border bg-background px-3 py-2 text-base font-normal" />
          </label>
          {state.error && <Alert kind="error">{state.error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonStyles.secondary} onClick={() => dialog.current?.close()}>
              Voltar
            </button>
            <SubmitButton variant="danger" pendingLabel="Cancelando…">Confirmar cancelamento</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
