import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import {
  type AguardandoOk,
  type AtribuicaoFila,
  type ConversaFila,
  type DadosFila,
  type EntregaViva,
  type EsperaFila,
  type EventoEntrega,
  OK_VALIDO_MS,
} from './caixa';
import { type GroupSummary, listGroups } from './data';
import { listarDespachos } from './despacho-store';
import { buildInbox, type InboxItem } from './inbox';
import { CONTROL_URL, DATA_DIR } from './paths';
import { type Atribuicao, type Atribuicoes, DONO, lerAtribuicoes } from '@/lib/equipe/atribuicoes';
import { classificarPendentes } from '@/lib/equipe/classificar-departamento';
import { type Departamento, departamentosDe, lerDepartamentos, lerNomeDono } from '@/lib/equipe/departamentos';
import { canonicoGlobal } from '@/lib/equipe/quem';
import { lerUsuarios } from '@/lib/equipe/usuarios';
import { readTriage, type TriageState } from './triage';

/**
 * Dados da Caixa lidos no servidor (layout e rota). A parte pura mora em
 * `./caixa`; aqui só se junta o que vem do disco e do coletor.
 */

/** Lista de conversas uma vez por renderização: o trilho e a fila dividem a mesma leitura. */
export const conversasDaRequisicao = cache(() => listGroups());

export function paraEspera(i: InboxItem): EsperaFila {
  return { slug: i.slug, nome: i.groupName, motivo: i.reason, de: i.who, previa: i.preview, desde: i.waitingSince };
}

/** O que a atribuição precisa para virar nome na lista. Lido uma vez por fila. */
export interface ContextoAtribuicao {
  atribuicoes: Atribuicoes;
  departamentos: Departamento[];
  /** Nome do dono na assinatura e na lista ("Dono" quando o responsável é `@dono`). */
  nomeDono: string;
  /** Login → nome da conta. Sem conta (apagada), o login aparece no lugar do nome. */
  nomeDe: ReadonlyMap<string, string>;
}

export async function contextoAtribuicao(): Promise<ContextoAtribuicao> {
  const [atribuicoes, departamentos, nomeDono, usuarios] = await Promise.all([
    lerAtribuicoes(),
    lerDepartamentos(),
    lerNomeDono(),
    lerUsuarios(),
  ]);
  return { atribuicoes, departamentos, nomeDono, nomeDe: new Map(usuarios.map((u) => [u.login, u.nome])) };
}

/** A atribuição da conversa (chave = slug canônico) em nomes. Departamento apagado vira "nenhum". */
export function atribuicaoDaConversa(chave: string, ctx: ContextoAtribuicao): AtribuicaoFila {
  const a: Atribuicao | undefined = ctx.atribuicoes[chave];
  const dep = a?.departamento ? ctx.departamentos.find((d) => d.id === a.departamento) : undefined;
  const responsavel = a?.responsavel ?? null;
  return {
    departamento: dep?.id ?? null,
    departamentoNome: dep?.nome ?? null,
    departamentoSugerido: dep !== undefined && a?.origemDepartamento === 'ia',
    responsavel,
    responsavelNome: responsavel === null ? null : responsavel === DONO ? ctx.nomeDono : (ctx.nomeDe.get(responsavel) ?? responsavel),
  };
}

