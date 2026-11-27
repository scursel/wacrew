import { NextResponse } from "next/server";
import { atendenteDoPedido, ErroHttp, respostaDeErro } from "@/lib/equipe/acesso";
import { departamentosDe, lerDepartamentos } from "@/lib/equipe/departamentos";
import { hashSenha, verificarSenha } from "@/lib/equipe/senha";
import { alterarUsuarios } from "@/lib/equipe/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const a = await atendenteDoPedido();
    const temDepartamento = departamentosDe(await lerDepartamentos(), a.usuario.login).length > 0;
    return NextResponse.json({
      login: a.usuario.login,
      nome: a.usuario.nome,
      assinatura: a.usuario.assinatura ?? "",
      temDepartamento,
      assinarMensagens: temDepartamento && a.usuario.assinarMensagens !== false,
    });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST(req: Request) {
  try {
    const a = await atendenteDoPedido();
    const body = (await req.json().catch(() => null)) as {
      nome?: unknown;
      senhaAtual?: unknown;
      novaSenha?: unknown;
      assinarMensagens?: unknown;
      assinatura?: unknown;
    } | null;
    if (!body) throw new ErroHttp(400, "JSON inválido");

    const nome = typeof body.nome === "string" ? body.nome.trim() : undefined;
    if (nome !== undefined && !nome) throw new ErroHttp(400, "nome obrigatório");

    if (body.assinarMensagens === true) {
      const temDepartamento = departamentosDe(await lerDepartamentos(), a.usuario.login).length > 0;
      if (!temDepartamento) {
        throw new ErroHttp(400, "você precisa estar em um departamento para ativar a assinatura");
      }
    }

    let novoHash: string | undefined;
    if (typeof body.novaSenha === "string" && body.novaSenha) {
      if (body.novaSenha.length < 8) throw new ErroHttp(400, "nova senha deve ter pelo menos 8 caracteres");
      const atual = typeof body.senhaAtual === "string" ? body.senhaAtual : "";
      if (!(await verificarSenha(atual, a.usuario.senha))) {
        throw new ErroHttp(400, "senha atual incorreta");
      }
      novoHash = await hashSenha(body.novaSenha);
    }

    await alterarUsuarios((lista) => {
      const u = lista.find((x) => x.login === a.usuario.login);
      if (!u) throw new ErroHttp(404, "conta não encontrada");
      if (nome !== undefined) u.nome = nome;
      if (typeof body.assinarMensagens === "boolean") u.assinarMensagens = body.assinarMensagens;
      if (typeof body.assinatura === "string") {
        const limpa = body.assinatura.trim();
        if (limpa) u.assinatura = limpa;
        else delete u.assinatura;
      }
      if (novoHash) u.senha = novoHash;
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
