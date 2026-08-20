import { NextResponse, type NextRequest } from "next/server";

/** Protege as áreas do professor e do administrador: exige cookie de sessão. */
export function middleware(req: NextRequest) {
  const token = req.cookies.get("avalialab_session")?.value;
  if (!token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/professor/:path*", "/admin/:path*"],
};
