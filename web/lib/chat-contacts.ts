/**
 * Contatos da conversa aberta no painel (mapa leve só com o que a Timeline
 * já carregou). Separado do índice global em `contacts.ts` porque aqui o
 * browser monta o mapa a partir das mensagens da tela — e a citação traz LID
 * que não aparece em `sender` das msgs fromMe (que usam o telefone).
 */

export type ChatContacts = {
  names: Map<string, string>;
  mine: Set<string>;
  team: Set<string>;
};

/** user-part de um jid: 250...@lid -> 250..., 55..:12@s.. -> 55.. */
export function numberFromJid(jid: string): string {
  return (jid.split("@")[0] ?? "").split(":")[0] ?? "";
}

/**
 * true se parece id cru, não um nome: só dígitos (LID/telefone), telefone formatado
 * ("+55 (11) 99999-9999") ou jid inteiro ("2778...@lid").
 */
export function looksLikeRawId(s: string): boolean {
  const t = s.trim();
  if (/^[\d:]+@[\w.]+$/.test(t)) return true;
  return /^[+\d\s().-]+$/.test(t) && t.replace(/\D/g, "").length >= 6;
}

/** Nome que dá pra mostrar: não vazio, não "Você" e não id cru. */
export function isDisplayName(s: string | null | undefined): s is string {
  return !!s?.trim() && s.trim() !== "Você" && !looksLikeRawId(s);
}

type MsgParaContatos = {
  id: string;
  sender: string;
  senderName: string;
  fromMe?: boolean;
  quotedId?: string | null;
  quotedSender?: string | null;
};

/**
 * Monta o mapa id→nome / mine a partir das mensagens da conversa.
 * Quando uma msg cita outra (`quotedId` + `quotedSender`), o LID do
 * `quotedSender` herda o autor da original — é o que faz a barra de citação
 * mostrar "você" / nome em vez do número do LID.
 */
export function contactsFromMessages(
  messages: ReadonlyArray<MsgParaContatos>,
  team: Set<string> = new Set(),
): ChatContacts {
  const names = new Map<string, string>();
  const mine = new Set<string>();
  const byId = new Map(messages.map((m) => [m.id, m]));

  for (const m of messages) {
    const num = numberFromJid(m.sender);
    if (!num) continue;
    // O 1º nome visto fica, mas um id cru (telefone no lugar do nome) dá lugar ao nome real.
    const atual = names.get(num);
    if (atual === undefined || (!isDisplayName(atual) && isDisplayName(m.senderName))) names.set(num, m.senderName);
    if (m.fromMe === true) mine.add(num);
  }

  for (const m of messages) {
    if (!m.quotedSender || !m.quotedId) continue;
    const orig = byId.get(m.quotedId);
    if (!orig) continue;
    const qNum = numberFromJid(m.quotedSender);
    if (!qNum) continue;
    if (orig.fromMe === true) {
      mine.add(qNum);
      continue;
    }
    if (isDisplayName(orig.senderName)) {
      names.set(qNum, orig.senderName.trim());
      continue;
    }
    const origNum = numberFromJid(orig.sender);
    const known = origNum ? names.get(origNum) : undefined;
    if (isDisplayName(known)) names.set(qNum, known.trim());
  }

  return { names, mine, team };
}

/** Resolve um jid para nome de exibição. Nunca devolve LID/telefone cru. */
export function senderLabel(jid: string | null | undefined, contacts: ChatContacts): string | null {
  if (!jid) return null;
  const num = numberFromJid(jid);
  if (!num) return null;
  if (contacts.mine.has(num)) return "você";
  const name = contacts.names.get(num);
  return isDisplayName(name) ? name.trim() : null;
}