/** `chave` é o slug canônico da conversa (na lista do dono, o próprio slug). */
export function paraConversa(
  g: GroupSummary,
  ctx: ContextoAtribuicao,
  chave: string = g.slug,
  triage?: TriageState,
  agoraMs: number = Date.now(),
): ConversaFila {
  const snoozedRaw = triage?.snoozedUntil[g.slug] ?? null;
  const snoozeExpired =
    snoozedRaw !== null &&
    ((Number.isFinite(Date.parse(snoozedRaw)) && Date.parse(snoozedRaw) <= agoraMs) ||
      Boolean(g.lastTimestamp && g.lastTimestamp > snoozedRaw));
  const snoozedUntil = snoozeExpired ? null : snoozedRaw;
  const rawStatus = triage?.status[g.slug];
  const resolved = triage?.resolved[g.slug];
  const reopenedAfterResolve = Boolean(resolved && g.lastTimestamp && g.lastTimestamp > resolved);
  const status =
    snoozedUntil
      ? 'adiada'
      : rawStatus === 'adiada'
        ? 'aberta'
        : rawStatus === 'resolvida' || (resolved && !reopenedAfterResolve)
          ? reopenedAfterResolve
            ? 'aberta'
            : 'resolvida'
          : rawStatus ?? 'aberta';
  const markedUnread = Boolean(triage?.markedUnread[g.slug]);
  return {
    slug: g.slug,
    nome: g.name,
    avatarPath: g.avatarPath,
    previa: g.lastPreview,
    ultimaEm: g.lastTimestamp,
    ...(g.capturaDesde ? { capturaDesde: g.capturaDesde } : {}),
    naoLidas: markedUnread ? Math.max(1, g.unread) : g.unread,
    fixada: Boolean(g.pinned),
    silenciada: Boolean(g.muted),
    arquivada: Boolean(g.archived),
    etiquetas: g.etiquetas ?? [],
    status,
    snoozedUntil,
    markedUnread,
    ...atribuicaoDaConversa(chave, ctx),
  };
}

export interface IaDaCaixa {
  entregas: EntregaViva[];
  aguardandoOk: AguardandoOk[];
}

/** Coletor fora do ar não pode segurar a tela: a fila da IA some, o resto aparece. */
const ESPERA_COLETOR_MS = 1500;

