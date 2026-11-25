import Anthropic from "@anthropic-ai/sdk";
import type { CopilotAction, NeutralPrompt } from "./copilot";
import { type DestinoIA, resolverIA } from "./ia/provedor";

/**
 * Camada de PROVEDOR do copiloto — o único lugar acoplado a um SDK/HTTP de modelo.
 * Recebe o NeutralPrompt (lib/copilot.ts) e adapta pra cada provedor:
 *  - "openai": qualquer endpoint OpenAI-compatible (OpenRouter, Ollama local, 9router, etc.)
 *  - "anthropic": SDK nativo da Anthropic.
 * Trocar de provedor/modelo é env ou escolha na tela de modelos de IA (9router).
 *
 * Misto por ação: `rascunhar` pode usar um modelo diferente (pt-BR mais natural) do
 * usado pra resumir/interpretar/chat (raciocínio), e cada um pode ir a um provedor
 * diferente (9router × padrão) — `destinoFor` resolve URL/chave/modelo por ação.
 */

export type Provider = "anthropic" | "openai";

/** Destino de uma ação: OpenAI-compatible (OpenRouter ou 9router) ou SDK da Anthropic. */
export interface DestinoCopiloto {
  tipo: "9router" | "openai" | "anthropic";
  /** Só para os OpenAI-compatible. */
  baseUrl?: string;
  apiKey: string;
  modelo: string;
}

export interface CopilotProvider {
  /** Rótulo humano pro painel: "OpenRouter", "Anthropic", "modelo local", "9router". */
  label: string;
  /**
   * Fallbacks de MODELO do OpenRouter (formato `models`), só pra destinos OpenAI-
   * compatible dele — o 9router não conhece esse campo.
   */
  fallbacks?: string[];
  /** Modelo pra uma ação (draft tem override). */
  modelFor(action?: CopilotAction): string;
  /** URL/chave/modelo de uma ação (cada função pode ir a um provedor diferente). */
  destinoFor(action?: CopilotAction): DestinoCopiloto;
}

function rotulo(baseUrl: string): string {
  if (/openrouter\.ai/.test(baseUrl)) return "OpenRouter";
  if (/localhost|127\.0\.0\.1|:11434/.test(baseUrl)) return "modelo local";
  return "OpenAI-compatible";
}

/** `resumir`/chat (e o resto) usam o modelo de raciocínio; redação usa o de rascunho. */
function funcaoDaAcao(action?: CopilotAction): "copiloto" | "rascunho" {
  return action === "rascunhar" || action === "sugerir" || action === "followup" ? "rascunho" : "copiloto";
}

interface PadraoEnv {
  provider: Provider;
  label: string;
  baseUrl?: string;
  apiKey: string;
  fallbacks: string[];
  modelo: string;
  modeloDraft: string;
}

/**
 * Provedor de sempre (env). `COPILOT_PROVIDER` força (openai|anthropic); sem ele,
 * usa openai-compatible se tiver `COPILOT_OPENAI_API_KEY`, senão Anthropic se tiver
 * `ANTHROPIC_API_KEY`. Null se nada estiver configurado no ambiente.
 */
