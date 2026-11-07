import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/login", "/primeiro-acesso", "/condutor/", "/api/webhooks/", "/api/cron/", "/manifest.webmanifest", "/icone.svg", "/sw.js", "/site/", "/og.png", "/icon-", "/apple-touch-icon.png", "/favicon.ico"];

/** Barreira rápida: sem cookie de sessão, vai para o login. A verificação real está em lib/auth. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || PUBLICAS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next")) return NextResponse.next();
  if (!req.cookies.get("vp_sessao")) return NextResponse.redirect(new URL("/login", req.url));
  // Repassa o caminho para o layout (usado para exigir a troca de senha provisória).
  const headers = new Headers(req.headers);
  headers.set("x-vp-path", pathname);
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
