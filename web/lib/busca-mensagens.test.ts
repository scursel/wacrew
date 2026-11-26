import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buscarMensagens } from './busca-mensagens';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'wac-busca-'));
  await mkdir(join(dataDir, 'oficina', 'transcripts'), { recursive: true });
  await mkdir(join(dataDir, 'dm-5511999999999'), { recursive: true });

  await writeFile(
    join(dataDir, 'oficina', 'messages.jsonl'),
    [
      JSON.stringify({
        id: 'm1',
        group: 'Oficina Central',
        senderName: 'João',
        fromMe: false,
        timestamp: '2026-11-25T10:00:00.000Z',
        text: 'Preciso trocar a embreagem e alinhamento',
        mediaPath: null,
      }),
      JSON.stringify({
        id: 'm2',
        group: 'Oficina Central',
        senderName: 'Você',
        fromMe: true,
        timestamp: '2026-11-26T09:00:00.000Z',
        text: '',
        mediaPath: 'oficina/audio/a1.ogg',
      }),
    ].join('\n'),
  );
  await writeFile(join(dataDir, 'oficina', 'transcripts', 'a1.ogg.txt'), 'Orçamento de suspensão aprovado');

  await writeFile(
    join(dataDir, 'dm-5511999999999', 'messages.jsonl'),
    JSON.stringify({
      id: 'm3',
      group: 'Carlos',
      senderName: 'Carlos',
      fromMe: false,
      timestamp: '2026-11-26T11:00:00.000Z',
      text: 'Bom dia, revisão embreagem',
      mediaPath: null,
    }),
  );
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('buscarMensagens', () => {
  it('busca em mensagens e transcrições ignorando acentos e ordena do mais novo ao mais antigo', async () => {
    const res = await buscarMensagens({ q: 'embreagem', dataDir });
    expect(res.total).toBe(2);
    expect(res.resultados.map((r) => r.id)).toEqual(['m3', 'm1']);

    const trans = await buscarMensagens({ q: 'orcamento', dataDir });
    expect(trans.total).toBe(1);
    expect(trans.resultados[0]).toMatchObject({ id: 'm2', source: 'transcricao' });
  });

  it('filtra por slug, allowedSlugs e paginação', async () => {
    const porSlug = await buscarMensagens({ q: 'embreagem', slug: 'oficina', dataDir });
    expect(porSlug.total).toBe(1);
    expect(porSlug.resultados[0]?.id).toBe('m1');

    const restrito = await buscarMensagens({
      q: 'embreagem',
      allowedSlugs: new Set(['oficina']),
      dataDir,
    });
    expect(restrito.total).toBe(1);

    const pag = await buscarMensagens({ q: 'embreagem', limit: 1, offset: 1, dataDir });
    expect(pag.total).toBe(2);
    expect(pag.resultados.map((r) => r.id)).toEqual(['m1']);
  });
});
