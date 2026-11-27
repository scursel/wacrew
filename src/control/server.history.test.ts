import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import type { WhatsAppGateway } from '../core/ports.js';
import { startControlServer } from './server.js';

describe('POST /history', () => {
  const original = env.DATA_DIR;
  const dirs: string[] = [];
  const servers: import('node:http').Server[] = [];
  afterEach(async () => {
    env.DATA_DIR = original;
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });
  async function setup(connected = true) {
    const dir = await mkdtemp(join(tmpdir(), 'history-'));
    dirs.push(dir);
    env.DATA_DIR = dir;
    const fetchHistoryBefore = vi.fn().mockResolvedValue(connected);
    const gateway = {
      fetchHistoryBefore,
      checkNumber: vi.fn(),
    } as unknown as WhatsAppGateway;
    const server = startControlServer(gateway, 0, []);
    servers.push(server);
    await new Promise<void>((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (body: unknown) =>
      fetch(`${base}/history`, { method: 'POST', body: JSON.stringify(body) });
    return { dir, post, fetchHistoryBefore };
  }
  it('usa âncora explícita e limita count', async () => {
    const { post, fetchHistoryBefore } = await setup();
    const anchor = {
      id: 'A',
      timestampMs: 1700000000000,
      fromMe: false,
      sender: 'x',
    };
    const response = await post({ slug: 'dm-123', anchor, count: 200 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      requested: true,
      slug: 'dm-123',
      anchorId: 'A',
      anchorTimestamp: new Date(anchor.timestampMs).toISOString(),
    });
    expect(fetchHistoryBefore).toHaveBeenCalledWith('123@s.whatsapp.net', anchor, 100);
  });
  it('lê a âncora mais antiga e o JID do disco', async () => {
    const { dir, post, fetchHistoryBefore } = await setup();
    await mkdir(join(dir, 'grupo'));
    await writeFile(
      join(dir, 'grupo', 'messages.jsonl'),
      [
        JSON.stringify({
          id: 'new',
          timestamp: '2024-01-02T00:00:00Z',
          groupJid: 'new@g.us',
        }),
        JSON.stringify({
          id: 'old',
          timestamp: '2024-01-01T00:00:00Z',
          groupJid: 'old@g.us',
          sender: 'x',
        }),
      ].join('\n'),
    );
    const response = await post({ slug: 'grupo' });
    expect(response.status).toBe(200);
    expect(fetchHistoryBefore).toHaveBeenCalledWith(
      'old@g.us',
      expect.objectContaining({ id: 'old' }),
      50,
    );
  });
  it('rejeita slug inválido e trata desconexão', async () => {
    const { post } = await setup(false);
    expect((await post({ slug: '../x' })).status).toBe(400);
    const response = await post({
      slug: 'dm-123',
      anchor: { id: 'A', timestampMs: 1, fromMe: false, sender: '' },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'WhatsApp desconectado',
    });
  });
});
