import { createHmac } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

interface WebhookConfigMinimal {
  id: string;
  url: string;
  secret: string;
  eventos: string[];
  ativo: boolean;
}

const cachePorDir = new Map<string, { chave: string; lista: WebhookConfigMinimal[] }>();

async function lerHooksCacheado(dataDir: string): Promise<WebhookConfigMinimal[]> {
  const arquivo = join(dataDir, '.webhooks.json');
  let chave: string;
  try {
    const s = await stat(arquivo);
    chave = `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    cachePorDir.delete(dataDir);
    return [];
  }
  const hit = cachePorDir.get(dataDir);
  if (hit && hit.chave === chave) return hit.lista;
  try {
    const raw = JSON.parse(await readFile(arquivo, 'utf8')) as unknown;
    const lista = Array.isArray(raw) ? (raw as WebhookConfigMinimal[]) : [];
    cachePorDir.set(dataDir, { chave, lista });
    return lista;
  } catch {
    return [];
  }
}

export async function dispararWebhookCollector(
  dataDir: string,
  evento: 'message.received' | 'message.sent',
  dados: Record<string, unknown>,
): Promise<void> {
  const todos = await lerHooksCacheado(dataDir);
  const hooks = todos.filter(
    (w) =>
      w?.ativo &&
      typeof w.url === 'string' &&
      Array.isArray(w.eventos) &&
      w.eventos.includes(evento),
  );
  if (hooks.length === 0) return;

  const payload = JSON.stringify({ evento, timestamp: new Date().toISOString(), dados });
  await Promise.all(
    hooks.map(async (wh) => {
      const sig = `sha256=${createHmac('sha256', wh.secret || '')
        .update(payload)
        .digest('hex')}`;
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
          const res = await fetch(wh.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Wacrew-Event': evento,
              'X-Wacrew-Signature-256': sig,
            },
            body: payload,
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok || res.status < 500) break;
        } catch {
          /* ignora erro de entrega */
        }
      }
    }),
  );
}
