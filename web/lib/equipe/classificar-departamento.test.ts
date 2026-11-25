import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LinhaHistorico } from '../estilo/postura';

// Mensagens e contatos vêm do mesmo leitor que o MCP usa (data-source).
const mock = vi.hoisted(() => ({ msgs: [] as unknown[] }));
vi.mock('../data-source', () => ({
  dsContacts: async () => ({ names: new Map(), ownIds: new Set(), teamIds: new Set(), phones: new Map(), lids: new Set(), hasSidecar: false }),
  dsGroupMessages: async () => mock.msgs,
  dsListGroups: async () => [],
}));

// Escolha da tela de modelos de IA; null = padrão (OpenRouter + env).
const escolha = vi.hoisted(() => ({ destino: null as unknown }));
vi.mock('@/lib/ia/provedor', () => ({
  resolverIA: async (_funcao: string, padrao: object) => escolha.destino ?? { via: 'padrao', ...padrao },
}));

let tmp: string;
let mod: typeof import('./classificar-departamento');
let dep: typeof import('./departamentos');
let atrib: typeof import('./atribuicoes');

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'classif-dep-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./classificar-departamento');
  dep = await import('./departamentos');
  atrib = await import('./atribuicoes');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  escolha.destino = null;
  mock.msgs = [];
});

const deps = [
  { id: 'financeiro', nome: 'Financeiro', descricao: 'boletos, cobranças e notas', membros: [] },
  { id: 'suporte', nome: 'Suporte', descricao: 'dúvidas e problemas técnicos', membros: [] },
];

const linha = (quem: LinhaHistorico['quem'], texto: string): LinhaHistorico => ({ quem, nome: quem === 'cliente' ? 'Fulano' : quem, hora: '25/11 10:00', texto });

const respostaIA = (conteudo: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(conteudo) } }] }), { status: 200 }));

describe('lerDepartamento', () => {
  it('devolve o id quando existe na lista', () => {
    expect(mod.lerDepartamento({ departamento: 'suporte' }, deps)).toBe('suporte');
  });
  it('id inventado ou apagado vira null', () => {
    expect(mod.lerDepartamento({ departamento: 'inventado' }, deps)).toBeNull();
  });
  it('json fora do formato vira null', () => {
    expect(mod.lerDepartamento('lixo', deps)).toBeNull();
    expect(mod.lerDepartamento(null, deps)).toBeNull();
    expect(mod.lerDepartamento({ departamento: 7 }, deps)).toBeNull();
  });
});

describe('montarPedidoDepartamento', () => {
  it('inclui nome e descrição de cada departamento, pede JSON e usa o modelo dado', () => {
    const corpo = mod.montarPedidoDepartamento([linha('cliente', 'meu boleto veio errado')], deps, 'modelo-x') as {
      model: string;
      response_format: { type: string };
      messages: { role: string; content: string }[];
    };
    const texto = corpo.messages.map((m) => m.content).join('\n');
    expect(corpo.model).toBe('modelo-x');
    expect(corpo.response_format).toEqual({ type: 'json_object' });
    expect(texto).toContain('Financeiro');
    expect(texto).toContain('boletos, cobranças e notas');
    expect(texto).toContain('Suporte');
    expect(texto).toContain('dúvidas e problemas técnicos');
    expect(texto).toContain('meu boleto veio errado');
    expect(texto).toMatch(/JSON/);
  });
});

