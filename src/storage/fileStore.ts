import { createWriteStream } from 'node:fs';
import { access, appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  CallRecord,
  DeleteRecord,
  EditRecord,
  MediaKind,
  MessageRecord,
  PollRecord,
  PollVoteRecord,
  ReactionRecord,
  ReceiptRecord,
} from '../core/message.js';
import type { MessageStore } from '../core/ports.js';

const MAX_SEEN_IDS_PER_GROUP = 50_000;

/** Persiste conteúdo em disco, organizado por grupo. */
export class FileStore implements MessageStore {
  private readonly seenByGroup = new Map<string, Promise<Set<string>>>();

  constructor(private readonly dataDir: string) {}

  private groupDir(slug: string): string {
    return join(this.dataDir, slug);
  }

  private getSeenIds(groupSlug: string): Promise<Set<string>> {
    const cached = this.seenByGroup.get(groupSlug);
    if (cached) return cached;
    const loading = (async () => {
      const seen = new Set<string>();
      try {
        const raw = await readFile(join(this.groupDir(groupSlug), 'messages.jsonl'), 'utf8');
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as { id?: unknown };
            if (typeof parsed.id === 'string' && parsed.id) {
              seen.add(parsed.id);
              if (seen.size > MAX_SEEN_IDS_PER_GROUP) {
                const oldest = seen.values().next().value;
                if (oldest !== undefined) seen.delete(oldest);
              }
            }
          } catch {
            // linha corrompida — ignora
          }
        }
      } catch {
        // arquivo ainda não existe
      }
      return seen;
    })();
    this.seenByGroup.set(groupSlug, loading);
    return loading;
  }

  async hasMedia(groupSlug: string, kind: MediaKind, fileName: string): Promise<boolean> {
    try {
      await access(join(this.groupDir(groupSlug), kind, fileName));
      return true;
    } catch {
      return false;
    }
  }

  async saveMedia(
    groupSlug: string,
    kind: MediaKind,
    fileName: string,
    data: Readable,
  ): Promise<string> {
    const dir = join(this.groupDir(groupSlug), kind);
    await mkdir(dir, { recursive: true });
    const fullPath = join(dir, fileName);
    await pipeline(data, createWriteStream(fullPath));
    // Caminho relativo a DATA_DIR (com separador '/' para ser portável no jsonl).
    return `${groupSlug}/${kind}/${fileName}`;
  }

  async saveRecord(groupSlug: string, record: MessageRecord): Promise<void> {
    const seen = await this.getSeenIds(groupSlug);
    if (record.id && seen.has(record.id)) return;
    if (record.id) {
      seen.add(record.id);
      if (seen.size > MAX_SEEN_IDS_PER_GROUP) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
    }
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'messages.jsonl'), `${JSON.stringify(record)}\n`, 'utf8');
    await appendFile(join(dir, 'log.md'), this.renderMarkdown(record), 'utf8');
  }

  async saveReaction(groupSlug: string, reaction: ReactionRecord): Promise<void> {
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'reactions.jsonl'), `${JSON.stringify(reaction)}\n`, 'utf8');
  }

  async saveReceipt(groupSlug: string, receipt: ReceiptRecord): Promise<void> {
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'receipts.jsonl'), `${JSON.stringify(receipt)}\n`, 'utf8');
  }

  async savePoll(groupSlug: string, poll: PollRecord): Promise<void> {
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'polls.jsonl'), `${JSON.stringify(poll)}\n`, 'utf8');
  }

  async savePollVote(groupSlug: string, vote: PollVoteRecord): Promise<void> {
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'poll-votes.jsonl'), `${JSON.stringify(vote)}\n`, 'utf8');
  }

  async saveCall(groupSlug: string, call: CallRecord): Promise<void> {
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'calls.jsonl'), `${JSON.stringify(call)}\n`, 'utf8');
  }

  async saveEdit(groupSlug: string, edit: EditRecord): Promise<void> {
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'edits.jsonl'), `${JSON.stringify(edit)}\n`, 'utf8');
  }

  async saveDelete(groupSlug: string, del: DeleteRecord): Promise<void> {
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'deletes.jsonl'), `${JSON.stringify(del)}\n`, 'utf8');
  }

  /** Foto do grupo: cache sobrescrito a cada refresh em <slug>/avatar.jpg. */
  async saveAvatar(groupSlug: string, data: Readable): Promise<void> {
    const dir = this.groupDir(groupSlug);
    await mkdir(dir, { recursive: true });
    await pipeline(data, createWriteStream(join(dir, 'avatar.jpg')));
  }

  /** Bloco legível por humano/IA para o log.md cronológico. */
  private renderMarkdown(r: MessageRecord): string {
    const head = `- **${r.timestamp}** · _${r.senderName}_ · \`${r.type}\``;
    const quoted = r.quotedText ? `\n  > ${r.quotedText.replace(/\n/g, '\n  > ')}` : '';
    const body = r.text ? `\n  ${r.text.replace(/\n/g, '\n  ')}` : '';
    const media = r.mediaPath ? `\n  📎 \`${r.mediaPath}\`` : '';
    return `${head}${quoted}${body}${media}\n`;
  }
}
