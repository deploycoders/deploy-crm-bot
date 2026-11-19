import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Comprobar si existe token de autenticación estricta (cookie CRM o cookie Supabase)
  const crmAuthToken = request.cookies.get("crm_auth_token")?.value;
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token") && c.value);

  const isAuthenticated = Boolean(crmAuthToken || hasSupabaseCookie);

  const isLoginPage = pathname === "/login";
  const isProtectedPath =
    pathname === "/" ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/contactos") ||
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/equipo") ||
    pathname.startsWith("/configuracion") ||
    pathname.startsWith("/admin");

  // Autenticación estricta: Redirigir al login si no tiene sesión activa
  if (!isAuthenticated && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Si ya tiene sesión activa y visita /login -> redirigir al Dashboard
  if (isAuthenticated && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes like whatsapp webhook)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
