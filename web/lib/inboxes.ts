import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export interface InboxCanal {
  id: string;
  nome: string;
  numero?: string;
  controlUrl: string;
  controlToken?: string;
  departamentoPadrao?: string;
  padrao?: boolean;
  ativo: boolean;
  criadoEm: string;
}

const arquivoInboxes = (dataDir = DATA_DIR) => join(dataDir, '.inboxes.json');

function canalPrincipal(): InboxCanal {
  return {
    id: 'principal',
    nome: 'WhatsApp Principal',
    controlUrl: (process.env.COLLECTOR_CONTROL_URL || 'http://127.0.0.1:4199').trim(),
    ...(process.env.COLLECTOR_CONTROL_TOKEN ? { controlToken: process.env.COLLECTOR_CONTROL_TOKEN } : {}),
    padrao: true,
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
  };
}

export async function lerInboxes(dataDir = DATA_DIR): Promise<InboxCanal[]> {
  let lista: InboxCanal[] = [];
  try {
    const parsed = JSON.parse(await readFile(arquivoInboxes(dataDir), 'utf8')) as unknown;
    if (Array.isArray(parsed)) lista = parsed as InboxCanal[];
  } catch {
    lista = [];
  }
  if (!lista.some((i) => i.id === 'principal')) {
    return [canalPrincipal(), ...lista];
  }
  return lista;
}

export async function salvarInbox(
  input: Omit<InboxCanal, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string },
  dataDir = DATA_DIR,
): Promise<InboxCanal> {
  const nome = input.nome.trim();
  const controlUrl = input.controlUrl.trim().replace(/\/+$/, '');
  if (!nome || !controlUrl) throw new Error('nome e controlUrl são obrigatórios');
  new URL(controlUrl);

  const atual = await lerInboxes(dataDir);
  const id = input.id?.trim() || `chip-${randomUUID().slice(0, 6)}`;
  const existente = atual.find((i) => i.id === id);
  const canal: InboxCanal = {
    id,
    nome,
    ...(input.numero !== undefined
      ? { numero: input.numero.trim() || undefined }
      : existente?.numero
        ? { numero: existente.numero }
        : {}),
    controlUrl,
    ...(input.controlToken !== undefined
      ? { controlToken: input.controlToken.trim() || undefined }
      : existente?.controlToken
        ? { controlToken: existente.controlToken }
        : {}),
    ...(input.departamentoPadrao !== undefined
      ? { departamentoPadrao: input.departamentoPadrao.trim() || undefined }
      : existente?.departamentoPadrao
        ? { departamentoPadrao: existente.departamentoPadrao }
        : {}),
    padrao: id === 'principal' || Boolean(input.padrao ?? existente?.padrao),
    ativo: input.ativo !== false,
    criadoEm: existente?.criadoEm ?? input.criadoEm ?? new Date().toISOString(),
  };

  const next = existente ? atual.map((i) => (i.id === id ? canal : i)) : [...atual, canal];
  await writeJsonAtomic(arquivoInboxes(dataDir), next);
  return canal;
}

export async function removerInbox(id: string, dataDir = DATA_DIR): Promise<boolean> {
  if (id === 'principal') throw new Error('Não é possível remover o canal principal');
  const atual = await lerInboxes(dataDir);
  const next = atual.filter((i) => i.id !== id);
  if (next.length === atual.length) return false;
  await writeJsonAtomic(arquivoInboxes(dataDir), next);
  return true;
}

export async function resolverInbox(id?: string, dataDir = DATA_DIR): Promise<InboxCanal> {
  const lista = await lerInboxes(dataDir);
  if (id) {
    const found = lista.find((i) => i.id === id && i.ativo);
    if (found) return found;
  }
  return lista.find((i) => i.padrao) ?? lista[0] ?? canalPrincipal();
}

export async function testarConexaoInbox(
  inbox: InboxCanal,
): Promise<{ ok: boolean; status?: string; erro?: string }> {
  try {
    const res = await fetch(`${inbox.controlUrl.replace(/\/+$/, '')}/status`, {
      headers: inbox.controlToken ? { Authorization: `Bearer ${inbox.controlToken}` } : undefined,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ok: false, erro: `HTTP ${res.status}` };
    const data = (await res.json().catch(() => ({}))) as { connection?: string; status?: string };
    return { ok: true, status: data.connection ?? data.status ?? 'online' };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro de conexão' };
  }
}
