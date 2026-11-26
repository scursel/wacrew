import { NextResponse } from "next/server";
import { AVISO_SEM_MODELO } from "@/lib/ia/aviso";
import { type FuncaoIA, FUNCOES_IA, lerConfigIA } from "@/lib/ia/config";
import { listarModelos9router } from "@/lib/ia/provedor";
import { semChave } from "@/lib/ia/texto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestePost {
  funcao?: unknown;
  baseUrl?: unknown;
  chave?: unknown;
}

/**
 * "Testar" de cada linha da tela. Sem `funcao`, testa a conexão listando os
 * modelos; com `funcao`, manda uma chamada mínima no 9router. `baseUrl`/`chave`
 * no corpo permitem testar antes de salvar.
 */
export async function POST(req: Request) {
  let body: TestePost;
  try {
    body = (await req.json()) as TestePost;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const salva = await lerConfigIA();
  const baseUrl =
    typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim().replace(/\/+$/, "") : salva.baseUrl;
  const chave = typeof body.chave === "string" && body.chave.trim() ? body.chave.trim() : salva.chave;
  if (!chave) return NextResponse.json({ ok: false, erro: "salve a chave do 9router antes de testar" });

  const inicio = Date.now();
  const ms = () => Date.now() - inicio;

  let funcao: FuncaoIA | undefined;
  if (body.funcao !== undefined) {
    if (typeof body.funcao !== "string" || !(FUNCOES_IA as string[]).includes(body.funcao)) {
      return NextResponse.json({ error: "função desconhecida" }, { status: 400 });
    }
    funcao = body.funcao as FuncaoIA;
  }

  if (!funcao) {
    try {
      const { combos } = await listarModelos9router({ baseUrl, chave });
      return NextResponse.json({ ok: true, ms: ms(), combos: combos.length });
    } catch (err) {
      const erro = semChave(err instanceof Error ? err.message : "falha ao listar os modelos do 9router", chave);
      return NextResponse.json({ ok: false, ms: ms(), erro });
    }
  }

  const modelo = salva.funcoes[funcao];
  if (!modelo) return NextResponse.json({ ok: false, ms: ms(), erro: AVISO_SEM_MODELO });

  // Transcrição: só confere se o modelo existe na lista de fala (não manda áudio).
  if (funcao === "transcricao") {
    try {
      const { fala } = await listarModelos9router({ baseUrl, chave });
      if (!fala.includes(modelo)) {
        return NextResponse.json({
          ok: false,
          ms: ms(),
          erro: `${modelo} não está na lista de modelos de fala do 9router`,
        });
      }
      return NextResponse.json({ ok: true, ms: ms() });
    } catch (err) {
      const erro = semChave(err instanceof Error ? err.message : "falha ao listar os modelos do 9router", chave);
      return NextResponse.json({ ok: false, ms: ms(), erro });
    }
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 5,
        messages: [{ role: "user", content: "responda ok" }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const corpo = await res.text().catch(() => "");
    if (!res.ok) {
      let detalhe = corpo;
      try {
        const j = JSON.parse(corpo) as { error?: { message?: string } };
        detalhe = j.error?.message ?? corpo;
      } catch {
        // corpo não é JSON: usa como veio
      }
      return NextResponse.json({ ok: false, ms: ms(), erro: semChave(`9router HTTP ${res.status}: ${detalhe.slice(0, 200)}`, chave) });
    }
    return NextResponse.json({ ok: true, ms: ms() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "falha na chamada ao 9router";
    return NextResponse.json({ ok: false, ms: ms(), erro: semChave(msg, chave) });
  }
}
