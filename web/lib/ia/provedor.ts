import { type FuncaoIA, lerConfigIA } from './config';

/** Pra onde uma função de IA vai: o 9router da tela ou o padrão de sempre (env). */
export interface DestinoIA {
  via: '9router' | 'padrao';
  baseUrl: string;
  chave: string;
  modelo: string;
}

const TIMEOUT_LISTA_MS = 10_000;
const CACHE_LISTA_TTL_MS = 60_000;
const RE_MODELO_FALA = /whisper|parakeet|asr|scribe|transcribe|stt|nova-\d/i;

let cacheLista: { chave: string; em: number; valor: { combos: string[]; fala: string[] } } | null = null;

export function invalidarCacheModelos9router(): void {
  cacheLista = null;
}

export { AVISO_SEM_MODELO } from './aviso';

/**
 * Endpoint/chave/modelo de uma função. Só vai ao 9router quando a tela escolheu
 * um modelo E existe chave salva. Sem isso a função fica desligada (chave vazia):
 * nada sai para o provedor do ambiente (OpenRouter, Anthropic), nunca.
 */
export async function resolverIA(
  funcao: FuncaoIA,
  padrao: { baseUrl: string; chave: string; modelo: string },
): Promise<DestinoIA> {
  const cfg = await lerConfigIA();
  const modelo = cfg.funcoes[funcao];
  if (modelo && cfg.chave.trim()) {
    return { via: '9router', baseUrl: cfg.baseUrl, chave: cfg.chave, modelo };
  }
  return { via: 'padrao', ...padrao, chave: '' };
}

/** Nenhuma mensagem de erro pode carregar a chave do operador. */
function semChave(msg: string, chave: string): string {
  return chave ? msg.split(chave).join('••••') : msg;
}

function detalheErro(corpo: string): string {
  try {
    const j = JSON.parse(corpo) as { error?: { message?: string } | string };
    if (typeof j.error === 'string') return j.error;
    if (j.error?.message) return j.error.message;
  } catch {
    // corpo não é JSON: usa como veio
  }
  return corpo;
}

interface Modelo9Router {
  id?: unknown;
  owned_by?: unknown;
}

/**
 * Lista os modelos do 9router: combos (owned_by "combo") e modelos de fala
 * (whisper/parakeet/asr). Sem `c`, usa a configuração salva.
 */
export async function listarModelos9router(
  c?: { baseUrl: string; chave: string; ignorarCache?: boolean },
): Promise<{ combos: string[]; fala: string[] }> {
  const cfg = c ?? (await lerConfigIA());
  const baseUrl = cfg.baseUrl.trim().replace(/\/+$/, '');
  const chave = cfg.chave.trim();
  if (!chave) throw new Error('chave do 9router não configurada: salve a chave na tela de modelos de IA');

  const chaveCache = `${baseUrl}|${chave}`;
  if (!c?.ignorarCache && cacheLista && cacheLista.chave === chaveCache && Date.now() - cacheLista.em < CACHE_LISTA_TTL_MS) {
    return cacheLista.valor;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(TIMEOUT_LISTA_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`9router não respondeu em ${baseUrl}: ${semChave(msg, chave)}`);
  }
  const corpo = await res.text().catch(() => '');
  if (!res.ok) {
    const detalhe = semChave(detalheErro(corpo).slice(0, 200), chave);
    throw new Error(`9router recusou a lista de modelos (HTTP ${res.status}): ${detalhe}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(corpo);
  } catch {
    throw new Error('9router devolveu a lista de modelos em formato ilegível');
  }
  const lista = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown })?.data;
  if (!Array.isArray(lista)) throw new Error('9router devolveu a lista de modelos em formato inesperado');

  const combos = new Set<string>();
  const fala = new Set<string>();
  for (const item of lista as Modelo9Router[]) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) continue;
    if (item.owned_by === 'combo') combos.add(id);
    if (RE_MODELO_FALA.test(id)) fala.add(id);
  }
  const valor = { combos: [...combos], fala: [...fala] };
  cacheLista = { chave: chaveCache, em: Date.now(), valor };
  return valor;
}
