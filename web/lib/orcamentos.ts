/**
 * Orçamentos enviados: quem recebeu orçamento é cliente (oficina/autocenter, sem
 * contrato). Três fontes somam:
 *  - texto, legenda ou nome do PDF que a própria conta mandou (determinístico);
 *  - foto/print que a conta mandou, lido por um modelo de visão (cache em disco);
 *  - marcação manual do operador (botão "Orçamento enviado").
 * O desmarcar manual vale contra tudo que veio antes dele.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';

export interface MsgOrcamento {
  id: string;
  timestamp: string;
  fromMe?: boolean;
  type: string;
  text?: string | null;
}

export interface VeredictoVisao {
  orcamento: boolean;
  em: string;
}

export interface StoreOrcamentos {
  /** slug → quando o operador marcou "orçamento enviado". */
  manual: Record<string, string>;
  /** slug → quando o operador desmarcou: o que veio antes deixa de contar. */
  removidos: Record<string, string>;
  /** id da mensagem (imagem) → o que o modelo de visão achou. */
  visao: Record<string, VeredictoVisao>;
}

export interface ResumoOrcamentos {
  total: number;
  ultimo: string | null;
  manual: boolean;
}

const PALAVRA = /or[çc]amento|or[çc]to\b|\bor[çc]\.?\s*n[ºo°]?\s*\d/i;
const VALOR = /R\$\s*\d/;

/** Mídia da própria conta que o modelo de visão deve olhar (sem legenda que já resolva). */
export function precisaVisao(m: MsgOrcamento): boolean {
  return Boolean(m.fromMe) && m.type === 'image' && !PALAVRA.test(m.text ?? '');
}

/**
 * Orçamento pelo que está escrito: PDF/imagem com "orçamento" no nome ou legenda,
 * ou texto com a palavra E um valor em R$ ("faz um orçamento" sozinho não conta).
 */
export function ehOrcamentoPorTexto(m: MsgOrcamento): boolean {
  if (!m.fromMe) return false;
  const texto = m.text ?? '';
  if (!PALAVRA.test(texto)) return false;
  if (m.type === 'document' || m.type === 'image' || m.type === 'video') return true;
  return m.type === 'text' && VALOR.test(texto);
}

/** Maior valor de `mapa` entre as chaves (DM partido: telefone e LID contam juntos). */
function maiorDe(mapa: Record<string, string>, chaves: readonly string[]): string | undefined {
  let maior: string | undefined;
  for (const k of chaves) {
    const v = Object.hasOwn(mapa, k) ? mapa[k] : undefined;
    if (v && (!maior || v > maior)) maior = v;
  }
  return maior;
}

/**
 * `slug` pode ser uma lista: as duas pontas de um DM partido (telefone e LID),
 * com `mensagens` já fundidas. Marcação e desmarcação valem de qualquer ponta.
 */
export function resumirOrcamentos(
  slug: string | readonly string[],
  mensagens: ReadonlyArray<MsgOrcamento>,
  store: StoreOrcamentos,
): ResumoOrcamentos {
  const chaves = typeof slug === 'string' ? [slug] : slug;
  const corte = maiorDe(store.removidos, chaves) ?? '';
  let total = 0;
  let ultimo: string | null = null;
  for (const m of mensagens) {
    if (!m.fromMe || m.timestamp <= corte) continue;
    const viaVisao = m.type === 'image' && Object.hasOwn(store.visao, m.id) && store.visao[m.id].orcamento === true;
    if (!ehOrcamentoPorTexto(m) && !viaVisao) continue;
    total++;
    if (!ultimo || m.timestamp > ultimo) ultimo = m.timestamp;
  }
  const marcado = maiorDe(store.manual, chaves);
  const manual = Boolean(marcado && marcado > corte);
  if (manual && total === 0) total = 1;
  if (manual && marcado && (!ultimo || marcado > ultimo)) ultimo = marcado;
  return { total, ultimo, manual };
}

const arquivo = (dataDir = DATA_DIR) => join(dataDir, '.orcamentos.json');

export async function lerOrcamentos(dataDir = DATA_DIR): Promise<StoreOrcamentos> {
  try {
    const j = JSON.parse(await readFile(arquivo(dataDir), 'utf8')) as Partial<StoreOrcamentos>;
    return { manual: j.manual ?? {}, removidos: j.removidos ?? {}, visao: j.visao ?? {} };
  } catch {
    return { manual: {}, removidos: {}, visao: {} };
  }
}

/** Serializa as escritas do processo: a visão grava em paralelo com o botão. */
let fila: Promise<unknown> = Promise.resolve();

export function alterarOrcamentos(
  mudar: (s: StoreOrcamentos) => void,
  dataDir = DATA_DIR,
): Promise<StoreOrcamentos> {
  const passo = fila.then(async () => {
    const s = await lerOrcamentos(dataDir);
    mudar(s);
    await writeJsonAtomic(arquivo(dataDir), s);
    return s;
  });
  fila = passo.catch(() => undefined);
  return passo;
}

/** Botão do operador: marcar conta agora; desmarcar zera o que veio antes. */
export function marcarOrcamento(slug: string, marcado: boolean, agora = new Date(), dataDir = DATA_DIR) {
  const iso = agora.toISOString();
  return alterarOrcamentos((s) => {
    if (marcado) {
      s.manual[slug] = iso;
    } else {
      delete s.manual[slug];
      s.removidos[slug] = iso;
    }
  }, dataDir);
}
