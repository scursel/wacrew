import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { Reconciler } from './reconciler.js';

it('verifica DMs recentes além dos grupos e ignora duplicatas e DMs antigas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reconcile-dm-'));
  const now = Date.now();
  try {
    for (const slug of ['dm-5511999999999', 'dm-123456789012345', 'dm-5511888888888']) {
      await mkdir(join(dir, slug));
      await writeFile(
        join(dir, slug, 'messages.jsonl'),
        [
          JSON.stringify({
            id: 'old',
            timestamp: new Date(now - 10 * 3600000).toISOString(),
            groupJid: '5511999999999@s.whatsapp.net',
          }),
          JSON.stringify({
            id: 'new',
            timestamp: new Date(now).toISOString(),
            groupJid: '5511999999999@s.whatsapp.net',
          }),
        ].join('\n'),
      );
    }
    const old = new Date(now - 31 * 86400000);
    await utimes(join(dir, 'dm-5511888888888', 'messages.jsonl'), old, old);
    const fetchHistoryBefore = vi.fn().mockResolvedValue(true);
    const reconciler = new Reconciler({
      dataDir: dir,
      connected: () => true,
      refreshGroups: async () => {},
      lastActivityOf: () => null,
      watchedEntries: () => [{ id: 'group@g.us', slug: 'group' }],
      fetchHistoryBefore,
      phoneOf: (id) => (id === '123456789012345' ? '5511999999999' : null),
      avatarUrl: async () => null,
      saveAvatarDm: async () => false,
    });
    const result = await reconciler.tickNow('manual');
    reconciler.stop();
    expect(result.chatsVerificados).toBe(2);
    expect(result.pedidosBackfill).toBe(1);
    expect(fetchHistoryBefore).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net',
      expect.objectContaining({ id: 'new' }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
