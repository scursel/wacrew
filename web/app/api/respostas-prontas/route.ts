import { NextResponse } from "next/server";
import { deleteRespostaPronta, readRespostasProntas, upsertRespostaPronta } from "@/lib/respostas-prontas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readRespostasProntas());
}

export async function POST(req: Request) {
  let body: { id?: unknown; atalho?: unknown; titulo?: unknown; texto?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof body.atalho !== "string" || typeof body.titulo !== "string" || typeof body.texto !== "string") {
    return NextResponse.json({ error: '"atalho", "titulo" e "texto" são obrigatórios' }, { status: 400 });
  }
  try {
    const lista = await upsertRespostaPronta({
      id: typeof body.id === "string" ? body.id : undefined,
      atalho: body.atalho,
      titulo: body.titulo,
      texto: body.texto,
    });
    return NextResponse.json({ ok: true, itens: lista });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }
  const itens = await deleteRespostaPronta(id);
  return NextResponse.json({ ok: true, itens });
}
