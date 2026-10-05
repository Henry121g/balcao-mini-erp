import { describe, expect, it } from "vitest";
import { addToCart, overStock, setQuantity, subtotalCents, type CartLine } from "./cart";

const agua = { productId: "a", priceCents: 300, stock: 5 };
const cafe = { productId: "c", priceCents: 1999, stock: 1 };

describe("carrinho", () => {
  it("soma quantidades do mesmo produto e calcula subtotal em centavos", () => {
    let cart: CartLine[] = [];
    cart = addToCart(cart, agua);
    cart = addToCart(cart, agua, 2);
    cart = addToCart(cart, cafe);
    expect(cart).toHaveLength(2);
    expect(subtotalCents(cart)).toBe(3 * 300 + 1999);
  });

  it("10 itens de R$ 0,10 somam exatamente R$ 1,00 (sem erro de ponto flutuante)", () => {
    const cart = addToCart([], { productId: "x", priceCents: 10, stock: 100 }, 10);
    expect(subtotalCents(cart)).toBe(100);
  });

  it("quantidade zero ou inválida remove o item", () => {
    const cart = addToCart([], agua, 2);
    expect(setQuantity(cart, "a", 0)).toEqual([]);
    expect(setQuantity(cart, "a", 1.5)).toEqual([]);
    expect(setQuantity(cart, "a", 4)[0].quantity).toBe(4);
  });

  it("aponta itens acima do saldo conhecido", () => {
    const cart = addToCart(addToCart([], cafe, 2), agua);
    expect(overStock(cart)).toEqual(["c"]);
  });
});
