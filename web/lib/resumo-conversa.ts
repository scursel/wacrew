/**
 * Resumo curto de cada conversa, fixo no painel do cliente. Nasce de carona na
 * pré-seleção de departamento (a mesma chamada, que já lê as últimas mensagens)
 * e só é refeito quando o operador clica em Atualizar. Nunca roda sozinho além disso.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export interface ResumoConversa {
  texto: string;
  /** Quando o resumo foi feito. */
  em: string;
}

/** Instrução do campo "resumo", a mesma no classificador e no Atualizar. */
export const INSTRUCAO_RESUMO =
  'resumo: até 3 linhas curtas em português, sem enfeite: o assunto, o que o cliente quer e o que está pendente. Não invente o que não está na conversa.';

const MAX_CHARS = 600;

const arquivo = (dataDir = DATA_DIR) => join(dataDir, '.resumos-conversa.json');

export async function lerResumos(dataDir = DATA_DIR): Promise<Record<string, ResumoConversa>> {
  try {
    const j = JSON.parse(await readFile(arquivo(dataDir), 'utf8')) as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, ResumoConversa>) : {};
  } catch {
    return {};
  }
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
    const r = { texto, em: agora.toISOString() };
    todos[slug] = r;
    await writeJsonAtomic(arquivo(dataDir), todos);
    return r;
  });
  fila = passo.catch(() => undefined);
  return passo;
}
