import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export type GatilhoAutomacao = 'mensagem_recebida' | 'fora_do_expediente' | 'sem_resposta_minutos';

export interface CondicoesAutomacao {
  contemTexto?: string;
  apenasDm?: boolean;
  etiqueta?: string;
  semDepartamento?: boolean;
  minutosSemResposta?: number;
}

export interface AcoesAutomacao {
  adicionarEtiqueta?: string;
  definirDepartamento?: string;
  atribuirAgente?: string;
  responderTexto?: string;
  criarNotaInterna?: string;
}

export interface RegraAutomacao {
  id: string;
  nome: string;
  ativo: boolean;
  gatilho: GatilhoAutomacao;
  condicoes: CondicoesAutomacao;
  acoes: AcoesAutomacao;
  criadoEm: string;
}

export interface ContextoAutomacao {
  gatilho: GatilhoAutomacao;
  texto?: string;
  ehDm?: boolean;
  etiquetas?: string[];
  departamentoAtual?: string | null;
  minutosSemResposta?: number;
  foraDoExpediente?: boolean;
}

const arquivoAutomacoes = (dataDir = DATA_DIR) => join(dataDir, '.automacoes.json');

export async function lerAutomacoes(dataDir = DATA_DIR): Promise<RegraAutomacao[]> {
  try {
    const parsed = JSON.parse(await readFile(arquivoAutomacoes(dataDir), 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as RegraAutomacao[]) : [];
  } catch {
    return [];
  }
}

export async function salvarAutomacao(
  input: Omit<RegraAutomacao, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string },
  dataDir = DATA_DIR,
): Promise<RegraAutomacao> {
  const nome = input.nome.trim();
  if (!nome) throw new Error('nome obrigatório');
  const lista = await lerAutomacoes(dataDir);
  const id = input.id?.trim() || `auto-${randomUUID().slice(0, 8)}`;
  const existente = lista.find((r) => r.id === id);
  const regra: RegraAutomacao = {
    id,
    nome,
    ativo: input.ativo !== false,
    gatilho: input.gatilho,
    condicoes: input.condicoes ?? {},
    acoes: input.acoes ?? {},
    criadoEm: existente?.criadoEm ?? input.criadoEm ?? new Date().toISOString(),
  };
  const next = existente ? lista.map((r) => (r.id === id ? regra : r)) : [...lista, regra];
  await writeJsonAtomic(arquivoAutomacoes(dataDir), next);
  return regra;
}

export async function removerAutomacao(id: string, dataDir = DATA_DIR): Promise<boolean> {
  const lista = await lerAutomacoes(dataDir);
  const next = lista.filter((r) => r.id !== id);
  if (next.length === lista.length) return false;
  await writeJsonAtomic(arquivoAutomacoes(dataDir), next);
  return true;
}

export function avaliarAutomacoes(regras: RegraAutomacao[], ctx: ContextoAutomacao): RegraAutomacao[] {
  const disparadas: RegraAutomacao[] = [];
  const textoLower = (ctx.texto ?? '').toLowerCase();
  const tagsLower = new Set((ctx.etiquetas ?? []).map((t) => t.toLowerCase()));

  for (const r of regras) {
    if (!r.ativo) continue;
    if (r.gatilho !== ctx.gatilho) continue;
    if (r.gatilho === 'fora_do_expediente' && ctx.foraDoExpediente === false) continue;

    const c = r.condicoes;
    if (c.apenasDm && !ctx.ehDm) continue;
    if (c.semDepartamento && ctx.departamentoAtual) continue;
    if (c.etiqueta && !tagsLower.has(c.etiqueta.trim().toLowerCase())) continue;
    if (c.contemTexto && !textoLower.includes(c.contemTexto.trim().toLowerCase())) continue;
    if (c.minutosSemResposta && (ctx.minutosSemResposta ?? 0) < c.minutosSemResposta) continue;

    disparadas.push(r);
  }
  return disparadas;
}
