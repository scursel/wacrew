import { dsContacts, dsGroupMessages, dsListGroups } from '../data-source';
import { fundirMensagens, slugsIrmaosDeDm } from '../dm-irmaos';
import { historicoDaConversa, type LinhaHistorico, MODELO_PADRAO } from '../estilo/postura';
import type { MessageView } from '../data';
import { type DestinoIA, resolverIA } from '../ia/provedor';
import { AVISO_SEM_MODELO } from '../ia/aviso';
import { textoDoDelta } from '../ia/texto';
import { INSTRUCAO_RESUMO, limparResumo, type ResumoConversa, salvarResumo } from '../resumo-conversa';
import { type Atribuicao, lerAtribuicoes, registrar } from './atribuicoes';
import { type Departamento, lerDepartamentos } from './departamentos';

/**
 * Pré-seleção de departamento pela IA. Roda em segundo plano: uma conversa em
 * espera, sem departamento e ainda não tentada, ganha uma sugestão. A sugestão olha
 * o pedido atual, não a conversa inteira, e é refeita quando o cliente volta com
 * assunto novo depois de `NOVO_ATENDIMENTO_MS` (a escolha manual fica). Falha ou
 * ausência da IA nunca bloqueia nada: a conversa só fica sem departamento.
 * Resumo é outra coisa: só nasce do botão (resumirConversa), nunca daqui.
 */

const BASE_OPENROUTER = 'https://openrouter.ai/api/v1';
const N_HISTORICO = 30;
const MAX_PARALELO = 3;
const TIMEOUT_MS = 20_000;
/**
 * Silêncio que separa um atendimento do outro. Mensagem depois de um intervalo assim é
 * assunto novo: o prompt a trata como pedido atual, e a conversa que a IA já classificou
 * volta para a fila quando a espera nova começa este tempo depois da última tentativa.
 */
export const NOVO_ATENDIMENTO_MS = 3 * 60 * 60_000;

const INSTRUCOES = `Você classifica uma conversa de WhatsApp de cliente em um dos departamentos da empresa.
Classifique pelo que o cliente quer AGORA, no bloco PEDIDO ATUAL. O CONTEXTO ANTERIOR serve só para entender termos e quem é o cliente: nunca decida por ele.
O mesmo cliente muda de assunto entre um atendimento e outro (pagou ontem e hoje pede orçamento novo; pediu suporte semana passada e hoje quer comprar). Quando o pedido atual e o contexto anterior apontam departamentos diferentes, vale o pedido atual.
Dentro do pedido atual, a mensagem mais recente do cliente pesa mais.
departamento: use SOMENTE os ids da lista. Se nenhum departamento se encaixa com clareza no pedido atual, use null.

Responda SÓ JSON: {"departamento": "<id>" ou null}`;

const INSTRUCOES_SO_RESUMO = `Você resume uma conversa de WhatsApp de cliente.
${INSTRUCAO_RESUMO}

Responda SÓ JSON: {"resumo": "<texto>"}`;

/** Conversas em classificação agora, para uma mesma conversa não disparar duas vezes. */
const emCurso = new Set<string>();
/** Falha (HTTP, timeout, JSON) não grava nada: espera este tempo antes de tentar a mesma conversa de novo. */
const ESPERA_APOS_FALHA_MS = 15 * 60_000;
const falhouEm = new Map<string, number>();

/** Uma mensagem por linha: quebra de linha do texto não pode imitar um cabeçalho de bloco nem outro remetente. */
const umaLinha = (t: string) => t.replace(/\s*[\r\n\u0085\u2028\u2029]+\s*/g, ' / ');
const formatarLinha = (l: LinhaHistorico) =>
  `[${l.hora}] ${l.quem === 'eu' ? 'EU' : l.quem === 'cliente' ? `CLIENTE (${umaLinha(l.nome)})` : `EQUIPE (${umaLinha(l.nome)})`}: ${umaLinha(l.texto)}`;

/**
 * Corta o histórico em contexto antigo e pedido atual. O pedido atual começa no último
 * silêncio de `NOVO_ATENDIMENTO_MS`; sem silêncio assim, nas falas do cliente depois da
 * última resposta nossa. Sem fala do cliente no recorte, a conversa inteira é o pedido.
 */
