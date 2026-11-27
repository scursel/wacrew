import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { CONTROL_URL, DATA_DIR } from './paths';

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
    controlUrl: (process.env.COLLECTOR_CONTROL_URL || CONTROL_URL).trim(),
    ...(process.env.COLLECTOR_CONTROL_TOKEN ? { controlToken: process.env.COLLECTOR_CONTROL_TOKEN } : {}),
    padrao: true,
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
  };
}

export async function lerInboxes(dataDir = DATA_DIR): Promise<InboxCanal[]> {
  let extras: InboxCanal[] = [];
  try {
    const parsed = JSON.parse(await readFile(arquivoInboxes(dataDir), 'utf8')) as unknown;
    if (Array.isArray(parsed)) {
      // Nunca deixa um registro antigo de `principal` congelar URL/token do ambiente.
      extras = (parsed as InboxCanal[]).filter((i) => i && i.id !== 'principal');
    }
  } catch {
    extras = [];
  }
  return [canalPrincipal(), ...extras];
}

function validarControlUrl(raw: string): string {
  const clean = raw.trim().replace(/\/+$/, '');
  const u = new URL(clean);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('URL do coletor deve usar http:// ou https://');
  }
  if (u.hostname === '169.254.169.254' || u.hostname === 'metadata.google.internal') {
    throw new Error('Endereço de metadata não permitido');
  }
  return clean;
}

export async function salvarInbox(
  input: Omit<InboxCanal, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string },
  dataDir = DATA_DIR,
): Promise<InboxCanal> {
  const nome = input.nome.trim();
  if (!nome || !input.controlUrl.trim()) throw new Error('nome e controlUrl são obrigatórios');
  const controlUrl = validarControlUrl(input.controlUrl);

  const id = input.id?.trim() || `chip-${randomUUID().slice(0, 6)}`;
  if (id === 'principal') throw new Error('O canal principal é gerenciado pelo ambiente do servidor');

  const atual = (await lerInboxes(dataDir)).filter((i) => i.id !== 'principal');
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
    padrao: false,
    ativo: input.ativo !== false,
    criadoEm: existente?.criadoEm ?? input.criadoEm ?? new Date().toISOString(),
  };

  const next = existente ? atual.map((i) => (i.id === id ? canal : i)) : [...atual, canal];
  await writeJsonAtomic(arquivoInboxes(dataDir), next, { mode: 0o600 });
  return canal;
}

export async function removerInbox(id: string, dataDir = DATA_DIR): Promise<boolean> {
  if (id === 'principal') throw new Error('Não é possível remover o canal principal');
  const atual = (await lerInboxes(dataDir)).filter((i) => i.id !== 'principal');
  const next = atual.filter((i) => i.id !== id);
  if (next.length === atual.length) return false;
  await writeJsonAtomic(arquivoInboxes(dataDir), next, { mode: 0o600 });
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
  const base = inbox.controlUrl.replace(/\/+$/, '');
  const headers = inbox.controlToken ? { Authorization: `Bearer ${inbox.controlToken}` } : undefined;
  try {
    const res = await fetch(`${base}/health`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; connection?: string; status?: string };
      return { ok: true, status: data.connection ?? data.status ?? 'online' };
    }
    if (res.status !== 404) {
      return { ok: false, erro: `HTTP ${res.status}` };
    }
    // Compatibilidade com coletores que expõem /status em vez de /health
    const resStatus = await fetch(`${base}/status`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });
    if (!resStatus.ok) return { ok: false, erro: `HTTP ${resStatus.status}` };
    const data = (await resStatus.json().catch(() => ({}))) as { connection?: string; status?: string };
    return { ok: true, status: data.connection ?? data.status ?? 'online' };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro de conexão' };
  }
}
