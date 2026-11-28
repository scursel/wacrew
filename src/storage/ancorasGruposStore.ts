import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomicNode } from './atomic.js';

/**
 * Sidecar de âncoras de grupo (`DATA_DIR/.ancoras-grupos.json`).
 * Para CADA grupo (monitorado ou não) guarda só a identificação da mensagem
 * mais nova que passou pelo coletor — nunca texto, mídia ou nome. Serve de
 * âncora pro backfill quando a captura é ligada depois.
 */

const SIDECAR_NAME = '.ancoras-grupos.json';
const DEBOUNCE_MS = 500;

/** Identificação mínima — compatível com `AncoraMsg` do núcleo de backfill. */
export interface AncoraGrupo {
  id: string;
  timestampMs: number;
  fromMe: boolean;
  sender: string;
}

interface SidecarFile {
  version: 1;
  updatedAt: string;
  /** groupJid → âncora da mensagem mais nova. */
  ancoras: Record<string, AncoraGrupo>;
}

function maisNova(atual: AncoraGrupo | undefined, candidata: AncoraGrupo): AncoraGrupo {
  if (!atual) return candidata;
  if (candidata.timestampMs > atual.timestampMs) return candidata;
  return atual;
}

export class AncorasGruposStore {
  private readonly path: string;
  private readonly byJid = new Map<string, AncoraGrupo>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, SIDECAR_NAME);
  }

  /** Carrega o sidecar (tolerante a ausência/corrupção). */
  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<SidecarFile>;
      if (raw.ancoras && typeof raw.ancoras === 'object') {
        for (const [jid, a] of Object.entries(raw.ancoras)) {
          if (a && typeof a.id === 'string' && typeof a.timestampMs === 'number') {
            this.byJid.set(jid, {
              id: a.id,
              timestampMs: a.timestampMs,
              fromMe: Boolean(a.fromMe),
              sender: typeof a.sender === 'string' ? a.sender : '',
            });
          }
        }
      }
    } catch {
      // primeiro boot ou arquivo ilegível — começa vazio
    }
  }

  /**
   * Registra uma mensagem de grupo. Só atualiza se for mais nova que a
   * conhecida. Conteúdo (texto/mídia) nunca entra aqui.
   */
  registrar(groupJid: string, candidata: AncoraGrupo): void {
    if (!groupJid.endsWith('@g.us')) return;
    const atual = this.byJid.get(groupJid);
    const proxima = maisNova(atual, candidata);
    if (atual && proxima.id === atual.id && proxima.timestampMs === atual.timestampMs) return;
    this.byJid.set(groupJid, proxima);
    this.scheduleFlush();
  }

  /** Âncora mais nova conhecida do grupo, ou null. */
  get(groupJid: string): AncoraGrupo | null {
    return this.byJid.get(groupJid) ?? null;
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, DEBOUNCE_MS);
    this.flushTimer.unref?.();
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const ancoras: Record<string, AncoraGrupo> = {};
    for (const [jid, a] of this.byJid) ancoras[jid] = a;
    const data: SidecarFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ancoras,
    };
    try {
      await writeJsonAtomicNode(this.path, data);
    } catch {
      this.dirty = true;
    }
  }
}
