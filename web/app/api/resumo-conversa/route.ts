import { NextResponse } from "next/server";
import { slugValido } from "@/lib/api-v1";
import { resolverIrmaosDm } from "@/lib/dm-conversa";
import { resumirConversa } from "@/lib/equipe/classificar-departamento";
import { juntarHistoricosResumos, lerResumos } from "@/lib/resumo-conversa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function lerHistoricoDaConversa(slug: string) {
  const [{ irmaos }, todos] = await Promise.all([resolverIrmaosDm(slug), lerResumos()]);
  const historico = juntarHistoricosResumos(irmaos.map((s) => (Object.hasOwn(todos, s) ? todos[s] : null)));
  return { resumo: historico[0] ?? null, historico };
}

/** Resumo guardado e histórico de resumos da conversa. Não chama IA. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!slugValido(slug)) return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  const { resumo, historico } = await lerHistoricoDaConversa(slug);
  return NextResponse.json({ slug, resumo, historico });
}

/** Botão Resumir / Gerar novo resumo: cria novo resumo e acumula no histórico com data/hora. */
export async function POST(req: Request) {
  let corpo: { slug?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const slug = typeof corpo.slug === "string" ? corpo.slug : "";
  if (!slugValido(slug)) return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  try {
    await resumirConversa(slug);
    const { resumo, historico } = await lerHistoricoDaConversa(slug);
    return NextResponse.json({ slug, resumo, historico });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "não resumiu" }, { status: 502 });
  }
}
