import { describe, expect, it } from 'vitest';
import type { PresencaAgente } from './equipe/presenca-interna';
import { frasePresencaEquipe } from './presenca-equipe';

function agente(nome: string, estado: PresencaAgente['estado'] = 'vendo'): PresencaAgente {
  return { login: nome.toLowerCase(), nome, estado, atualizadoEm: 0 };
}

describe('frasePresencaEquipe', () => {
  it('sem ninguém não há linha', () => {
    expect(frasePresencaEquipe([])).toBeNull();
  });

  it('um colega só olhando não repete "nesta conversa"', () => {
    expect(frasePresencaEquipe([agente('Administrador')])).toBe('Administrador também está nesta conversa');
  });

  it('quem digita tem prioridade e vira o foco da frase', () => {
    expect(frasePresencaEquipe([agente('Ana'), agente('Bruno', 'digitando')])).toBe('Bruno está digitando…');
  });

  it('dois digitando no plural', () => {
    expect(frasePresencaEquipe([agente('Ana', 'digitando'), agente('Bruno', 'digitando')])).toBe(
      'Ana e Bruno estão digitando…',
    );
  });

  it('lista com mais de dois usa vírgula e "e"', () => {
    expect(frasePresencaEquipe([agente('Ana'), agente('Bruno'), agente('Carla')])).toBe(
      'Ana, Bruno e Carla também estão nesta conversa',
    );
  });
});
