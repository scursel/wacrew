import type { WAMessage, WASocket } from 'baileys';
import { describe, expect, it } from 'vitest';
import { mapMessage, mapPoll, mapReaction } from './mapper.js';

// Em DM o WhatsApp manda `key.participant` como string vazia (não nulo): o
// remetente tem que cair no `remoteJid`, como quando o campo vinha ausente.
const DM = '5511999999999@s.whatsapp.net';
const sock = { user: { id: '5511888888888:2@s.whatsapp.net' } } as unknown as WASocket;

function recebidaNaDm(extra: Partial<WAMessage> = {}): WAMessage {
  return {
    key: { remoteJid: DM, fromMe: false, id: 'ABC123', participant: '' },
    message: { conversation: 'oi' },
    messageTimestamp: 1_700_000_000,
    pushName: 'Fulano',
    ...extra,
  } as WAMessage;
}

describe('remetente em DM com participant vazio', () => {
  it('mensagem recebida fica com o remoteJid como remetente', () => {
    const m = mapMessage(recebidaNaDm(), sock, 'Fulano');
    expect(m?.sender).toBe(DM);
  });

  it('sem pushName, o nome não sai vazio', () => {
    const m = mapMessage(recebidaNaDm({ pushName: null }), sock, 'Fulano');
    expect(m?.senderName).toBe('desconhecido');
  });

  it('citação com participant vazio não vira autor vazio', () => {
    const m = mapMessage(
      recebidaNaDm({
        message: {
          extendedTextMessage: {
            text: 'resposta',
            contextInfo: { quotedMessage: { conversation: 'original' }, participant: '' },
          },
        },
      }),
      sock,
      'Fulano',
    );
    expect(m?.quotedText).toBe('original');
    expect(m?.quotedSender).toBeNull();
  });

  it('citação do próprio LID grava o jid de telefone (não o LID cru)', () => {
    const sockComLid = {
      user: { id: '5511888888888:2@s.whatsapp.net', lid: '277897403211794@lid' },
    } as unknown as WASocket;
    const m = mapMessage(
      recebidaNaDm({
        message: {
          extendedTextMessage: {
            text: 'resposta',
            contextInfo: {
              quotedMessage: { conversation: 'Fala Gustavo, tudo bem?' },
              participant: '277897403211794@lid',
            },
          },
        },
      }),
      sockComLid,
      'Fulano',
    );
    expect(m?.quotedSender).toBe('5511888888888:2@s.whatsapp.net');
  });

  it('telefone de contato com os mesmos dígitos do nosso LID não vira a gente', () => {
    const sockComLid = {
      user: { id: '5511888888888:2@s.whatsapp.net', lid: '277897403211794@lid' },
    } as unknown as WASocket;
    const m = mapMessage(
      recebidaNaDm({
        message: {
          extendedTextMessage: {
            text: 'resposta',
            contextInfo: {
              quotedMessage: { conversation: 'oi' },
              participant: '277897403211794@s.whatsapp.net',
            },
          },
        },
      }),
      sockComLid,
      'Fulano',
    );
    expect(m?.quotedSender).toBe('277897403211794@s.whatsapp.net');
  });

  it('em grupo o participant continua sendo o remetente', () => {
    const m = mapMessage(
      recebidaNaDm({
        key: {
          remoteJid: '120363000000000000@g.us',
          fromMe: false,
          id: 'GRP1',
          participant: '5511777777777@s.whatsapp.net',
        },
      }),
      sock,
      'Grupo',
    );
    expect(m?.sender).toBe('5511777777777@s.whatsapp.net');
  });

  it('reação na DM fica com o remoteJid como autor', () => {
    const r = mapReaction(
      {
        key: { remoteJid: DM, id: 'ALVO1' },
        reaction: {
          key: { remoteJid: DM, fromMe: false, participant: '' },
          text: '👍',
          senderTimestampMs: 1_700_000_000_000,
        },
      },
      'Fulano',
    );
    expect(r?.reactor).toBe(DM);
    expect(r?.reactorName).toBe('5511999999999');
  });

  it('enquete na DM fica com o remoteJid como autor', () => {
    const p = mapPoll(
      recebidaNaDm({
        message: {
          pollCreationMessageV3: {
            name: 'Qual dia?',
            options: [{ optionName: 'segunda' }, { optionName: 'terça' }],
            selectableOptionsCount: 1,
          },
          messageContextInfo: { messageSecret: new Uint8Array(32).fill(7) },
        },
      }),
      'Fulano',
    );
    expect(p?.creatorJid).toBe(DM);
  });
});

describe('duração e páginas da mídia', () => {
  it('vídeo e áudio guardam os segundos; documento guarda as páginas', () => {
    const video = mapMessage(
      recebidaNaDm({ message: { videoMessage: { seconds: 312, mimetype: 'video/mp4' } } }),
      sock,
      'Fulano',
    );
    expect(video?.duracao_s).toBe(312);
    const audio = mapMessage(
      recebidaNaDm({ message: { audioMessage: { seconds: 48, mimetype: 'audio/ogg' } } }),
      sock,
      'Fulano',
    );
    expect(audio?.duracao_s).toBe(48);
    const doc = mapMessage(
      recebidaNaDm({
        message: {
          documentMessage: { pageCount: 7, fileName: 'proposta.pdf', mimetype: 'application/pdf' },
        },
      }),
      sock,
      'Fulano',
    );
    expect(doc?.paginas).toBe(7);
    expect(mapMessage(recebidaNaDm(), sock, 'Fulano')).not.toHaveProperty('duracao_s');
  });
});

describe('quotedId, location e vcard estruturados', () => {
  it('extrai quotedId (stanzaId) de contextInfo', () => {
    const m = mapMessage(
      recebidaNaDm({
        message: {
          extendedTextMessage: {
            text: 'respondendo',
            contextInfo: {
              stanzaId: 'MSG-ORIG-123',
              participant: DM,
              quotedMessage: { conversation: 'texto citado' },
            },
          },
        },
      }),
      sock,
      'Fulano',
    );
    expect(m?.quotedId).toBe('MSG-ORIG-123');
    expect(m?.quotedText).toBe('texto citado');
  });

  it('extrai lat/lng estruturados de locationMessage', () => {
    const m = mapMessage(
      recebidaNaDm({
        message: {
          locationMessage: {
            degreesLatitude: -23.5505,
            degreesLongitude: -46.6333,
            name: 'Autocenter',
            address: 'Av Paulista, 1000',
          },
        },
      }),
      sock,
      'Fulano',
    );
    expect(m?.location).toEqual({
      lat: -23.5505,
      lng: -46.6333,
      name: 'Autocenter',
      address: 'Av Paulista, 1000',
    });
  });

  it('extrai vcard e contactName de contactMessage', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Carlos Mecânico\nTEL:+5511999990000\nEND:VCARD';
    const m = mapMessage(
      recebidaNaDm({
        message: {
          contactMessage: {
            displayName: 'Carlos Mecânico',
            vcard,
          },
        },
      }),
      sock,
      'Fulano',
    );
    expect(m?.contactName).toBe('Carlos Mecânico');
    expect(m?.vcard).toBe(vcard);
  });
});