function padraoDoEnv(): PadraoEnv | null {
  const explicit = process.env.COPILOT_PROVIDER?.toLowerCase();
  const orKey = process.env.COPILOT_OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const wantOpenai = explicit === "openai" || (explicit !== "anthropic" && !!orKey);
  if (wantOpenai && orKey) {
    const baseUrl = (process.env.COPILOT_OPENAI_BASE_URL || "https://openrouter.ai/api/v1").replace(
      /\/+$/,
      "",
    );
    const modelo = process.env.COPILOT_OPENAI_MODEL || "openai/gpt-4o-mini";
    return {
      provider: "openai",
      label: rotulo(baseUrl),
      baseUrl,
      apiKey: orKey,
      fallbacks: (process.env.COPILOT_OPENAI_MODELS_FALLBACK || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      modelo,
      modeloDraft: process.env.COPILOT_OPENAI_MODEL_DRAFT || modelo,
    };
  }

  if ((explicit === "anthropic" || !explicit) && anthropicKey) {
    const modelo = process.env.COPILOT_ANTHROPIC_MODEL || "claude-haiku-4-5";
    return {
      provider: "anthropic",
      label: "Anthropic",
      apiKey: anthropicKey,
      fallbacks: [],
      modelo,
      modeloDraft: process.env.COPILOT_ANTHROPIC_MODEL_DRAFT || modelo,
    };
  }

  return null;
}

/** Padrão resolvido + escolha da tela → destino do copiloto (null = sem provedor). */
function destinoDoCopiloto(d: DestinoIA, env: PadraoEnv | null): DestinoCopiloto | null {
  if (d.via === "9router") return { tipo: "9router", baseUrl: d.baseUrl, apiKey: d.chave, modelo: d.modelo };
  if (!d.chave) return null;
  return env?.provider === "anthropic"
    ? { tipo: "anthropic", apiKey: d.chave, modelo: d.modelo }
    : { tipo: "openai", baseUrl: d.baseUrl, apiKey: d.chave, modelo: d.modelo };
}

/**
 * Resolve o provedor: env atual + escolha da tela de modelos de IA. Cada função
 * (`copiloto`, `rascunho`) pode ir a um provedor diferente; a chave de um nunca vai
 * pro outro. Sem nenhum env e sem 9router → null (→ 503 na rota).
 */
export async function resolveProvider(): Promise<CopilotProvider | null> {
  const env = padraoDoEnv();
  const [padraoCopiloto, padraoRascunho] = await Promise.all([
    resolverIA("copiloto", { baseUrl: env?.baseUrl ?? "", chave: env?.apiKey ?? "", modelo: env?.modelo ?? "" }),
    resolverIA("rascunho", {
      baseUrl: env?.baseUrl ?? "",
      chave: env?.apiKey ?? "",
      modelo: env?.modeloDraft ?? "",
    }),
  ]);
  const destinoCopiloto = destinoDoCopiloto(padraoCopiloto, env);
  const destinoRascunho = destinoDoCopiloto(padraoRascunho, env);
  if (!destinoCopiloto && !destinoRascunho) return null;

  const doDestino = (action?: CopilotAction) =>
    funcaoDaAcao(action) === "rascunho" ? destinoRascunho : destinoCopiloto;
  const tipos = new Set([destinoCopiloto?.tipo, destinoRascunho?.tipo].filter(Boolean));
  const label =
    tipos.size === 1
      ? destinoCopiloto?.tipo === "9router" || destinoRascunho?.tipo === "9router"
        ? "9router"
        : (env?.label ?? "OpenAI-compatible")
      : `${env?.label ?? "OpenAI-compatible"} + 9router`;

  return {
    label,
    fallbacks: env?.fallbacks ?? [],
    modelFor: (a) => doDestino(a)?.modelo ?? "",
    destinoFor: (a) => {
      const d = doDestino(a);
      if (!d) throw new Error("nenhum provedor configurado para esta ação");
      return d;
    },
  };
}

export interface StreamArgs {
  prompt: NeutralPrompt;
  action?: CopilotAction;
  maxTokens: number;
  signal?: AbortSignal;
}

/** Streama a resposta do copiloto como deltas de texto (provedor do destino da ação). */
export async function* streamCopilot(
  p: CopilotProvider,
  args: StreamArgs,
): AsyncGenerator<string> {
  const destino = p.destinoFor(args.action);
  if (destino.tipo === "anthropic") {
    yield* streamAnthropic(destino, args);
  } else {
    yield* streamOpenAICompatible(destino, p.fallbacks ?? [], args);
  }
}

/* ------------------------------------------------------------------ */
/* Anthropic nativo                                                    */
/* ------------------------------------------------------------------ */

async function* streamAnthropic(
  p: DestinoCopiloto,
  { prompt, maxTokens, signal }: StreamArgs,
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey: p.apiKey });
  const system: Anthropic.TextBlockParam[] = prompt.system.map((b) =>
    b.cache
      ? { type: "text", text: b.text, cache_control: { type: "ephemeral" } }
      : { type: "text", text: b.text },
  );
  const messages: Anthropic.MessageParam[] = prompt.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const stream = client.messages.stream(
    { model: p.modelo, max_tokens: maxTokens, system, messages },
    { signal },
  );
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
      yield ev.delta.text;
    }
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible (OpenRouter / 9router / Ollama / etc.)            */
/* ------------------------------------------------------------------ */

async function* streamOpenAICompatible(
  p: DestinoCopiloto,
  fallbacks: string[],
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
  // OpenRouter: array de fallback de modelos (tenta na ordem se o 1º falhar). O
  // 9router não conhece esse campo — mandar só no destino da OpenRouter.
  if (p.tipo === "openai" && fallbacks.length) body.models = [model, ...fallbacks];

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
    throw new Error(`${p.tipo === "9router" ? "9router" : "provedor"} ${res.status}: ${extractError(txt) || res.statusText}`);
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
          choices?: { delta?: { content?: string } }[];
        };
        try {
          obj = JSON.parse(payload);
        } catch {
          continue;
        }
        // Erro mid-stream do OpenRouter vem como chunk com campo `error` no topo.
        if (obj.error) throw new Error(obj.error.message || "erro no provedor");
        const delta = obj.choices?.[0]?.delta?.content;
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
