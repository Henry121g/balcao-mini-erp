import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const root = join(__dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

export type Role = "anon" | "authenticated" | "service_role";
export type MemberRole = "admin" | "vendedor" | "estoquista" | "leitura";

export interface TestDb {
  db: PGlite;
  /** Executa `fn` como um usuário da API (RLS ativa), dentro de uma transação. */
  as<T>(uid: string | null, fn: (tx: Transaction) => Promise<T>, role?: Role): Promise<T>;
  /** Cadastra pelo app (trigger cria organização sandbox com catálogo). Retorna usuário e organização. */
  signUp(fullName: string): Promise<{ userId: string; orgId: string }>;
  /** Cria usuário sem organização (simula conta de outro app ou membro convidado). */
  createBareUser(fullName: string): Promise<string>;
  addMember(orgId: string, userId: string, role: MemberRole, fullName?: string): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create({ extensions: { btree_gist } });
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  const seed = join(root, "supabase", "seed.sql");
  if (existsSync(seed)) await db.exec(readFileSync(seed, "utf8"));

  const as: TestDb["as"] = (uid, fn, role = uid ? "authenticated" : "anon") =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
      await tx.exec(`set local role ${role}`);
      return fn(tx);
    });

  let counter = 0;
  const insertUser = async (fullName: string, app: string) => {
    counter += 1;
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('app', $3::text, 'full_name', $2::text)) returning id`,
      [`usuario${counter}@exemplo.test`, fullName, app],
    );
    return rows[0].id;
  };

  const signUp: TestDb["signUp"] = async (fullName) => {
    const userId = await insertUser(fullName, "erp");
    const { rows } = await db.query<{ org_id: string }>(`select org_id from erp.members where user_id = $1`, [userId]);
    return { userId, orgId: rows[0].org_id };
  };

  const createBareUser: TestDb["createBareUser"] = (fullName) => insertUser(fullName, "outro-app");

  const addMember: TestDb["addMember"] = async (orgId, userId, role, fullName = "Membro") => {
    await db.query(`insert into erp.members (org_id, user_id, role, full_name) values ($1, $2, $3, $4)`, [
      orgId,
      userId,
      role,
      fullName,
    ]);
  };

  return { db, as, signUp, createBareUser, addMember };
}
