import { NextResponse } from 'next/server';
import { slugsIrmaosDeDm } from '@/lib/dm-irmaos';
import { ErroHttp, respostaDeErro } from '@/lib/equipe/acesso';
import { DONO, registrar, type EventoAtribuicao } from '@/lib/equipe/atribuicoes';
import { lerDepartamentos } from '@/lib/equipe/departamentos';
import { contatosDeIdentidade, slugsExistentes } from '@/lib/equipe/identidade';
import { canonicoGlobal, quemAtendeDoPedido } from '@/lib/equipe/quem';
import { acharUsuario } from '@/lib/equipe/usuarios';
import { setResolved } from '@/lib/triage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const quem = await quemAtendeDoPedido();
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.slug !== 'string' || !body.slug) throw new ErroHttp(400, 'slug inválido');
    const slug = body.slug;
    const existentes = await slugsExistentes();
    if (!existentes.has(slug)) throw new ErroHttp(404, 'não encontrado');
    const { acao, para, departamento } = body;
    if (departamento !== undefined && departamento !== null && (typeof departamento !== 'string' || !(await lerDepartamentos()).some((d) => d.id === departamento))) {
      throw new ErroHttp(400, 'departamento inválido');
    }
    let evento: EventoAtribuicao;
    switch (acao) {
      case 'assumir':
      case 'soltar':
      case 'resolver':
        evento = { tipo: acao, por: quem.id };
        break;
      case 'delegar':
        if (typeof para !== 'string' || (para !== DONO && !(await acharUsuario(para))?.ativo)) throw new ErroHttp(400, 'responsável inválido');
        evento = { tipo: 'delegar', por: quem.id, para, ...(departamento !== undefined ? { departamento: departamento as string | null } : {}) };
        break;
      case 'departamento':
        if (departamento === undefined) throw new ErroHttp(400, 'departamento inválido');
        evento = { tipo: 'departamento', por: quem.id, departamento: departamento as string | null };
        break;
      default:
        throw new ErroHttp(400, 'ação inválida');
    }
    const canonico = (await canonicoGlobal())(slug);
    if (acao === 'resolver') {
      const contatos = await contatosDeIdentidade();
      const agora = new Date().toISOString();
      for (const irmao of slugsIrmaosDeDm(slug, contatos, existentes)) await setResolved(irmao, agora);
    }
    const atribuicao = await registrar(canonico, evento);
    return NextResponse.json({ ok: true, atribuicao });
  } catch (e) {
    return respostaDeErro(e);
  }
}
