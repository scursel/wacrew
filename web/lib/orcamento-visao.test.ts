import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classificarFotos, lerResposta } from './orcamento-visao';
import { lerOrcamentos } from './orcamentos';

vi.mock('./ia/provedor', () => ({
  resolverIA: async (_f: string, padrao: { baseUrl: string; chave: string; modelo: string }) => ({ via: 'padrao', ...padrao, chave: 'k' }),
}));

describe('lerResposta', () => {
  it('lê o JSON do modelo, com ou sem cerca de código', () => {
    expect(lerResposta('{"orcamento": true}')).toBe(true);
    expect(lerResposta('```json\n{"orcamento": false}\n```')).toBe(false);
    expect(lerResposta('talvez')).toBeNull();
  });
});

describe('classificarFotos', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'orcv-'));
    await mkdir(join(dir, 'dm-1', 'image'), { recursive: true });
    await writeFile(join(dir, 'dm-1', 'image', 'a.jpg'), Buffer.from([1, 2, 3]));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const resposta = (conteudo: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content: conteudo } }] }), { status: 200 });

  it('grava o veredito e trata arquivo ausente como não-orçamento', async () => {
    const fetchFn = vi.fn(async () => resposta('{"orcamento": true}'));
    const n = await classificarFotos(
      [
        { id: 'a', mediaPath: 'dm-1/image/a.jpg' },
        { id: 'b', mediaPath: 'dm-1/image/sumiu.jpg' },
        { id: 'c', mediaPath: '../fora.jpg' },
      ],
      { dataDir: dir, fetchFn: fetchFn as unknown as typeof fetch },
    );
    expect(n).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const s = await lerOrcamentos(dir);
    expect(s.visao.a.orcamento).toBe(true);
    expect(s.visao.b.orcamento).toBe(false);
    expect(s.visao.c.orcamento).toBe(false);
  });

  it('resposta ilegível ou em partes: só grava o que deu para ler', async () => {
    const partes = [{ type: 'thinking', thinking: [] }, { type: 'text', text: '{"orcamento": true}' }];
    await mkdir(join(dir, 'dm-1', 'image'), { recursive: true });
    await writeFile(join(dir, 'dm-1', 'image', 'b.jpg'), Buffer.from([4]));
    const b64A = Buffer.from([1, 2, 3]).toString('base64');
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const ehA = String(init?.body ?? '').includes(b64A);
      return ehA
        ? new Response(JSON.stringify({ choices: [{ message: { content: partes } }] }), { status: 200 })
        : resposta('talvez');
    });
    await classificarFotos(
      [
        { id: 'a', mediaPath: 'dm-1/image/a.jpg' },
        { id: 'b', mediaPath: 'dm-1/image/b.jpg' },
      ],
      { dataDir: dir, fetchFn: fetchFn as unknown as typeof fetch },
    );
    const s = await lerOrcamentos(dir);
    expect(s.visao.a?.orcamento).toBe(true);
    expect(s.visao.b).toBeUndefined();
  });

  it('falha da API não grava nada para tentar de novo depois', async () => {
    const fetchFn = vi.fn(async () => new Response('limite', { status: 429 }));
    const n = await classificarFotos([{ id: 'a', mediaPath: 'dm-1/image/a.jpg' }], {
      dataDir: dir,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(n).toBe(0);
    expect((await lerOrcamentos(dir)).visao.a).toBeUndefined();
  });
});
