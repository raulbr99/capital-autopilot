import { NextResponse } from "next/server";
import { COOKIE } from "@/middleware";

export const dynamic = "force-dynamic";

/** Estado de la puerta: si hay protección configurada y si hay sesión abierta. */
export async function GET(req: Request) {
  const pass = process.env.DASHBOARD_PASSWORD;
  const cookie = req.headers.get("cookie") || "";
  const tieneSesion = !!pass && cookie.includes(`${COOKIE}=${pass}`);
  return NextResponse.json({ protegido: !!pass, sesion: tieneSesion });
}

/** Comprueba la contraseña y deja la cookie de sesión (30 días). */
export async function POST(req: Request) {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) return NextResponse.json({ ok: true, sinPassword: true });

  const { password } = await req.json().catch(() => ({ password: "" }));
  if (password !== pass) {
    // Pequeño retardo: encarece el probar contraseñas a lo bruto
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, pass, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

/** Cerrar sesión. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
