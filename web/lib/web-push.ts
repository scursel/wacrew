import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  usuario: string;
  userAgent?: string;
  criadoEm: string;
}

const arquivoPush = (dataDir = DATA_DIR) => join(dataDir, '.push-subscriptions.json');

export function vapidPublicKey(): string {
  return (process.env.VAPID_PUBLIC_KEY ?? '').trim();
}

export async function lerSubscriptions(dataDir = DATA_DIR): Promise<PushSubscriptionRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(arquivoPush(dataDir), 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as PushSubscriptionRecord[]) : [];
  } catch {
    return [];
  }
}

export async function salvarSubscription(
  input: Omit<PushSubscriptionRecord, 'criadoEm'> & { criadoEm?: string },
  dataDir = DATA_DIR,
): Promise<PushSubscriptionRecord> {
  const endpoint = input.endpoint.trim();
  if (!endpoint || !input.keys?.p256dh || !input.keys?.auth) {
    throw new Error('subscription inválida');
  }
  const lista = await lerSubscriptions(dataDir);
  const existente = lista.find((s) => s.endpoint === endpoint);
  const registro: PushSubscriptionRecord = {
    endpoint,
    keys: {
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
    usuario: input.usuario.trim() || 'operador',
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    criadoEm: existente?.criadoEm ?? input.criadoEm ?? new Date().toISOString(),
  };
  const next = existente ? lista.map((s) => (s.endpoint === endpoint ? registro : s)) : [...lista, registro];
  await writeJsonAtomic(arquivoPush(dataDir), next);
  return registro;
}

export async function removerSubscription(endpoint: string, dataDir = DATA_DIR): Promise<boolean> {
  const lista = await lerSubscriptions(dataDir);
  const next = lista.filter((s) => s.endpoint !== endpoint);
  if (next.length === lista.length) return false;
  await writeJsonAtomic(arquivoPush(dataDir), next);
  return true;
}
