import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { WhatsAppGateway } from '../core/ports.js';
import { startControlServer } from './server.js';

const servers: import('node:http').Server[] = [];

function gatewayMock() {
  const deleted: Array<{
    jid: string;
    key: { id: string; participant?: string; fromMe?: boolean };
  }> = [];
  const texts: Array<{ jid: string; text: string; mentions?: string[]; quotedId?: string }> = [];
  const gw = {
    async checkNumber(n: string) {
      return { exists: true, jid: `${n}@s.whatsapp.net` };
    },
    async sendText(
      jid: string,
      text: string,
      mentions?: string[],
      _meta?: unknown,
      quotedId?: string,
    ) {
      texts.push({ jid, text, mentions, quotedId });
    },
    async deleteMessage(jid: string, key: { id: string; participant?: string; fromMe?: boolean }) {
      deleted.push({ jid, key });
    },
  } as unknown as WhatsAppGateway;
  return { gw, deleted, texts };
}

async function subir(gw: WhatsAppGateway): Promise<string> {
  const server = startControlServer(gw, 0, []);
  servers.push(server);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
});

describe('control /message e /send com citar/mentions', () => {
  it('DELETE /message valida campos e delega ao gateway.deleteMessage', async () => {
    const { gw, deleted } = gatewayMock();
    const base = await subir(gw);

    const bad = await fetch(`${base}/message`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: '123@g.us' }),
    });
    expect(bad.status).toBe(400);

    const ok = await fetch(`${base}/message`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: '123@g.us', msgId: 'MSG-99', fromMe: true }),
    });
    expect(ok.status).toBe(200);
    expect(deleted).toEqual([
      { jid: '123@g.us', key: { id: 'MSG-99', participant: undefined, fromMe: true } },
    ]);
  });

  it('POST /send direto repassa citar (quotedId) e mentions', async () => {
    const { gw, texts } = gatewayMock();
    const base = await subir(gw);

    const res = await fetch(`${base}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jid: '123@g.us',
        text: 'Oi @Ana',
        mentions: ['5511999999999@s.whatsapp.net'],
        citar: 'ORIG-1',
      }),
    });
    expect(res.status).toBe(200);
    expect(texts).toEqual([
      {
        jid: '123@g.us',
        text: 'Oi @Ana',
        mentions: ['5511999999999@s.whatsapp.net'],
        quotedId: 'ORIG-1',
      },
    ]);
  });
});
