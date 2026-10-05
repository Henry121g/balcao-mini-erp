import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
let org: string, admin: string, vendedor: string, estoquista: string, leitura: string;
let outraOrg: string, outroAdmin: string;

interface Product {
  id: string;
  sku: string;
  stock: number;
  price_cents: number;
  cost_cents: number;
}

async function product(sku: string, orgId = org): Promise<Product> {
  const { rows } = await t.db.query<Product>(
    `select id, sku, stock, price_cents::int, cost_cents::int from erp.products where org_id = $1 and sku = $2`,
    [orgId, sku],
  );
  return rows[0];
}

async function sell(uid: string, items: { product_id: string; quantity: number }[], discount = 0, orgId = org) {
  return t.as(uid, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(`select erp.create_sale($1, $2::jsonb, 'Cliente teste', $3) as id`, [
      orgId,
      JSON.stringify(items),
      discount,
    ]);
    return rows[0].id;
  });
}

async function move(uid: string, productId: string, type: string, quantity: number, reason: string | null = "Teste", cost: number | null = null) {
  return t.as(uid, (tx) =>
    tx.query(`select erp.register_movement($1, $2, $3::erp.movement_type, $4, $5, $6)`, [
      org,
      productId,
      type,
      quantity,
      reason,
      cost,
    ]),
  );
}

async function stockConsistent(orgId = org) {
  // O saldo atual deve ser a soma de todas as movimentações, e bater com o último stock_after.
  const { rows } = await t.db.query<{ ok: boolean }>(
    `select bool_and(p.stock = coalesce(m.total, 0) and p.stock = coalesce(last.stock_after, 0)) as ok
     from erp.products p
     left join (select product_id, sum(quantity) total from erp.stock_movements group by 1) m on m.product_id = p.id
     left join lateral (select stock_after from erp.stock_movements sm where sm.product_id = p.id order by id desc limit 1) last on true
     where p.org_id = $1`,
    [orgId],
  );
  return rows[0].ok;
}

beforeAll(async () => {
  t = await createTestDb();
  ({ userId: admin, orgId: org } = await t.signUp("Dona Admin"));
  ({ userId: outroAdmin, orgId: outraOrg } = await t.signUp("Outro Dono"));
  vendedor = await t.createBareUser("Vera Vendedora");
  estoquista = await t.createBareUser("Edu Estoquista");
  leitura = await t.createBareUser("Lia Leitura");
  await t.addMember(org, vendedor, "vendedor");
  await t.addMember(org, estoquista, "estoquista");
  await t.addMember(org, leitura, "leitura");
});

