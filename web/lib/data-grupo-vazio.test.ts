import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// DATA_DIR e GROUPS_CONFIG são lidos no import de ./paths: o ambiente vem antes do import.
let tmp: string;
let data: typeof import('./data');

const msg = (id: string, ts: string) =>
  `${JSON.stringify({ id, groupJid: '9@g.us', group: 'Antigo', sender: '5511999990000@s.whatsapp.net', senderName: 'Carla', fromMe: false, timestamp: ts, type: 'text', text: 'oi' })}\n`;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-grupo-vazio-'));
  const dir = join(tmp, 'data');
  await mkdir(join(dir, 'antigo'), { recursive: true });
  await writeFile(join(dir, 'antigo', 'messages.jsonl'), msg('a1', '2026-11-20T10:00:00.000Z'));
  // Pasta criada pelo coletor ao ligar a captura (só a foto, nenhuma mensagem ainda).
  await mkdir(join(dir, 'familia'), { recursive: true });
  const ligadaEm = new Date('2026-11-28T13:07:00.000Z');
  await utimes(join(dir, 'familia'), ligadaEm, ligadaEm);
  await writeFile(
    join(tmp, 'groups.config.json'),
    JSON.stringify([
      { id: '9@g.us', name: 'Antigo', watch: true, slug: 'antigo' },
      { id: '1@g.us', name: 'Família ®', watch: true, slug: 'familia' },
      { id: '2@g.us', name: 'Sem pasta', watch: true },
      { id: '3@g.us', name: 'Desligado', watch: false, slug: 'desligado' },
    ]),
  );
  process.env.WAC_DATA_DIR = dir;
  process.env.WAC_GROUPS_CONFIG = join(tmp, 'groups.config.json');
  data = await import('./data');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

describe('listGroups: grupo com captura ligada e ainda sem mensagem', () => {
  it('aparece na lista com a hora em que a captura começou, antes das conversas mais antigas', async () => {
    const lista = await data.listGroups();
    expect(lista.map((g) => g.slug)).toEqual(['familia', 'antigo', 'sem-pasta']);
    const familia = lista[0]!;
    expect(familia).toMatchObject({
      name: 'Família ®',
      messageCount: 0,
      lastTimestamp: null,
      unread: 0,
      capturaDesde: '2026-11-28T13:07:00.000Z',
      jid: '1@g.us',
    });
    expect(familia.lastPreview).toMatch(/ainda sem mensagens/i);
    // Sem pasta (grupo sem foto) não há hora de início confiável: aparece, no fim.
    expect(lista.at(-1)).toMatchObject({ slug: 'sem-pasta', name: 'Sem pasta', capturaDesde: null });
  });

  it('grupo com captura desligada continua fora; conversa com mensagem não muda', async () => {
    const lista = await data.listGroups();
    expect(lista.some((g) => g.slug === 'desligado')).toBe(false);
    const antigo = lista.find((g) => g.slug === 'antigo')!;
    expect(antigo.messageCount).toBe(1);
    expect(antigo.capturaDesde ?? null).toBeNull();
  });
});
