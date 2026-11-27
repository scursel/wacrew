import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Escolha da tela de modelos de IA; null = padrão (OpenRouter + env).
const escolha = vi.hoisted(() => ({ destino: null as unknown }));
vi.mock('@/lib/ia/provedor', () => ({
  resolverIA: async (_funcao: string, padrao: object) => escolha.destino ?? { via: 'padrao', ...padrao },
}));

let dataDir: string;
beforeEach(async () => {
  vi.resetModules();
  dataDir = await mkdtemp(join(tmpdir(), 'wac-tx-'));
  vi.stubEnv('WAC_DATA_DIR', dataDir);
  vi.stubEnv('WAC_MCP_REMOTE', '');
  vi.stubEnv('WAC_CLOUD_URL', '');
  vi.stubEnv('TRANSCRIBE_BACKEND', 'openrouter');
  escolha.destino = null;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(dataDir, { recursive: true, force: true });
});

describe('transcricaoBackend', () => {
  it('retorna 9router quando TRANSCRIBE_BACKEND=openrouter', async () => {
    vi.stubEnv('TRANSCRIBE_BACKEND', 'openrouter');
    const { transcricaoBackend } = await import('./transcribe');
    expect(transcricaoBackend()).toBe('9router');
  });
  it('retorna mlx quando TRANSCRIBE_BACKEND=mlx', async () => {
    vi.stubEnv('TRANSCRIBE_BACKEND', 'mlx');
    const { transcricaoBackend } = await import('./transcribe');
    expect(transcricaoBackend()).toBe('mlx');
  });
});

describe('mediaPathPorId', () => {
  const msgs = [
    { id: 'A1', type: 'audio' as const, mediaPath: 'g/audio/a1.ogg' },
    { id: 'T1', type: 'text' as const, mediaPath: null },
    { id: 'P1', type: 'video' as const, mediaPath: null },
  ];
  it('acha o mediaPath de um áudio pelo id da mensagem', async () => {
    const { mediaPathPorId } = await import('./transcribe');
    expect(mediaPathPorId(msgs, 'A1')).toEqual({ ok: true, mediaPath: 'g/audio/a1.ogg' });
  });
  it('id de mensagem de texto não tem o que transcrever', async () => {
    const { mediaPathPorId } = await import('./transcribe');
    expect(mediaPathPorId(msgs, 'T1')).toMatchObject({ ok: false });
  });
  it('id desconhecido explica que não achou', async () => {
    const { mediaPathPorId } = await import('./transcribe');
    expect(mediaPathPorId(msgs, 'ZZ')).toMatchObject({ ok: false, motivo: expect.stringContaining('ZZ') });
  });
});

describe('transcribeBatch — cache local', () => {
  it('mídia já transcrita aqui não ocupa vaga do lote: vai em emCache e o lote avança', async () => {
    await mkdir(join(dataDir, 'g', 'transcripts'), { recursive: true });
    await writeFile(join(dataDir, 'g', 'transcripts', 'a1.ogg.txt'), 'texto do a1\n');
    const { transcribeBatch } = await import('./transcribe');
    const r = await transcribeBatch('g', ['g/audio/a1.ogg', 'g/audio/a2.ogg'], 1);
    expect(r.emCache).toEqual(['g/audio/a1.ogg']);
    // a2 não existe nem local nem na nuvem → falha isolada, não conta como transcrito
    expect(r.textos).toEqual([]);
    expect(r.restantes).toBe(0);
  });
});

describe('transcrição na nuvem', () => {
  async function audioEmDisco(): Promise<string> {
    await mkdir(join(dataDir, 'g', 'audio'), { recursive: true });
    const abs = join(dataDir, 'g', 'audio', 'a1.ogg');
    await writeFile(abs, Buffer.from('OGG-DO-WHATSAPP'));
    return 'g/audio/a1.ogg';
  }

  it('destino 9router manda multipart (file, model, language), não o JSON da OpenRouter (Review Focus 4)', async () => {
    escolha.destino = { via: '9router', baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'groq/whisper-large-v3' };
    const rel = await audioEmDisco();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: '  oi tudo bem  ' }), { status: 200 }));
    const { transcribe } = await import('./transcribe');

    const texto = await transcribe('g', rel);

    expect(texto).toBe('oi tudo bem');
    expect(fetchSpy.mock.calls[0][0]).toBe('http://9r.test/v1/audio/transcriptions');
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer chave-9r' });
    const corpo = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get('model')).toBe('groq/whisper-large-v3');
    expect(corpo.get('language')).toBe('pt');
    const arquivo = corpo.get('file') as File;
    expect(arquivo.name).toBe('audio.ogg');
    expect(await arquivo.text()).toBe('OGG-DO-WHATSAPP');
  });

  it('sem modelo na tela fica desligada mesmo com OPENROUTER_API_KEY no ambiente', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'chave-openrouter');
    const rel = await audioEmDisco();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { transcribe } = await import('./transcribe');

    await expect(transcribe('g', rel)).rejects.toThrow(/Modelos de IA/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('publicarTranscricao', () => {
  it('em modo remoto sobe o texto pra /api/transcripts (a nuvem passa a saber que já foi transcrito)', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { publicarTranscricao } = await import('./transcribe');
    await publicarTranscricao('g', 'g/audio/a1.ogg', 'texto');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/transcripts',
      expect.objectContaining({ body: JSON.stringify({ slug: 'g', mediaPath: 'g/audio/a1.ogg', text: 'texto' }) }),
    );
  });
  it('em modo local não faz nada', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { publicarTranscricao } = await import('./transcribe');
    await publicarTranscricao('g', 'g/audio/a1.ogg', 'texto');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