async function entregasVivas(): Promise<EntregaViva[]> {
  try {
    const res = await fetch(`${CONTROL_URL}/entregas`, { cache: 'no-store', signal: AbortSignal.timeout(ESPERA_COLETOR_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { entregas?: Array<Partial<EntregaViva>> };
    return (data.entregas ?? [])
      .filter((e): e is EntregaViva => typeof e.ticket === 'string' && typeof e.slug === 'string' && typeof e.estado === 'string')
      .map((e) => ({
        ticket: e.ticket,
        slug: e.slug,
        estado: e.estado,
        enviados: Number(e.enviados) || 0,
        total: Number(e.total) || 0,
        entregarEm: String(e.entregarEm ?? ''),
      }));
  } catch {
    return [];
  }
}

/** Um dia de folga além da validade da pergunta: a passada vem no fuso do operador, não em UTC. */
const JANELA_DESPACHO_MS = OK_VALIDO_MS + 24 * 60 * 60_000;

/** Perguntas da triagem para o cliente que ainda esperam o "ok N" do operador (só as recentes). */
async function perguntasPendentes(): Promise<AguardandoOk[]> {
  const out: AguardandoOk[] = [];
  const desde = `${new Date(Date.now() - JANELA_DESPACHO_MS).toISOString().slice(0, 10)}T0000`;
  for (const arquivo of await listarDespachos({ desde })) {
    for (const item of arquivo.itens) {
      if (item.acao !== 'enviar' || item.executadoEm) continue;
      out.push({ slug: item.slug, n: item.n, texto: item.texto ?? item.titulo, desde: arquivo.criadoEm });
    }
  }
  // A mais nova primeiro: a fila mostra uma linha por chat.
  return out.sort((a, b) => b.desde.localeCompare(a.desde));
}

/**
 * Conversa de apoio para uma espera cujo slug (canônico) não está na lista. Sem ela, a espera
 * não acharia a atribuição, que fica no slug canônico. Não entra em "Paradas" nem muda a espera.
 */
function conversaDeApoio(slug: string, nome: string, ctx: ContextoAtribuicao): ConversaFila {
  return {
    slug,
    nome,
    avatarPath: null,
    previa: null,
    ultimaEm: null,
    naoLidas: 0,
    fixada: false,
    silenciada: false,
    arquivada: false,
    etiquetas: [],
    ...atribuicaoDaConversa(slug, ctx),
  };
}

/** A lista mais as esperas que não estão nela (ver `conversaDeApoio`). */
function comEsperasSemConversa(
  conversas: ConversaFila[],
  inbox: InboxItem[],
  ctx: ContextoAtribuicao,
  canonicoDe: (slug: string) => string = (s) => s,
): ConversaFila[] {
  const listadas = new Set(conversas.map((c) => c.slug));
  const apoio = inbox
    .filter((i) => !listadas.has(i.slug))
    .map((i) => ({ ...conversaDeApoio(i.slug, i.groupName, ctx), ...atribuicaoDaConversa(canonicoDe(i.slug), ctx) }));
  return apoio.length ? [...conversas, ...apoio] : conversas;
}

/** Fila do dono: quem espera, as conversas e o que a IA está fazendo. */
export async function filaDoDono(): Promise<DadosFila> {
  const [inbox, grupos, ia, ctx, canonicoDe, triage] = await Promise.all([
    buildInbox(),
    conversasDaRequisicao(),
    iaDaCaixa(),
    contextoAtribuicao(),
    canonicoGlobal(),
    readTriage(),
  ]);
  const agora = Date.now();
  const slugsEmEspera = inbox.map((i) => ({ slug: canonicoDe(i.slug), desde: i.waitingSince }));
  const dados: DadosFila = {
    esperando: inbox.map(paraEspera),
    // A lista do dono não agrupa DM partida, mas a atribuição mora no slug canônico (onde as rotas gravam):
    // os dois lados mostram o mesmo responsável e departamento.
    conversas: comEsperasSemConversa(
      grupos.map((g) => paraConversa(g, ctx, canonicoDe(g.slug), triage, agora)),
      inbox,
      ctx,
      canonicoDe,
    ),
    entregas: ia.entregas,
    aguardandoOk: ia.aguardandoOk,
    eu: DONO,
    departamentos: ctx.departamentos.map(({ id, nome }) => ({ id, nome })),
    // O dono escolhe qualquer departamento: todos são dele.
    meusDepartamentos: ctx.departamentos.map((d) => d.id),
    geradoEm: agora,
  };
  // A IA classifica em segundo plano: a fila não espera por ela (a função não lança).
  void classificarPendentes(slugsEmEspera);
  return dados;
}

/**
 * Fila de quem atende: só os chats liberados. O "silenciado" é organização do
 * dono e não tira ninguém da fila; a DM partida em telefone × LID é uma conversa só.
 * `eu` é o login de quem atende (alimenta a vista Minhas).
 */
export async function filaDaEquipe(
  chats: ReadonlySet<string>,
  canonicoDe: (slug: string) => string,
  lista: GroupSummary[],
  eu: string,
): Promise<DadosFila> {
  const [inbox, ctx, triage] = await Promise.all([
    buildInbox({ slugs: chats, ignorarSilenciados: true, canonicoDe }),
    contextoAtribuicao(),
    readTriage(),
  ]);
  const agora = Date.now();
  const slugsEmEspera = inbox.map((i) => ({ slug: i.slug, desde: i.waitingSince }));
  const dados: DadosFila = {
    esperando: inbox.map(paraEspera),
    // Atribuição no slug canônico (o mesmo da espera): DM partida (telefone × LID) é uma conversa só.
    conversas: comEsperasSemConversa(
      lista.map((g) => paraConversa(g, ctx, canonicoDe(g.slug), triage, agora)),
      inbox,
      ctx,
      canonicoDe,
    ),
    entregas: [],
    aguardandoOk: [],
    eu,
    departamentos: ctx.departamentos.map(({ id, nome }) => ({ id, nome })),
    meusDepartamentos: departamentosDe(ctx.departamentos, eu),
    geradoEm: Date.now(),
  };
  // Slugs já canônicos (agruparConversas). A IA classifica em segundo plano, sem atrasar a fila.
  void classificarPendentes(slugsEmEspera);
  return dados;
}

/** Atribuição da conversa aberta, pronta para a tela: nomes, departamentos e quem pode receber. */
export interface DadosAtribuicaoConversa {
  /** Login de quem olha, ou `@dono`. */
  eu: string;
  inicial: AtribuicaoFila;
  departamentos: { id: string; nome: string }[];
  /** Contas ativas e o dono, sem quem está olhando (para delegar). */
  equipe: { id: string; nome: string }[];
}

/** `chave` é o slug canônico da conversa (`canonicoGlobal` no dono, `canonicoDe` na equipe). */
export async function atribuicaoDaConversaAberta(chave: string, eu: string): Promise<DadosAtribuicaoConversa> {
  const [ctx, usuarios] = await Promise.all([contextoAtribuicao(), lerUsuarios()]);
  const contas = usuarios.filter((u) => u.ativo && u.login !== eu).map((u) => ({ id: u.login, nome: u.nome }));
  return {
    eu,
    inicial: atribuicaoDaConversa(chave, ctx),
    departamentos: ctx.departamentos.map(({ id, nome }) => ({ id, nome })),
    equipe: eu === DONO ? contas : [...contas, { id: DONO, nome: ctx.nomeDono }],
  };
}

/** O que a IA está fazendo agora: entregas na fila e perguntas esperando o OK. */
export async function iaDaCaixa(): Promise<IaDaCaixa> {
  const [entregas, aguardandoOk] = await Promise.all([entregasVivas(), perguntasPendentes().catch(() => [])]);
  return { entregas, aguardandoOk };
}

/** O registro de entregas só cresce: lê o fim dele (o bastante para semanas de conversa). */
const TETO_REGISTRO = 4 * 1024 * 1024;

async function fimDoRegistro(caminho: string, tamanho: number): Promise<string> {
  const h = await open(caminho, 'r');
  try {
    const inicio = Math.max(0, tamanho - TETO_REGISTRO);
    const buf = Buffer.alloc(tamanho - inicio);
    await h.read(buf, 0, buf.length, inicio);
    const texto = buf.toString('utf8');
    // Começou no meio de uma linha: descarta o pedaço.
    return inicio > 0 ? texto.slice(texto.indexOf('\n') + 1) : texto;
  } finally {
    await h.close();
  }
}

function paraEvento(linha: string): EventoEntrega | null {
  try {
    const e = JSON.parse(linha) as Partial<EventoEntrega>;
    if (typeof e.slug !== 'string' || typeof e.ticket !== 'string' || typeof e.estado !== 'string' || typeof e.ts !== 'string') return null;
    return {
      ts: e.ts,
      ticket: e.ticket,
      slug: e.slug,
      estado: e.estado,
      motivo: typeof e.motivo === 'string' ? e.motivo : null,
      enviados: Number(e.enviados) || 0,
      total: Number(e.total) || 0,
      iniciadoEm: typeof e.iniciadoEm === 'string' ? e.iniciadoEm : null,
    };
  } catch {
    return null; // linha cortada no meio da escrita
  }
}

/** Leitura guardada até o registro mudar de tamanho ou de data: a conversa consulta a cada 10 s. */
let registro: { mtimeMs: number; size: number; eventos: EventoEntrega[] } | null = null;

/** Transições das entregas da IA numa conversa, desde um instante (o registro que o coletor grava). */
export async function eventosDaConversa(slug: string, desde = ''): Promise<EventoEntrega[]> {
  const caminho = join(DATA_DIR, '.entregas.jsonl');
  try {
    const st = await stat(caminho);
    if (!registro || registro.mtimeMs !== st.mtimeMs || registro.size !== st.size) {
      const eventos = (await fimDoRegistro(caminho, st.size))
        .split('\n')
        .map(paraEvento)
        .filter((e): e is EventoEntrega => e !== null);
      registro = { mtimeMs: st.mtimeMs, size: st.size, eventos };
    }
  } catch {
    return [];
  }
  return registro.eventos.filter((e) => e.slug === slug && (!desde || e.ts >= desde));
}
