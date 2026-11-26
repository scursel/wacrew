import { NextResponse } from 'next/server';
import { slugsIrmaosDeDm } from '@/lib/dm-irmaos';
import { ErroHttp, respostaDeErro } from '@/lib/equipe/acesso';
import { DONO, lerAtribuicoes, lerHistoricoAtribuicoes, registrar, type EventoAtribuicao } from '@/lib/equipe/atribuicoes';
import { lerDepartamentos, lerNomeDono } from '@/lib/equipe/departamentos';
import { escolherProximoRoundRobin } from '@/lib/equipe/disponibilidade';
import { contatosDeIdentidade, slugsExistentes } from '@/lib/equipe/identidade';
import { notificarAgente } from '@/lib/equipe/notificacoes-internas';
import { canonicoGlobal, quemAtendeDoPedido } from '@/lib/equipe/quem';
import { acharUsuario, lerUsuarios } from '@/lib/equipe/usuarios';
import { adicionarNotaInterna } from '@/lib/notas-internas';
import { setResolved } from '@/lib/triage';
import { dispararWebhook } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await quemAtendeDoPedido();
    const slug = new URL(req.url).searchParams.get('slug')?.trim() ?? '';
    if (!slug) throw new ErroHttp(400, 'slug inválido');
    const canonico = (await canonicoGlobal())(slug);
    const [raw, usuarios, deptos, nomeDono] = await Promise.all([
      lerHistoricoAtribuicoes(canonico),
      lerUsuarios(),
      lerDepartamentos(),
      lerNomeDono(),
    ]);
    const nomeDe = new Map(usuarios.map((u) => [u.login, u.nome]));
    nomeDe.set(DONO, nomeDono);
    const depNome = new Map(deptos.map((d) => [d.id, d.nome]));
    const eventos = raw.map((ev) => ({
      ...ev,
      porNome: ev.por ? (nomeDe.get(ev.por) ?? ev.por) : null,
      paraNome: ev.para ? (nomeDe.get(ev.para) ?? ev.para) : null,
      departamentoNome: ev.departamento ? (depNome.get(ev.departamento) ?? ev.departamento) : null,
    }));
    return NextResponse.json({ eventos });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST(req: Request) {
  try {
    const quem = await quemAtendeDoPedido();
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.slug !== 'string' || !body.slug) throw new ErroHttp(400, 'slug inválido');
    const slug = body.slug;
    const existentes = await slugsExistentes();
    if (!existentes.has(slug)) throw new ErroHttp(404, 'não encontrado');
    const { acao, para, departamento, nota } = body;
    const deptos = await lerDepartamentos();
    const depObj = typeof departamento === 'string' ? deptos.find((d) => d.id === departamento) : undefined;
    if (departamento !== undefined && departamento !== null && (typeof departamento !== 'string' || !depObj)) {
      throw new ErroHttp(400, 'departamento inválido');
    }
    const notaLimpa = typeof nota === 'string' && nota.trim() ? nota.trim() : undefined;
    let evento: EventoAtribuicao;
    switch (acao) {
      case 'reabrir': {
        const contatos = await contatosDeIdentidade();
        for (const irmao of slugsIrmaosDeDm(slug, contatos, existentes)) await setResolved(irmao, '');
        return NextResponse.json({ ok: true });
      }
      case 'assumir':
      case 'soltar':
      case 'resolver':
        evento = { tipo: acao, por: quem.id };
        break;
      case 'delegar':
        if (typeof para !== 'string' || (para !== DONO && !(await acharUsuario(para))?.ativo)) throw new ErroHttp(400, 'responsável inválido');
        evento = {
          tipo: 'delegar',
          por: quem.id,
          para,
          ...(departamento !== undefined ? { departamento: departamento as string | null } : {}),
          ...(notaLimpa ? { nota: notaLimpa } : {}),
        };
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
    let atribuicao = await registrar(canonico, evento);
    if (acao === 'delegar' && typeof para === 'string') {
      if (notaLimpa) {
        await adicionarNotaInterna(slug, { autor: quem.id, autorNome: quem.nome, texto: `[Delegação] ${notaLimpa}` }).catch(() => {});
      }
      if (para !== quem.id) {
        await notificarAgente({
          para,
          tipo: 'delegacao',
          slug,
          de: quem.id,
          deNome: quem.nome,
          texto: notaLimpa ? `Delegou conversa: ${notaLimpa}` : 'Delegou uma conversa para você',
        }).catch(() => {});
      }
    }
    if (acao === 'departamento' && depObj?.roundRobin && !atribuicao.responsavel) {
      const atual = (await lerAtribuicoes())[canonico];
      if (!atual?.responsavel) {
        const escolhido = await escolherProximoRoundRobin(depObj.id, depObj.membros);
        if (escolhido) {
          atribuicao = await registrar(canonico, { tipo: 'delegar', por: quem.id, para: escolhido });
          await notificarAgente({
            para: escolhido,
            tipo: 'delegacao',
            slug,
            de: quem.id,
            deNome: quem.nome,
            texto: `Conversa atribuída via round-robin (${depObj.nome})`,
          }).catch(() => {});
        }
      }
    }
    if (acao === 'resolver') {
      void dispararWebhook('conversation.resolved', {
        slug,
        canonico,
        por: quem.id,
        porNome: quem.nome,
      }).catch(() => {});
    } else if (acao === 'assumir' || acao === 'delegar') {
      void dispararWebhook('conversation.assigned', {
        slug,
        canonico,
        acao,
        por: quem.id,
        porNome: quem.nome,
        responsavel: atribuicao.responsavel,
        departamento: atribuicao.departamento,
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, atribuicao });
  } catch (e) {
    return respostaDeErro(e);
  }
}
