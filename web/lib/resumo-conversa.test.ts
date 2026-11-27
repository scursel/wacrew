import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { historicoDe, juntarHistoricosResumos, lerResumos, salvarResumo } from './resumo-conversa';

describe('resumo-conversa (histórico)', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'resumo-hist-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('acumula resumos gerados em ordem mais-recente-primeiro mantendo compatibilidade com texto/em', async () => {
    const t1 = new Date('2026-11-26T12:00:00.000Z');
    const t2 = new Date('2026-11-27T13:30:00.000Z');

    await salvarResumo('dm-1', 'Primeiro resumo.', t1, dir);
    const ultimo = await salvarResumo('dm-1', 'Segundo resumo.', t2, dir);

    expect(ultimo.texto).toBe('Segundo resumo.');
    expect(ultimo.em).toBe(t2.toISOString());
    expect(ultimo.historico).toEqual([
      { texto: 'Segundo resumo.', em: t2.toISOString() },
      { texto: 'Primeiro resumo.', em: t1.toISOString() },
    ]);

    const salvo = (await lerResumos(dir))['dm-1'];
    expect(historicoDe(salvo)).toHaveLength(2);
  });

  it('lê formato legado (sem campo historico) e junta históricos de irmãos DM sem duplicar', async () => {
    await writeFile(
      join(dir, '.resumos-conversa.json'),
      JSON.stringify({
        'dm-111': { texto: 'Resumo antigo', em: '2026-11-25T10:00:00.000Z' },
        'dm-lid': {
          texto: 'Resumo novo',
          em: '2026-11-27T10:00:00.000Z',
          historico: [
            { texto: 'Resumo novo', em: '2026-11-27T10:00:00.000Z' },
            { texto: 'Resumo antigo', em: '2026-11-25T10:00:00.000Z' },
          ],
        },
      }),
    );

    const todos = await lerResumos(dir);
    expect(historicoDe(todos['dm-111'])).toEqual([{ texto: 'Resumo antigo', em: '2026-11-25T10:00:00.000Z' }]);
    expect(juntarHistoricosResumos([todos['dm-111'], todos['dm-lid']])).toEqual([
      { texto: 'Resumo novo', em: '2026-11-27T10:00:00.000Z' },
      { texto: 'Resumo antigo', em: '2026-11-25T10:00:00.000Z' },
    ]);
  });
});
