import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: "owner" | "admin" | "agent";
}

/**
 * Resolves a tenant only after validating the Supabase access token and the
 * user's membership. `x-tenant-id` is a selection, never a trust boundary.
 */
export async function getTenantContext(request: NextRequest): Promise<TenantContext | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const admin = getSupabaseAdmin();
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  if (userError || !userResult.user) return null;

  const selectedTenantId = request.headers.get("x-tenant-id");
  let query = admin
    .from("organization_members")
    .select("tenant_id, role")
    .eq("user_id", userResult.user.id)
    .eq("is_active", true);

  if (selectedTenantId) query = query.eq("tenant_id", selectedTenantId);
  const { data: memberships, error } = await query.order("created_at", { ascending: true }).limit(1);
  const membership = memberships?.[0];
  if (error || !membership) return null;

  return {
    tenantId: membership.tenant_id,
    userId: userResult.user.id,
    role: membership.role as TenantContext["role"],
  };
}

export function isTenantAdmin(context: TenantContext) {
  return context.role === "owner" || context.role === "admin";
}
