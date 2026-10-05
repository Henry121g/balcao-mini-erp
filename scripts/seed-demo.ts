// Cria/redefine a empresa de demonstração compartilhada e suas contas públicas (papéis limitados).
// Uso: node --env-file=.env.local scripts/seed-demo.ts   (também roda diariamente no GitHub Actions)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  db: { schema: "erp" },
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_ORG_NAME = "Mercadinho Bom Preço (demo)";
const PUBLIC_PASSWORD = "demo12345"; // contas sem papel de administrador

const USERS = [
  { email: "vendedor@erp.demo.test", fullName: "Vera Vendedora", role: "vendedor" },
  { email: "estoquista@erp.demo.test", fullName: "Edu Estoquista", role: "estoquista" },
  { email: "leitura@erp.demo.test", fullName: "Lia Consulta", role: "leitura" },
] as const;

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

// 1) Recria a organização demo do zero (cascata apaga catálogo, vendas e histórico).
await admin.from("organizations").delete().eq("name", DEMO_ORG_NAME).eq("is_sandbox", false);
const { data: org, error: orgError } = await admin
  .from("organizations")
  .insert({ name: DEMO_ORG_NAME, is_sandbox: false })
  .select("id")
  .single();
if (orgError) throw orgError;

// 2) Contas públicas (sem metadado app=erp, para não ganharem sandbox) e vínculo à organização.
const ids: string[] = [];
for (const u of USERS) {
  let id = await findUserId(u.email);
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: PUBLIC_PASSWORD, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: PUBLIC_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.fullName },
    });
    if (error) throw error;
    id = data.user.id;
  }
  const { error } = await admin.from("members").insert({ org_id: org.id, user_id: id, role: u.role, full_name: u.fullName });
  if (error) throw error;
  ids.push(id);
  console.log(`✓ ${u.role.padEnd(11)} ${u.email}`);
}

// 3) Catálogo fictício + 30 dias de vendas, registradas em nome da vendedora demo.
const { error: seedError } = await admin.rpc("seed_sample_catalog", { p_org: org.id, p_actor: ids[0], p_with_sales: true });
if (seedError) throw seedError;
const { count } = await admin.from("sales").select("id", { count: "exact", head: true }).eq("org_id", org.id);
console.log(`✓ ${DEMO_ORG_NAME}: catálogo e ${count} vendas fictícias.`);
