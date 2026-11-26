import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DATA_DIR } from './paths';

export interface RegistroCsat {
  id: string;
  slug: string;
  nota: 1 | 2 | 3 | 4 | 5;
  comentario?: string;
  agente?: string;
  timestamp: string;
}

const arquivoCsat = (dataDir = DATA_DIR) => join(dataDir, '.csat.jsonl');

export async function registrarCsat(
  input: { slug: string; nota: number; comentario?: string; agente?: string; timestamp?: string },
  dataDir = DATA_DIR,
): Promise<RegistroCsat> {
  const slug = input.slug.trim();
  if (!slug) throw new Error('slug obrigatório');
  const notaNum = Math.round(Number(input.nota));
  if (!Number.isFinite(notaNum) || notaNum < 1 || notaNum > 5) {
    throw new Error('nota deve estar entre 1 e 5');
  }
  const file = arquivoCsat(dataDir);
  await mkdir(dirname(file), { recursive: true });
  const reg: RegistroCsat = {
    id: `csat-${randomUUID().slice(0, 8)}`,
    slug,
    nota: notaNum as 1 | 2 | 3 | 4 | 5,
    ...(input.comentario?.trim() ? { comentario: input.comentario.trim() } : {}),
    ...(input.agente?.trim() ? { agente: input.agente.trim() } : {}),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
  await appendFile(file, `${JSON.stringify(reg)}\n`, 'utf8');
  return reg;
}

export async function lerCsat(dataDir = DATA_DIR): Promise<RegistroCsat[]> {
  try {
    const raw = await readFile(arquivoCsat(dataDir), 'utf8');
    const out: RegistroCsat[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const reg = JSON.parse(line) as RegistroCsat;
        if (reg && typeof reg.id === 'string' && typeof reg.nota === 'number') out.push(reg);
      } catch {
        /* linha inválida */
      }
    }
    return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

export function resumoCsat(lista: RegistroCsat[]): {
  total: number;
  media: number | null;
  distribuicao: Record<1 | 2 | 3 | 4 | 5, number>;
  porAgente: Record<string, { total: number; soma: number; media: number }>;
} {
  const distribuicao: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const porAgente: Record<string, { total: number; soma: number; media: number }> = {};
  let soma = 0;

  for (const r of lista) {
    const n = r.nota;
    soma += n;
    distribuicao[n]++;
    if (r.agente) {
      const entry = (porAgente[r.agente] ??= { total: 0, soma: 0, media: 0 });
      entry.total++;
      entry.soma += n;
      entry.media = Number((entry.soma / entry.total).toFixed(2));
    }
  }

  return {
    total: lista.length,
    media: lista.length > 0 ? Number((soma / lista.length).toFixed(2)) : null,
    distribuicao,
    porAgente,
  };
}
