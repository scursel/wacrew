import { describe, expect, it } from 'vitest';
import type { Contacts } from './contacts';
import { resolverIrmaosDmDe } from './dm-conversa';

const c: Contacts = {
  names: new Map(),
  ownIds: new Set(),
  teamIds: new Set(),
  phones: new Map([
    ['40000000000001', '5511987650001'],
    ['5511987650001', '5511987650001'],
  ]),
  lids: new Set(['40000000000001', '99999999999999']),
  hasSidecar: true,
};
const existentes = new Set(['dm-5511987650001', 'dm-40000000000001', 'grupo-x']);

describe('resolverIrmaosDmDe', () => {
  it('grupo devolve só o próprio slug como canônico', () => {
    expect(resolverIrmaosDmDe('grupo-x', c, existentes)).toEqual({
      irmaos: ['grupo-x'],
      canonico: 'grupo-x',
    });
  });

  it('DM por LID traz telefone + LID e canônico no telefone', () => {
    expect(resolverIrmaosDmDe('dm-40000000000001', c, existentes)).toEqual({
      irmaos: ['dm-5511987650001', 'dm-40000000000001'],
      canonico: 'dm-5511987650001',
    });
  });

  it('DM por telefone traz irmãos e canônico no telefone', () => {
    expect(resolverIrmaosDmDe('dm-5511987650001', c, existentes)).toEqual({
      irmaos: ['dm-5511987650001', 'dm-40000000000001'],
      canonico: 'dm-5511987650001',
    });
  });

  it('LID sem telefone conhecido fica sozinho', () => {
    expect(resolverIrmaosDmDe('dm-99999999999999', c, existentes)).toEqual({
      irmaos: ['dm-99999999999999'],
      canonico: 'dm-99999999999999',
    });
  });
});
