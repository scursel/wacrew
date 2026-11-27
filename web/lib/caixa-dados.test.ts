import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GroupSummary } from './data';
import type { ContextoAtribuicao } from './caixa-dados';
import { montarFila } from './caixa';

// A espera vem do inbox e a classificação da IA; os dois são controlados pelo teste.
const { buildInbox, classificarPendentes, irmaos } = vi.hoisted(() => ({
  // DM partida que o teste liga (lado → slug canônico); o resto é o próprio slug.
  irmaos: new Map<string, string>(),
  buildInbox: vi.fn(async (_opts?: unknown): Promise<unknown[]> => []),
  // Nunca resolve: se a fila esperasse a IA, o teste travaria.
  classificarPendentes: vi.fn((_pendentes: unknown[]): Promise<void> => new Promise(() => {})),
}));
vi.mock('./inbox', () => ({ buildInbox }));
vi.mock('@/lib/equipe/classificar-departamento', () => ({ classificarPendentes }));
vi.mock('@/lib/equipe/quem', () => ({ canonicoGlobal: async () => (slug: string) => irmaos.get(slug) ?? slug }));

const esperaFake = (slug: string, groupName: string) => ({
  slug,
  groupName,
  reason: 'client-waiting',
  who: 'Carla',
  preview: 'oi',
  waitingSince: '2026-11-25T09:00:00.000Z',
});

// O registro de entregas e o despacho moram em DATA_DIR (resolvido no import de ./paths).
// `DONO` é o de `@/lib/equipe/atribuicoes`; não importo aqui porque esse módulo também lê DATA_DIR no import.
const DONO = '@dono';
let tmp: string;
let mod: typeof import('./caixa-dados');

