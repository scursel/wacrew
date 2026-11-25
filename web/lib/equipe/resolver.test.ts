import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../triage', () => ({ setResolved: vi.fn(async () => {}) }));
vi.mock('./atribuicoes', () => ({ DONO: '@dono', registrar: vi.fn(async () => ({})) }));
vi.mock('./identidade', () => ({ slugsExistentes: vi.fn(), contatosDeIdentidade: vi.fn() }));
vi.mock('./quem', () => ({ canonicoGlobal: vi.fn(async () => (s: string) => (s === 'dm-123456789012345' ? 'dm-5511999999999' : s)) }));

import { setResolved } from '../triage';
import { registrar } from './atribuicoes';
import { contatosDeIdentidade, slugsExistentes } from './identidade';
import { resolverConversa } from './resolver';

const contatos = {
  names: new Map(),
  ownIds: new Set(),
  teamIds: new Set(),
  phones: new Map([['123456789012345', '5511999999999']]),
  lids: new Set(['123456789012345']),
  hasSidecar: true,
};

describe('resolverConversa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(slugsExistentes).mockResolvedValue(new Set(['dm-5511999999999', 'dm-123456789012345', 'grupo']));
    vi.mocked(contatosDeIdentidade).mockResolvedValue(contatos as never);
  });

  it('DM partida: resolve os dois lados e solta o responsável no slug canônico', async () => {
    await resolverConversa('dm-123456789012345', '2026-11-25T12:00:00.000Z');
    expect(vi.mocked(setResolved).mock.calls.map((c) => c[0]).sort()).toEqual(['dm-123456789012345', 'dm-5511999999999']);
    expect(registrar).toHaveBeenCalledWith('dm-5511999999999', { tipo: 'resolver', por: '@dono' });
  });

  it('valor vazio desfaz o resolvido e não solta ninguém', async () => {
    await resolverConversa('grupo', '');
    expect(setResolved).toHaveBeenCalledWith('grupo', '');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('falha ao soltar o responsável não derruba o resolvido', async () => {
    vi.mocked(registrar).mockRejectedValueOnce(new Error('disco cheio'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(resolverConversa('grupo', '2026-11-25T12:00:00.000Z')).resolves.toBeUndefined();
    expect(setResolved).toHaveBeenCalledWith('grupo', '2026-11-25T12:00:00.000Z');
  });
});
