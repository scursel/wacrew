import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MessageRecord } from '../core/message.js';
import { FileStore } from './fileStore.js';

let dataDir: string;

function makeRecord(id: string, text = 'oi'): MessageRecord {
  return {
    id,
    timestamp: '2026-11-26T12:00:00.000Z',
    group: 'Teste',
    groupJid: '123@g.us',
    sender: '5511999999999@s.whatsapp.net',
    senderName: 'Cliente',
    fromMe: false,
    type: 'text',
    text,
    quotedText: null,
    quotedSender: null,
    mediaPath: null,
  };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'wac-filestore-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('FileStore dedup na escrita', () => {
  it('ignora record.id repetido na mesma instância (inclusive em chamadas concorrentes)', async () => {
    const store = new FileStore(dataDir);
    await Promise.all([
      store.saveRecord('teste', makeRecord('msg-1', 'primeira')),
      store.saveRecord('teste', makeRecord('msg-1', 'duplicada')),
    ]);
    await store.saveRecord('teste', makeRecord('msg-1', 'terceira'));
    await store.saveRecord('teste', makeRecord('msg-2', 'segunda'));

    const lines = (await readFile(join(dataDir, 'teste', 'messages.jsonl'), 'utf8'))
      .trim()
      .split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '{}').id).toBe('msg-1');
    expect(JSON.parse(lines[1] ?? '{}').id).toBe('msg-2');
  });

  it('deduplica após reiniciar (nova instância lê messages.jsonl existente)', async () => {
    const store1 = new FileStore(dataDir);
    await store1.saveRecord('teste', makeRecord('msg-a', 'antes do restart'));

    const store2 = new FileStore(dataDir);
    await store2.saveRecord('teste', makeRecord('msg-a', 'history sync pós-restart'));
    await store2.saveRecord('teste', makeRecord('msg-b', 'mensagem nova'));

    const lines = (await readFile(join(dataDir, 'teste', 'messages.jsonl'), 'utf8'))
      .trim()
      .split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => JSON.parse(l).id)).toEqual(['msg-a', 'msg-b']);
  });
});
