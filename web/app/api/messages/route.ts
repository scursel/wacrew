import { NextResponse } from "next/server";
import { readGroupMessages } from "@/lib/data";
import { ultimoAtendimento } from "@/lib/ultimo-atendimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9._-]+$/;
// Janela padrão do chat: o suficiente pra contexto sem serializar o histórico
// inteiro (grupo grande = dezenas de MB por request; o poll roda a cada 3s).
const DEFAULT_LIMIT = 150;
const MAX_LIMIT = 500;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug || !SAFE.test(slug)) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  const before = url.searchParams.get("before") ?? undefined;
  if (before && !/^[\w=+/-]{1,128}$/.test(before)) {
    return NextResponse.json({ error: "before inválido" }, { status: 400 });
  }
  // all=1 devolve o histórico inteiro (consumidor: o MCP em modo remoto, que
  // precisa da mesma visão que teria lendo o disco). O painel segue paginando.
  if (url.searchParams.get("all") === "1") {
    return NextResponse.json(await readGroupMessages(slug, { before }));
  }
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const mensagens = readGroupMessages(slug, { limit, before });
  if (!before && url.searchParams.get("ultimoAtendimento") === "1") {
    const [messages, atendimento] = await Promise.all([mensagens, ultimoAtendimento([slug])]);
    return NextResponse.json({ messages, ultimoAtendimento: atendimento });
  }
  return NextResponse.json(await mensagens);
}
