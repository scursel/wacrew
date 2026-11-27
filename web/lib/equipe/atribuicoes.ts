import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from '../paths';
import { writeJsonAtomic } from '../json-store';

export const DONO = '@dono';
export interface Atribuicao {
  departamento: string | null;
  origemDepartamento: 'ia' | 'manual' | null;
  responsavel: string | null;
  desde: string | null;
  iaTentouEm?: string;
  /** ISO da última mensagem que a IA leu na última tentativa. */
  iaViuAte?: string;
  /** ISO do último "resolver": atendimento encerrado, a sugestão da IA vale só até aqui. */
  resolvidoEm?: string;
}
export type Atribuicoes = Record<string, Atribuicao>;
export type EventoAtribuicao =
  | { tipo: 'assumir'; por: string }
  | { tipo: 'responder'; por: string }
  | { tipo: 'delegar'; por: string; para: string | null; departamento?: string | null; nota?: string }
  | { tipo: 'soltar'; por: string }
  | { tipo: 'departamento'; por: string; departamento: string | null }
  | { tipo: 'sugestao'; departamento: string | null; viuAte?: string }
  | { tipo: 'resolver'; por: string };

export interface RegistroEventoAtribuicao {
  ts: string;
  slug: string;
  tipo: EventoAtribuicao['tipo'];
  por?: string;
  para?: string | null;
  departamento?: string | null;
  nota?: string;
}

export function aplicar(estado: Atribuicoes, slug: string, ev: EventoAtribuicao, agoraIso: string): Atribuicoes {
  const atual: Atribuicao = estado[slug] ? { ...estado[slug] } : { departamento: null, origemDepartamento: null, responsavel: null, desde: null };
  switch (ev.tipo) {
    case 'assumir': case 'responder':
      if (atual.responsavel) return estado;
      atual.responsavel = ev.por; atual.desde = agoraIso; break;
    case 'delegar':
      atual.responsavel = ev.para; atual.desde = ev.para ? agoraIso : null;
      if (ev.departamento !== undefined) { atual.departamento = ev.departamento; atual.origemDepartamento = 'manual'; }
      break;
    case 'soltar': atual.responsavel = null; atual.desde = null; break;
    case 'resolver': atual.responsavel = null; atual.desde = null; atual.resolvidoEm = agoraIso; break;
    // Tirar o departamento na mão também é escolha manual: a IA não volta a preencher.
    case 'departamento': atual.departamento = ev.departamento; atual.origemDepartamento = 'manual'; break;
    case 'sugestao':
      atual.iaTentouEm = agoraIso;
      atual.iaViuAte = ev.viuAte ?? agoraIso;
      // A IA troca a própria sugestão (atendimento novo, assunto novo), nunca a escolha manual.
      if (atual.origemDepartamento !== 'manual' && (ev.departamento || atual.origemDepartamento === 'ia')) {
        atual.departamento = ev.departamento; atual.origemDepartamento = ev.departamento ? 'ia' : null;
      }
      break;
  }
  return { ...estado, [slug]: atual };
}

const arquivo = () => join(DATA_DIR, '.equipe', 'atribuicoes.json');
async function lerStrict(): Promise<Atribuicoes> {
  try {
    const valor: unknown = JSON.parse(await readFile(arquivo(), 'utf8'));
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('inválido');
    return valor as Atribuicoes;
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return {};
    throw new Error('arquivo de atribuições ilegível — corrija antes de alterar');
  }
}
export async function lerAtribuicoes(): Promise<Atribuicoes> { try { return await lerStrict(); } catch { return {}; } }
let fila: Promise<unknown> = Promise.resolve();
function serializar<T>(fn: () => Promise<T>): Promise<T> { const passo = fila.then(fn); fila = passo.catch(() => {}); return passo; }
export function registrar(slug: string, ev: EventoAtribuicao): Promise<Atribuicao> {
  return serializar(async () => {
    const ts = new Date().toISOString();
    const estado = aplicar(await lerStrict(), slug, ev, ts);
    await writeJsonAtomic(arquivo(), estado);
    await appendFile(join(DATA_DIR, '.equipe', 'atribuicoes.jsonl'), `${JSON.stringify({ ts, slug, ...ev })}\n`);
    return estado[slug]!;
  });
}
export function liberarLogin(login: string): Promise<void> {
  return serializar(async () => { const estado = await lerStrict(); for (const a of Object.values(estado)) if (a.responsavel === login) { a.responsavel = null; a.desde = null; } await writeJsonAtomic(arquivo(), estado); });
}
export function limparDepartamento(id: string): Promise<void> {
  return serializar(async () => { const estado = await lerStrict(); for (const a of Object.values(estado)) if (a.departamento === id) { a.departamento = null; a.origemDepartamento = null; delete a.iaTentouEm; } await writeJsonAtomic(arquivo(), estado); });
}

export async function lerHistoricoAtribuicoes(slug?: string): Promise<RegistroEventoAtribuicao[]> {
  try {
    const raw = await readFile(join(DATA_DIR, '.equipe', 'atribuicoes.jsonl'), 'utf8');
    const out: RegistroEventoAtribuicao[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as RegistroEventoAtribuicao;
        if ((!slug || ev.slug === slug) && typeof ev.ts === 'string' && typeof ev.tipo === 'string') out.push(ev);
      } catch {
        /* linha corrompida */
      }
    }
    return out;
  } catch {
    return [];
  }
}
