/**
 * Foto/print que a conta mandou é orçamento? Um modelo de visão barato responde
 * sim/não e o veredito fica em `.orcamentos.json` (`visao[id]`): cada imagem é
 * lida uma vez só. Roda em segundo plano, em lotes pequenos, quando a tela de
 * clientes é montada; nunca segura a resposta da página.
 */
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { resolverIA } from './ia/provedor';
import { semChave, textoDoDelta } from './ia/texto';
import { alterarOrcamentos } from './orcamentos';
import { DATA_DIR } from './paths';

const BASE_OPENROUTER = 'https://openrouter.ai/api/v1';
export const MODELO_PADRAO = 'google/gemini-3.8-flash';
/** Quantas imagens por rodada: a tela se atualiza a cada 15 s, então o histórico anda sozinho. */
const POR_RODADA = 12;
const PARALELO = 3;
/** Só olha o que foi mandado nos últimos 90 dias: o resto é histórico morto e custo à toa. */
export const JANELA_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 6 * 1024 * 1024;

const INSTRUCOES = `Você vê uma imagem que uma oficina mecânica / autocenter mandou para alguém no WhatsApp.
Responda SÓ JSON: {"orcamento": true} ou {"orcamento": false}.
true quando a imagem é um orçamento: lista de peças e/ou serviços com valores (papel, print do sistema, planilha, ordem de serviço com preços).
false para todo o resto: foto de carro, de peça, de pessoa, comprovante de pagamento/Pix, documento, mapa, meme.`;

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export interface CandidatoVisao {
  id: string;
  mediaPath: string | null;
}

export function lerResposta(conteudo: string): boolean | null {
  try {
    const j = JSON.parse(conteudo.replace(/^```(?:json)?\s*|\s*```$/g, '')) as { orcamento?: unknown };
    return typeof j.orcamento === 'boolean' ? j.orcamento : null;
  } catch {
    return null;
  }
}

/** Caminho da mídia dentro do DATA_DIR; null se sair dele. */
function caminhoSeguro(mediaPath: string, dataDir: string): string | null {
  const raiz = resolve(dataDir);
  const alvo = resolve(raiz, mediaPath);
  return alvo.startsWith(raiz + sep) ? alvo : null;
}

type Fetch = typeof fetch;

async function perguntar(
  dataUrl: string,
  destino: { endpoint: string; chave: string; modelo: string },
  fetchFn: Fetch,
): Promise<boolean | null> {
  const res = await fetchFn(destino.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${destino.chave}`, 'Content-Type': 'application/json', 'X-Title': 'whatsapp-collector orcamento' },
    body: JSON.stringify({
      model: destino.modelo,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSTRUCOES },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }] },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  return lerResposta(textoDoDelta(j.choices?.[0]?.message?.content));
}

/**
 * Classifica até POR_RODADA candidatos. Arquivo ausente ou formato que o modelo não
 * lê vira "não é orçamento" (não tenta de novo); falha da API para a rodada sem gravar.
 */
export async function classificarFotos(
  candidatos: CandidatoVisao[],
  o: { dataDir?: string; fetchFn?: Fetch } = {},
): Promise<number> {
  const dataDir = o.dataDir ?? DATA_DIR;
  const lote = candidatos.slice(0, POR_RODADA);
  if (!lote.length) return 0;
  // Só o modelo escolhido na tela de IA: sem escolha, a chave vem vazia e nada sai.
  const d = await resolverIA('orcamento', { baseUrl: BASE_OPENROUTER, chave: '', modelo: MODELO_PADRAO });
  if (!d.chave.trim()) return 0;
  const destino = { endpoint: `${d.baseUrl}/chat/completions`, chave: d.chave, modelo: d.modelo };

  const vereditos: Record<string, boolean> = {};
  let falhou = false;
  const fila = [...lote];
  const trabalhador = async () => {
    for (let c = fila.shift(); c && !falhou; c = fila.shift()) {
      const caminho = c.mediaPath ? caminhoSeguro(c.mediaPath, dataDir) : null;
      const mime = c.mediaPath ? MIME[extname(c.mediaPath).toLowerCase()] : undefined;
      if (!caminho || !mime) {
        vereditos[c.id] = false;
        continue;
      }
      let bytes: Buffer;
      try {
        bytes = await readFile(caminho);
      } catch {
        vereditos[c.id] = false;
        continue;
      }
      if (bytes.length > MAX_BYTES) {
        vereditos[c.id] = false;
        continue;
      }
      try {
        const r = await perguntar(`data:${mime};base64,${bytes.toString('base64')}`, destino, o.fetchFn ?? fetch);
        // Resposta ilegível não vira "não é orçamento" para sempre: fica para a próxima rodada.
        if (r !== null) vereditos[c.id] = r;
      } catch (e) {
        falhou = true;
        console.warn(semChave(`[orcamento] visão parou: ${e instanceof Error ? e.message : String(e)}`, destino.chave));
      }
    }
  };
  await Promise.all(Array.from({ length: PARALELO }, trabalhador));

  const ids = Object.keys(vereditos);
  if (ids.length) {
    const em = new Date().toISOString();
    await alterarOrcamentos((s) => {
      for (const id of ids) s.visao[id] = { orcamento: vereditos[id], em };
    }, dataDir);
  }
  return ids.length;
}

let rodando = false;

/** Dispara uma rodada em segundo plano; se já tem uma rodando, não faz nada. */
export function dispararClassificacao(candidatos: CandidatoVisao[]): void {
  // Desligado por padrão: manda fotos para um modelo externo. Liga com WAC_ORCAMENTO_VISAO=1.
  if (process.env.WAC_ORCAMENTO_VISAO !== '1') return;
  if (rodando || !candidatos.length) return;
  rodando = true;
  classificarFotos(candidatos)
    .catch((e) => console.warn(`[orcamento] ${e instanceof Error ? e.message : String(e)}`))
    .finally(() => {
      rodando = false;
    });
}
