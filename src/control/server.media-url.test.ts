import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutboundMedia } from '../core/message.js';
import type { WhatsAppGateway } from '../core/ports.js';
import { startControlServer } from './server.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const servers: import('node:http').Server[] = [];

function gatewayMock() {
  const sentMedia: Array<{ jid: string; media: OutboundMedia }> = [];
  const pairingCalls: string[] = [];
  const gw = {
    async checkNumber(n: string) {
      if (n === '5544991111111') return { exists: true, jid: '554491111111@s.whatsapp.net' };
      if (n === '5511000000000') return { exists: false, jid: null };
      return { exists: true, jid: `${n}@s.whatsapp.net` };
    },
    async sendMedia(jid: string, media: OutboundMedia) {
      sentMedia.push({ jid, media });
    },
    async requestPairingCode(number: string) {
      pairingCalls.push(number);
      return 'ABCD1234';
    },
  } as unknown as WhatsAppGateway;
  return { gw, sentMedia, pairingCalls };
}

async function subir(gw: WhatsAppGateway): Promise<string> {
  const server = startControlServer(gw, 0, []);
  servers.push(server);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
});

describe('control /send-media-url e /pair-code', () => {
  it('aceita video, gif e audio e resolve o JID canônico (9º dígito)', async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('https://cdn.example.com/')) {
        return Promise.resolve(
          new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: { 'content-length': '4' },
          }),
        );
      }
      return realFetch(input, init);
    });

    const { gw, sentMedia } = gatewayMock();
    const base = await subir(gw);

    for (const kind of ['video', 'gif', 'audio'] as const) {
      const res = await realFetch(`${base}/send-media-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jid: '5544991111111@s.whatsapp.net',
          url: `https://cdn.example.com/media.${kind}`,
          kind,
          caption: 'legenda',
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; jid: string; jid_corrigido_de?: string };
      expect(body).toEqual({
        ok: true,
        jid: '554491111111@s.whatsapp.net',
        jid_corrigido_de: '5544991111111@s.whatsapp.net',
      });
    }

    expect(sentMedia.map((s) => s.media.kind)).toEqual(['video', 'gif', 'audio']);
    expect(sentMedia.every((s) => s.jid === '554491111111@s.whatsapp.net')).toBe(true);
  });

  it('rejeita número inexistente com 400 no /send-media-url', async () => {
    const { gw, sentMedia } = gatewayMock();
    const base = await subir(gw);

    const res = await fetch(`${base}/send-media-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jid: '5511000000000@s.whatsapp.net',
        url: 'https://cdn.example.com/video.mp4',
        kind: 'video',
      }),
    });
    expect(res.status).toBe(400);
    expect(sentMedia).toHaveLength(0);
  });

  it('/pair-code valida number e delega ao gateway.requestPairingCode', async () => {
    const { gw, pairingCalls } = gatewayMock();
    const base = await subir(gw);

    const bad = await fetch(`${base}/pair-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ number: 'abc' }),
    });
    expect(bad.status).toBe(400);

    const ok = await fetch(`${base}/pair-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ number: '+55 (11) 99999-9999' }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, code: 'ABCD1234' });
    expect(pairingCalls).toEqual(['5511999999999']);
  });
});
