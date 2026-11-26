import { describe, expect, it } from 'vitest';
import { type ConversaFila, montarFila } from './caixa';

const conv = (slug: string, extra: Partial<ConversaFila> = {}): ConversaFila => ({
  slug,
  nome: slug,
  avatarPath: null,
  previa: null,
  ultimaEm: null,
  naoLidas: 0,
  fixada: false,
  silenciada: false,
  arquivada: false,
  etiquetas: [],
  departamento: null,
  departamentoNome: null,
  departamentoSugerido: false,
  responsavel: null,
  responsavelNome: null,
  ...extra,
});

describe('ciclo de vida na fila (Fase 2)', () => {
  const conversas = [
    conv('dm-111', { nome: 'Ana', status: 'aberta', naoLidas: 2, ultimaEm: '2026-11-26T10:00:00Z', etiquetas: ['vip'] }),
    conv('oficina', { nome: 'Oficina', status: 'adiada', snoozedUntil: '2026-11-27T09:00:00Z', ultimaEm: '2026-11-26T09:00:00Z' }),
    conv('dm-222', { nome: 'Bruno', status: 'resolvida', ultimaEm: '2026-11-26T11:00:00Z' }),
    conv('dm-333', { nome: 'Carla', status: 'aberta', markedUnread: true, ultimaEm: '2026-11-26T08:00:00Z' }),
  ];

  it('filtra vistas resolvidas, adiadas e nao_lidas', () => {
    const base = { esperando: [], conversas, entregas: [], aguardandoOk: [] };
    expect(montarFila(base, { vista: 'resolvidas' }).ordem).toEqual(['dm-222']);
    expect(montarFila(base, { vista: 'adiadas' }).ordem).toEqual(['oficina']);
    expect(montarFila(base, { vista: 'nao_lidas' }).ordem).toEqual(['dm-111', 'dm-333']);
  });

  it('filtra por tipo (dm vs grupo), etiquetas e ordena por nome', () => {
    const base = { esperando: [], conversas, entregas: [], aguardandoOk: [] };
    expect(montarFila(base, { vista: 'todas', tipo: 'grupo' }).ordem).toEqual(['oficina']);
    expect(montarFila(base, { vista: 'todas', tipo: 'dm', ordenacao: 'nome' }).ordem).toEqual(['dm-111', 'dm-222', 'dm-333']);
    expect(montarFila(base, { vista: 'todas', etiquetas: ['VIP'] }).ordem).toEqual(['dm-111']);
  });
});
