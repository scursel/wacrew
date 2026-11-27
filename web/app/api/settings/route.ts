import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/config";
import { lerConfigIA } from "@/lib/ia/config";
import { transcricaoBackend } from "@/lib/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function estadoTranscricao() {
  const modo = transcricaoBackend();
  const ia = await lerConfigIA();
  return {
    modo,
    modelo9router: ia.funcoes.transcricao ?? null,
    temChave9router: Boolean(ia.chave.trim()),
  };
}

export async function GET() {
  const [settings, transcricao] = await Promise.all([readSettings(), estadoTranscricao()]);
  return NextResponse.json({ ...settings, transcricao });
}

export async function POST(req: Request) {
  let body: { model?: string; language?: string };
  try {
    body = (await req.json()) as { model?: string; language?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const [saved, transcricao] = await Promise.all([
    writeSettings({ model: body.model, language: body.language }),
    estadoTranscricao(),
  ]);
  return NextResponse.json({ ...saved, transcricao });
}
