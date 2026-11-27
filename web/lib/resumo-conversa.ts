/**
 * Resumo curto de cada conversa, fixo no painel do cliente. Nasce de carona na
 * pré-seleção de departamento (a mesma chamada, que já lê as últimas mensagens)
 * e só é refeito quando o operador clica em Atualizar. Nunca roda sozinho além disso.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export interface EntradaResumo {
  texto: string;
  /** Quando o resumo foi feito (ISO). */
  em: string;
}

export interface ResumoConversa extends EntradaResumo {
  /** Histórico de resumos gerados (mais recente primeiro), incluindo o atual. */
  historico?: EntradaResumo[];
}

/** Instrução do campo "resumo", a mesma no classificador e no Atualizar. */
export const INSTRUCAO_RESUMO =
  'resumo: até 3 linhas curtas em português, sem enfeite: o assunto, o que o cliente quer e o que está pendente. Não invente o que não está na conversa.';

const MAX_CHARS = 600;
const MAX_HISTORICO = 30;

const arquivo = (dataDir = DATA_DIR) => join(dataDir, '.resumos-conversa.json');

export async function lerResumos(dataDir = DATA_DIR): Promise<Record<string, ResumoConversa>> {
  try {
    const j = JSON.parse(await readFile(arquivo(dataDir), 'utf8')) as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, ResumoConversa>) : {};
  } catch {
    return {};
  }
}

/** Normaliza uma entrada salva (legada ou com histórico) para lista mais-recente-primeiro. */
export function historicoDe(r: ResumoConversa | null | undefined): EntradaResumo[] {
  if (!r || typeof r.texto !== 'string' || !r.texto.trim()) return [];
  const lista: EntradaResumo[] = Array.isArray(r.historico)
    ? r.historico.filter((x): x is EntradaResumo => Boolean(x && typeof x.texto === 'string' && x.texto.trim() && typeof x.em === 'string'))
    : [];
  const atual: EntradaResumo = { texto: r.texto, em: r.em };
  const semDup = lista.filter((x) => !(x.em === atual.em && x.texto === atual.texto));
  return [atual, ...semDup].sort((a, b) => b.em.localeCompare(a.em)).slice(0, MAX_HISTORICO);
}

/** Junta históricos de vários slugs (ex.: irmãos de DM), sem duplicar, mais recente primeiro. */
export function juntarHistoricosResumos(itens: ReadonlyArray<ResumoConversa | null | undefined>): EntradaResumo[] {
  const vistos = new Set<string>();
  const saida: EntradaResumo[] = [];
  for (const item of itens) {
    for (const e of historicoDe(item)) {
      const chave = `${e.em}\u0000${e.texto}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(e);
    }
  }
  return saida.sort((a, b) => b.em.localeCompare(a.em)).slice(0, MAX_HISTORICO);
}

/** Texto do modelo → resumo limpo; null se não serve. */
export function limparResumo(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  const t = bruto.trim();
  if (!t) return null;
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS - 1)}…` : t;
}

let fila: Promise<unknown> = Promise.resolve();

export function salvarResumo(slug: string, texto: string, agora = new Date(), dataDir = DATA_DIR): Promise<ResumoConversa> {
  const passo = fila.then(async () => {
    const todos = await lerResumos(dataDir);
    const anterior = Object.hasOwn(todos, slug) ? todos[slug] : undefined;
    const novo: EntradaResumo = { texto, em: agora.toISOString() };
    const anteriores = historicoDe(anterior);
    const historico = [novo, ...anteriores].slice(0, MAX_HISTORICO);
    const r: ResumoConversa = { texto: novo.texto, em: novo.em, historico };
    todos[slug] = r;
    await writeJsonAtomic(arquivo(dataDir), todos);
    return r;
  });
  fila = passo.catch(() => undefined);
  return passo;
}
