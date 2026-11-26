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
const configFile = () => join(DATA_DIR, '.equipe', 'config.json');
export async function lerNomeDono(): Promise<string> {
  try { const x = JSON.parse(await readFile(configFile(), 'utf8')); if (typeof x.nomeDono === 'string' && x.nomeDono.trim()) return x.nomeDono.trim(); } catch { /* usa padrão */ }
  return process.env.PANEL_USER ?? 'Operador';
}
export async function gravarNomeDono(nome: string): Promise<void> { await writeJsonAtomic(configFile(), { nomeDono: nome.trim() }); }
