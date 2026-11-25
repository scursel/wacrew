import { describe, expect, it, vi } from 'vitest';
import type { MessageRecord } from './data';
import { ultimoAtendimento } from './ultimo-atendimento';

vi.mock('./contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./contacts')>()),
  buildContacts: async () => ({ ownIds: new Set(), teamIds: new Set(['5511888888888']) }),
}));
vi.mock('./equipe/usuarios', () => ({
  acharUsuario: async () => ({ nome: 'Ana Souza' }),
}));

const hora = (minuto: string) => `2026-09-22T15:${minuto}:00.000Z`;
const corte = { chat: hora('20') };

function msg(id: string, minuto: string, campos: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id,
    timestamp: hora(minuto),
    group: 'chat',
    groupJid: '123@g.us',
    sender: '5511999999999@s.whatsapp.net',
    senderName: 'Cliente',
    type: 'text',
    text: id,
    quotedText: null,
    mediaPath: null,
    ...campos,
  };
}

describe('observação do último atendimento', () => {
  it('usa a primeira mensagem do cliente após o corte e mantém o último atendente anterior', async () => {
    const resposta = msg('resposta', '19', { fromMe: true, ator: 'painel', usuario: 'ana' });
    const equipe = msg('equipe', '21', { sender: '5511888888888@s.whatsapp.net' });
    const retorno = msg('retorno', '22');
    const depois = msg('depois', '23', { fromMe: true, ator: 'painel', usuario: 'outro' });
    expect(await ultimoAtendimento(['chat'], corte, [depois, equipe, retorno, resposta])).toEqual({
      resolvidoEm: hora('20'),
      reabertoPorMensagem: 'retorno',
      atendente: 'Ana Souza',
    });
  });

  it('ignora mensagem própria, evento e mensagens no instante da resolução', async () => {
    expect(await ultimoAtendimento(['chat'], corte, [
      msg('no-corte', '20'),
      msg('própria', '21', { fromMe: true }),
      msg('evento', '22', { type: 'event' }),
    ])).toBeNull();
  });

  it('considera o corte mais recente entre os slugs permitidos e aceita histórico sem autoria', async () => {
    expect(await ultimoAtendimento(
      ['chat', 'irmao'], { ...corte, irmao: hora('22'), restrito: hora('25') },
      [msg('antiga', '19', { fromMe: true }), msg('retorno', '23')],
    )).toEqual({ resolvidoEm: hora('22'), reabertoPorMensagem: 'retorno', atendente: null });
  });
});
