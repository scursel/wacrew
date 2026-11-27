import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let tmp: string;
let mod: typeof import('./assinatura');
let usuarios: typeof import('./usuarios');
let departamentos: typeof import('./departamentos');
const PANEL = process.env.PANEL_USER;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-assinatura-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./assinatura');
  usuarios = await import('./usuarios');
  departamentos = await import('./departamentos');
});

afterAll(async () => {
  if (PANEL === undefined) delete process.env.PANEL_USER;
  else process.env.PANEL_USER = PANEL;
  await rm(tmp, { recursive: true, force: true });
});

describe('assinar', () => {
  it('primeira linha em negrito com o nome e dois-pontos dentro do negrito', () => {
    expect(mod.assinar('Oi\ntudo bem?', 'Ana')).toBe('*Ana:*\nOi\ntudo bem?');
  });
  it('texto vazio sai só com a assinatura', () => {
    expect(mod.assinar('', 'Ana')).toBe('*Ana:*');
  });
  it('várias linhas e parágrafos: a assinatura entra uma vez, no topo', () => {
    const texto = 'Oi, tudo bem?\n\nJá verifiquei aqui.\nTe falo hoje.';
    expect(mod.assinar(texto, 'Ana')).toBe(`*Ana:*\n${texto}`);
    expect(mod.assinar(mod.assinar(texto, 'Ana'), 'Ana')).toBe(`*Ana:*\n*Ana:*\n${texto}`);
  });
});

describe('assinarBaloes', () => {
  it('assinatura só no primeiro balão', () => {
    expect(mod.assinarBaloes(['a', 'b'], 'Ana')).toEqual(['*Ana:*\na', 'b']);
  });
  it('lista vazia continua vazia', () => {
    expect(mod.assinarBaloes([], 'Ana')).toEqual([]);
  });
});

describe('semAssinatura', () => {
  it('tira a assinatura que assinar colocou', () => {
    expect(mod.semAssinatura(mod.assinar('oi', 'Ana'))).toBe('oi');
    expect(mod.semAssinatura('*Ana:*\nOi\ntudo bem?')).toBe('Oi\ntudo bem?');
  });
  it('não mexe em negrito que não é assinatura', () => {
    expect(mod.semAssinatura('*importante* oi')).toBe('*importante* oi');
  });
});

describe('nomeDeQuemEnvia', () => {
  it('dono sem nomeDono cai no PANEL_USER', async () => {
    process.env.PANEL_USER = 'chefe';
    expect(await mod.nomeDeQuemEnvia('chefe')).toBe('chefe');
  });
  it('dono usa o nomeDono passado', async () => {
    process.env.PANEL_USER = 'chefe';
    expect(await mod.nomeDeQuemEnvia('chefe', async () => 'Carlos')).toBe('Carlos');
  });
  it('atendente usa o nome da conta; sem nome, o login', async () => {
    process.env.PANEL_USER = 'chefe';
    await usuarios.alterarUsuarios((l) => {
      const base = { senha: 'scrypt$x$y', ativo: true, versao: 1, chats: [], criadoEm: '2026-10-06T12:00:00.000Z', ultimoAcesso: null };
      l.push({ ...base, login: 'ana', nome: 'Ana' });
      l.push({ ...base, login: 'bia', nome: '' });
    });
    expect(await mod.nomeDeQuemEnvia('ana')).toBe('Ana');
    expect(await mod.nomeDeQuemEnvia('bia')).toBe('bia');
  });

  it('atendente com assinatura própria usa o texto configurado', async () => {
    await usuarios.alterarUsuarios((l) => {
      const u = l.find((x) => x.login === 'ana');
      if (u) u.assinatura = 'Ana · Financeiro';
    });
    expect(await mod.nomeDeQuemEnvia('ana')).toBe('Ana · Financeiro');
  });
});

describe('deveAssinar (exige departamento)', () => {
  it('usuário ou dono sem departamento nunca assina', async () => {
    process.env.PANEL_USER = 'chefe';
    await departamentos.gravarConfigDono({ nomeDono: 'Financeiro Gala', assinarMensagens: true });
    await departamentos.alterarDepartamentos((l) => {
      l.length = 0;
    });
    expect(await mod.deveAssinar('chefe')).toBe(false);
    expect(await mod.deveAssinar('ana')).toBe(false);
  });

  it('só assina quando participa de departamento e a assinatura está ligada', async () => {
    process.env.PANEL_USER = 'chefe';
    await departamentos.alterarDepartamentos((l) => {
      l.length = 0;
      l.push({ id: 'fin', nome: 'Financeiro', descricao: '', membros: ['@dono', 'ana'] });
    });
    await departamentos.gravarConfigDono({ nomeDono: 'Gabriel', assinarMensagens: false });
    expect(await mod.deveAssinar('chefe')).toBe(false);
    await departamentos.gravarConfigDono({ assinarMensagens: true });
    expect(await mod.deveAssinar('chefe')).toBe(true);
    expect(await mod.deveAssinar('ana')).toBe(true);
    expect(await mod.deveAssinar('bia')).toBe(false);
  });
});