describe('classificarPendentes', () => {
  it('sem OPENROUTER_API_KEY não chama fetch e não grava nada', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await dep.alterarDepartamentos((l) => { l.push(...deps); });
    mock.msgs = [{ id: '1', timestamp: '2026-11-25T10:00:00.000Z', fromMe: false, sender: '5511999@s.whatsapp.net', senderName: 'Fulano', type: 'text', text: 'oi' }];

    await mod.classificarPendentes(['grupo-sem-chave']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await atrib.lerAtribuicoes())['grupo-sem-chave']).toBeUndefined();
  });

  it('com chave, grava a sugestão da IA como origem ia', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'chave-teste');
    const fetchMock = respostaIA({ departamento: 'suporte' });
    vi.stubGlobal('fetch', fetchMock);
    mock.msgs = [{ id: '2', timestamp: '2026-11-25T10:00:00.000Z', fromMe: false, sender: '5511999@s.whatsapp.net', senderName: 'Fulano', type: 'text', text: 'o sistema caiu' }];

    await mod.classificarPendentes(['grupo-com-chave']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const a = (await atrib.lerAtribuicoes())['grupo-com-chave'];
    expect(a).toMatchObject({ departamento: 'suporte', origemDepartamento: 'ia' });
    expect(a?.iaTentouEm).toBeTruthy();
  });

  it('conversa que já tem departamento ou já foi tentada não é reclassificada', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'chave-teste');
    const fetchMock = respostaIA({ departamento: 'financeiro' });
    vi.stubGlobal('fetch', fetchMock);
    await atrib.registrar('grupo-manual', { tipo: 'departamento', por: 'ana', departamento: 'suporte' });
    await atrib.registrar('grupo-tentado', { tipo: 'sugestao', departamento: null });

    await mod.classificarPendentes(['grupo-manual', 'grupo-tentado']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await atrib.lerAtribuicoes())['grupo-manual']?.departamento).toBe('suporte');
  });
  it('falha da IA espera antes de tentar a mesma conversa de novo', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'chave-teste');
    const fetchMock = vi.fn(async () => new Response('erro', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    mock.msgs = [{ id: '3', timestamp: '2026-11-25T10:00:00.000Z', fromMe: false, sender: '5511999@s.whatsapp.net', senderName: 'Fulano', type: 'text', text: 'preciso do boleto' }];

    await mod.classificarPendentes(['grupo-falhou']);
    await mod.classificarPendentes(['grupo-falhou']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await atrib.lerAtribuicoes())['grupo-falhou']).toBeUndefined();
  });
  it('destino 9router: chama o 9router com a chave salva e o combo escolhido', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'chave-openrouter');
    escolha.destino = { via: '9router', baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };
    const fetchMock = respostaIA({ departamento: 'suporte' });
    vi.stubGlobal('fetch', fetchMock);
    mock.msgs = [{ id: '5', timestamp: '2026-11-25T10:00:00.000Z', fromMe: false, sender: '5511999@s.whatsapp.net', senderName: 'Fulano', type: 'text', text: 'o sistema caiu' }];

    await mod.classificarPendentes(['grupo-9router']);

    expect(fetchMock.mock.calls[0][0]).toBe('http://9r.test/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer chave-9r' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('leve');
    expect((await atrib.lerAtribuicoes())['grupo-9router']).toMatchObject({ departamento: 'suporte', origemDepartamento: 'ia' });
  });

  it('com chave do 9router e sem OPENROUTER_API_KEY, classifica pelo 9router (a guarda olha o destino)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    escolha.destino = { via: '9router', baseUrl: 'http://9r.test/v1', chave: 'chave-9r', modelo: 'leve' };
    const fetchMock = respostaIA({ departamento: 'financeiro' });
    vi.stubGlobal('fetch', fetchMock);
    mock.msgs = [{ id: '6', timestamp: '2026-11-25T10:00:00.000Z', fromMe: false, sender: '5511999@s.whatsapp.net', senderName: 'Fulano', type: 'text', text: 'preciso do boleto' }];

    await mod.classificarPendentes(['grupo-so-9router']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await atrib.lerAtribuicoes())['grupo-so-9router']).toMatchObject({ departamento: 'financeiro' });
  });

  it('duas montagens da fila ao mesmo tempo não classificam a mesma conversa duas vezes (nem além do 1º lote)', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'chave-teste');
    let liberar: () => void = () => {};
    const segura = new Promise<void>((r) => {
      liberar = r;
    });
    const fetchMock = vi.fn(async () => {
      await segura;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ departamento: 'suporte' }) } }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    mock.msgs = [{ id: '4', timestamp: '2026-11-25T10:00:00.000Z', fromMe: false, sender: '5511999@s.whatsapp.net', senderName: 'Fulano', type: 'text', text: 'oi' }];
    const slugs = ['lote-1', 'lote-2', 'lote-3', 'lote-4', 'lote-5'];

    const a = mod.classificarPendentes(slugs);
    const b = mod.classificarPendentes(slugs);
    await new Promise((r) => setTimeout(r, 20));
    liberar();
    await Promise.all([a, b]);

    expect(fetchMock).toHaveBeenCalledTimes(slugs.length);
  });
});
