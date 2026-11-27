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
  let reconnectCalls = 0;
  let resetCalls = 0;
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
    async reconnect() {
      reconnectCalls += 1;
    },
    async resetSession() {
      resetCalls += 1;
    },
  } as unknown as WhatsAppGateway;
  return {
    gw,
    deleted,
    texts,
    getReconnectCalls: () => reconnectCalls,
    getResetCalls: () => resetCalls,
  };
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

  it('POST /reconnect e POST /reset-session delegam ao gateway', async () => {
    const { gw, getReconnectCalls, getResetCalls } = gatewayMock();
    const base = await subir(gw);

    const r1 = await fetch(`${base}/reconnect`, { method: 'POST' });
    expect(r1.status).toBe(200);
    expect(getReconnectCalls()).toBe(1);

    const r2 = await fetch(`${base}/reset-session`, { method: 'POST' });
    expect(r2.status).toBe(200);
    expect(getResetCalls()).toBe(1);
  });
});
