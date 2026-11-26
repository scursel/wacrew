import { NextResponse } from "next/server";
import { ErroHttp, respostaDeErro } from "@/lib/equipe/acesso";
import { atualizarPresencaInterna, type EstadoPresencaInterna } from "@/lib/equipe/presenca-interna";
import { quemAtendeDoPedido } from "@/lib/equipe/quem";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const quem = await quemAtendeDoPedido();
    const body = (await req.json().catch(() => null)) as { slug?: unknown; estado?: unknown } | null;
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const estado = body?.estado;
    if (!slug || (estado !== "vendo" && estado !== "digitando" && estado !== "saindo")) {
      throw new ErroHttp(400, "slug e estado válidos são obrigatórios");
    }
    const outros = atualizarPresencaInterna(
      slug,
      { login: quem.id, nome: quem.nome },
      estado as EstadoPresencaInterna,
    );
    return NextResponse.json({ ok: true, outros });
  } catch (e) {
    return respostaDeErro(e);
  }
}
