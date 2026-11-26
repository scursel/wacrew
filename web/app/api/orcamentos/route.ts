import { NextResponse } from "next/server";
import { slugValido } from "@/lib/api-v1";
import { buildContacts } from "@/lib/contacts";
import { listGroups, readGroupRecords } from "@/lib/data";
import { fundirMensagens, slugsIrmaosDeDm } from "@/lib/dm-irmaos";
import { lerOrcamentos, marcarOrcamento, resumirOrcamentos } from "@/lib/orcamentos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Orçamentos do chat; num DM partido (telefone e LID) as duas pontas contam juntas. */
async function resumo(slug: string) {
  const [contatos, grupos, store] = await Promise.all([buildContacts(), listGroups(), lerOrcamentos()]);
  const irmaos = slugsIrmaosDeDm(slug, contatos, new Set(grupos.map((g) => g.slug)));
  const listas = await Promise.all(irmaos.map((s) => readGroupRecords(s)));
  const mensagens = listas.length > 1 ? fundirMensagens(listas) : (listas[0] ?? []);
  return resumirOrcamentos(irmaos, mensagens, store);
}

/** Quantos orçamentos o chat recebeu e se o operador marcou à mão. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!slugValido(slug)) return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  return NextResponse.json({ slug, ...(await resumo(slug)) });
}

/** Botão "Orçamento enviado": { slug, marcado }. */
export async function POST(req: Request) {
  let corpo: { slug?: unknown; marcado?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const slug = typeof corpo.slug === "string" ? corpo.slug : "";
  if (!slugValido(slug)) return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  if (typeof corpo.marcado !== "boolean") return NextResponse.json({ error: "marcado deve ser true ou false" }, { status: 400 });
  await marcarOrcamento(slug, corpo.marcado);
  return NextResponse.json({ ok: true, slug, ...(await resumo(slug)) });
}
