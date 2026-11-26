import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../json-store';
import { DATA_DIR } from '../paths';

export type StatusDisponibilidade = 'online' | 'ocupado' | 'offline';

const arquivoDisp = (dataDir = DATA_DIR) => join(dataDir, '.equipe', 'disponibilidade.json');
const arquivoRR = (dataDir = DATA_DIR) => join(dataDir, '.equipe', 'round-robin.json');

export async function lerDisponibilidade(dataDir = DATA_DIR): Promise<Record<string, StatusDisponibilidade>> {
  try {
    const parsed = JSON.parse(await readFile(arquivoDisp(dataDir), 'utf8')) as Record<string, unknown>;
    const out: Record<string, StatusDisponibilidade> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      if (v === 'online' || v === 'ocupado' || v === 'offline') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function definirDisponibilidade(
  login: string,
  status: StatusDisponibilidade,
  dataDir = DATA_DIR,
): Promise<Record<string, StatusDisponibilidade>> {
  const atual = await lerDisponibilidade(dataDir);
  atual[login] = status;
  await writeJsonAtomic(arquivoDisp(dataDir), atual);
  return atual;
}

export async function escolherProximoRoundRobin(
  departamentoId: string,
  membros: string[],
  disp?: Record<string, StatusDisponibilidade>,
  dataDir = DATA_DIR,
): Promise<string | null> {
  if (membros.length === 0) return null;
  const mapaDisp = disp ?? (await lerDisponibilidade(dataDir));
  // Considera 'online' (e quem ainda não definiu status explícito fica fora ou online? Somente 'online' para round-robin previsível).
  const elegiveis = membros.filter((m) => mapaDisp[m] === 'online');
  if (elegiveis.length === 0) return null;

  let rr: Record<string, number> = {};
  try {
    rr = JSON.parse(await readFile(arquivoRR(dataDir), 'utf8')) as Record<string, number>;
  } catch {
    rr = {};
  }
  const idx = (rr[departamentoId] ?? 0) % elegiveis.length;
  const escolhido = elegiveis[idx] ?? null;
  rr[departamentoId] = (idx + 1) % elegiveis.length;
  await writeJsonAtomic(arquivoRR(dataDir), rr);
  return escolhido;
}
