import { NextResponse } from 'next/server';
import { lerCsat, resumoCsat } from '@/lib/csat';
import { DONO, lerHistoricoAtribuicoes } from '@/lib/equipe/atribuicoes';
import { lerNomeDono } from '@/lib/equipe/departamentos';
import { lerUsuarios } from '@/lib/equipe/usuarios';
import { periodoDe } from '@/lib/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LinhaAgenteRelatorio {
  id: string;
  nome: string;
  respostas: number;
  assumidas: number;
  delegacoesRecebidas: number;
  resolvidas: number;
  csatMedio: number | null;
  csatTotal: number;
}

function esc(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const periodo = periodoDe(url.searchParams.get('periodo'));
  const formato = url.searchParams.get('formato');
  const corteIso = new Date(Date.now() - periodo * 86_400_000).toISOString();

  const [eventos, usuarios, nomeDono, csatLista] = await Promise.all([
    lerHistoricoAtribuicoes(),
    lerUsuarios(),
    lerNomeDono(),
    lerCsat(),
  ]);

  const csatPeriodo = csatLista.filter((c) => c.timestamp >= corteIso);
  const resumo = resumoCsat(csatPeriodo);

  const nomes = new Map<string, string>([[DONO, nomeDono]]);
  for (const u of usuarios) nomes.set(u.login, u.nome);

  const mapa = new Map<string, LinhaAgenteRelatorio>();
  const obter = (id: string): LinhaAgenteRelatorio => {
    let cur = mapa.get(id);
    if (!cur) {
      const c = resumo.porAgente[id];
      cur = {
        id,
        nome: nomes.get(id) ?? id,
        respostas: 0,
        assumidas: 0,
        delegacoesRecebidas: 0,
        resolvidas: 0,
        csatMedio: c ? c.media : null,
        csatTotal: c ? c.total : 0,
      };
      mapa.set(id, cur);
    }
    return cur;
  };

  for (const id of nomes.keys()) obter(id);

  for (const ev of eventos) {
    if (ev.ts < corteIso) continue;
    if (ev.tipo === 'responder' && ev.por) obter(ev.por).respostas++;
    else if (ev.tipo === 'assumir' && ev.por) obter(ev.por).assumidas++;
    else if (ev.tipo === 'resolver' && ev.por) obter(ev.por).resolvidas++;
    else if (ev.tipo === 'delegar' && ev.para) obter(ev.para).delegacoesRecebidas++;
  }

  const agentes = [...mapa.values()].sort((a, b) => b.respostas + b.resolvidas - (a.respostas + a.resolvidas));

  if (formato === 'csv') {
    const linhas = [
      ['agente_id', 'nome', 'respostas', 'assumidas', 'delegacoes_recebidas', 'resolvidas', 'csat_medio', 'csat_total'].join(','),
      ...agentes.map((a) =>
        [a.id, a.nome, a.respostas, a.assumidas, a.delegacoesRecebidas, a.resolvidas, a.csatMedio, a.csatTotal].map(esc).join(','),
      ),
    ];
    return new Response(`\uFEFF${linhas.join('\n')}\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="relatorio-equipe-${periodo}d.csv"`,
      },
    });
  }

  return NextResponse.json({
    periodoDias: periodo,
    agentes,
    csat: resumo,
  });
}
