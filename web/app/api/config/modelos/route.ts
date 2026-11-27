import { NextResponse } from "next/server";
import { configPublica, type FuncaoIA, FUNCOES_IA, lerConfigIA, salvarConfigIA } from "@/lib/ia/config";
import { invalidarCacheModelos9router, listarModelos9router } from "@/lib/ia/provedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Config da tela "Modelos de IA". A chave do 9router nunca sai daqui: o GET devolve
 * só `temChave`/`chaveFinal`. Com `?soConfig=1`, responde imediatamente sem consultar
 * o 9router (evita travar a tela se o 9router estiver lento).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const soConfig = url.searchParams.get("soConfig") === "1";
  const atualizar = url.searchParams.get("atualizar") === "1";
  const cfg = await lerConfigIA();
  const pub = configPublica(cfg);
  if (soConfig || !pub.temChave) return NextResponse.json({ ...pub, combos: [], fala: [] });
  try {
    const { combos, fala } = await listarModelos9router({
      baseUrl: cfg.baseUrl,
      chave: cfg.chave,
      ignorarCache: atualizar,
    });
    return NextResponse.json({ ...pub, combos, fala });
  } catch (err) {
    const erroLista = err instanceof Error ? err.message : "falha ao listar os modelos do 9router";
    return NextResponse.json({ ...pub, combos: [], fala: [], erroLista });
  }
}

interface ModelosPost {
  baseUrl?: unknown;
  chave?: unknown;
  funcoes?: unknown;
}

/** Valida só o que o plano manda: URL http(s) e funções conhecidas com id texto. */
function lerCorpo(body: ModelosPost): { erro: string } | { baseUrl?: string; chave?: string; funcoes?: Partial<Record<FuncaoIA, string | null>> } {
  const out: { baseUrl?: string; chave?: string; funcoes?: Partial<Record<FuncaoIA, string | null>> } = {};
  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== "string" || !/^https?:\/\/\S+$/i.test(body.baseUrl.trim())) {
      return { erro: "baseUrl precisa ser uma URL http(s)" };
    }
    out.baseUrl = body.baseUrl;
  }
  if (body.chave !== undefined) {
    if (typeof body.chave !== "string") return { erro: "chave precisa ser texto" };
    out.chave = body.chave;
  }
  if (body.funcoes !== undefined) {
    if (!body.funcoes || typeof body.funcoes !== "object" || Array.isArray(body.funcoes)) {
      return { erro: "funcoes precisa ser um objeto" };
    }
    const funcoes: Partial<Record<FuncaoIA, string | null>> = {};
    for (const [k, v] of Object.entries(body.funcoes as Record<string, unknown>)) {
      if (!(FUNCOES_IA as string[]).includes(k)) return { erro: `função desconhecida: ${k}` };
      if (v !== null && typeof v !== "string") return { erro: `modelo de ${k} precisa ser texto ou null` };
      funcoes[k as FuncaoIA] = v;
    }
    out.funcoes = funcoes;
  }
  return out;
}

export async function POST(req: Request) {
  let body: ModelosPost;
  try {
    body = (await req.json()) as ModelosPost;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = lerCorpo(body ?? {});
  if ("erro" in parsed) return NextResponse.json({ error: parsed.erro }, { status: 400 });
  const salvo = await salvarConfigIA(parsed);
  invalidarCacheModelos9router();
  return NextResponse.json(configPublica(salvo));
}