export function separarPedidoAtual(historico: LinhaHistorico[]): { anterior: LinhaHistorico[]; atual: LinhaHistorico[] } {
  let corte = 0;
  for (let i = historico.length - 1; i > 0; i--) {
    const antes = Date.parse(historico[i - 1]!.ts ?? '');
    const depois = Date.parse(historico[i]!.ts ?? '');
    if (Number.isFinite(antes) && Number.isFinite(depois) && depois - antes >= NOVO_ATENDIMENTO_MS) {
      corte = i;
      break;
    }
  }
  if (corte === 0) {
    const ultimaNossa = historico.map((l) => l.quem).findLastIndex((q) => q !== 'cliente');
    corte = ultimaNossa + 1;
  }
  const atual = historico.slice(corte);
  if (!atual.some((l) => l.quem === 'cliente')) return { anterior: [], atual: historico };
  return { anterior: historico.slice(0, corte), atual };
}

export function montarPedidoDepartamento(historico: LinhaHistorico[], deps: Departamento[], modelo: string): object {
  const lista = deps.map((d) => `- ${d.id}: ${d.nome}${d.descricao ? ` (${d.descricao})` : ''}`).join('\n');
  const { anterior, atual } = separarPedidoAtual(historico);
  const blocos = [
    `DEPARTAMENTOS:\n${lista}`,
    anterior.length ? `CONTEXTO ANTERIOR (só contexto, mais antiga primeiro):\n${anterior.map(formatarLinha).join('\n')}` : '',
    `PEDIDO ATUAL (classifique por aqui, mais antiga primeiro):\n${atual.map(formatarLinha).join('\n')}`,
  ];
  return {
    model: modelo,
    temperature: 0,
    response_format: { type: 'json_object' },
    provider: { sort: 'latency' },
    messages: [
      { role: 'system', content: INSTRUCOES },
      { role: 'user', content: blocos.filter(Boolean).join('\n\n') },
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

/** JSON da resposta (conteúdo em string ou em partes, com ou sem cerca de código). */
async function lerJson(res: Response): Promise<unknown> {
  const corpo = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const conteudo = textoDoDelta(corpo?.choices?.[0]?.message?.content).replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(conteudo);
  } catch {
    throw new Error('o modelo respondeu fora do formato esperado; tente de novo');
  }
}

/** `slug` já está em `emCurso` (marcado por `classificarPendentes`); sai dele no fim. */
async function classificarUm(slug: string, deps: Departamento[], destino: DestinoIA): Promise<void> {
  try {
    const historico = await historicoDo(slug);
    if (!historico.length) {
      await registrar(slug, { tipo: 'sugestao', departamento: null });
      return;
    }
    const endpoint = `${destino.baseUrl}/chat/completions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${destino.chave}`, 'Content-Type': 'application/json', 'X-Title': 'whatsapp-collector departamento' },
      body: JSON.stringify(montarPedidoDepartamento(historico, deps, destino.modelo)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      falhouEm.set(slug, Date.now());
      return;
    }
    const json = await lerJson(res);
    const departamento = lerDepartamento(json, deps);
    // Só `null` explícito é "nenhum se encaixa". Resposta sem o campo ou com id que não existe
    // é falha: não apaga a sugestão que já está lá e tenta de novo depois da espera.
    if (departamento === null && (json as { departamento?: unknown } | null)?.departamento !== null) {
      falhouEm.set(slug, Date.now());
      return;
    }
    await registrar(slug, { tipo: 'sugestao', departamento, viuAte: historico.at(-1)?.ts });
  } catch {
    // Falha da IA não bloqueia a fila: a conversa segue sem departamento e tenta de novo depois da espera.
    falhouEm.set(slug, Date.now());
  } finally {
    emCurso.delete(slug);
  }
}

/** Conversa em espera: o slug, ou o slug com o começo da espera (ISO). */
export type PendenteDepartamento = string | { slug: string; desde?: string };

/**
 * Pode (re)classificar? Nunca a escolha manual. Sem tentativa ainda, sim. Já tentada pela IA,
 * só quando o cliente abriu um atendimento novo depois do que a IA leu: a espera começou
 * `NOVO_ATENDIMENTO_MS` depois da última mensagem lida, ou depois de um "resolver" que veio
 * após essa leitura. Quem pagou ontem e hoje pede orçamento novo sai do departamento antigo.
 * A base é a última mensagem lida, não a hora em que a IA respondeu: resposta atrasada não
 * encobre um pedido que chegou enquanto ela pensava.
 */
export function precisaClassificar(a: Atribuicao | undefined, desde: string | undefined): boolean {
  if (a?.origemDepartamento === 'manual') return false;
  if (!a?.iaTentouEm) return !a?.departamento;
  const viu = Date.parse(a.iaViuAte ?? a.iaTentouEm);
  const espera = Date.parse(desde ?? '');
  if (!Number.isFinite(viu) || !Number.isFinite(espera)) return false;
  if (espera - viu >= NOVO_ATENDIMENTO_MS) return true;
  const resolvido = Date.parse(a.resolvidoEm ?? '');
  return Number.isFinite(resolvido) && resolvido > viu && espera > resolvido;
}

/** Classifica as conversas em espera sem departamento, ou com o da IA vencido por um atendimento novo. Não lança. */
export async function classificarPendentes(pendentes: PendenteDepartamento[]): Promise<void> {
  // Só o modelo escolhido na tela de IA: sem escolha, a chave vem vazia e nada sai.
  const destino = await resolverIA('departamento', { baseUrl: BASE_OPENROUTER, chave: '', modelo: MODELO_PADRAO });
  if (!destino.chave.trim()) return;
  const deps = await lerDepartamentos();
  if (!deps.length) return;
  const atribuicoes = await lerAtribuicoes();
  // Mesmo slug mais de uma vez (DM partida na lista do dono): vale a espera mais antiga, o
  // começo real dela. A mais nova faria uma fala no meio da espera parecer atendimento novo.
  const desdeDe = new Map<string, string | undefined>();
  for (const p of pendentes) {
    const slug = typeof p === 'string' ? p : p.slug;
    const desde = typeof p === 'string' ? undefined : p.desde;
    const atual = desdeDe.get(slug);
    if (!desdeDe.has(slug) || (desde && (!atual || desde < atual))) desdeDe.set(slug, desde);
  }
  const fila = [...desdeDe.keys()].filter((s) => {
    const falha = falhouEm.get(s);
    if (falha !== undefined && Date.now() - falha < ESPERA_APOS_FALHA_MS) return false;
    return !emCurso.has(s) && precisaClassificar(atribuicoes[s], desdeDe.get(s));
  });
  // Marca o lote inteiro de uma vez (sem await entre o filtro e a marca): outra montagem da fila
  // que chegue enquanto o 1º lote espera a IA não pega as mesmas conversas.
  for (const s of fila) emCurso.add(s);
  for (let i = 0; i < fila.length; i += MAX_PARALELO) {
    await Promise.all(fila.slice(i, i + MAX_PARALELO).map((s) => classificarUm(s, deps, destino)));
  }
}

/**
 * Botão Atualizar do painel: refaz só o resumo, com o mesmo modelo da pré-seleção
 * de departamento. Lança com motivo legível se a IA está desligada ou falhou.
 */
export function resumirConversa(slug: string): Promise<ResumoConversa> {
  // Dois cliques (ou duas abas) no mesmo chat esperam a mesma chamada.
  const andando = resumindo.get(slug);
  if (andando) return andando;
  const p = resumirAgora(slug).finally(() => resumindo.delete(slug));
  resumindo.set(slug, p);
  return p;
}

const resumindo = new Map<string, Promise<ResumoConversa>>();

async function resumirAgora(slug: string): Promise<ResumoConversa> {
  const destino = await resolverIA('departamento', { baseUrl: BASE_OPENROUTER, chave: '', modelo: MODELO_PADRAO });
  if (!destino.chave.trim()) throw new Error(AVISO_SEM_MODELO);
  const historico = await historicoDo(slug);
  if (!historico.length) throw new Error('conversa sem mensagens para resumir');
  const conversa = historico.map(formatarLinha).join('\n');
  const res = await fetch(`${destino.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${destino.chave}`, 'Content-Type': 'application/json', 'X-Title': 'whatsapp-collector resumo' },
    body: JSON.stringify({
      model: destino.modelo,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSTRUCOES_SO_RESUMO },
        { role: 'user', content: `CONVERSA (mais antiga primeiro):\n${conversa}` },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS * 2),
  });
  if (!res.ok) throw new Error(`9router HTTP ${res.status}`);
  const resumo = limparResumo((((await lerJson(res)) ?? {}) as { resumo?: unknown }).resumo);
  if (!resumo) throw new Error('o modelo não devolveu um resumo');
  return salvarResumo(slug, resumo);
}
