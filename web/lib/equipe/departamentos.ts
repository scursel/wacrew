import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from '../paths';
import { writeJsonAtomic } from '../json-store';

export interface Departamento { id: string; nome: string; descricao: string; membros: string[]; roundRobin?: boolean }
export function departamentosFile(): string { return join(DATA_DIR, '.equipe', 'departamentos.json'); }
function valido(x: unknown): x is Departamento {
  if (!x || typeof x !== 'object') return false;
  const d = x as Departamento;
  return typeof d.id === 'string' && typeof d.nome === 'string' && typeof d.descricao === 'string' && Array.isArray(d.membros) && d.membros.every((m) => typeof m === 'string');
}
async function lerStrict(): Promise<Departamento[]> {
  try { const x: unknown = JSON.parse(await readFile(departamentosFile(), 'utf8')); if (!Array.isArray(x) || !x.every(valido)) throw new Error('inválido'); return x; }
  catch (e) { if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return []; throw new Error('arquivo de departamentos ilegível — corrija antes de alterar'); }
}
export async function lerDepartamentos(): Promise<Departamento[]> { try { return await lerStrict(); } catch { return []; } }
let fila: Promise<unknown> = Promise.resolve();
export function alterarDepartamentos<T>(fn: (l: Departamento[]) => T | Promise<T>): Promise<T> {
  const passo = fila.then(async () => { const lista = await lerStrict(); const resultado = await fn(lista); await writeJsonAtomic(departamentosFile(), lista); return resultado; });
  fila = passo.catch(() => {}); return passo;
}
export function departamentosDe(lista: Departamento[], login: string): string[] { return lista.filter((d) => d.membros.includes(login)).map((d) => d.id); }
export interface ConfigDono {
  nomeDono: string;
  assinarMensagens: boolean;
}

const configFile = () => join(DATA_DIR, '.equipe', 'config.json');

export async function lerConfigDono(): Promise<ConfigDono> {
  const padrao = process.env.PANEL_USER ?? 'Operador';
  try {
    const x = JSON.parse(await readFile(configFile(), 'utf8')) as { nomeDono?: unknown; assinarMensagens?: unknown };
    return {
      nomeDono: typeof x.nomeDono === 'string' && x.nomeDono.trim() ? x.nomeDono.trim() : padrao,
      assinarMensagens: x.assinarMensagens === true,
    };
  } catch {
    return { nomeDono: padrao, assinarMensagens: false };
  }
}

export async function lerNomeDono(): Promise<string> {
  return (await lerConfigDono()).nomeDono;
}

export async function gravarConfigDono(patch: { nomeDono?: string; assinarMensagens?: boolean }): Promise<void> {
  let atual: { nomeDono?: string; assinarMensagens?: boolean } = {};
  try {
    const parsed = JSON.parse(await readFile(configFile(), 'utf8')) as { nomeDono?: unknown; assinarMensagens?: unknown };
    if (typeof parsed.nomeDono === 'string') atual.nomeDono = parsed.nomeDono;
    if (typeof parsed.assinarMensagens === 'boolean') atual.assinarMensagens = parsed.assinarMensagens;
  } catch {
    /* arquivo ainda não existe */
  }
  const prox = {
    nomeDono: patch.nomeDono !== undefined ? patch.nomeDono.trim() : (atual.nomeDono ?? ''),
    assinarMensagens: patch.assinarMensagens !== undefined ? patch.assinarMensagens : (atual.assinarMensagens === true),
  };
  await writeJsonAtomic(configFile(), prox);
}

export async function gravarNomeDono(nome: string): Promise<void> {
  await gravarConfigDono({ nomeDono: nome });
}
