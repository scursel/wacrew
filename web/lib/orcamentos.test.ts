import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ehOrcamentoPorTexto,
  lerOrcamentos,
  marcarOrcamento,
  type MsgOrcamento,
  precisaVisao,
  resumirOrcamentos,
  type StoreOrcamentos,
} from './orcamentos';

const msg = (p: Partial<MsgOrcamento>): MsgOrcamento => ({
  id: 'x',
  timestamp: '2026-11-20T10:00:00.000Z',
  fromMe: true,
  type: 'text',
  text: '',
  ...p,
});

const vazio = (): StoreOrcamentos => ({ manual: {}, removidos: {}, visao: {} });

describe('ehOrcamentoPorTexto', () => {
  it('reconhece o PDF do sistema pelo nome', () => {
    expect(ehOrcamentoPorTexto(msg({ type: 'document', text: 'Orcamento_N265110_17092026.pdf' }))).toBe(true);
  });

  it('reconhece texto com a palavra e um valor', () => {
    expect(ehOrcamentoPorTexto(msg({ text: 'Segue o orçamento:\nPastilha R$ 180,00\nMão de obra R$ 90' }))).toBe(true);
  });

  it('ignora pedido de orçamento sem valor', () => {
    expect(ehOrcamentoPorTexto(msg({ text: 'faz um orcamento' }))).toBe(false);
  });

  it('ignora o que o cliente mandou', () => {
    expect(ehOrcamentoPorTexto(msg({ fromMe: false, type: 'document', text: 'orcamento.pdf' }))).toBe(false);
  });

  it('reconhece foto com legenda de orçamento', () => {
    expect(ehOrcamentoPorTexto(msg({ type: 'image', text: 'orçamento do Gol' }))).toBe(true);
  });
});

describe('precisaVisao', () => {
  it('só olha foto enviada sem legenda que já resolva', () => {
    expect(precisaVisao(msg({ type: 'image', text: '' }))).toBe(true);
    expect(precisaVisao(msg({ type: 'image', text: 'orçamento' }))).toBe(false);
    expect(precisaVisao(msg({ type: 'image', fromMe: false }))).toBe(false);
    expect(precisaVisao(msg({ type: 'document' }))).toBe(false);
  });
});

describe('resumirOrcamentos', () => {
  it('soma texto e visão e guarda o mais recente', () => {
    const s = vazio();
    s.visao.foto = { orcamento: true, em: '2026-11-21T00:00:00.000Z' };
    const r = resumirOrcamentos(
      'dm-1',
      [
        msg({ id: 'a', type: 'document', text: 'Orcamento_1.pdf', timestamp: '2026-11-01T10:00:00.000Z' }),
        msg({ id: 'foto', type: 'image', timestamp: '2026-11-10T10:00:00.000Z' }),
        msg({ id: 'b', type: 'image', timestamp: '2026-11-12T10:00:00.000Z' }),
      ],
      s,
    );
    expect(r).toEqual({ total: 2, ultimo: '2026-11-10T10:00:00.000Z', manual: false });
  });

  it('marcação manual sozinha conta um', () => {
    const s = vazio();
    s.manual['dm-1'] = '2026-11-25T12:00:00.000Z';
    expect(resumirOrcamentos('dm-1', [], s)).toEqual({ total: 1, ultimo: '2026-11-25T12:00:00.000Z', manual: true });
  });

  it('desmarcar apaga o que veio antes, mas não o que vier depois', () => {
    const s = vazio();
    s.removidos['dm-1'] = '2026-11-15T00:00:00.000Z';
    const antes = msg({ type: 'document', text: 'orcamento.pdf', timestamp: '2026-11-10T00:00:00.000Z' });
    const depois = msg({ type: 'document', text: 'orcamento2.pdf', timestamp: '2026-11-20T00:00:00.000Z' });
    expect(resumirOrcamentos('dm-1', [antes], s).total).toBe(0);
    expect(resumirOrcamentos('dm-1', [antes, depois], s).total).toBe(1);
  });
});

describe('resumirOrcamentos com DM partido', () => {
  it('marcação em qualquer ponta vale para as duas', () => {
    const s = vazio();
    s.manual['dm-lid'] = '2026-11-25T12:00:00.000Z';
    expect(resumirOrcamentos(['dm-telefone', 'dm-lid'], [], s).manual).toBe(true);
    expect(resumirOrcamentos('dm-telefone', [], s).manual).toBe(false);
  });
});

describe('marcarOrcamento', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('marca e desmarca no disco', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orc-'));
    await marcarOrcamento('dm-1', true, new Date('2026-11-25T12:00:00Z'), dir);
    expect((await lerOrcamentos(dir)).manual['dm-1']).toBe('2026-11-25T12:00:00.000Z');
    await marcarOrcamento('dm-1', false, new Date('2026-11-26T12:00:00Z'), dir);
    const s = await lerOrcamentos(dir);
    expect(s.manual['dm-1']).toBeUndefined();
    expect(s.removidos['dm-1']).toBe('2026-11-26T12:00:00.000Z');
  });
});
