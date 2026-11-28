/**
 * Eventos do histórico de atribuição como a timeline os mostra: em texto e sem o
 * ruído da IA que releu a conversa e não mudou o departamento.
 */
export interface EventoAuditoriaView {
  ts: string;
  slug: string;
  tipo: string;
  por?: string;
  para?: string | null;
  departamento?: string | null;
  nota?: string;
  porNome: string | null;
  paraNome: string | null;
  departamentoNome: string | null;
}

export function textoEventoAuditoria(e: EventoAuditoriaView): string {
  if (e.tipo === 'sugestao') {
    return e.departamentoNome ? `IA sugeriu ${e.departamentoNome}` : 'IA não encontrou departamento';
  }
  const ator = e.porNome ?? e.por ?? 'Alguém';
  if (e.tipo === 'assumir') return `${ator} assumiu a conversa`;
  if (e.tipo === 'soltar') return `${ator} soltou a conversa`;
  if (e.tipo === 'resolver') return `${ator} marcou como resolvida`;
  if (e.tipo === 'reabrir') return `${ator} reabriu a conversa`;
  if (e.tipo === 'delegar') {
    const dest = e.paraNome ?? e.para ?? 'colega';
    return `${ator} delegou para ${dest}${e.nota ? ` — "${e.nota}"` : ''}`;
  }
  if (e.tipo === 'departamento') {
    return e.departamentoNome ? `${ator} moveu para ${e.departamentoNome}` : `${ator} removeu do departamento`;
  }
  if (e.tipo === 'responder') return `${ator} respondeu`;
  return `${ator} · ${e.tipo}`;
}

/**
 * Na ordem do histórico, mantém só a sugestão que mudou o departamento: a IA
 * que releu e chegou ao mesmo resultado não vira linha na conversa.
 */
export function filtrarEventos(eventos: EventoAuditoriaView[]): EventoAuditoriaView[] {
  const out: EventoAuditoriaView[] = [];
  let departamento: string | null | undefined;
  for (const e of eventos) {
    if (e.tipo === 'sugestao') {
      const sugerido = e.departamento ?? null;
      if (departamento !== undefined && sugerido === departamento) continue;
      departamento = sugerido;
    } else if (e.tipo === 'departamento' || (e.tipo === 'delegar' && e.departamento !== undefined)) {
      departamento = e.departamento ?? null;
    }
    out.push(e);
  }
  return out;
}
