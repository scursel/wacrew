import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmp: string;
let mod: typeof import('./config');

const arquivo = () => join(tmp, '.ia', 'modelos.json');

beforeEach(async () => {
  vi.resetModules();
  tmp = await mkdtemp(join(tmpdir(), 'ia-config-'));
  process.env.WAC_DATA_DIR = tmp;
  mod = await import('./config');
});
afterEach(async () => {
  delete process.env.WAC_DATA_DIR;
  await rm(tmp, { recursive: true, force: true });
});

describe('lerConfigIA', () => {
  it('arquivo ausente → URL padrão, sem chave e sem escolhas', async () => {
    expect(await mod.lerConfigIA()).toEqual({
      baseUrl: mod.URL_9ROUTER_PADRAO,
      chave: '',
      funcoes: {},
    });
  });

  it('JSON corrompido cai no padrão sem lançar (postura/copiloto não podem quebrar por isso)', async () => {
    await mkdir(join(tmp, '.ia'), { recursive: true });
    await writeFile(arquivo(), 'isto não é json', 'utf8');
    await expect(mod.lerConfigIA()).resolves.toEqual({
      baseUrl: mod.URL_9ROUTER_PADRAO,
      chave: '',
      funcoes: {},
    });
  });

  it('ignora o que não reconhece: função desconhecida e id que não é texto', async () => {
    await mkdir(join(tmp, '.ia'), { recursive: true });
    await writeFile(
      arquivo(),
      JSON.stringify({ baseUrl: 'http://9r.test/v1', chave: 'abc12345', funcoes: { inventada: 'x', video: 7, postura: 'forte' } }),
      'utf8',
    );
    const c = await mod.lerConfigIA();
    expect(c.funcoes).toEqual({ postura: 'forte' });
  });
});

describe('salvarConfigIA', () => {
  it('salva e lê de volta, sem barra final na URL e com o arquivo em 0600', async () => {
    const salvo = await mod.salvarConfigIA({
      baseUrl: 'http://9r.test/v1/',
      chave: 'chave-super-secreta-1234',
      funcoes: { postura: 'forte' },
    });
    expect(salvo).toEqual({
      baseUrl: 'http://9r.test/v1',
      chave: 'chave-super-secreta-1234',
      funcoes: { postura: 'forte' },
    });
    expect(await mod.lerConfigIA()).toEqual(salvo);

    const s = await stat(arquivo());
    expect(s.mode & 0o777).toBe(0o600);
  });

  it('POST sem chave mantém a anterior; chave: "" apaga (Review Focus 2)', async () => {
    await mod.salvarConfigIA({ chave: 'minha-chave-9999' });

    const trocandoModelos = await mod.salvarConfigIA({ funcoes: { video: 'ver-video' } });
    expect(trocandoModelos.chave).toBe('minha-chave-9999');
    expect(trocandoModelos.funcoes).toEqual({ video: 'ver-video' });

    const apagada = await mod.salvarConfigIA({ chave: '' });
    expect(apagada.chave).toBe('');
    expect((await mod.lerConfigIA()).chave).toBe('');
  });

  it('função null ou "" volta ao padrão', async () => {
    await mod.salvarConfigIA({ funcoes: { copiloto: 'leve', postura: 'forte' } });
    const r = await mod.salvarConfigIA({ funcoes: { copiloto: null, postura: '' } });
    expect(r.funcoes).toEqual({});
  });
});

describe('configPublica', () => {
  it('nunca carrega a chave; mostra só os 4 últimos caracteres', async () => {
    const salvo = await mod.salvarConfigIA({
      baseUrl: 'http://9r.test/v1',
      chave: 'chave-super-secreta-1234',
      funcoes: { departamento: 'rapido' },
    });
    const pub = mod.configPublica(salvo);
    expect(pub).toEqual({
      baseUrl: 'http://9r.test/v1',
      temChave: true,
      chaveFinal: '1234',
      funcoes: { departamento: 'rapido' },
    });
    expect(JSON.stringify(pub)).not.toContain('chave-super-secreta-1234');
  });

  it('sem chave: temChave false e chaveFinal null', () => {
    expect(mod.configPublica({ baseUrl: mod.URL_9ROUTER_PADRAO, chave: '', funcoes: {} })).toEqual({
      baseUrl: mod.URL_9ROUTER_PADRAO,
      temChave: false,
      chaveFinal: null,
      funcoes: {},
    });
  });
});
