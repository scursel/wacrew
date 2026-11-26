import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DATA_DIR } from '../paths';

export interface NotificacaoInterna {
  id: string;
  para: string;
  tipo: 'mencao' | 'delegacao';
  slug: string;
  de: string;
  deNome: string;
  texto: string;
  timestamp: string;
  lida?: boolean;
}

const arquivoNotificacoes = (dataDir = DATA_DIR) => join(dataDir, '.equipe', 'notificacoes.jsonl');

async function lerTodas(dataDir = DATA_DIR): Promise<NotificacaoInterna[]> {
  try {
    const raw = await readFile(arquivoNotificacoes(dataDir), 'utf8');
    const out: NotificacaoInterna[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const n = JSON.parse(line) as NotificacaoInterna;
        if (n && typeof n.id === 'string' && typeof n.para === 'string') out.push(n);
      } catch {
        /* linha corrompida */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function notificarAgente(
  input: Omit<NotificacaoInterna, 'id' | 'timestamp' | 'lida'>,
  dataDir = DATA_DIR,
): Promise<NotificacaoInterna> {
  const file = arquivoNotificacoes(dataDir);
  await mkdir(dirname(file), { recursive: true });
  const item: NotificacaoInterna = {
    id: `ni-${randomUUID()}`,
    ...input,
    timestamp: new Date().toISOString(),
    lida: false,
  };
  await appendFile(file, `${JSON.stringify(item)}\n`, 'utf8');
  return item;
}

export async function lerNotificacoesAgente(login: string, dataDir = DATA_DIR): Promise<NotificacaoInterna[]> {
  const todas = await lerTodas(dataDir);
  return todas
    .filter((n) => n.para === login)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 50);
}

export async function marcarNotificacoesLidas(login: string, dataDir = DATA_DIR): Promise<void> {
  const todas = await lerTodas(dataDir);
  if (todas.length === 0) return;
  const atualizadas = todas.map((n) => (n.para === login ? { ...n, lida: true } : n));
  const file = arquivoNotificacoes(dataDir);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${atualizadas.map((n) => JSON.stringify(n)).join('\n')}\n`, 'utf8');
}
