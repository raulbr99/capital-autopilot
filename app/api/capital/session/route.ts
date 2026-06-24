import { NextResponse } from "next/server";
import { getSession, getAccount, capitalConfigured } from "@/lib/capital";

export const dynamic = "force-dynamic";

// Test de conexion: confirma credenciales y devuelve la cuenta.
export async function GET() {
  if (!capitalConfigured()) {
    return NextResponse.json(
      { configured: false, message: "Faltan credenciales en .env.local" },
      { status: 200 }
    );
  }
  try {
    await getSession(true);
    const account = await getAccount();
    return NextResponse.json({ configured: true, ok: true, account });
  } catch (err: any) {
    return NextResponse.json(
      { configured: true, ok: false, error: err.message },
      { status: 200 }
    );
  }
}
