/**
 * Texto de um delta. Alguns combos do 9router mandam `content` como lista de partes
 * (`thinking` + `text`) em vez de string: só as partes de texto vão para a tela.
 */
export function textoDoDelta(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p) => (p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' ? (p as { text?: unknown }).text : ''))
    .filter((t): t is string => typeof t === 'string')
    .join('');
}

/** Nenhuma mensagem de erro ou log pode carregar a chave do provedor. */
export function semChave(msg: string, chave: string): string {
  return chave ? msg.split(chave).join('••••') : msg;
}
