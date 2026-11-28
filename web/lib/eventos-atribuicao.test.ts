import { describe, expect, it } from 'vitest';
import { type EventoAuditoriaView, filtrarEventos, textoEventoAuditoria } from './eventos-atribuicao';

function ev(parcial: Partial<EventoAuditoriaView> & { tipo: string }): EventoAuditoriaView {
  return {
    ts: '2026-11-25T19:09:00.000Z',
    slug: 'grupo-x',
    por: undefined,
    para: null,
    departamento: null,
    nota: undefined,
    porNome: null,
    paraNome: null,
    departamentoNome: null,
    ...parcial,
  };
}

describe('textoEventoAuditoria', () => {
  it('sugestão da IA sem departamento não vira "Alguém · sugestao"', () => {
    expect(textoEventoAuditoria(ev({ tipo: 'sugestao' }))).toBe('IA não encontrou departamento');
  });

  it('sugestão da IA com departamento nomeia o destino', () => {
    expect(textoEventoAuditoria(ev({ tipo: 'sugestao', departamento: 'fin', departamentoNome: 'Financeiro' }))).toBe(
      'IA sugeriu Financeiro',
    );
  });

  it('ator humano sem nome cadastrado cai no login, e só sem login cai em Alguém', () => {
    expect(textoEventoAuditoria(ev({ tipo: 'assumir', por: 'ana' }))).toBe('ana assumiu a conversa');
    expect(textoEventoAuditoria(ev({ tipo: 'resolver' }))).toBe('Alguém marcou como resolvida');
  });

  it('tipo desconhecido continua legível', () => {
    expect(textoEventoAuditoria(ev({ tipo: 'novidade', por: 'ana' }))).toBe('ana · novidade');
  });
});

describe('filtrarEventos', () => {
  it('esconde a releitura da IA que chegou ao mesmo departamento', () => {
    const eventos = [
      ev({ tipo: 'sugestao' }),
      ev({ tipo: 'sugestao', ts: '2026-11-25T19:10:00.000Z' }),
    ];
    expect(filtrarEventos(eventos)).toEqual([eventos[0]]);
  });

  it('mantém a sugestão que mudou o departamento', () => {
    const eventos = [
      ev({ tipo: 'sugestao' }),
      ev({ tipo: 'sugestao', departamento: 'fin', departamentoNome: 'Financeiro' }),
    ];
    expect(filtrarEventos(eventos)).toHaveLength(2);
  });

  it('sugestão igual à escolha manual anterior é ruído e sai', () => {
    const eventos = [
      ev({ tipo: 'departamento', por: 'ana', departamento: 'fin', porNome: 'Ana' }),
      ev({ tipo: 'sugestao', departamento: 'fin', departamentoNome: 'Financeiro' }),
    ];
    expect(filtrarEventos(eventos)).toEqual([eventos[0]]);
  });

  it('troca manual de departamento é sempre visível e vira a base da próxima sugestão', () => {
    const eventos = [
      ev({ tipo: 'departamento', por: 'ana', departamento: 'fin' }),
      ev({ tipo: 'departamento', por: 'ana', departamento: 'suporte' }),
      ev({ tipo: 'sugestao', departamento: 'suporte', departamentoNome: 'Suporte' }),
    ];
    expect(filtrarEventos(eventos)).toEqual(eventos.slice(0, 2));
  });

  it('delegação com departamento conta como escolha manual', () => {
    const eventos = [
      ev({ tipo: 'delegar', por: 'ana', para: 'bia', departamento: 'fin' }),
      ev({ tipo: 'sugestao', departamento: 'fin', departamentoNome: 'Financeiro' }),
      ev({ tipo: 'sugestao', departamento: 'fin', departamentoNome: 'Financeiro' }),
    ];
    expect(filtrarEventos(eventos)).toEqual([eventos[0]]);
  });

  it('eventos de responsável não interferem no departamento', () => {
    const eventos = [ev({ tipo: 'sugestao', departamento: 'fin' }), ev({ tipo: 'resolver', por: 'ana' })];
    expect(filtrarEventos(eventos)).toHaveLength(2);
  });

  it('lista vazia continua vazia', () => {
    expect(filtrarEventos([])).toEqual([]);
  });
});
