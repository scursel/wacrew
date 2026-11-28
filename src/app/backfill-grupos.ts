import { open, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../logger.js';
import type { AncorasGruposStore } from '../storage/ancorasGruposStore.js';
import { writeJsonAtomicNode } from '../storage/atomic.js';
import {
  type AncoraMsg,
  aposConcluir,
  aposPedir,
  type BackfillEstadoGrupo,
  decidirProximaAcao,
  deveAgendarBackfill,
  estadoNovo,
} from './backfill-grupos-core.js';
import { comTeto } from './reconciler.js';

/**
 * Backfill sob demanda ao ligar a captura de um grupo: pede ao celular o
 * histórico anterior à âncora (sidecar ou primeira msg gravada), pagina até
 * o teto (30 dias / 500 msgs) ou página vazia. Um pedido por vez.
 */

const SIDECAR_NAME = '.backfill-grupos.json';
/** Intervalo entre pedidos — evita acordar o celular em rajada. */
const INTERVALO_ENTRE_PEDIDOS_MS = 3_000;
/** Teto da chamada fetchMessageHistory (espelha o reconciliador). */
const TETO_CHAMADA_MS = 90_000;
/** Quanto esperar a resposta assíncrona (messaging-history.set) após o pedido. */
const ESPERA_RESPOSTA_MS = 45_000;
/** Polling do jsonl enquanto espera a página chegar. */
const POLL_MS = 1_000;

export interface BackfillGruposDeps {
  dataDir: string;
  connected(): boolean;
  /** jid → slug estável do diretório em DATA_DIR. */
  slugOf(jid: string): string | undefined;
  fetchHistoryBefore(jid: string, ancora: AncoraMsg, count: number): Promise<boolean>;
  ancoras: AncorasGruposStore;
  /** Snapshot opcional publicado no status do reconciliador. */
  onStatusChange?(resumo: BackfillResumoPublico): void;
}

export interface BackfillResumoPublico {
  atualizadosEm: string;
  porGrupo: Record<
    string,
    {
      status: BackfillEstadoGrupo['status'];
      totalTrazido: number;
      ancoraTentada?: string;
      inicio?: string;
    }
  >;
}

interface SidecarFile {
  version: 1;
  updatedAt: string;
  grupos: Record<string, BackfillEstadoGrupo>;
}

export class BackfillGrupos {
  private readonly path: string;
  private readonly estados = new Map<string, BackfillEstadoGrupo>();
  private readonly fila: string[] = [];
  private readonly naFila = new Set<string>();
  private rodando = false;
  private parado = false;
  /** jids em aguardando_ancora — liberados quando chega a 1ª msg gravada. */
  private readonly esperandoAncora = new Set<string>();

  constructor(private readonly deps: BackfillGruposDeps) {
    this.path = join(deps.dataDir, SIDECAR_NAME);
  }

  async start(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<SidecarFile>;
      if (raw.grupos && typeof raw.grupos === 'object') {
        for (const [jid, e] of Object.entries(raw.grupos)) {
          if (e && typeof e.status === 'string') {
            this.estados.set(jid, {
              status: e.status,
              totalTrazido: typeof e.totalTrazido === 'number' ? e.totalTrazido : 0,
              ...(e.ancoraInicial ? { ancoraInicial: e.ancoraInicial } : {}),
              ...(e.ancoraTentada ? { ancoraTentada: e.ancoraTentada } : {}),
              ...(e.inicio ? { inicio: e.inicio } : {}),
            });
          }
        }
      }
    } catch {
      // primeiro boot
    }
    this.publicarStatus();
  }

  /**
   * Agenda backfill do grupo. `acabouDeLigar` zera o ciclo (mesmo se já
   * tinha concluído numa captura anterior).
   */
  async agendar(jid: string, opts: { acabouDeLigar?: boolean } = {}): Promise<void> {
    if (!jid.endsWith('@g.us')) return;
    const slug = this.deps.slugOf(jid);
    const temJsonl = slug ? await this.existeJsonl(slug) : false;
    const atual = this.estados.get(jid);
    if (
      !deveAgendarBackfill({
        acabouDeLigar: Boolean(opts.acabouDeLigar),
        temJsonl,
        estado: atual,
      })
    ) {
      return;
    }
    if (
      opts.acabouDeLigar ||
      !atual ||
      atual.status === 'concluido' ||
      atual.status === 'sem_resposta'
    ) {
      this.estados.set(jid, estadoNovo(new Date().toISOString()));
    }
    this.enfileirar(jid);
    await this.persistir();
    void this.bombear();
  }

  /** Startup: retoma incompletos e agenda monitorados sem jsonl. */
  async agendarMonitorados(jids: string[]): Promise<void> {
    for (const jid of jids) {
      await this.agendar(jid, { acabouDeLigar: false });
    }
  }

  /**
   * Chamado quando o collector grava uma msg de grupo — libera quem estava
   * esperando a primeira âncora (captura ligada sem sidecar prévio).
   */
  onMensagemGravada(groupJid: string): void {
    if (!this.esperandoAncora.has(groupJid)) return;
    this.esperandoAncora.delete(groupJid);
    this.enfileirar(groupJid);
    void this.bombear();
  }

  /** Snapshot p/ o `.reconciler-status.json`. */
  resumo(): BackfillResumoPublico {
    const porGrupo: BackfillResumoPublico['porGrupo'] = {};
    for (const [jid, e] of this.estados) {
      porGrupo[jid] = {
        status: e.status,
        totalTrazido: e.totalTrazido,
        ...(e.ancoraTentada ? { ancoraTentada: e.ancoraTentada } : {}),
        ...(e.inicio ? { inicio: e.inicio } : {}),
      };
    }
    return { atualizadosEm: new Date().toISOString(), porGrupo };
  }

  stop(): void {
    this.parado = true;
  }

  private enfileirar(jid: string): void {
    if (this.naFila.has(jid)) return;
    this.naFila.add(jid);
    this.fila.push(jid);
  }

  private async bombear(): Promise<void> {
    if (this.rodando || this.parado) return;
    this.rodando = true;
    try {
      while (this.fila.length > 0 && !this.parado) {
        const jid = this.fila.shift();
        if (!jid) break;
        this.naFila.delete(jid);
        await this.processar(jid);
        if (this.fila.length > 0) {
          await delay(INTERVALO_ENTRE_PEDIDOS_MS);
        }
      }
    } finally {
      this.rodando = false;
      // Algo enfileirou durante o finally?
      if (this.fila.length > 0 && !this.parado) void this.bombear();
    }
  }

  private async processar(jid: string): Promise<void> {
    let estado = this.estados.get(jid);
    if (!estado) return;

    const slug = this.deps.slugOf(jid);
    const maisAntiga = slug ? await this.lerMaisAntiga(slug) : null;
    const acao = decidirProximaAcao({
      estado,
      conectado: this.deps.connected(),
      ancoraSidecar: this.deps.ancoras.get(jid),
      maisAntigaJsonl: maisAntiga,
      agoraMs: Date.now(),
    });

    if (acao.tipo === 'aguardar_conexao') {
      // Reagenda: o próximo tick (ligação / outro grupo) retoma.
      this.enfileirar(jid);
      return;
    }

    if (acao.tipo === 'aguardar_ancora') {
      estado = { ...estado, status: 'aguardando_ancora' };
      this.estados.set(jid, estado);
      this.esperandoAncora.add(jid);
      await this.persistir();
      logger.info({ jid, slug }, '📜 Backfill de grupo aguardando primeira mensagem.');
      return;
    }

    if (acao.tipo === 'concluir') {
      estado = aposConcluir(estado, acao.motivo);
      this.estados.set(jid, estado);
      this.esperandoAncora.delete(jid);
      await this.persistir();
      if (acao.motivo === 'sem_novidade') {
        logger.info(
          { jid, slug, totalTrazido: estado.totalTrazido },
          '📜 Backfill de grupo sem resposta (página vazia).',
        );
      } else {
        logger.info(
          { jid, slug, motivo: acao.motivo, totalTrazido: estado.totalTrazido },
          '📜 Backfill de grupo concluído.',
        );
      }
      return;
    }

    // pedir
    const linhasAntes = slug ? await this.contarLinhas(slug) : 0;
    const antigaAntes = maisAntiga;
    try {
      const ok = await comTeto(
        this.deps.fetchHistoryBefore(jid, acao.ancora, acao.count),
        TETO_CHAMADA_MS,
        'backfill.fetchHistoryBefore',
      );
      if (!ok) {
        this.enfileirar(jid);
        return;
      }
    } catch (err) {
      logger.warn({ err, jid, slug }, '📜 Backfill de grupo: pedido falhou.');
      this.enfileirar(jid);
      return;
    }

    estado = aposPedir(estado, acao.ancora, new Date().toISOString());
    this.estados.set(jid, estado);
    await this.persistir();
    logger.info(
      { jid, slug, ancora: acao.ancora.id, totalTrazido: estado.totalTrazido },
      '📜 Backfill de grupo pedido.',
    );

    // Espera a página assíncrona aterrissar no jsonl (ou timeout).
    await this.esperarPagina(slug, antigaAntes?.id ?? null);

    const linhasDepois = slug ? await this.contarLinhas(slug) : 0;
    const delta = Math.max(0, linhasDepois - linhasAntes);
    const atualizado = this.estados.get(jid) ?? estado;
    estado = {
      ...atualizado,
      totalTrazido: atualizado.totalTrazido + delta,
    };
    this.estados.set(jid, estado);
    await this.persistir();

    // Próxima página (ou conclusão) — volta pra fila.
    this.enfileirar(jid);
  }

  private async esperarPagina(
    slug: string | undefined,
    idAntigaAntes: string | null,
  ): Promise<void> {
    if (!slug) {
      await delay(ESPERA_RESPOSTA_MS);
      return;
    }
    const deadline = Date.now() + ESPERA_RESPOSTA_MS;
    while (Date.now() < deadline && !this.parado) {
      await delay(POLL_MS);
      const antiga = await this.lerMaisAntiga(slug);
      if (antiga && antiga.id !== idAntigaAntes) return;
      // Primeira página sem jsonl prévio: qualquer linha conta.
      if (!idAntigaAntes) {
        const n = await this.contarLinhas(slug);
        if (n > 0) return;
      }
    }
  }

  private async existeJsonl(slug: string): Promise<boolean> {
    try {
      await stat(join(this.deps.dataDir, slug, 'messages.jsonl'));
      return true;
    } catch {
      return false;
    }
  }

  /** Mensagem de menor timestampMs no jsonl (backfill anexa no fim — não é head). */
  private async lerMaisAntiga(slug: string): Promise<AncoraMsg | null> {
    const path = join(this.deps.dataDir, slug, 'messages.jsonl');
    let fh: Awaited<ReturnType<typeof open>> | null = null;
    try {
      fh = await open(path, 'r');
      const { size } = await fh.stat();
      if (size === 0) return null;
      // Grupos em backfill ficam ≤ ~500 linhas; lê o arquivo inteiro.
      const buf = Buffer.alloc(size);
      await fh.read(buf, 0, buf.length, 0);
      let melhor: AncoraMsg | null = null;
      for (const linha of buf.toString('utf8').split('\n')) {
        if (!linha.trim()) continue;
        try {
          const r = JSON.parse(linha) as {
            id?: string;
            timestamp?: string;
            fromMe?: boolean;
            sender?: string;
          };
          if (!r.id || !r.timestamp) continue;
          const cand: AncoraMsg = {
            id: r.id,
            timestampMs: new Date(r.timestamp).getTime(),
            fromMe: Boolean(r.fromMe),
            sender: r.sender ?? '',
          };
          if (!melhor || cand.timestampMs < melhor.timestampMs) melhor = cand;
        } catch {
          // linha corrompida
        }
      }
      return melhor;
    } catch {
      return null;
    } finally {
      await fh?.close();
    }
  }

  private async contarLinhas(slug: string): Promise<number> {
    try {
      const raw = await readFile(join(this.deps.dataDir, slug, 'messages.jsonl'), 'utf8');
      let n = 0;
      for (const linha of raw.split('\n')) {
        if (linha.trim()) n++;
      }
      return n;
    } catch {
      return 0;
    }
  }

  private async persistir(): Promise<void> {
    const grupos: Record<string, BackfillEstadoGrupo> = {};
    for (const [jid, e] of this.estados) grupos[jid] = e;
    const data: SidecarFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      grupos,
    };
    await writeJsonAtomicNode(this.path, data).catch((err) =>
      logger.warn({ err }, 'Backfill de grupo: falha ao gravar estado.'),
    );
    this.publicarStatus();
  }

  private publicarStatus(): void {
    this.deps.onStatusChange?.(this.resumo());
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms);
    t.unref?.();
  });
}
