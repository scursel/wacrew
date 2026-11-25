import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./identidade', () => ({
  slugsExistentes: vi.fn(),
  contatosDeIdentidade: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('./autenticar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./autenticar')>()),
  credenciaisDoDono: vi.fn(),
  quemPelaSessao: vi.fn(),
}));
vi.mock('./usuarios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./usuarios')>()),
  acharUsuario: vi.fn(),
}));
vi.mock('./departamentos', () => ({ lerNomeDono: vi.fn() }));

import { cookies } from 'next/headers';
import { contatosDeIdentidade, slugsExistentes } from './identidade';
import { credenciaisDoDono, quemPelaSessao } from './autenticar';
import { lerNomeDono } from './departamentos';
import { acharUsuario } from './usuarios';
import { canonicoGlobal, quemAtendeDoPedido } from './quem';

describe('identidade de atendimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PANEL_SESSION_SECRET = 'teste';
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'token' }) } as never);
    vi.mocked(credenciaisDoDono).mockReturnValue({ user: 'dono', pass: 'senha' });
  });

  it('usa o mesmo slug canônico para telefone e LID da conversa', async () => {
    vi.mocked(slugsExistentes).mockResolvedValue(new Set(['dm-5511999999999', 'dm-123456789012345']));
    vi.mocked(contatosDeIdentidade).mockResolvedValue({ names: new Map(), ownIds: new Set(), teamIds: new Set(), phones: new Map([['123456789012345', '5511999999999']]), lids: new Set(['123456789012345']), hasSidecar: true });
    const canonico = await canonicoGlobal();
    expect(canonico('dm-123456789012345')).toBe('dm-5511999999999');
    expect(canonico('dm-5511999999999')).toBe('dm-5511999999999');
    expect(canonico('grupo')).toBe('grupo');
  });

  it('identifica dono e atendente pela sessão validada', async () => {
    vi.mocked(quemPelaSessao).mockResolvedValueOnce({ papel: 'dono', login: 'dono' }).mockResolvedValueOnce({ papel: 'atendente', login: 'ana' });
    vi.mocked(lerNomeDono).mockResolvedValue('Operador');
    vi.mocked(acharUsuario).mockResolvedValue({ login: 'ana', nome: 'Ana', ativo: true } as never);
    await expect(quemAtendeDoPedido()).resolves.toEqual({ id: '@dono', nome: 'Operador', papel: 'dono' });
    await expect(quemAtendeDoPedido()).resolves.toEqual({ id: 'ana', nome: 'Ana', papel: 'atendente' });
  });

  it('painel local sem PANEL_USER/PANEL_PASS é do dono, como no proxy', async () => {
    vi.mocked(credenciaisDoDono).mockReturnValue(null);
    vi.mocked(lerNomeDono).mockResolvedValue('Operador');
    await expect(quemAtendeDoPedido()).resolves.toEqual({ id: '@dono', nome: 'Operador', papel: 'dono' });
  });

  it('recusa sessão ausente ou inválida', async () => {
    vi.mocked(quemPelaSessao).mockResolvedValue(null);
    await expect(quemAtendeDoPedido()).rejects.toMatchObject({ status: 401 });
  });
});
