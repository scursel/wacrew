import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmp: string;
let cfg: typeof import('./config');
let mod: typeof import('./provedor');

beforeEach(async () => {
  vi.resetModules();
  tmp = await mkdtemp(join(tmpdir(), 'ia-provedor-'));
  process.env.WAC_DATA_DIR = tmp;
  cfg = await import('./config');
  mod = await import('./provedor');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.WAC_DATA_DIR;
  await rm(tmp, { recursive: true, force: true });
});

describe('resolverIA', () => {
  const padrao = { baseUrl: 'https://openrouter.ai/api/v1', chave: 'chave-openrouter', modelo: 'google/gemini-3.8-flash' };

  it('sem escolha na tela → padrão, byte a byte', async () => {
    await cfg.salvarConfigIA({ chave: 'chave-9router' });
    expect(await mod.resolverIA('postura', padrao)).toEqual({ via: 'padrao', ...padrao });
  });

  it('com escolha mas sem chave salva → padrão (a chave do 9router não vai pra OpenRouter)', async () => {
    await cfg.salvarConfigIA({ funcoes: { postura: 'forte' } });
    expect(await mod.resolverIA('postura', padrao)).toEqual({ via: 'padrao', ...padrao });
  });

  it('com os dois → 9router com a chave e o modelo da tela (Review Focus 1)', async () => {
    await cfg.salvarConfigIA({ baseUrl: 'http://9r.test/v1', chave: 'chave-9r', funcoes: { postura: 'forte' } });
    expect(await mod.resolverIA('postura', padrao)).toEqual({
      via: '9router',
      baseUrl: 'http://9r.test/v1',
      chave: 'chave-9r',
      modelo: 'forte',
    });
    // A outra função continua no padrão, com a chave do outro provedor.
    expect(await mod.resolverIA('copiloto', padrao)).toEqual({ via: 'padrao', ...padrao });
  });

  it('config ilegível não lança: cai no padrão', async () => {
    await cfg.salvarConfigIA({ chave: 'chave-9r', funcoes: { postura: 'forte' } });
    await writeFile(join(tmp, '.ia', 'modelos.json'), '{quebrado', 'utf8');
    await expect(mod.resolverIA('postura', padrao)).resolves.toEqual({ via: 'padrao', ...padrao });
  });
});

describe('listarModelos9router', () => {
  const respostaModelos = () =>
    new Response(
      JSON.stringify({
        data: [
          { id: 'leve', owned_by: 'combo' },
          { id: 'forte', owned_by: 'combo' },
          { id: 'groq/whisper-large-v3', owned_by: 'groq' },
          { id: 'groq/whisper-large-v3-turbo', owned_by: 'groq' },
          { id: 'nvidia/parakeet-ctc-1.1b-asr', owned_by: 'nvidia' },
          { id: 'openai/gpt-4o-mini', owned_by: 'openai' },
        ],
      }),
      { status: 200 },
    );

  it('separa combos e fala, ignorando o resto', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => respostaModelos());
    vi.stubGlobal('fetch', fetchMock);

    const r = await mod.listarModelos9router({ baseUrl: 'http://9r.test/v1', chave: 'chave-9r' });

    expect(r.combos).toEqual(['leve', 'forte']);
    expect(r.fala).toEqual(['groq/whisper-large-v3', 'groq/whisper-large-v3-turbo', 'nvidia/parakeet-ctc-1.1b-asr']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://9r.test/v1/models');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer chave-9r' });
  });

  it('sem argumento usa a configuração salva', async () => {
    await cfg.salvarConfigIA({ baseUrl: 'http://9r.test/v1', chave: 'chave-9r' });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => respostaModelos());
    vi.stubGlobal('fetch', fetchMock);

    const r = await mod.listarModelos9router();

    expect(r.combos).toEqual(['leve', 'forte']);
    expect(fetchMock.mock.calls[0][0]).toBe('http://9r.test/v1/models');
  });

  it('HTTP 401 → erro claro e sem a chave na mensagem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'invalid key chave-9r' } }), { status: 401 })),
    );
    const erro = await mod
      .listarModelos9router({ baseUrl: 'http://9r.test/v1', chave: 'chave-9r' })
      .catch((e: unknown) => e as Error);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain('401');
    expect((erro as Error).message).not.toContain('chave-9r');
  });

  it('sem chave salva: erro explicando antes de qualquer chamada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(mod.listarModelos9router({ baseUrl: 'http://9r.test/v1', chave: '' })).rejects.toThrow(/chave/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('URL que não responde → erro com a URL, sem a chave', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const erro = await mod
      .listarModelos9router({ baseUrl: 'http://9r.test/v1', chave: 'chave-9r' })
      .catch((e: unknown) => e as Error);
    expect((erro as Error).message).toContain('http://9r.test/v1');
    expect((erro as Error).message).not.toContain('chave-9r');
  });
});