const evento = (slug: string, ts: string, estado = 'entregando') =>
  `${JSON.stringify({ ts, ticket: `t-${slug}-${ts}`, slug, estado, motivo: null, enviados: 0, total: 2, iniciadoEm: ts })}\n`;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-caixa-'));
  await mkdir(join(tmp, 'data', 'despacho'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  // Porta sem ninguém: a fila de envio "fora do ar" não pode quebrar a Caixa.
  process.env.WAC_CONTROL_PORT = '9';
  mod = await import('./caixa-dados');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('eventosDaConversa', () => {
  it('sem registro, nada', async () => {
    expect(await mod.eventosDaConversa('g')).toEqual([]);
  });

  it('só os eventos da conversa, a partir do instante pedido, e acompanha o registro crescer', async () => {
    const arq = join(tmp, 'data', '.entregas.jsonl');
    await writeFile(arq, evento('g', '2026-10-07T10:00:00Z') + evento('outra', '2026-10-07T10:01:00Z') + '{linha cortada');
    expect((await mod.eventosDaConversa('g')).map((e) => e.ts)).toEqual(['2026-10-07T10:00:00Z']);
    await appendFile(arq, `\n${evento('g', '2026-10-07T12:00:00Z', 'entregue')}`);
    const depois = await mod.eventosDaConversa('g', '2026-10-07T11:00:00Z');
    expect(depois).toEqual([
      {
        ts: '2026-10-07T12:00:00Z',
        ticket: 't-g-2026-10-07T12:00:00Z',
        slug: 'g',
        estado: 'entregue',
        motivo: null,
        enviados: 0,
        total: 2,
        iniciadoEm: '2026-10-07T12:00:00Z',
      },
    ]);
  });
});

describe('iaDaCaixa', () => {
  it('coletor fora do ar dá fila vazia; pergunta da triagem sem decisão espera o OK', async () => {
    // A fila só lê os despachos recentes: a passada é de hoje, e uma de meses atrás nem é aberta.
    const agora = new Date();
    const passada = `${agora.toISOString().slice(0, 10)}T0610`;
    const criadoEm = agora.toISOString();
    await writeFile(
      join(tmp, 'data', 'despacho', '2020-01-01T0610.json'),
      JSON.stringify({ passada: '2020-01-01T0610', criadoEm: '2020-01-01T09:10:00.000Z', enviadoEm: null, itens: [
        { n: 1, id: 'v', slug: 'velho', cliente: 'V', tipo: 'pergunta', titulo: 'x', url: null, texto: 'antiga', issue: null, acao: 'enviar', label: null, executadoEm: null, resultado: null },
      ] }),
    );
    await writeFile(
      join(tmp, 'data', 'despacho', `${passada}.json`),
      JSON.stringify({
        passada,
        criadoEm,
        enviadoEm: criadoEm,
        itens: [
          { n: 3, id: 'a', slug: 'g', cliente: 'G', tipo: 'pergunta', titulo: 'Prazo', url: null, texto: 'Fecha sexta?', issue: null, acao: 'enviar', label: null, executadoEm: null, resultado: null },
          { n: 4, id: 'b', slug: 'h', cliente: 'H', tipo: 'pergunta', titulo: 'x', url: null, texto: 'y', issue: null, acao: 'enviar', label: null, executadoEm: '2026-10-07T10:00:00Z', resultado: 'ok' },
          { n: 5, id: 'c', slug: 'i', cliente: 'I', tipo: 'issue', titulo: 'Bug', url: null, texto: null, issue: null, acao: 'label', label: 'claude', executadoEm: null, resultado: null },
        ],
      }),
    );
    expect(await mod.iaDaCaixa()).toEqual({
      entregas: [],
      aguardandoOk: [{ slug: 'g', n: 3, texto: 'Fecha sexta?', desde: criadoEm }],
    });
  });
});

const grupo = (slug: string, name = slug): GroupSummary => ({
  slug,
  name,
  messageCount: 0,
  lastTimestamp: null,
  avatarPath: null,
  lastPreview: null,
  unread: 0,
});

const ATRIBUICAO_IA = { departamento: 'suporte', origemDepartamento: 'ia', responsavel: 'ana', desde: '2026-11-25T10:00:00.000Z' } as const;
const DEPARTAMENTOS = [
  { id: 'suporte', nome: 'Suporte', descricao: '', membros: ['ana'] },
  { id: 'financeiro', nome: 'Financeiro', descricao: '', membros: ['bia'] },
];

describe('paraConversa: atribuição em nomes', () => {
  const ctx: ContextoAtribuicao = {
    atribuicoes: {
      'grupo-a': ATRIBUICAO_IA,
      'grupo-b': { departamento: 'financeiro', origemDepartamento: 'manual', responsavel: DONO, desde: '2026-11-25T10:00:00.000Z' },
      'grupo-c': { departamento: 'apagado', origemDepartamento: 'ia', responsavel: 'sumiu', desde: '2026-11-25T10:00:00.000Z' },
    },
    departamentos: DEPARTAMENTOS,
    nomeDono: 'Operador',
    nomeDe: new Map([['ana', 'Ana Souza']]),
  };

  it('atribuição da IA sai com o nome da conta, o nome do departamento e a sugestão', () => {
    expect(mod.paraConversa(grupo('grupo-a', 'Grupo A'), ctx)).toMatchObject({
      slug: 'grupo-a',
      nome: 'Grupo A',
      responsavel: 'ana',
      responsavelNome: 'Ana Souza',
      departamento: 'suporte',
      departamentoNome: 'Suporte',
      departamentoSugerido: true,
    });
  });

  it('dono responsável sai com o nome do dono; escolha manual não é sugestão', () => {
    expect(mod.paraConversa(grupo('grupo-b'), ctx)).toMatchObject({
      responsavel: DONO,
      responsavelNome: 'Operador',
      departamentoNome: 'Financeiro',
      departamentoSugerido: false,
    });
  });

  it('departamento apagado vira nenhum; responsável sem conta aparece pelo login', () => {
    expect(mod.paraConversa(grupo('grupo-c'), ctx)).toMatchObject({
      departamento: null,
      departamentoNome: null,
      departamentoSugerido: false,
      responsavel: 'sumiu',
      responsavelNome: 'sumiu',
    });
  });

  it('sem atribuição, tudo vazio; a chave é o slug canônico (DM partida usa a atribuição do irmão)', () => {
    expect(mod.paraConversa(grupo('grupo-x'), ctx)).toMatchObject({
      departamento: null,
      departamentoNome: null,
      departamentoSugerido: false,
      responsavel: null,
      responsavelNome: null,
    });
    expect(mod.paraConversa(grupo('dm-lid'), ctx, 'grupo-a')).toMatchObject({ slug: 'dm-lid', responsavelNome: 'Ana Souza' });
  });
});

describe('fila com as atribuições gravadas em .equipe', () => {
  const eq = () => join(tmp, 'data', '.equipe');

  it('filaDaEquipe: nomes das contas, departamentos da pessoa e a atribuição no slug canônico', async () => {
    await mkdir(eq(), { recursive: true });
    await writeFile(
      join(eq(), 'usuarios.json'),
      JSON.stringify([{ login: 'ana', nome: 'Ana Souza', senha: 'scrypt$x$y', ativo: true, versao: 1, chats: [], criadoEm: '2026-10-06T12:00:00.000Z', ultimoAcesso: null }]),
    );
    await writeFile(join(eq(), 'departamentos.json'), JSON.stringify(DEPARTAMENTOS));
    await writeFile(join(eq(), 'atribuicoes.json'), JSON.stringify({ 'dm-tel': ATRIBUICAO_IA }));
    const canonicoDe = (slug: string) => (slug === 'dm-lid' ? 'dm-tel' : slug);

    const f = await mod.filaDaEquipe(new Set(), canonicoDe, [grupo('dm-tel'), grupo('dm-lid')], 'ana');

    expect(f.eu).toBe('ana');
    expect(f.departamentos).toEqual([
      { id: 'suporte', nome: 'Suporte' },
      { id: 'financeiro', nome: 'Financeiro' },
    ]);
    expect(f.meusDepartamentos).toEqual(['suporte']);
    expect(f.conversas.map((c) => [c.slug, c.responsavelNome, c.departamentoNome, c.departamentoSugerido])).toEqual([
      ['dm-tel', 'Ana Souza', 'Suporte', true],
      ['dm-lid', 'Ana Souza', 'Suporte', true],
    ]);
  });

  it('filaDoDono: eu é o dono e os departamentos são todos dele', async () => {
    await mkdir(eq(), { recursive: true });
    await writeFile(join(eq(), 'departamentos.json'), JSON.stringify(DEPARTAMENTOS));
    const f = await mod.filaDoDono();
    expect(f.eu).toBe(DONO);
    expect(f.meusDepartamentos).toEqual(['suporte', 'financeiro']);
    expect(f.departamentos).toHaveLength(2);
  });
});

describe('classificação da IA e espera de DM partida', () => {
  const eq = () => join(tmp, 'data', '.equipe');

  it('filaDaEquipe passa os slugs da espera à classificação e não espera por ela', async () => {
    buildInbox.mockResolvedValueOnce([esperaFake('grupo-a', 'Grupo A')]);
    const f = await mod.filaDaEquipe(new Set(['grupo-a']), (s) => s, [grupo('grupo-a')], 'ana');
    expect(classificarPendentes).toHaveBeenCalledWith([{ slug: 'grupo-a', desde: expect.any(String) }]);
    expect(f.esperando.map((e) => e.slug)).toEqual(['grupo-a']);
  });

  it('filaDoDono também dispara a classificação com os slugs da espera, sem esperar', async () => {
    buildInbox.mockResolvedValueOnce([esperaFake('grupo-b', 'Grupo B')]);
    const f = await mod.filaDoDono();
    expect(classificarPendentes).toHaveBeenCalledWith([{ slug: 'grupo-b', desde: expect.any(String) }]);
    expect(f.esperando.map((e) => e.slug)).toEqual(['grupo-b']);
  });

  it('a espera de DM partida acha a atribuição pelo slug canônico, mesmo sem a conversa canônica na lista', async () => {
    await mkdir(eq(), { recursive: true });
    await writeFile(
      join(eq(), 'usuarios.json'),
      JSON.stringify([{ login: 'ana', nome: 'Ana Souza', senha: 'scrypt$x$y', ativo: true, versao: 1, chats: [], criadoEm: '2026-10-06T12:00:00.000Z', ultimoAcesso: null }]),
    );
    await writeFile(join(eq(), 'departamentos.json'), JSON.stringify(DEPARTAMENTOS));
    await writeFile(join(eq(), 'atribuicoes.json'), JSON.stringify({ 'dm-tel': ATRIBUICAO_IA }));
    // A lista só tem o LID; a espera e a atribuição estão no telefone (slug canônico).
    const canonicoDe = (slug: string) => (slug === 'dm-lid' ? 'dm-tel' : slug);
    buildInbox.mockResolvedValueOnce([esperaFake('dm-tel', 'Carla')]);

    const f = await mod.filaDaEquipe(new Set(['dm-tel']), canonicoDe, [grupo('dm-lid')], 'ana');

    const linhaDaEspera = montarFila(f, { vista: 'esperando' }).secoes[0]?.linhas.find((l) => l.slug === 'dm-tel');
    expect(linhaDaEspera).toMatchObject({ responsavel: 'ana', responsavelNome: 'Ana Souza', departamentoNome: 'Suporte', departamentoSugerido: true });
    // Com responsável, a espera sai da Fila.
    expect(montarFila(f, { vista: 'fila' }).ordem).toEqual([]);
  });

  it('filaDoDono: lado LID da DM partida mostra a atribuição gravada no telefone e classifica pelo canônico', async () => {
    await mkdir(eq(), { recursive: true });
    await writeFile(
      join(eq(), 'usuarios.json'),
      JSON.stringify([{ login: 'ana', nome: 'Ana Souza', senha: 'scrypt$x$y', ativo: true, versao: 1, chats: [], criadoEm: '2026-10-06T12:00:00.000Z', ultimoAcesso: null }]),
    );
    await writeFile(join(eq(), 'departamentos.json'), JSON.stringify(DEPARTAMENTOS));
    await writeFile(join(eq(), 'atribuicoes.json'), JSON.stringify({ 'dm-tel': ATRIBUICAO_IA }));
    irmaos.set('dm-lid', 'dm-tel');
    buildInbox.mockResolvedValueOnce([esperaFake('dm-lid', 'Carla')]);

    const f = await mod.filaDoDono();
    irmaos.clear();

    const linha = montarFila(f, { vista: 'esperando' }).secoes[0]?.linhas.find((l) => l.slug === 'dm-lid');
    expect(linha).toMatchObject({ responsavel: 'ana', departamentoNome: 'Suporte' });
    expect(classificarPendentes).toHaveBeenLastCalledWith([{ slug: 'dm-tel', desde: expect.any(String) }]);
  });
});
