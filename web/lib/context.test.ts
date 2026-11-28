import { describe, expect, it } from 'vitest';
import type { Contacts } from './contacts';
import { horaBRT, label } from './context';

describe('horaBRT', () => {
  it('converte UTC para Brasília (-3h) — msg da noite vira a hora certa', () => {
    // 01:11 UTC = 22:11 do dia anterior em BRT (fácil de ler errado como 01h).
    expect(horaBRT('2026-06-26T01:11:00.000Z')).toBe('25/06, 22:11');
    expect(horaBRT('2026-06-26T00:25:00.000Z')).toBe('25/06, 21:25');
  });

  it('mesma data quando não cruza meia-noite', () => {
    expect(horaBRT('2026-06-26T16:19:38.000Z')).toBe('26/06, 13:19');
  });

  it('data inválida cai pro valor cru', () => {
    expect(horaBRT('não-é-data')).toBe('não-é-data');
  });
});

describe('label', () => {
  const contatos = (names: [string, string][]): Contacts =>
    ({ names: new Map(names), ownIds: new Set(['5511888888888']), teamIds: new Set(), phones: new Map([['277897403211794', '5511999999999']]), lids: new Set(), hasSidecar: true }) as unknown as Contacts;

  it('LID com só o número no cadastro cai no nome do cadastro do telefone', () => {
    const c = contatos([['277897403211794', '277897403211794'], ['5511999999999', 'Gustavo']]);
    expect(label(c, '277897403211794@lid')).toBe('Gustavo');
  });
  it('sem nome em nenhum dos dois, não devolve número cru', () => {
    const c = contatos([['277897403211794', '+55 11 99999-9999'], ['5511999999999', 'desconhecido']]);
    expect(label(c, '277897403211794@lid')).toBeUndefined();
  });
});
