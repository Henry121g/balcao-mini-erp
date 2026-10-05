// Teste de concorrência contra um Supabase real (PGlite não tem conexões simultâneas).
// Um produto com saldo S recebe N vendas simultâneas de 1 unidade (N > S), de sessões diferentes.
// Esperado: exatamente S vendas concluídas, N − S recusadas, saldo final 0 e nunca negativo.
// Também dispara vendas cruzadas (A+B e B+A) para verificar ausência de deadlock.
// Uso: node --env-file=.env.local scripts/concurrency-test.ts [N] [S]
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const N = Number(process.argv[2] ?? 12);
const S = Number(process.argv[3] ?? 5);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !anonKey || !serviceKey) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { db: { schema: "erp" }, auth: { persistSession: false } });

const stamp = Date.now();
const created: string[] = [];
let orgId = "";
let failed = false;

try {
  const { data: org, error: e1 } = await admin
    .from("organizations")
    .insert({ name: `Teste concorrência ${stamp}` })
    .select("id")
    .single();
  if (e1) throw e1;
  orgId = org.id;

  const { data: prods, error: e2 } = await admin
    .from("products")
    .insert([
      { org_id: orgId, sku: "CONC-A", name: "Produto A", price_cents: 1000 },
      { org_id: orgId, sku: "CONC-B", name: "Produto B", price_cents: 500 },
    ])
    .select("id, sku");
  if (e2) throw e2;
  const a = prods.find((p) => p.sku === "CONC-A")!.id;
  const b = prods.find((p) => p.sku === "CONC-B")!.id;

  // Vendedores temporários, cada um com sua sessão.
  const sessions: (typeof admin)[] = [];
  for (let i = 0; i < N; i++) {
    const email = `conc-${stamp}-${i}@erp.demo.test`;
    const password = randomBytes(16).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    created.push(data.user.id);
    await admin.from("members").insert({ org_id: orgId, user_id: data.user.id, role: "vendedor", full_name: `Vendedor ${i}` });
    const c = createClient(url, anonKey, { db: { schema: "erp" }, auth: { persistSession: false } });
    const { error: le } = await c.auth.signInWithPassword({ email, password });
    if (le) throw le;
    sessions.push(c);
  }

  // Estoque inicial via movimentação (o primeiro vendedor não pode; usa um admin temporário).
  const adminEmail = `conc-${stamp}-admin@erp.demo.test`;
  const adminPass = randomBytes(16).toString("base64url");
  const { data: au } = await admin.auth.admin.createUser({ email: adminEmail, password: adminPass, email_confirm: true });
  created.push(au.user!.id);
  await admin.from("members").insert({ org_id: orgId, user_id: au.user!.id, role: "admin", full_name: "Admin teste" });
  const adm = createClient(url, anonKey, { db: { schema: "erp" }, auth: { persistSession: false } });
  await adm.auth.signInWithPassword({ email: adminEmail, password: adminPass });
  for (const [pid, qty] of [[a, S], [b, N * 2]] as const) {
    const { error } = await adm.rpc("register_movement", { p_org: orgId, p_product: pid, p_type: "entrada", p_quantity: qty, p_reason: "Teste", p_unit_cost_cents: null });
    if (error) throw error;
  }

  console.log(`1) ${N} vendas simultâneas de 1 unidade do Produto A (saldo ${S})…`);
  const r1 = await Promise.all(
    sessions.map((c) => c.rpc("create_sale", { p_org: orgId, p_items: [{ product_id: a, quantity: 1 }], p_customer: null, p_discount_cents: 0 })),
  );
  const ok = r1.filter((r) => !r.error).length;
  const insufficient = r1.filter((r) => r.error?.message.includes("ESTOQUE_INSUFICIENTE")).length;
  const others = r1.filter((r) => r.error && !r.error.message.includes("ESTOQUE_INSUFICIENTE"));
  const { data: pa } = await admin.from("products").select("stock").eq("id", a).single();
  console.log(`   concluídas: ${ok} · recusadas por estoque: ${insufficient} · outros erros: ${others.length} · saldo final: ${pa!.stock}`);
  others.forEach((r) => console.log("   -", r.error?.message));
  if (ok !== S || insufficient !== N - S || pa!.stock !== 0 || others.length) failed = true;

  console.log(`2) ${N} vendas cruzadas (A+B / B+A) para checar deadlock…`);
  await adm.rpc("register_movement", { p_org: orgId, p_product: a, p_type: "entrada", p_quantity: N, p_reason: "Teste", p_unit_cost_cents: null });
  const r2 = await Promise.all(
    sessions.map((c, i) =>
      c.rpc("create_sale", {
        p_org: orgId,
        p_items: i % 2 ? [{ product_id: a, quantity: 1 }, { product_id: b, quantity: 1 }] : [{ product_id: b, quantity: 1 }, { product_id: a, quantity: 1 }],
        p_customer: null,
        p_discount_cents: 0,
      }),
    ),
  );
  const deadlocks = r2.filter((r) => r.error?.message.toLowerCase().includes("deadlock")).length;
  const ok2 = r2.filter((r) => !r.error).length;
  console.log(`   concluídas: ${ok2}/${N} · deadlocks: ${deadlocks}`);
  if (deadlocks || ok2 !== N) failed = true;

  console.log(failed ? "✗ FALHOU" : "✓ OK: sem saldo negativo, sem vendas a mais, sem deadlock.");
  if (failed) process.exitCode = 1;
} finally {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  for (const id of created) await admin.auth.admin.deleteUser(id);
}
