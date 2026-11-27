import { NextResponse } from "next/server";
import { readStatus } from "@/lib/config";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let healthCache: { em: number; vivo: boolean } | null = null;
const HEALTH_TTL_MS = 2000;

async function coletorVivo(): Promise<boolean> {
  const agora = Date.now();
  if (healthCache && agora - healthCache.em < HEALTH_TTL_MS) {
    return healthCache.vivo;
  }
  let vivo = false;
  try {
    const res = await fetch(`${CONTROL_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1000),
    });
    vivo = res.ok;
  } catch {
    vivo = false;
  }
  healthCache = { em: agora, vivo };
  return vivo;
}

export async function GET() {
  const [status, vivo] = await Promise.all([readStatus(), coletorVivo()]);
  if (!vivo) {
    return NextResponse.json({
      ...status,
      connection: "offline",
      qr: null,
      pairingCode: null,
    });
  }
  return NextResponse.json(status);
}
