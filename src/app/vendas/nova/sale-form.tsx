"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui";
import { buttonStyles } from "@/components/button-styles";
import { addToCart, overStock, setQuantity, subtotalCents, type CartLine } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";
import { createSale } from "../actions";

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  price_cents: number;
  stock: number;
}

export function SaleForm({ products }: { products: ProductOption[] }) {
  const [state, action] = useActionState(createSale, {});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [discount, setDiscount] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const term = search.trim().toLowerCase();
  const matches = term
    ? products.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)).slice(0, 8)
    : [];
  const subtotal = subtotalCents(cart);
  const discountCents = discount ? parseMoneyToCents(discount) : 0;
  const total = discountCents === null ? null : subtotal - discountCents;
  const over = overStock(cart);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="busca-produto">
          Adicionar produto (nome ou código)
          <input
            id="busca-produto"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            aria-controls="resultados-produto"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base"
          />
        </label>
        <ul id="resultados-produto" aria-label="Resultados da busca" className="flex flex-col gap-1" aria-live="polite">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={p.stock === 0}
                onClick={() => {
                  setCart((c) => addToCart(c, { productId: p.id, priceCents: p.price_cents, stock: p.stock }));
                  setSearch("");
                }}
                className="flex w-full justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:border-brand disabled:opacity-50"
              >
                <span>
                  <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name}
                </span>
                <span>
                  {formatMoney(p.price_cents)} · {p.stock === 0 ? "sem estoque" : `${p.stock} em estoque`}
                </span>
              </button>
            </li>
          ))}
          {term && matches.length === 0 && <li className="text-sm text-muted">Nenhum produto encontrado.</li>}
        </ul>

        <section aria-labelledby="itens">
          <h2 id="itens" className="mb-2 font-semibold">Itens ({cart.length})</h2>
          {cart.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              Busque um produto acima para adicioná-lo.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
              {cart.map((l) => {
                const p = byId.get(l.productId)!;
                const qtyId = `qtd-${l.productId}`;
                return (
                  <li key={l.productId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="flex-1">
                      {p.name}
                      <span className="block text-xs text-muted">{formatMoney(l.priceCents)} cada</span>
                      {over.includes(l.productId) && (
                        <span className="block text-xs text-danger">Acima do saldo conhecido ({l.stock}).</span>
                      )}
                    </span>
                    <label htmlFor={qtyId} className="sr-only">Quantidade de {p.name}</label>
                    <input
                      id={qtyId}
                      type="number"
                      min={1}
                      step={1}
                      value={l.quantity}
                      onChange={(e) => setCart((c) => setQuantity(c, l.productId, Number(e.target.value)))}
                      className="min-h-11 w-20 rounded-lg border border-border bg-background px-2 text-right"
                    />
                    <span className="w-24 text-right font-semibold">{formatMoney(l.priceCents * l.quantity)}</span>
                    <button
                      type="button"
                      onClick={() => setCart((c) => setQuantity(c, l.productId, 0))}
                      className="min-h-11 rounded-md px-2 text-danger hover:bg-danger-bg"
                    >
                      Remover <span className="sr-only">{p.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside aria-label="Resumo da venda" className="flex h-fit flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <input type="hidden" name="items" value={JSON.stringify(cart.map((l) => ({ product_id: l.productId, quantity: l.quantity })))} />
        <Field label="Cliente (opcional)" name="customer" maxLength={100} />
        <Field
          label="Desconto (R$)"
          name="discount"
          inputMode="decimal"
          placeholder="0,00"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          error={discountCents === null ? "Use o formato 5,00." : total !== null && total < 0 ? "Maior que o subtotal." : undefined}
        />
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">Subtotal</dt>
          <dd className="text-right">{formatMoney(subtotal)}</dd>
          <dt className="text-muted">Desconto</dt>
          <dd className="text-right">{formatMoney(discountCents ?? 0)}</dd>
          <dt className="text-base font-semibold">Total</dt>
          <dd className="text-right text-base font-semibold" aria-live="polite">
            {total !== null && total >= 0 ? formatMoney(total) : "—"}
          </dd>
        </dl>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        <SubmitButton pendingLabel="Registrando…" disabled={cart.length === 0 || total === null || total < 0}>
          Concluir venda
        </SubmitButton>
        {cart.length > 0 && (
          <button type="button" className={buttonStyles.secondary} onClick={() => setCart([])}>
            Limpar itens
          </button>
        )}
        <p className="text-xs text-muted">
          Preços e saldos são conferidos novamente no servidor no momento da venda.
        </p>
      </aside>
    </form>
  );
}
