import { NextResponse } from "next/server";
import { ErroHttp, respostaDeErro } from "@/lib/equipe/acesso";
import { notificarAgente } from "@/lib/equipe/notificacoes-internas";
import { quemAtendeDoPedido } from "@/lib/equipe/quem";
import { lerUsuarios } from "@/lib/equipe/usuarios";
import { adicionarNotaInterna, lerNotasInternas } from "@/lib/notas-internas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await quemAtendeDoPedido();
    const slug = new URL(req.url).searchParams.get("slug")?.trim() ?? "";
    if (!slug) throw new ErroHttp(400, "slug inválido");
    const [notas, usuarios] = await Promise.all([lerNotasInternas(slug), lerUsuarios()]);
    const equipe = usuarios.filter((u) => u.ativo).map((u) => ({ login: u.login, nome: u.nome }));
    return NextResponse.json({ notas, equipe });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST(req: Request) {
  try {
    const quem = await quemAtendeDoPedido();
    const body = (await req.json().catch(() => null)) as { slug?: unknown; texto?: unknown } | null;
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
    if (!slug || !texto) throw new ErroHttp(400, "slug e texto são obrigatórios");

    const nota = await adicionarNotaInterna(slug, {
      autor: quem.id,
      autorNome: quem.nome,
      texto,
    });

    const usuarios = await lerUsuarios();
    const loginsAtivos = new Set(usuarios.filter((u) => u.ativo).map((u) => u.login));
    for (const login of nota.mencoes) {
      if (login !== quem.id && loginsAtivos.has(login)) {
        await notificarAgente({
          para: login,
          tipo: "mencao",
          slug,
          de: quem.id,
          deNome: quem.nome,
          texto: nota.texto.slice(0, 140),
        });
      }
    }

    return NextResponse.json({ ok: true, nota });
  } catch (e) {
    return respostaDeErro(e);
  }
}
