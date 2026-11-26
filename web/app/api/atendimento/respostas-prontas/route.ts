import { NextResponse } from "next/server";
import { atendenteDoPedido, respostaDeErro } from "@/lib/equipe/acesso";
import { readRespostasProntas } from "@/lib/respostas-prontas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await atendenteDoPedido();
    return NextResponse.json(await readRespostasProntas());
  } catch (e) {
    return respostaDeErro(e);
  }
}
