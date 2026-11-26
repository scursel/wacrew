import type { CopilotAction, NeutralPrompt } from "./copilot";
import { AVISO_SEM_MODELO } from "./ia/aviso";
import { resolverIA } from "./ia/provedor";
import { semChave, textoDoDelta } from "./ia/texto";

/**
 * Camada de PROVEDOR do copiloto: o único lugar acoplado ao HTTP do modelo.
 * Recebe o NeutralPrompt (lib/copilot.ts) e chama um endpoint OpenAI-compatible.
 *
 * Só vai ao modelo escolhido na tela de IA (Configurações › Modelos de IA). Sem
 * escolha, a função fica desligada: nenhuma variável de ambiente (OpenRouter,
 * Anthropic) é usada. Misto por ação: `rascunhar`/`sugerir`/`followup` usam a
 * função `rascunho`; o resto usa `copiloto`. Cada uma tem o seu modelo.
 */

/** Destino de uma ação. */
export interface DestinoCopiloto {
  tipo: "9router";
  baseUrl: string;
  apiKey: string;
  modelo: string;
}

export interface CopilotProvider {
  /** Rótulo humano pro painel. */
  label: string;
  /** Modelo pra uma ação ("" quando a função daquela ação está desligada). */
  modelFor(action?: CopilotAction): string;
  /** URL/chave/modelo de uma ação; lança com o aviso da tela se a função está desligada. */
  destinoFor(action?: CopilotAction): DestinoCopiloto;
}

/** `resumir`/chat (e o resto) usam o modelo de raciocínio; redação usa o de rascunho. */
function funcaoDaAcao(action?: CopilotAction): "copiloto" | "rascunho" {
  return action === "rascunhar" || action === "sugerir" || action === "followup" ? "rascunho" : "copiloto";
}

const ROTULO_FUNCAO = { copiloto: "Copiloto: resumir e conversar", rascunho: "Copiloto: rascunhar e sugerir" } as const;

/** Provedor do copiloto, ou null quando nenhuma das duas funções tem modelo escolhido (→ 503). */
export async function resolveProvider(): Promise<CopilotProvider | null> {
  const desligado = { baseUrl: "", chave: "", modelo: "" };
  const [copiloto, rascunho] = await Promise.all([resolverIA("copiloto", desligado), resolverIA("rascunho", desligado)]);
  const destinos = {
    copiloto: copiloto.chave ? ({ tipo: "9router", baseUrl: copiloto.baseUrl, apiKey: copiloto.chave, modelo: copiloto.modelo } as const) : null,
    rascunho: rascunho.chave ? ({ tipo: "9router", baseUrl: rascunho.baseUrl, apiKey: rascunho.chave, modelo: rascunho.modelo } as const) : null,
  };
  if (!destinos.copiloto && !destinos.rascunho) return null;
  return {
    label: "9router",
    modelFor: (a) => destinos[funcaoDaAcao(a)]?.modelo ?? "",
    destinoFor: (a) => {
      const f = funcaoDaAcao(a);
      const d = destinos[f];
      if (!d) throw new Error(`${AVISO_SEM_MODELO} (${ROTULO_FUNCAO[f]})`);
      return d;
    },
  };
}

/** A ação tem modelo escolhido? Confere antes de abrir o stream: o erro vira 503, não falha no meio. */
export function temDestino(p: CopilotProvider, action?: CopilotAction): boolean {
  try {
    p.destinoFor(action);
    return true;
  } catch {
    return false;
  }
}

export interface StreamArgs {
  prompt: NeutralPrompt;
  action?: CopilotAction;
  maxTokens: number;
  signal?: AbortSignal;
}

/** Streama a resposta do copiloto como deltas de texto. */
export async function* streamCopilot(p: CopilotProvider, args: StreamArgs): AsyncGenerator<string> {
  yield* streamOpenAICompatible(p.destinoFor(args.action), args);
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible (9router e afins)                                 */
/* ------------------------------------------------------------------ */

async function* streamOpenAICompatible(
  p: DestinoCopiloto,
  { prompt, maxTokens, signal }: StreamArgs,
): AsyncGenerator<string> {
  // OpenAI-compatible usa UM system message; junta os blocos neutros.
  const systemText = prompt.system.map((b) => b.text).join("\n\n");
  const model = p.modelo;
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: [{ role: "system", content: systemText }, ...prompt.messages],
  };

  const res = await fetch(`${p.baseUrl ?? ""}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.apiKey}`,
      // Identificação opcional do app (rankings/atribuição no OpenRouter).
      "HTTP-Referer": "https://github.com/sumioshi/whatsapp-automation",
      "X-Title": "Signal Room Copiloto",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(semChave(`9router ${res.status}: ${extractError(txt) || res.statusText}`, p.apiKey));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const eventBlock = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of eventBlock.split("\n")) {
        const t = line.trimStart();
        // Comentários SSE do OpenRouter (": OPENROUTER PROCESSING") não começam com "data:".
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") return;
        let obj: {
          error?: { message?: string };
          choices?: { delta?: { content?: unknown } }[];
        };
        try {
          obj = JSON.parse(payload);
        } catch {
          continue;
        }
        // Erro mid-stream do OpenRouter vem como chunk com campo `error` no topo.
        if (obj.error) throw new Error(obj.error.message || "erro no provedor");
        const delta = textoDoDelta(obj.choices?.[0]?.delta?.content);
        if (delta) yield delta;
      }
      sep = buffer.indexOf("\n\n");
    }
  }
}

/** Extrai a mensagem de erro de um corpo JSON do provedor (pré-stream). */
function extractError(txt: string): string {
  try {
    const j = JSON.parse(txt) as { error?: { message?: string } };
    return j.error?.message ?? "";
  } catch {
    return txt.slice(0, 160);
  }
}
