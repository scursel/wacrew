import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteRespostaPronta,
  interpolarResposta,
  readRespostasProntas,
  upsertRespostaPronta,
} from './respostas-prontas';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wac-rp-'));
  file = join(dir, '.respostas-prontas.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('respostas-prontas', () => {
  it('CRUD: cria, lista ordenado, atualiza, impede atalho duplicado e remove', async () => {
    expect(await readRespostasProntas(file)).toEqual([]);

    const created = await upsertRespostaPronta(
      { atalho: '/Boas-Vindas', titulo: 'Saudação', texto: 'Olá {{nome}}!' },
      file,
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.atalho).toBe('boas-vindas');

    await expect(
      upsertRespostaPronta({ atalho: 'boas-vindas', titulo: 'Outra', texto: 'Oi' }, file),
    ).rejects.toThrow(/já existe/);

    const id = created[0]!.id;
    const updated = await upsertRespostaPronta(
      { id, atalho: 'oi', titulo: 'Saudação 2', texto: 'Oi {{nome}}, aqui é {{atendente}}' },
      file,
    );
    expect(updated[0]?.atalho).toBe('oi');

    const afterDelete = await deleteRespostaPronta(id, file);
    expect(afterDelete).toEqual([]);
  });

  it('interpolarResposta substitui {{nome}}, {{atendente}} e {{departamento}}', () => {
    const out = interpolarResposta(
      'Olá {{NOME}}, aqui é {{atendente}} de {{ departamento }}.',
      { nome: 'Maria', atendente: 'João', departamento: 'Oficina' },
    );
    expect(out).toBe('Olá Maria, aqui é João de Oficina.');
  });
});
