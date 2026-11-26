import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface WebhookConfigMinimal {
  id: string;
  url: string;
  secret: string;
  eventos: string[];
  ativo: boolean;
}

export async function dispararWebhookCollector(
  dataDir: string,
  evento: 'message.received' | 'message.sent',
  dados: Record<string, unknown>,
): Promise<void> {
  let hooks: WebhookConfigMinimal[] = [];
  try {
    const raw = JSON.parse(await readFile(join(dataDir, '.webhooks.json'), 'utf8')) as unknown;
    if (Array.isArray(raw)) {
      hooks = (raw as WebhookConfigMinimal[]).filter(
        (w) =>
          w?.ativo &&
          typeof w.url === 'string' &&
          Array.isArray(w.eventos) &&
          w.eventos.includes(evento),
      );
    }
  } catch {
    return;
  }
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
