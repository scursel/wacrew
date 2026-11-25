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
  it('sem env e sem 9router → null, como hoje', async () => {
    vi.stubEnv('COPILOT_OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await provider()).toBeNull();
  });

  it('só a chave do 9router basta para o copiloto funcionar', async () => {
    vi.stubEnv('COPILOT_OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    escolha.funcoes.copiloto = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };

    const p = await provider();

    expect(p).not.toBeNull();
    expect(p?.label).toBe('9router');
    expect(p?.modelFor('resumir')).toBe('leve');
  });

  it('copiloto no 9router e rascunho padrão: cada ação usa o seu destino (Review Focus 5)', async () => {
    vi.stubEnv('COPILOT_OPENAI_API_KEY', 'chave-openrouter');
    vi.stubEnv('COPILOT_OPENAI_MODEL', 'openai/gpt-4o-mini');
    vi.stubEnv('COPILOT_OPENAI_MODEL_DRAFT', '');
    escolha.funcoes.copiloto = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };

    const p = await provider();

    expect(p?.modelFor('resumir')).toBe('leve');
    expect(p?.destinoFor('resumir')).toEqual({ tipo: '9router', baseUrl: 'http://9r.test/v1', apiKey: 'chave-9r', modelo: 'leve' });

    expect(p?.modelFor('rascunhar')).toBe('openai/gpt-4o-mini');
    expect(p?.destinoFor('rascunhar')).toEqual({
      tipo: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'chave-openrouter',
      modelo: 'openai/gpt-4o-mini',
    });
  });

  it('modelo de rascunho do env vale para rascunhar/sugerir/followup', async () => {
    vi.stubEnv('COPILOT_OPENAI_API_KEY', 'chave-openrouter');
    vi.stubEnv('COPILOT_OPENAI_MODEL', 'modelo-raciocinio');
    vi.stubEnv('COPILOT_OPENAI_MODEL_DRAFT', 'modelo-redacao');

    const p = await provider();

    expect(p?.modelFor('resumir')).toBe('modelo-raciocinio');
    expect(p?.modelFor('sugerir')).toBe('modelo-redacao');
    expect(p?.modelFor('followup')).toBe('modelo-redacao');
  });

  it('a chave do 9router nunca vai pro destino padrão, nem a da OpenRouter pro 9router', async () => {
    vi.stubEnv('COPILOT_OPENAI_API_KEY', 'chave-openrouter');
    escolha.funcoes.rascunho = { baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };

    const p = await provider();

    expect(p?.destinoFor('resumir').apiKey).toBe('chave-openrouter');
    expect(p?.destinoFor('rascunhar').apiKey).toBe('chave-9r');
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
});
