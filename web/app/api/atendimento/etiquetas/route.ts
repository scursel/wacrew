import { NextResponse } from "next/server";
import { atendenteDoPedido, ErroHttp, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";
import { readTriage, setEtiquetas } from "@/lib/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const a = await atendenteDoPedido();
    const slug = new URL(req.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) throw new ErroHttp(400, "slug inválido");
    exigirChat(a, slug);
    const t = await readTriage();
    const conhecidas = [...new Set(Object.values(t.etiquetas).flat())].sort((x, y) => x.localeCompare(y, "pt-BR"));
    return NextResponse.json({ etiquetas: t.etiquetas[slug] ?? [], conhecidas });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido();
    const body = (await req.json().catch(() => null)) as { slug?: unknown; etiquetas?: unknown } | null;
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    if (!slug) throw new ErroHttp(400, "slug inválido");
    exigirChat(a, slug);
    if (!Array.isArray(body?.etiquetas) || !body.etiquetas.every((x) => typeof x === "string")) {
      throw new ErroHttp(400, "etiquetas deve ser string[]");
    }
    await setEtiquetas(slug, body.etiquetas);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
