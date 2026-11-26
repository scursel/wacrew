import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DATA_DIR, safeDataPath } from './paths';

export interface NotaInterna {
  id: string;
  autor: string;
  autorNome: string;
  texto: string;
  mencoes: string[];
  timestamp: string;
}

export function extrairMencoesInternas(texto: string): string[] {
  const encontrados = new Set<string>();
  const re = /(?:^|\s)@([a-z0-9._-]{2,32})/gi;
  for (const m of texto.matchAll(re)) {
    if (m[1]) encontrados.add(m[1].toLowerCase());
  }
  return [...encontrados];
}

function arquivoNotas(slug: string, dataDir?: string): string {
  return dataDir ? join(dataDir, slug, 'notas-internas.jsonl') : safeDataPath(slug, 'notas-internas.jsonl');
}

export async function lerNotasInternas(slug: string, dataDir?: string): Promise<NotaInterna[]> {
  try {
    const raw = await readFile(arquivoNotas(slug, dataDir), 'utf8');
    const out: NotaInterna[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const n = JSON.parse(line) as NotaInterna;
        if (n && typeof n.id === 'string' && typeof n.texto === 'string') out.push(n);
      } catch {
        /* linha corrompida */
      }
    }
    return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}

export async function adicionarNotaInterna(
  slug: string,
  input: { autor: string; autorNome: string; texto: string },
  dataDir: string = DATA_DIR,
): Promise<NotaInterna> {
  const texto = input.texto.trim();
  if (!texto) throw new Error('texto obrigatório');
  const file = dataDir === DATA_DIR ? safeDataPath(slug, 'notas-internas.jsonl') : join(dataDir, slug, 'notas-internas.jsonl');
  await mkdir(dirname(file), { recursive: true });
  const nota: NotaInterna = {
    id: `nota-${randomUUID()}`,
    autor: input.autor,
    autorNome: input.autorNome,
    texto,
    mencoes: extrairMencoesInternas(texto),
    timestamp: new Date().toISOString(),
  };
  await appendFile(file, `${JSON.stringify(nota)}\n`, 'utf8');
  return nota;
}
