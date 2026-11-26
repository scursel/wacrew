import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../json-store';
import { DATA_DIR } from '../paths';

/** Cada IA do painel que pode ser apontada para um modelo do 9router. */
export type FuncaoIA = 'copiloto' | 'rascunho' | 'postura' | 'departamento' | 'video' | 'transcricao' | 'orcamento';

export const FUNCOES_IA: FuncaoIA[] = ['copiloto', 'rascunho', 'postura', 'departamento', 'video', 'transcricao', 'orcamento'];

export const URL_9ROUTER_PADRAO = 'http://100.115.118.6:20128/v1';

export interface ConfigIA {
  baseUrl: string;
  chave: string;
  funcoes: Partial<Record<FuncaoIA, string>>;
}

function arquivo(): string {
  return join(DATA_DIR, '.ia', 'modelos.json');
}

function padrao(): ConfigIA {
  return { baseUrl: URL_9ROUTER_PADRAO, chave: '', funcoes: {} };
}

function semBarra(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function ehFuncao(x: string): x is FuncaoIA {
  return (FUNCOES_IA as string[]).includes(x);
}

/** Só o que o painel reconhece: URL/chave strings e funções conhecidas com id não vazio. */
function sanear(parsed: unknown): ConfigIA {
  const cfg = padrao();
  if (!parsed || typeof parsed !== 'object') return cfg;
  const p = parsed as Record<string, unknown>;
  if (typeof p.baseUrl === 'string' && semBarra(p.baseUrl)) cfg.baseUrl = semBarra(p.baseUrl);
  if (typeof p.chave === 'string') cfg.chave = p.chave.trim();
  if (p.funcoes && typeof p.funcoes === 'object') {
    for (const [k, v] of Object.entries(p.funcoes as Record<string, unknown>)) {
      if (!ehFuncao(k) || typeof v !== 'string') continue;
      const id = v.trim();
      if (id) cfg.funcoes[k] = id;
    }
  }
  return cfg;
}

let cache: { chave: string; cfg: ConfigIA } | null = null;

/**
 * Config do 9router. Arquivo ausente ou ilegível → padrão, sem lançar: postura e
 * copiloto leem isso no caminho do envio e falha de config não pode derrubar nada.
 * Relê só quando o arquivo muda (mtime + tamanho + inode, como `acharUsuario`).
 */
export async function lerConfigIA(): Promise<ConfigIA> {
  let chaveStat: string;
  try {
    const s = await stat(arquivo());
    chaveStat = `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    cache = null;
    return padrao();
  }
  if (cache && cache.chave === chaveStat) return cache.cfg;
  let cfg = padrao();
  try {
    cfg = sanear(JSON.parse(await readFile(arquivo(), 'utf8')));
  } catch {
    cfg = padrao();
  }
  cache = { chave: chaveStat, cfg };
  return cfg;
}

let fila: Promise<unknown> = Promise.resolve();

/**
 * Grava a config (0600, escrita atômica). `chave` undefined mantém a atual; ''
 * apaga. Em `funcoes`, null/'' devolve aquela função ao padrão. Uma escrita por vez.
 */
export function salvarConfigIA(p: {
  baseUrl?: string;
  chave?: string;
  funcoes?: Partial<Record<FuncaoIA, string | null>>;
}): Promise<ConfigIA> {
  const passo = fila.then(async () => {
    const atual = await lerConfigIA();
    const next: ConfigIA = { baseUrl: atual.baseUrl, chave: atual.chave, funcoes: { ...atual.funcoes } };
    if (p.baseUrl !== undefined) {
      const url = semBarra(p.baseUrl);
      if (url) next.baseUrl = url;
    }
    if (p.chave !== undefined) next.chave = p.chave.trim();
    for (const [k, v] of Object.entries(p.funcoes ?? {})) {
      if (!ehFuncao(k)) continue;
      const id = typeof v === 'string' ? v.trim() : '';
      if (id) next.funcoes[k] = id;
      else delete next.funcoes[k];
    }
    await writeJsonAtomic(arquivo(), next, { mode: 0o600 });
    cache = null;
    return next;
  });
  fila = passo.catch(() => {});
  return passo;
}

/** Versão que vai pro navegador: nunca inclui a chave, só os últimos 4 caracteres. */
export function configPublica(c: ConfigIA): {
  baseUrl: string;
  temChave: boolean;
  chaveFinal: string | null;
  funcoes: Partial<Record<FuncaoIA, string>>;
} {
  return {
    baseUrl: c.baseUrl,
    temChave: !!c.chave,
    chaveFinal: c.chave ? c.chave.slice(-4) : null,
    funcoes: { ...c.funcoes },
  };
}
