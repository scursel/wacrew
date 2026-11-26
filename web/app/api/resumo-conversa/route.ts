import { NextResponse } from "next/server";
import { slugValido } from "@/lib/api-v1";
import { resumirConversa } from "@/lib/equipe/classificar-departamento";
import { lerResumos } from "@/lib/resumo-conversa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resumo guardado da conversa (null se ainda não tem). Não chama IA. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!slugValido(slug)) return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  const todos = await lerResumos();
  return NextResponse.json({ slug, resumo: Object.hasOwn(todos, slug) ? todos[slug] : null });
}

/** Botão Atualizar: refaz o resumo pelo modelo escolhido na tela de IA. */
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
    return NextResponse.json({ slug, resumo: await resumirConversa(slug) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "não resumiu" }, { status: 502 });
  }
}
