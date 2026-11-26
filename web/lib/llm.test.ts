import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NeutralPrompt } from './copilot';

// Escolha da tela de modelos de IA por função; ausente = padrão (env).
const escolha = vi.hoisted(() => ({ funcoes: {} as Record<string, { baseUrl: string; chave: string; modelo: string }> }));
vi.mock('./ia/provedor', () => ({
  resolverIA: async (funcao: string, padrao: object) =>
    escolha.funcoes[funcao] ? { via: '9router', ...escolha.funcoes[funcao] } : { via: 'padrao', ...padrao },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  escolha.funcoes = {};
});

async function provider() {
  const { resolveProvider } = await import('./llm');
  return resolveProvider();
}

const prompt = (texto: string): NeutralPrompt => ({
  system: [{ text: 'sistema' }],
  messages: [{ role: 'user', content: texto }],
});

describe('resolveProvider', () => {
  it('sem modelo na tela → null, mesmo com chaves de OpenRouter/Anthropic no ambiente', async () => {
    vi.stubEnv('COPILOT_OPENAI_API_KEY', 'chave-openrouter');
    vi.stubEnv('ANTHROPIC_API_KEY', 'chave-anthropic');
    vi.stubEnv('OPENROUTER_API_KEY', 'chave-openrouter');
    expect(await provider()).toBeNull();
  });

  it('só a chave do 9router basta para o copiloto funcionar', async () => {
    escolha.funcoes.copiloto = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };

    const p = await provider();

    expect(p?.label).toBe('9router');
    expect(p?.modelFor('resumir')).toBe('leve');
  });

  it('cada ação usa o modelo da sua função', async () => {
    escolha.funcoes.copiloto = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };
    escolha.funcoes.rascunho = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'redacao' };

    const p = await provider();

    expect(p?.destinoFor('resumir')).toEqual({ tipo: '9router', baseUrl: 'http://9r.test/v1', apiKey: 'chave-9r', modelo: 'leve' });
    for (const a of ['rascunhar', 'sugerir', 'followup'] as const) expect(p?.modelFor(a)).toBe('redacao');
  });

  it('função sem modelo: a ação é recusada antes do stream, com o aviso da tela', async () => {
    vi.stubEnv('COPILOT_OPENAI_API_KEY', 'chave-openrouter');
    escolha.funcoes.copiloto = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };
    const { resolveProvider, temDestino } = await import('./llm');

    const p = await resolveProvider();

    expect(temDestino(p!, 'resumir')).toBe(true);
    expect(temDestino(p!, 'rascunhar')).toBe(false);
    expect(() => p!.destinoFor('rascunhar')).toThrow(/Modelos de IA.*rascunhar/);
  });
});

describe('streamCopilot', () => {
  it('streama do 9router para a ação resolvida e sem fallbacks de modelo', async () => {
    vi.stubEnv('COPILOT_OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    escolha.funcoes.copiloto = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };
    escolha.funcoes.rascunho = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'rapido' };
    const sse = 'data: {"choices":[{"delta":{"content":"oi"}}]}\n\ndata:';
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(sse, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { resolveProvider, streamCopilot } = await import('./llm');
    const p = await resolveProvider();
    const deltas: string[] = [];
    for await (const d of streamCopilot(p!, { prompt: prompt('resuma'), action: 'resumir', maxTokens: 10 })) deltas.push(d);

    expect(deltas.join('')).toBe('oi');
    expect(fetchMock.mock.calls[0][0]).toBe('http://9r.test/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer chave-9r' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.model).toBe('leve');
    // O campo de fallback de modelos é só da OpenRouter.
    expect(body.models).toBeUndefined();
  });

  it('conteúdo em partes (combo do 9router): só o texto sai, o raciocínio fica de fora', async () => {
    escolha.funcoes.copiloto = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };
    const partes = (c: unknown) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`;
    const sse =
      partes([{ type: 'thinking', thinking: [{ type: 'text', text: 'pensando' }], closed: true }]) +
      partes([{ type: 'thinking', thinking: [{ type: 'text', text: '.' }], closed: true }, { type: 'text', text: '-' }]) +
      partes(' Carina enviou o PDF.') +
      'data: [DONE]\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { status: 200 })));

    const { resolveProvider, streamCopilot } = await import('./llm');
    const p = await resolveProvider();
    const deltas: unknown[] = [];
    for await (const d of streamCopilot(p!, { prompt: prompt('resuma'), action: 'resumir', maxTokens: 10 })) deltas.push(d);

    expect(deltas.every((d) => typeof d === 'string')).toBe(true);
    expect(deltas.join('')).toBe('- Carina enviou o PDF.');
  });
});
