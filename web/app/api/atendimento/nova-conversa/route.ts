import { NextResponse } from "next/server";
import { atendenteDoPedido, ErroHttp, respostaDeErro } from "@/lib/equipe/acesso";
import { assinar, deveAssinar, nomeDeQuemEnvia } from "@/lib/equipe/assinatura";
import { registrar } from "@/lib/equipe/atribuicoes";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido();
    const body = (await req.json().catch(() => null)) as { numero?: unknown; texto?: unknown } | null;
    const digits = typeof body?.numero === "string" ? body.numero.replace(/\D/g, "") : "";
    const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
    if (!digits || digits.length < 8) throw new ErroHttp(400, "informe o número com DDI");
    if (!texto) throw new ErroHttp(400, "informe a mensagem inicial");

    const checkRes = await fetch(`${CONTROL_URL}/check-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: digits }),
    }).catch(() => null);
    if (!checkRes) return NextResponse.json({ error: "Coletor offline." }, { status: 502 });
    const check = (await checkRes.json().catch(() => ({}))) as { exists?: boolean; jid?: string | null; error?: string };
    if (!checkRes.ok) return NextResponse.json({ error: check.error ?? "falha ao validar número" }, { status: checkRes.status || 502 });
    if (!check.exists || !check.jid) throw new ErroHttp(400, "Este número não está cadastrado no WhatsApp.");

    const jid = check.jid;
    const slug = `dm-${jid.split("@")[0]}`;
    const usarAssinatura = await deveAssinar(a.usuario.login);
    const textFinal = usarAssinatura ? assinar(texto, await nomeDeQuemEnvia(a.usuario.login)) : texto;

    const sendRes = await fetch(`${CONTROL_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid, text: textFinal, slug, ator: "painel", usuario: a.usuario.login }),
    }).catch(() => null);
    if (!sendRes) return NextResponse.json({ error: "Coletor offline." }, { status: 502 });
    const sendData = (await sendRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!sendRes.ok || !sendData.ok) {
      return NextResponse.json({ error: sendData.error ?? "falha no envio" }, { status: sendRes.status || 502 });
    }
    await registrar(slug, { tipo: "assumir", por: a.usuario.login }).catch(() => {});
    return NextResponse.json({ ok: true, slug });
  } catch (e) {
    return respostaDeErro(e);
  }
}
