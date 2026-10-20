import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authToken = request.cookies.get("crm_auth_token")?.value;

  const isLoginPage = pathname === "/login";
  const isProtectedPath =
    pathname === "/" ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/contactos") ||
    pathname.startsWith("/configuracion");

  // Si no tiene token y visita una ruta protegida, auto-aprobar sesión de desarrollo local
  if (!authToken && isProtectedPath) {
    const response = NextResponse.next();
    response.cookies.set("crm_auth_token", "authenticated_superadmin", {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
    });
    return response;
  }

  // Si ya tiene token e intenta visitar /login -> redirigir a /
  if (authToken && isLoginPage) {
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
