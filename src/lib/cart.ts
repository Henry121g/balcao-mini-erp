// Cálculos do carrinho em centavos inteiros (apenas para exibição; o banco recalcula tudo).

export interface CartLine {
  productId: string;
  quantity: number;
  priceCents: number;
  stock: number;
}

export function addToCart(cart: CartLine[], line: Omit<CartLine, "quantity">, quantity = 1): CartLine[] {
  const existing = cart.find((l) => l.productId === line.productId);
  if (existing) {
    return cart.map((l) => (l.productId === line.productId ? { ...l, quantity: l.quantity + quantity } : l));
  }
  return [...cart, { ...line, quantity }];
}

export function setQuantity(cart: CartLine[], productId: string, quantity: number): CartLine[] {
  if (!Number.isInteger(quantity) || quantity <= 0) return cart.filter((l) => l.productId !== productId);
  return cart.map((l) => (l.productId === productId ? { ...l, quantity } : l));
}

export function subtotalCents(cart: CartLine[]): number {
  return cart.reduce((acc, l) => acc + l.priceCents * l.quantity, 0);
}

/** Itens cuja quantidade passa do saldo conhecido (aviso antecipado; o banco tem a palavra final). */
export function overStock(cart: CartLine[]): string[] {
  return cart.filter((l) => l.quantity > l.stock).map((l) => l.productId);
}
