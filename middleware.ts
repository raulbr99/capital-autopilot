import { NextResponse, type NextRequest } from "next/server";

export const COOKIE = "ap_auth";

/**
 * Puerta de acceso al panel.
 *
 * OPCIONAL A PROPÓSITO: sin `DASHBOARD_PASSWORD` definida, esto no hace nada y
 * la app funciona exactamente igual que antes. Así activar la protección es una
 * decisión consciente (poner la variable en Vercel) y no hay forma de quedarse
 * fuera por un despliegue.
 *
 * Quedan SIEMPRE abiertas las rutas que traen su propia autenticación por
 * cabecera, porque las llaman máquinas y no pueden pasar por un formulario:
 *   · /api/bot/cron     → GitHub Action, con CRON_SECRET
 *   · /api/bot/pm-queue → routines del Gestor, con Bearer
 */
const ABIERTAS = ["/login", "/api/auth", "/api/bot/cron", "/api/bot/pm-queue"];

export function middleware(req: NextRequest) {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) return NextResponse.next(); // sin contraseña configurada: todo abierto, como hasta ahora

  const { pathname } = req.nextUrl;
  if (ABIERTAS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (req.cookies.get(COOKIE)?.value === pass) return NextResponse.next();

  // A la API se le responde con un 401 honesto; al navegador se le enseña el login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("volver", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Todo menos los recursos estáticos y los iconos
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js).*)"],
};
