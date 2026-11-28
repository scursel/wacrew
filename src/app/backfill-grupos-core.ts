/**
 * Núcleo puro do backfill sob demanda de grupos: decide a próxima ação a partir
 * do estado, da âncora sidecar e do rabo/cabeça do jsonl. Sem I/O — o
 * BackfillGrupos (socket/disco) consome estas funções.
 */

/** Identificação mínima de mensagem — nunca texto, mídia ou nome. */
export interface AncoraMsg {
  id: string;
  timestampMs: number;
  fromMe: boolean;
  sender: string;
}

export type BackfillStatus =
  | 'pendente'
  | 'aguardando_ancora'
  | 'pedindo'
  | 'concluido'
  | 'sem_resposta';

export interface BackfillEstadoGrupo {
  status: BackfillStatus;
  /** Âncora do primeiro pedido — base do teto de 30 dias. */
  ancoraInicial?: AncoraMsg;
  /** Id da última âncora já pedida (não repetir). */
  ancoraTentada?: string;
  /** Mensagens que o backfill acrescentou ao jsonl (aprox.). */
  totalTrazido: number;
  /** ISO do início deste ciclo. */
  inicio?: string;
}

export type AcaoBackfill =
  | { tipo: 'aguardar_conexao' }
  | { tipo: 'aguardar_ancora' }
  | { tipo: 'pedir'; ancora: AncoraMsg; count: number }
  | {
      tipo: 'concluir';
      motivo: 'teto_dias' | 'teto_msgs' | 'sem_novidade' | 'ja_concluido';
    };

/** Mensagens pedidas por página ao celular. */
export const BACKFILL_PAGINA = 50;
/** Teto de mensagens trazidas por um ciclo de backfill. */
export const BACKFILL_TETO_MSGS = 500;
/** Até quantos dias antes da âncora inicial vale pedir. */
export const BACKFILL_TETO_DIAS = 30;

const DIA_MS = 24 * 60 * 60_000;

/**
 * JIDs que passaram a `watch: true` nesta recarga (antes → depois).
 * Só os que ligaram agora — desligar e re-ligar conta como novo.
 */
export function gruposLigadosAgora(
  monitoradosAntes: ReadonlySet<string>,
  monitoradosDepois: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const jid of monitoradosDepois) {
    if (!monitoradosAntes.has(jid)) out.push(jid);
  }
  return out.sort();
}

/**
 * Mantém só a mensagem mais nova. Empate de timestamp: preserva a atual
 * (evita churn de id no sidecar).
 */
export function ancoraMaisNova(
  atual: AncoraMsg | null | undefined,
  candidata: AncoraMsg,
): AncoraMsg {
  if (!atual) return candidata;
  if (candidata.timestampMs > atual.timestampMs) return candidata;
  return atual;
}

/** Vale agendar (ou retomar) o backfill deste grupo? */
export function deveAgendarBackfill(opts: {
  acabouDeLigar: boolean;
  temJsonl: boolean;
  estado: BackfillEstadoGrupo | undefined;
}): boolean {
  if (opts.acabouDeLigar) return true;
  const st = opts.estado?.status;
  if (st === 'pendente' || st === 'aguardando_ancora' || st === 'pedindo') return true;
  // Startup: monitorado sem messages.jsonl → pede histórico ao celular.
  if (!opts.temJsonl) return true;
  return false;
}

/**
 * Próxima ação do ciclo. O orquestrador só chama de novo DEPOIS de esperar a
 * resposta do `fetchHistoryBefore` (ou timeout) — assim `ancoraTentada` igual
 * à mais antiga do jsonl significa página vazia.
 */
export function decidirProximaAcao(input: {
  estado: BackfillEstadoGrupo;
  conectado: boolean;
  ancoraSidecar: AncoraMsg | null;
  maisAntigaJsonl: AncoraMsg | null;
  agoraMs: number;
}): AcaoBackfill {
  const { estado, conectado, ancoraSidecar, maisAntigaJsonl } = input;
  void input.agoraMs;

  if (estado.status === 'concluido') {
    return { tipo: 'concluir', motivo: 'ja_concluido' };
  }
  if (estado.status === 'sem_resposta') {
    return { tipo: 'concluir', motivo: 'sem_novidade' };
  }

  if (!conectado) return { tipo: 'aguardar_conexao' };

  if (estado.totalTrazido >= BACKFILL_TETO_MSGS) {
    return { tipo: 'concluir', motivo: 'teto_msgs' };
  }

  // Âncora do próximo pedido: a mais antiga do jsonl (página seguinte) ou a
  // do sidecar quando ainda não há arquivo (primeiro pedido ao ligar).
  const ancora = maisAntigaJsonl ?? ancoraSidecar;
  if (!ancora) return { tipo: 'aguardar_ancora' };

  const ref = estado.ancoraInicial ?? ancora;
  if (ancora.timestampMs < ref.timestampMs - BACKFILL_TETO_DIAS * DIA_MS) {
    return { tipo: 'concluir', motivo: 'teto_dias' };
  }
  // Mesma âncora já pedida → celular não trouxe nada novo.
  if (estado.ancoraTentada === ancora.id) {
    return { tipo: 'concluir', motivo: 'sem_novidade' };
  }

  return { tipo: 'pedir', ancora, count: BACKFILL_PAGINA };
}

/** Aplica o resultado de um pedido bem enviado ao estado em memória. */
export function aposPedir(
  estado: BackfillEstadoGrupo,
  ancora: AncoraMsg,
  agoraIso: string,
): BackfillEstadoGrupo {
  return {
    ...estado,
    status: 'pedindo',
    ancoraInicial: estado.ancoraInicial ?? ancora,
    ancoraTentada: ancora.id,
    inicio: estado.inicio ?? agoraIso,
  };
}

/** Marca o ciclo como terminado (teto ou página vazia). */
export function aposConcluir(
  estado: BackfillEstadoGrupo,
  motivo: 'teto_dias' | 'teto_msgs' | 'sem_novidade' | 'ja_concluido',
): BackfillEstadoGrupo {
  return {
    ...estado,
    status: motivo === 'sem_novidade' ? 'sem_resposta' : 'concluido',
  };
}

/** Estado inicial de um ciclo novo (ligar captura / startup sem jsonl). */
export function estadoNovo(agoraIso: string): BackfillEstadoGrupo {
  return { status: 'pendente', totalTrazido: 0, inicio: agoraIso };
}
