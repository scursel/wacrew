import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./dm-conversa', () => ({ resolverIrmaosDm: vi.fn() }));
vi.mock('./data', () => ({ readGroupRecords: vi.fn() }));

import { POST } from '../app/api/history/route';
import { readGroupRecords } from './data';
import { resolverIrmaosDm } from './dm-conversa';

const slugTel = 'dm-5511987650001';
const slugLid = 'dm-40000000000001';

function pedido(body: unknown) {
  return new Request('http://localhost/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolverIrmaosDm).mockResolvedValue({
      irmaos: [slugTel, slugLid],
      canonico: slugTel,
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('recusa slug inválido com 400', async () => {
    const res = await POST(pedido({ slug: '../etc' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'slug inválido' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('monta âncora da mensagem mais antiga dos irmãos quando o corpo não traz', async () => {
    vi.mocked(readGroupRecords)
      .mockResolvedValueOnce([
        {
          id: 'nova',
          timestamp: '2026-09-10T12:00:00.000Z',
          group: 'x',
          groupJid: '5511987650001@s.whatsapp.net',
          sender: '5511987650001@s.whatsapp.net',
          senderName: 'A',
          fromMe: false,
          type: 'text',
          text: 'nova',
          quotedText: null,
          mediaPath: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'antiga',
          timestamp: '2026-09-01T08:00:00.000Z',
          group: 'x',
          groupJid: '40000000000001@lid',
          sender: '40000000000001@lid',
          senderName: 'A',
          fromMe: true,
          type: 'text',
          text: 'antiga',
          quotedText: null,
          mediaPath: null,
        },
      ]);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, requested: true, slug: slugTel, anchorId: 'antiga' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await POST(pedido({ slug: slugLid }));
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/history$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          slug: slugTel,
          anchor: {
            id: 'antiga',
            timestampMs: Date.parse('2026-09-01T08:00:00.000Z'),
            fromMe: true,
            sender: '40000000000001@lid',
          },
          jid: '40000000000001@lid',
        }),
      }),
    );
    expect(await res.json()).toMatchObject({ ok: true, requested: true });
  });

  it('repassa âncora e jid do corpo ao coletor no slug canônico', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, requested: true, slug: slugTel }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const anchor = {
      id: 'MSG1',
      timestampMs: 1_700_000_000_000,
      fromMe: false,
      sender: '5511987650001@s.whatsapp.net',
    };
    const res = await POST(
      pedido({
        slug: slugLid,
        jid: '5511987650001@s.whatsapp.net',
        count: 50,
        anchor,
      }),
    );
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/history$/),
      expect.objectContaining({
        body: JSON.stringify({
          slug: slugTel,
          anchor,
          jid: '5511987650001@s.whatsapp.net',
          count: 50,
        }),
      }),
    );
    expect(readGroupRecords).not.toHaveBeenCalled();
  });

  it('devolve 502 quando o coletor está fora do ar', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await POST(
      pedido({
        slug: slugTel,
        anchor: {
          id: 'MSG1',
          timestampMs: 1_700_000_000_000,
          fromMe: false,
          sender: '5511987650001@s.whatsapp.net',
        },
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'coletor fora do ar' });
  });
});
