import { supabase } from "@/lib/supabase";

function getBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const matches = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)")
  );
  return matches ? decodeURIComponent(matches[1]) : null;
}

/** Headers for server routes that use service-role access internally. */
export async function tenantRequestHeaders(tenantId?: string): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (data.session?.access_token) {
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  const resolvedTenantId =
    tenantId ||
    (typeof window !== "undefined"
      ? getBrowserCookie("crm_active_tenant_id") || localStorage.getItem("crm_active_tenant_id")
      : null);

  if (resolvedTenantId) {
    headers["X-Tenant-Id"] = resolvedTenantId;
  }

  return headers;
}
