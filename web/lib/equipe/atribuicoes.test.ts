import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

let tmp: string;
let a: typeof import('./atribuicoes');
beforeAll(async () => { tmp = await mkdtemp(join(tmpdir(), 'atrib-')); process.env.WAC_DATA_DIR = tmp; a = await import('./atribuicoes'); });
afterAll(async () => { await rm(tmp, { recursive: true, force: true }); });

describe('atribuições', () => {
  it('assume somente conversa livre e preserva o estado original', () => {
    const vazio = {};
    const ocupado = a.aplicar(vazio, 'x', { tipo: 'responder', por: 'ana' }, 'agora');
    expect(vazio).toEqual({});
    expect(ocupado.x).toMatchObject({ responsavel: 'ana', desde: 'agora' });
    expect(a.aplicar(ocupado, 'x', { tipo: 'responder', por: 'bia' }, 'depois')).toEqual(ocupado);
    expect(a.aplicar(ocupado, 'x', { tipo: 'assumir', por: 'bia' }, 'depois')).toEqual(ocupado);
  });
  it('delega, solta e resolve mantendo o departamento', () => {
    let estado = a.aplicar({}, 'x', { tipo: 'delegar', por: 'ana', para: 'bia' }, 'um');
    expect(estado.x?.responsavel).toBe('bia');
    estado = a.aplicar(estado, 'x', { tipo: 'delegar', por: 'ana', para: null, departamento: 'financeiro' }, 'dois');
    expect(estado.x).toMatchObject({ responsavel: null, desde: null, departamento: 'financeiro', origemDepartamento: 'manual' });
    estado = a.aplicar(estado, 'x', { tipo: 'assumir', por: 'ana' }, 'três');
    for (const tipo of ['soltar', 'resolver'] as const) expect(a.aplicar(estado, 'x', { tipo, por: 'ana' }, 'quatro').x).toMatchObject({ responsavel: null, desde: null, departamento: 'financeiro' });
  });
  it('registra tentativa da IA sem sobrescrever departamento manual', () => {
    const sugestao = a.aplicar({}, 'x', { tipo: 'sugestao', departamento: 'suporte' }, 'agora');
    expect(sugestao.x).toMatchObject({ departamento: 'suporte', origemDepartamento: 'ia', iaTentouEm: 'agora' });
    const manual = a.aplicar({}, 'x', { tipo: 'departamento', por: 'ana', departamento: 'financeiro' }, 'antes');
    expect(a.aplicar(manual, 'x', { tipo: 'sugestao', departamento: 'suporte' }, 'agora').x).toMatchObject({ departamento: 'financeiro', origemDepartamento: 'manual', iaTentouEm: 'agora' });
    expect(a.aplicar({}, 'x', { tipo: 'sugestao', departamento: null }, 'agora').x).toMatchObject({ departamento: null, origemDepartamento: null, iaTentouEm: 'agora' });
  });
  it('serializa registros e limpa responsáveis e departamentos', async () => {
    await Promise.all([a.registrar('x', { tipo: 'delegar', por: 'ana', para: 'ana', departamento: 'fin' }), a.registrar('y', { tipo: 'delegar', por: 'bia', para: 'bia', departamento: 'fin' })]);
    expect((await readFile(join(tmp, '.equipe', 'atribuicoes.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(2);
    await a.liberarLogin('ana');
    expect((await a.lerAtribuicoes()).x?.responsavel).toBeNull();
    expect((await a.lerAtribuicoes()).y?.responsavel).toBe('bia');
    await a.registrar('z', { tipo: 'sugestao', departamento: 'fin' });
    await a.limparDepartamento('fin');
    expect((await a.lerAtribuicoes()).y).toMatchObject({ departamento: null, origemDepartamento: null });
    // Departamento apagado: a conversa volta a poder ser classificada pela IA.
    expect((await a.lerAtribuicoes()).z?.iaTentouEm).toBeUndefined();
  });
});
