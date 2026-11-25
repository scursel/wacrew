import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Contacts } from '../contacts';
import { atendentePeloToken, chatsEfetivos, ErroHttp, exigirChat, irmaosPermitidos, slugCanonico } from './acesso';
import { assinarSessao, chaveDeSessao, novaSessao } from './sessao';

// DATA_DIR sai do import de ../paths: o ambiente precisa estar pronto antes dos imports.
const dados = await vi.hoisted(async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tmp = await mkdtemp(join(tmpdir(), 'wa-acesso-'));
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  process.env.PANEL_USER = 'dono';
  process.env.PANEL_PASS = 'segredo-do-dono';
  return { tmp, data: join(tmp, 'data') };
});

function contatos(phones: Array<[string, string]>): Contacts {
  return {
    names: new Map(),
    ownIds: new Set(),
    teamIds: new Set(),
    phones: new Map(phones),
    lids: new Set(phones.map(([lid]) => lid)),
    hasSidecar: true,
  };
}

describe('chatsEfetivos', () => {
  const c = contatos([['98200000000001', '5511999999999']]);
  const existentes = new Set(['grupo-a', 'dm-5511999999999', 'dm-98200000000001', 'dm-5511888888888']);

  it('DM liberada pelo telefone abre o irmão por LID, e vice-versa', () => {
    expect(chatsEfetivos(['dm-5511999999999'], c, existentes)).toEqual(new Set(['dm-5511999999999', 'dm-98200000000001']));
    expect(chatsEfetivos(['dm-98200000000001'], c, existentes)).toEqual(new Set(['dm-5511999999999', 'dm-98200000000001']));
  });
  it('não abre DM de outra pessoa nem grupo não liberado', () => {
    const s = chatsEfetivos(['dm-5511999999999'], c, existentes);
    expect(s.has('dm-5511888888888')).toBe(false);
    expect(s.has('grupo-a')).toBe(false);
  });
  it('dois LIDs de pessoas diferentes: liberar o telefone de uma não abre o LID da outra', () => {
    const dois = contatos([
      ['98200000000001', '5511999999999'],
      ['98200000000002', '5511888888888'],
    ]);
    const todos = new Set(['dm-5511999999999', 'dm-98200000000001', 'dm-5511888888888', 'dm-98200000000002']);
    const s = chatsEfetivos(['dm-5511999999999'], dois, todos);
    expect(s).toEqual(new Set(['dm-5511999999999', 'dm-98200000000001']));
    expect(s.has('dm-98200000000002')).toBe(false);
  });
  it('grupo é ele mesmo', () => {
    expect(chatsEfetivos(['grupo-a'], c, existentes)).toEqual(new Set(['grupo-a']));
  });
  it('irmão que não existe no coletor não entra; o slug liberado sempre fica', () => {
    expect(chatsEfetivos(['dm-5511999999999'], c, new Set())).toEqual(new Set(['dm-5511999999999']));
  });
});

describe('irmaosPermitidos', () => {
  const c = contatos([['98200000000001', '5511999999999']]);
  const existentes = new Set(['dm-5511999999999', 'dm-98200000000001', 'grupo-a']);

  it('DM: o próprio slug e o irmão liberado (telefone primeiro)', () => {
    const chats = new Set(['dm-5511999999999', 'dm-98200000000001']);
    expect(irmaosPermitidos(chats, 'dm-98200000000001', c, existentes)).toEqual(['dm-5511999999999', 'dm-98200000000001']);
  });
  it('irmão fora da lista liberada não entra', () => {
    expect(irmaosPermitidos(new Set(['dm-98200000000001']), 'dm-98200000000001', c, existentes)).toEqual(['dm-98200000000001']);
  });
  it('grupo é só ele', () => {
    expect(irmaosPermitidos(new Set(['grupo-a']), 'grupo-a', c, existentes)).toEqual(['grupo-a']);
  });
});

describe('exigirChat', () => {
  it('chat fora da lista é 404', () => {
    const a = { usuario: {} as never, chats: new Set(['grupo-a']) };
    expect(() => exigirChat(a, 'grupo-a')).not.toThrow();
    try {
      exigirChat(a, 'grupo-b');
      throw new Error('devia ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ErroHttp);
      expect((e as ErroHttp).status).toBe(404);
    }
  });
});

describe('slugCanonico', () => {
  const c = contatos([
    ['98200000000001', '5511999999999'],
    ['98200000000002', '5511999999999'],
  ]);
  it('o do telefone, quando está entre os irmãos', () => {
    expect(slugCanonico(['dm-98200000000001', 'dm-5511999999999'], c)).toBe('dm-5511999999999');
  });
  it('só LIDs: o mesmo resultado em qualquer ordem', () => {
    expect(slugCanonico(['dm-98200000000002', 'dm-98200000000001'], c)).toBe('dm-98200000000001');
    expect(slugCanonico(['dm-98200000000001', 'dm-98200000000002'], c)).toBe('dm-98200000000001');
  });
  it('grupo é ele mesmo', () => {
    expect(slugCanonico(['grupo-a'], c)).toBe('grupo-a');
  });
});

describe('atendentePeloToken: atendente vê todas as conversas existentes', () => {
  beforeAll(async () => {
    await mkdir(join(dados.data, 'grupo-a'), { recursive: true });
    await mkdir(join(dados.data, 'dm-5511999999999'), { recursive: true });
    await mkdir(join(dados.data, '.equipe'), { recursive: true });
    await writeFile(
      join(dados.data, '.equipe', 'usuarios.json'),
      JSON.stringify([
        {
          login: 'ana',
          nome: 'Ana',
          senha: 'scrypt$x$y',
          ativo: true,
          versao: 1,
          chats: [],
          criadoEm: '2026-10-06T12:00:00.000Z',
          ultimoAcesso: null,
        },
      ]),
    );
  });
  afterAll(async () => rm(dados.tmp, { recursive: true, force: true }));

  it('lista de chats vazia no arquivo: enxerga qualquer slug existente e 404 para o inexistente', async () => {
    const token = assinarSessao(novaSessao('ana', 'atendente', 1), chaveDeSessao()!);
    const a = await atendentePeloToken(token);
    expect(a).not.toBeNull();
    expect(a!.chats).toEqual(new Set(['grupo-a', 'dm-5511999999999']));
    expect(() => exigirChat(a!, 'grupo-a')).not.toThrow();
    expect(() => exigirChat(a!, 'dm-5511999999999')).not.toThrow();
    try {
      exigirChat(a!, 'nao-existe');
      throw new Error('devia ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ErroHttp);
      expect((e as ErroHttp).status).toBe(404);
    }
  });
});
