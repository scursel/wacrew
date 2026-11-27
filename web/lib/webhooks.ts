import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export type EventoWebhook =
  | 'message.received'
  | 'message.sent'
  | 'conversation.resolved'
  | 'conversation.assigned'
  | 'csat.submitted';

export interface WebhookConfig {
  id: string;
  nome: string;
  url: string;
  secret: string;
  eventos: EventoWebhook[];
  ativo: boolean;
  criadoEm: string;
}

const arquivoWebhooks = (dataDir = DATA_DIR) => join(dataDir, '.webhooks.json');

export function assinarPayloadWebhook(payload: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

export function validarUrlWebhook(raw: string): string {
  const u = new URL(raw.trim());
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('URL deve usar http:// ou https://');
  }
  if (u.hostname === '169.254.169.254' || u.hostname === 'metadata.google.internal') {
    throw new Error('Endereço de metadata não permitido');
  }
  return u.toString();
}

export async function lerWebhooks(dataDir = DATA_DIR): Promise<WebhookConfig[]> {
  try {
    const parsed = JSON.parse(await readFile(arquivoWebhooks(dataDir), 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as WebhookConfig[]) : [];
  } catch {
    return [];
  }
}

export async function salvarWebhook(
  input: Omit<WebhookConfig, 'id' | 'criadoEm' | 'secret'> & { id?: string; secret?: string; criadoEm?: string },
  dataDir = DATA_DIR,
): Promise<WebhookConfig> {
  const nome = input.nome.trim();
  if (!nome) throw new Error('nome obrigatório');
  const url = validarUrlWebhook(input.url);
  const lista = await lerWebhooks(dataDir);
  const id = input.id?.trim() || `wh-${randomUUID().slice(0, 8)}`;
  const existente = lista.find((w) => w.id === id);
  const cfg: WebhookConfig = {
    id,
    nome,
    url,
    secret: input.secret?.trim() || existente?.secret || randomUUID().replace(/-/g, ''),
    eventos: input.eventos,
    ativo: input.ativo !== false,
    criadoEm: existente?.criadoEm ?? input.criadoEm ?? new Date().toISOString(),
  };
  const next = existente ? lista.map((w) => (w.id === id ? cfg : w)) : [...lista, cfg];
  await writeJsonAtomic(arquivoWebhooks(dataDir), next, { mode: 0o600 });
  return cfg;
}

export async function removerWebhook(id: string, dataDir = DATA_DIR): Promise<boolean> {
  const lista = await lerWebhooks(dataDir);
  const next = lista.filter((w) => w.id !== id);
  if (next.length === lista.length) return false;
  await writeJsonAtomic(arquivoWebhooks(dataDir), next, { mode: 0o600 });
  return true;
}

async function enviarComRetry(wh: WebhookConfig, payload: string, evento: string): Promise<boolean> {
  const sig = assinarPayloadWebhook(payload, wh.secret);
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
      if (res.ok) return true;
      if (res.status < 500) return false;
    } catch {
      /* tenta novamente se houver segunda tentativa */
    }
  }
  return false;
}

export async function dispararWebhook(
  evento: EventoWebhook,
  dados: Record<string, unknown>,
  dataDir = DATA_DIR,
): Promise<{ enviados: number; ok: number }> {
  const hooks = (await lerWebhooks(dataDir)).filter((w) => w.ativo && w.eventos.includes(evento));
  if (hooks.length === 0) return { enviados: 0, ok: 0 };
  const body = JSON.stringify({ evento, timestamp: new Date().toISOString(), dados });
  const results = await Promise.all(hooks.map((w) => enviarComRetry(w, body, evento)));
  return { enviados: hooks.length, ok: results.filter(Boolean).length };
}

export async function testarWebhook(id: string, dataDir = DATA_DIR): Promise<boolean> {
  const wh = (await lerWebhooks(dataDir)).find((w) => w.id === id);
  if (!wh) throw new Error('Webhook não encontrado');
  const body = JSON.stringify({
    evento: 'webhook.test',
    timestamp: new Date().toISOString(),
    dados: { webhookId: wh.id, nome: wh.nome },
  });
  return enviarComRetry(wh, body, 'webhook.test');
}
