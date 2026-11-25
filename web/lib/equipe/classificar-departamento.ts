import { dsContacts, dsGroupMessages, dsListGroups } from '../data-source';
import { fundirMensagens, slugsIrmaosDeDm } from '../dm-irmaos';
import { historicoDaConversa, type LinhaHistorico, MODELO_PADRAO } from '../estilo/postura';
import type { MessageView } from '../data';
import { lerAtribuicoes, registrar } from './atribuicoes';
import { type Departamento, lerDepartamentos } from './departamentos';

/**
 * Pré-seleção de departamento pela IA. Roda em segundo plano: uma conversa em
 * espera, sem departamento e ainda não tentada, ganha uma sugestão. Falha ou
 * ausência da IA nunca bloqueia nada: a conversa só fica sem departamento.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const N_HISTORICO = 30;
const MAX_PARALELO = 3;
const TIMEOUT_MS = 20_000;

const INSTRUCOES = `Você classifica uma conversa de WhatsApp de cliente em um dos departamentos da empresa.
Use SOMENTE os ids da lista. Se nenhum departamento se encaixa com clareza, responda null.

Responda SÓ JSON: {"departamento": "<id>"} ou {"departamento": null}`;

/** Conversas em classificação agora, para uma mesma conversa não disparar duas vezes. */
const emCurso = new Set<string>();
/** Falha (HTTP, timeout, JSON) não grava nada: espera este tempo antes de tentar a mesma conversa de novo. */
const ESPERA_APOS_FALHA_MS = 15 * 60_000;
const falhouEm = new Map<string, number>();

export function montarPedidoDepartamento(historico: LinhaHistorico[], deps: Departamento[], modelo: string): object {
  const lista = deps.map((d) => `- ${d.id}: ${d.nome}${d.descricao ? ` (${d.descricao})` : ''}`).join('\n');
  const conversa = historico
    .map((l) => `[${l.hora}] ${l.quem === 'eu' ? 'EU' : l.quem === 'cliente' ? `CLIENTE (${l.nome})` : `EQUIPE (${l.nome})`}: ${l.texto}`)
    .join('\n');
  return {
    model: modelo,
    temperature: 0,
    response_format: { type: 'json_object' },
    provider: { sort: 'latency' },
    messages: [
      { role: 'system', content: INSTRUCOES },
      { role: 'user', content: `DEPARTAMENTOS:\n${lista}\n\nCONVERSA (mais antiga primeiro):\n${conversa}` },
    ],
  };
}

export function lerDepartamento(json: unknown, deps: Departamento[]): string | null {
  if (!json || typeof json !== 'object') return null;
  const id = (json as { departamento?: unknown }).departamento;
  if (typeof id !== 'string') return null;
  return deps.some((d) => d.id === id) ? id : null;
}

/** Últimas mensagens da conversa, com as duas pontas de um DM partido (telefone e LID) juntas. */
async function historicoDo(slug: string): Promise<LinhaHistorico[]> {
  const c = await dsContacts();
  let msgs: MessageView[];
  if (/^dm-\d+$/.test(slug)) {
    const existentes = new Set((await dsListGroups()).map((g) => g.slug));
    const slugs = slugsIrmaosDeDm(slug, c, existentes);
    const listas = await Promise.all(slugs.map((s) => dsGroupMessages(s)));
    msgs = slugs.length === 1 ? (listas[0] ?? []) : fundirMensagens(listas);
  } else {
    msgs = await dsGroupMessages(slug);
  }
  return historicoDaConversa(msgs, c, N_HISTORICO);
}

/** `slug` já está em `emCurso` (marcado por `classificarPendentes`); sai dele no fim. */
async function classificarUm(slug: string, deps: Departamento[], chave: string): Promise<void> {
  try {
    const historico = await historicoDo(slug);
    if (!historico.length) {
      await registrar(slug, { tipo: 'sugestao', departamento: null });
      return;
    }
    const modelo = process.env.WAC_DEPARTAMENTO_MODEL?.trim() || MODELO_PADRAO;
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', 'X-Title': 'whatsapp-collector departamento' },
      body: JSON.stringify(montarPedidoDepartamento(historico, deps, modelo)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      falhouEm.set(slug, Date.now());
      return;
    }
    const corpo = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const conteudo = String(corpo?.choices?.[0]?.message?.content ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '');
    const departamento = lerDepartamento(JSON.parse(conteudo), deps);
    await registrar(slug, { tipo: 'sugestao', departamento });
  } catch {
    // Falha da IA não bloqueia a fila: a conversa segue sem departamento e tenta de novo depois da espera.
    falhouEm.set(slug, Date.now());
  } finally {
    emCurso.delete(slug);
  }
}

/** Classifica as conversas em espera que ainda não têm departamento nem foram tentadas. Não lança. */
export async function classificarPendentes(slugs: string[]): Promise<void> {
  const chave = (process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!chave) return;
  const deps = await lerDepartamentos();
  if (!deps.length) return;
  const atribuicoes = await lerAtribuicoes();
  const fila = [...new Set(slugs)].filter((s) => {
    const a = atribuicoes[s];
    const falha = falhouEm.get(s);
    if (falha !== undefined && Date.now() - falha < ESPERA_APOS_FALHA_MS) return false;
    return !emCurso.has(s) && !a?.departamento && !a?.iaTentouEm;
  });
  // Marca o lote inteiro de uma vez (sem await entre o filtro e a marca): outra montagem da fila
  // que chegue enquanto o 1º lote espera a IA não pega as mesmas conversas.
  for (const s of fila) emCurso.add(s);
  for (let i = 0; i < fila.length; i += MAX_PARALELO) {
    await Promise.all(fila.slice(i, i + MAX_PARALELO).map((s) => classificarUm(s, deps, chave)));
  }
}
