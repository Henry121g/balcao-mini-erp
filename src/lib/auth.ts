import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type MemberRole = "admin" | "vendedor" | "estoquista" | "leitura";

export const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  estoquista: "Estoquista",
  leitura: "Somente leitura",
};

export interface Membership {
  orgId: string;
  orgName: string;
  role: MemberRole;
  timezone: string;
  isSandbox: boolean;
}

export interface Viewer {
  id: string;
  email: string | null;
  fullName: string;
  org: Membership;
  memberships: Membership[];
}

export const ORG_COOKIE = "erp_org";

/** Usuário autenticado (validado via getClaims) e a organização ativa. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: rows } = await supabase
    .from("members")
    .select("org_id, role, full_name, organizations(name, timezone, is_sandbox)")
    .eq("user_id", claims.sub)
    .order("created_at");
  const memberships: (Membership & { fullName: string })[] = (rows ?? []).map((r) => {
    const o = r.organizations as unknown as { name: string; timezone: string; is_sandbox: boolean };
    return {
      orgId: r.org_id,
      orgName: o.name,
      timezone: o.timezone,
      isSandbox: o.is_sandbox,
      role: r.role as MemberRole,
      fullName: r.full_name,
    };
  });
  if (!memberships.length) return null;

  // Organização ativa: cookie (se o usuário ainda for membro) ou a primeira.
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.orgId === preferred) ?? memberships[0];
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: active.fullName,
    org: active,
    memberships,
  };
});

export async function requireViewer(next: string, roles?: MemberRole[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/entrar?proximo=${encodeURIComponent(next)}`);
  if (roles && !roles.includes(viewer.org.role)) redirect("/painel?sem-permissao=1");
  return viewer;
}

export function can(viewer: Viewer, action: "vender" | "estoque" | "catalogo" | "cancelar"): boolean {
  const r = viewer.org.role;
  switch (action) {
    case "vender":
      return r === "admin" || r === "vendedor";
    case "estoque":
    case "catalogo":
      return r === "admin" || r === "estoquista";
    case "cancelar":
      return r === "admin";
  }
}