describe("cadastro e catálogo de exemplo", () => {
  it("cria organização sandbox com o novo usuário como admin e catálogo fictício", async () => {
    const { rows } = await t.db.query<{ role: string; n: number }>(
      `select m.role, (select count(*)::int from erp.products where org_id = m.org_id) as n
       from erp.members m where m.user_id = $1`,
      [admin],
    );
    expect(rows).toEqual([{ role: "admin", n: 12 }]);
  });

  it("o saldo de cada produto é exatamente a soma das movimentações", async () => {
    expect(await stockConsistent()).toBe(true);
  });

  it("usuário de outro app não ganha organização", async () => {
    const { rows } = await t.db.query(`select 1 from erp.members where user_id = $1`, [
      await t.createBareUser("Usuário Barbearia"),
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("venda transacional", () => {
  it("baixa o estoque de todos os itens, congela preços e numera em sequência", async () => {
    const agua = await product("BEB-001");
    const cafe = await product("MER-003");
    const antes = await t.db.query<{ n: number }>(`select last_sale_number as n from erp.organizations where id = $1`, [org]);

    const id = await sell(vendedor, [
      { product_id: agua.id, quantity: 2 },
      { product_id: cafe.id, quantity: 1 },
      { product_id: agua.id, quantity: 1 }, // repetido: soma
    ]);
    const { rows } = await t.db.query<{ number: number; subtotal: number; total: number; itens: number }>(
      `select number, subtotal_cents::int subtotal, total_cents::int total,
              (select count(*)::int from erp.sale_items where sale_id = s.id) itens
       from erp.sales s where id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({
      number: antes.rows[0].n + 1,
      subtotal: 3 * agua.price_cents + cafe.price_cents,
      total: 3 * agua.price_cents + cafe.price_cents,
      itens: 2,
    });
    expect((await product("BEB-001")).stock).toBe(agua.stock - 3);
    expect((await product("MER-003")).stock).toBe(cafe.stock - 1);
    expect(await stockConsistent()).toBe(true);
  });

  it("se um item não tem saldo, nada é gravado (nem os outros itens)", async () => {
    const agua = await product("BEB-001");
    const papel = await product("HIG-003");
    const vendas = await t.db.query<{ n: number }>(`select count(*)::int n from erp.sales where org_id = $1`, [org]);
    await expect(
      sell(vendedor, [
        { product_id: agua.id, quantity: 1 },
        { product_id: papel.id, quantity: papel.stock + 1 },
      ]),
    ).rejects.toThrow(/ESTOQUE_INSUFICIENTE/);
    expect((await product("BEB-001")).stock).toBe(agua.stock);
    const depois = await t.db.query<{ n: number }>(`select count(*)::int n from erp.sales where org_id = $1`, [org]);
    expect(depois.rows[0].n).toBe(vendas.rows[0].n);
  });

  it("aplica desconto em centavos e recusa desconto maior que o subtotal", async () => {
    const sabonete = await product("HIG-001"); // R$ 2,49
    const id = await sell(vendedor, [{ product_id: sabonete.id, quantity: 3 }], 47); // 7,47 − 0,47
    const { rows } = await t.db.query<{ total: number }>(`select total_cents::int total from erp.sales where id = $1`, [id]);
    expect(rows[0].total).toBe(700);
    await expect(sell(vendedor, [{ product_id: sabonete.id, quantity: 1 }], 250)).rejects.toThrow(/DESCONTO_INVALIDO/);
  });

  it("recusa quantidade inválida, lista vazia e produto de outra organização", async () => {
    const agua = await product("BEB-001");
    await expect(sell(vendedor, [{ product_id: agua.id, quantity: 0 }])).rejects.toThrow(/QUANTIDADE_INVALIDA/);
    await expect(sell(vendedor, [])).rejects.toThrow(/VENDA_SEM_ITENS/);
    const alheio = await product("BEB-001", outraOrg);
    await expect(sell(vendedor, [{ product_id: alheio.id, quantity: 1 }])).rejects.toThrow(/PRODUTO_INVALIDO/);
  });

  it("estoquista e leitura não registram vendas", async () => {
    const agua = await product("BEB-001");
    await expect(sell(estoquista, [{ product_id: agua.id, quantity: 1 }])).rejects.toThrow(/SEM_PERMISSAO/);
    await expect(sell(leitura, [{ product_id: agua.id, quantity: 1 }])).rejects.toThrow(/SEM_PERMISSAO/);
  });

  it("vender exatamente o saldo zera o estoque; a próxima venda é recusada", async () => {
    const suco = await product("BEB-003");
    await sell(vendedor, [{ product_id: suco.id, quantity: suco.stock }]);
    expect((await product("BEB-003")).stock).toBe(0);
    await expect(sell(vendedor, [{ product_id: suco.id, quantity: 1 }])).rejects.toThrow(/ESTOQUE_INSUFICIENTE/);
  });
});

describe("movimentações de estoque", () => {
  it("entrada soma, atualiza o custo e registra o saldo resultante", async () => {
    const suco = await product("BEB-003");
    await move(estoquista, suco.id, "entrada", 10, "NF 123 (fictícia)", 700);
    const p = await product("BEB-003");
    expect(p.stock).toBe(suco.stock + 10);
    expect(p.cost_cents).toBe(700);
  });

  it("saída acima do saldo é recusada; saída exige motivo", async () => {
    const suco = await product("BEB-003");
    await expect(move(estoquista, suco.id, "saida", suco.stock + 1)).rejects.toThrow(/ESTOQUE_INSUFICIENTE/);
    await expect(move(estoquista, suco.id, "saida", 1, null)).rejects.toThrow(/MOTIVO_OBRIGATORIO/);
    await move(estoquista, suco.id, "saida", 1, "Avaria");
    expect((await product("BEB-003")).stock).toBe(suco.stock - 1);
  });

  it("ajuste usa a contagem física e calcula a diferença", async () => {
    const arroz = await product("MER-001");
    await move(admin, arroz.id, "ajuste", 7, "Inventário mensal");
    const { rows } = await t.db.query<{ quantity: number; stock_after: number }>(
      `select quantity, stock_after from erp.stock_movements where product_id = $1 order by id desc limit 1`,
      [arroz.id],
    );
    expect(rows[0]).toEqual({ quantity: 7 - arroz.stock, stock_after: 7 });
    await expect(move(admin, arroz.id, "ajuste", 7, "Sem mudança")).rejects.toThrow(/AJUSTE_SEM_DIFERENCA/);
  });

  it("vendedor não movimenta estoque e ninguém registra 'venda' manualmente", async () => {
    const arroz = await product("MER-001");
    await expect(move(vendedor, arroz.id, "entrada", 1)).rejects.toThrow(/SEM_PERMISSAO/);
    await expect(move(admin, arroz.id, "venda", -1)).rejects.toThrow(/TIPO_INVALIDO/);
  });

  it("o saldo não pode ser editado diretamente, nem por admin", async () => {
    const arroz = await product("MER-001");
    await expect(
      t.as(admin, (tx) => tx.query(`update erp.products set stock = 999 where id = $1`, [arroz.id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("histórico é imutável", async () => {
    await expect(
      t.as(admin, (tx) => tx.query(`delete from erp.stock_movements where org_id = $1`, [org])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      t.as(admin, (tx) => tx.query(`update erp.sales set total_cents = 0 where org_id = $1`, [org])),
    ).rejects.toThrow(/permission denied/);
  });

  it("após tudo isso, o saldo continua igual à soma das movimentações", async () => {
    expect(await stockConsistent()).toBe(true);
  });
});

describe("cancelamento de venda", () => {
  it("só admin cancela; o estoque volta com movimentação de estorno", async () => {
    const detergente = await product("LIM-001");
    const id = await sell(vendedor, [{ product_id: detergente.id, quantity: 2 }]);
    await expect(
      t.as(vendedor, (tx) => tx.query(`select erp.cancel_sale($1, 'Cliente desistiu')`, [id])),
    ).rejects.toThrow(/SEM_PERMISSAO/);
    await t.as(admin, (tx) => tx.query(`select erp.cancel_sale($1, 'Cliente desistiu')`, [id]));
    expect((await product("LIM-001")).stock).toBe(detergente.stock);
    await expect(
      t.as(admin, (tx) => tx.query(`select erp.cancel_sale($1, 'De novo')`, [id])),
    ).rejects.toThrow(/VENDA_JA_CANCELADA/);
    expect(await stockConsistent()).toBe(true);
  });

  it("admin de outra organização não cancela nem descobre a venda", async () => {
    const agua = await product("BEB-001");
    const id = await sell(vendedor, [{ product_id: agua.id, quantity: 1 }]);
    await expect(
      t.as(outroAdmin, (tx) => tx.query(`select erp.cancel_sale($1, 'Invasão')`, [id])),
    ).rejects.toThrow(/VENDA_INEXISTENTE/);
  });
});

describe("relatórios e alertas", () => {
  it("relatório diário bate com a soma das vendas concluídas e ignora canceladas", async () => {
    const r = await t.as(admin, async (tx) => {
      const { rows } = await tx.query<{ revenue: number; cost: number; margin: number }>(
        `select sum(revenue_cents)::int revenue, sum(cost_cents)::int cost, sum(margin_cents)::int margin
         from erp.report_daily($1, current_date - 40, current_date + 1)`,
        [org],
      );
      return rows[0];
    });
    const { rows } = await t.db.query<{ total: number }>(
      `select sum(total_cents)::int total from erp.sales where org_id = $1 and status = 'concluida'`,
      [org],
    );
    expect(r.revenue).toBe(rows[0].total);
    expect(r.margin).toBe(r.revenue - r.cost);
  });

  it("relatório por produto respeita o período", async () => {
    const vazio = await t.as(admin, async (tx) =>
      (await tx.query(`select * from erp.report_products($1, '2000-01-01', '2000-01-31')`, [org])).rows,
    );
    expect(vazio).toHaveLength(0);
  });

  it("alerta de estoque mínimo lista produtos no limite ou abaixo", async () => {
    const lista = await t.as(vendedor, async (tx) =>
      (await tx.query<{ sku: string }>(`select sku from erp.low_stock where org_id = $1 order by sku`, [org])).rows.map((r) => r.sku),
    );
    expect(lista.length).toBeGreaterThan(0);
    const { rows } = await t.db.query<{ sku: string }>(
      `select sku from erp.products where org_id = $1 and active and stock <= min_stock order by sku`,
      [org],
    );
    expect(lista).toEqual(rows.map((r) => r.sku));
  });
});

describe("remoção de organização (redefinição da demo)", () => {
  it("apagar uma organização remove tudo dela em cascata, sem afetar as outras", async () => {
    const { orgId: tmp } = await t.signUp("Temporário");
    const antes = await t.db.query<{ n: number }>(`select count(*)::int n from erp.products where org_id = $1`, [org]);
    await t.db.query(`delete from erp.organizations where id = $1`, [tmp]);
    for (const table of ["products", "sales", "sale_items", "stock_movements", "members", "categories"]) {
      const { rows } = await t.db.query<{ n: number }>(`select count(*)::int n from erp.${table} where org_id = $1`, [tmp]);
      expect(rows[0].n, table).toBe(0);
    }
    const depois = await t.db.query<{ n: number }>(`select count(*)::int n from erp.products where org_id = $1`, [org]);
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });

  it("um produto com histórico não pode ser apagado isoladamente (nem pelo service_role)", async () => {
    const agua = await product("BEB-001");
    await expect(t.db.query(`delete from erp.products where id = $1`, [agua.id])).rejects.toThrow(/foreign key/);
  });
});

describe("isolamento entre organizações (RLS)", () => {
  it.each(["products", "sales", "sale_items", "stock_movements", "categories", "suppliers", "members"])(
    "admin de outra organização não lê %s desta",
    async (table) => {
      const { rows } = await t.as(outroAdmin, (tx) =>
        tx.query(`select 1 from erp.${table} where org_id = $1`, [org]),
      );
      expect(rows).toHaveLength(0);
    },
  );

  it("não cria produto em organização alheia", async () => {
    await expect(
      t.as(outroAdmin, (tx) =>
        tx.query(`insert into erp.products (org_id, sku, name, price_cents) values ($1, 'X-1', 'Invasor', 100)`, [org]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("não vincula produto a categoria de outra organização (FK composta)", async () => {
    const { rows } = await t.db.query<{ id: string }>(`select id from erp.categories where org_id = $1 limit 1`, [outraOrg]);
    await expect(
      t.as(admin, (tx) =>
        tx.query(`insert into erp.products (org_id, sku, name, price_cents, category_id) values ($1, 'X-2', 'Teste', 100, $2)`, [
          org,
          rows[0].id,
        ]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("leitura não altera catálogo; vendedor também não", async () => {
    for (const uid of [leitura, vendedor]) {
      const r = await t.as(uid, (tx) => tx.query(`update erp.products set price_cents = 1 where org_id = $1 returning id`, [org]));
      expect(r.rows).toHaveLength(0);
    }
  });

  it("estoquista cadastra produto com saldo zero (saldo só entra por movimentação)", async () => {
    await t.as(estoquista, (tx) =>
      tx.query(`insert into erp.products (org_id, sku, name, price_cents) values ($1, 'NOVO-1', 'Produto novo', 990)`, [org]),
    );
    expect((await product("NOVO-1")).stock).toBe(0);
    await expect(
      t.as(estoquista, (tx) =>
        tx.query(`insert into erp.products (org_id, sku, name, price_cents, stock) values ($1, 'NOVO-2', 'Com saldo', 990, 50)`, [org]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
