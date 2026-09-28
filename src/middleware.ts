import { NextResponse, type NextRequest } from "next/server";

/**
 * Filtro grosseiro para as áreas de professor/admin.
 *
 * O middleware roda no edge e `lib/auth.ts` usa `node:crypto`, então aqui não dá
 * para validar a assinatura HMAC — e não é para tentar: isto é só uma cortina
 * rápida para não entregar nem a página. A autorização que importa é a dos route
 * handlers (`requireApiUser` / `requireApiAdmin`), que checam sessão, papel e
 * expiração no servidor. Nunca confie neste arquivo como fronteira de segurança.
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get("avalialab_session")?.value;

  if (!token) {
    // API responde 401 em JSON; página redireciona para o login.
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/professor/:path*", "/admin/:path*", "/api/admin/:path*"],
};
