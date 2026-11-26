import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';
import { interpolarResposta, type RespostaPronta } from './respostas-prontas-interp';

export { interpolarResposta, type RespostaPronta };

const ARQUIVO = join(DATA_DIR, '.respostas-prontas.json');

function normalizarAtalho(raw: string): string {
  return raw.trim().replace(/^\/+/, '').toLowerCase();
}

export async function readRespostasProntas(file = ARQUIVO): Promise<RespostaPronta[]> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is RespostaPronta =>
          Boolean(x) &&
          typeof x === 'object' &&
          typeof (x as RespostaPronta).id === 'string' &&
          typeof (x as RespostaPronta).atalho === 'string' &&
          typeof (x as RespostaPronta).titulo === 'string' &&
          typeof (x as RespostaPronta).texto === 'string',
      )
      .sort((a, b) => a.atalho.localeCompare(b.atalho));
  } catch {
    return [];
  }
}

export async function upsertRespostaPronta(
  input: { id?: string; atalho: string; titulo: string; texto: string },
  file = ARQUIVO,
): Promise<RespostaPronta[]> {
  const atalho = normalizarAtalho(input.atalho);
  const titulo = input.titulo.trim();
  const texto = input.texto.trim();
  if (!atalho || !titulo || !texto) {
    throw new Error('atalho, título e texto são obrigatórios');
  }
  const lista = await readRespostasProntas(file);
  const id = input.id?.trim() || randomUUID();
  const conflito = lista.find((r) => r.atalho === atalho && r.id !== id);
  if (conflito) {
    throw new Error(`já existe resposta com o atalho /${atalho}`);
  }
  const idx = lista.findIndex((r) => r.id === id);
  const item: RespostaPronta = { id, atalho, titulo, texto };
  if (idx >= 0) lista[idx] = item;
  else lista.push(item);
  lista.sort((a, b) => a.atalho.localeCompare(b.atalho));
  await writeJsonAtomic(file, lista);
  return lista;
}

export async function deleteRespostaPronta(id: string, file = ARQUIVO): Promise<RespostaPronta[]> {
  const lista = await readRespostasProntas(file);
  const next = lista.filter((r) => r.id !== id);
  await writeJsonAtomic(file, next);
  return next;
}
