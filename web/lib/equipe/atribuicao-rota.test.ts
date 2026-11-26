import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./quem', () => ({ quemAtendeDoPedido: vi.fn(), canonicoGlobal: vi.fn() }));
vi.mock('./identidade', () => ({ slugsExistentes: vi.fn(), contatosDeIdentidade: vi.fn() }));
vi.mock('./usuarios', () => ({ acharUsuario: vi.fn() }));
vi.mock('./departamentos', () => ({ lerDepartamentos: vi.fn() }));
vi.mock('./atribuicoes', () => ({ DONO: '@dono', registrar: vi.fn() }));
vi.mock('../triage', () => ({ setAutonomo: vi.fn(), setResolved: vi.fn() }));

import { POST } from '../../app/api/atendimento/atribuicao/route';
import { registrar } from './atribuicoes';
import { lerDepartamentos } from './departamentos';
import { contatosDeIdentidade, slugsExistentes } from './identidade';
import { canonicoGlobal, quemAtendeDoPedido } from './quem';
import { acharUsuario } from './usuarios';
import { setAutonomo, setResolved } from '../triage';

const telefone = 'dm-5511999999999';
const lid = 'dm-123456789012345';
const pedido = (body: unknown) => new Request('http://localhost/api/atendimento/atribuicao', { method: 'POST', body: JSON.stringify(body) });

describe('rota de atribuição', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(quemAtendeDoPedido).mockResolvedValue({ id: 'ana', nome: 'Ana', papel: 'atendente' });
    vi.mocked(slugsExistentes).mockResolvedValue(new Set([telefone, lid]));
    vi.mocked(contatosDeIdentidade).mockResolvedValue({ names: new Map(), ownIds: new Set(), teamIds: new Set(), phones: new Map([['123456789012345', '5511999999999']]), lids: new Set(['123456789012345']), hasSidecar: true });
    vi.mocked(canonicoGlobal).mockResolvedValue(() => telefone);
    vi.mocked(lerDepartamentos).mockResolvedValue([{ id: 'suporte', nome: 'Suporte', descricao: '', membros: [] }]);
    vi.mocked(registrar).mockResolvedValue({ departamento: null, origemDepartamento: null, responsavel: null, desde: null });
  });

  it('resolve os dois irmãos e solta a atribuição canônica', async () => {
    const res = await POST(pedido({ slug: lid, acao: 'resolver' }));
    expect(res.status).toBe(200);
    expect(setResolved).toHaveBeenCalledTimes(2);
    expect(setResolved).toHaveBeenCalledWith(telefone, expect.any(String));
    expect(setResolved).toHaveBeenCalledWith(lid, expect.any(String));
    expect(registrar).toHaveBeenCalledWith(telefone, { tipo: 'resolver', por: 'ana' });
  });

  it('assumir atribui no slug canônico e desliga o modo autônomo da IA nos irmãos', async () => {
    const res = await POST(pedido({ slug: lid, acao: 'assumir' }));
    expect(res.status).toBe(200);
    expect(setAutonomo).toHaveBeenCalledTimes(2);
    expect(setAutonomo).toHaveBeenCalledWith(telefone, false);
    expect(setAutonomo).toHaveBeenCalledWith(lid, false);
    expect(registrar).toHaveBeenCalledWith(telefone, { tipo: 'assumir', por: 'ana' });
  });

  it('valida responsável ativo e departamento antes de delegar', async () => {
    vi.mocked(acharUsuario).mockResolvedValue(null);
    expect((await POST(pedido({ slug: lid, acao: 'delegar', para: 'ausente' }))).status).toBe(400);
    expect((await POST(pedido({ slug: lid, acao: 'departamento', departamento: 'inexistente' }))).status).toBe(400);
    expect(registrar).not.toHaveBeenCalled();
    expect((await POST(pedido({ slug: lid, acao: 'delegar', para: '@dono', departamento: 'suporte' }))).status).toBe(200);
    expect(registrar).toHaveBeenCalledWith(telefone, { tipo: 'delegar', por: 'ana', para: '@dono', departamento: 'suporte' });
  });
});
