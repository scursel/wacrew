import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizarBusca } from './busca';
import { DATA_DIR, safeDataPath } from './paths';

export interface ResultadoBuscaMensagem {
  id: string;
  slug: string;
  groupName: string;
  senderName: string;
  fromMe: boolean;
  timestamp: string;
  trecho: string;
  source: 'mensagem' | 'transcricao';
}

function extrairTrecho(texto: string, consulta: string): string {
  const normTexto = normalizarBusca(texto);
  const normQ = normalizarBusca(consulta.trim());
  const idx = normTexto.indexOf(normQ);
  if (idx < 0) return texto.slice(0, 140);
  const start = Math.max(0, idx - 45);
  const end = Math.min(texto.length, idx + normQ.length + 75);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < texto.length ? '…' : '';
  return `${prefix}${texto.slice(start, end).trim()}${suffix}`;
}

export async function buscarMensagens(opts: {
  q: string;
  slug?: string;
  allowedSlugs?: ReadonlySet<string>;
  limit?: number;
  offset?: number;
  dataDir?: string;
}): Promise<{ total: number; resultados: ResultadoBuscaMensagem[] }> {
  const consulta = opts.q.trim();
  const qNorm = normalizarBusca(consulta);
  if (!qNorm) return { total: 0, resultados: [] };

  const root = opts.dataDir ?? DATA_DIR;
  let slugs: string[] = [];
  if (opts.slug) {
    if (opts.allowedSlugs && !opts.allowedSlugs.has(opts.slug)) {
      return { total: 0, resultados: [] };
    }
    slugs = [opts.slug];
  } else {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      if (opts.allowedSlugs && !opts.allowedSlugs.has(e.name)) continue;
      slugs.push(e.name);
    }
  }

  const hits: ResultadoBuscaMensagem[] = [];

  for (const slug of slugs) {
    let jsonlPath: string;
    try {
      jsonlPath = opts.dataDir ? join(root, slug, 'messages.jsonl') : safeDataPath(slug, 'messages.jsonl');
    } catch {
      continue;
    }

    const raw = await readFile(jsonlPath, 'utf8').catch(() => '');
    if (!raw) continue;

    // Carrega transcrições do slug (se existirem) indexadas por basename de mediaPath.
    const transDir = opts.dataDir ? join(root, slug, 'transcripts') : safeDataPath(slug, 'transcripts');
    const transFiles = await readdir(transDir).catch(() => []);
    const transcripts = new Map<string, string>();
    for (const f of transFiles) {
      if (!f.endsWith('.txt')) continue;
      const content = await readFile(join(transDir, f), 'utf8').catch(() => '');
      if (content.trim()) transcripts.set(f.slice(0, -4), content.trim());
    }

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as {
          id?: string;
          group?: string;
          senderName?: string;
          fromMe?: boolean;
          timestamp?: string;
          text?: string;
          mediaPath?: string | null;
        };
        if (!rec.id) continue;
        const text = rec.text ?? '';
        const mediaBase = rec.mediaPath ? rec.mediaPath.split('/').pop() ?? '' : '';
        const trans = mediaBase ? transcripts.get(mediaBase) ?? '' : '';

        if (text && normalizarBusca(text).includes(qNorm)) {
          hits.push({
            id: rec.id,
            slug,
            groupName: rec.group || slug,
            senderName: rec.fromMe ? 'Você' : rec.senderName || 'Contato',
            fromMe: Boolean(rec.fromMe),
            timestamp: rec.timestamp ?? '',
            trecho: extrairTrecho(text, consulta),
            source: 'mensagem',
          });
        } else if (trans && normalizarBusca(trans).includes(qNorm)) {
          hits.push({
            id: rec.id,
            slug,
            groupName: rec.group || slug,
            senderName: rec.fromMe ? 'Você' : rec.senderName || 'Contato',
            fromMe: Boolean(rec.fromMe),
            timestamp: rec.timestamp ?? '',
            trecho: extrairTrecho(trans, consulta),
            source: 'transcricao',
          });
        }
      } catch {
        /* linha corrompida */
      }
    }
  }

  hits.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
  return {
    total: hits.length,
    resultados: hits.slice(offset, offset + limit),
  };
}
