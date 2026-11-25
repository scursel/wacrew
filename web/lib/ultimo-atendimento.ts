import { buildContacts, displayNameOf, numberFromJid, roleOf } from './contacts';
import { type MessageRecord, readGroupRecords } from './data';
import { acharUsuario } from './equipe/usuarios';
import { readTriage } from './triage';

export interface UltimoAtendimento {
  resolvidoEm: string;
  reabertoPorMensagem: string;
  atendente: string | null;
}

/** O corte mais recente entre os lados da conversa (DM partida em telefone × LID). */
function corteMaisRecente(slugs: readonly string[], cortes: Record<string, string>): { resolvidoEm: string; corte: number } {
  let resolvidoEm = '';
  let corte = -Infinity;
  for (const slug of slugs) {
    const data = cortes[slug];
    const ts = Date.parse(data ?? '');
    if (data && ts > corte) {
      resolvidoEm = data;
      corte = ts;
    }
  }
  return { resolvidoEm, corte };
}

/**
 * A conversa foi marcada como resolvida e o cliente não escreveu depois disso. É o que pinta
 * o botão Resolver de verde; a primeira mensagem do cliente depois do corte o volta ao amarelo.
 */
export async function estaResolvida(
  slugs: readonly string[],
  resolved?: Record<string, string>,
  registros?: readonly MessageRecord[],
): Promise<boolean> {
  const { resolvidoEm, corte } = corteMaisRecente(slugs, resolved ?? (await readTriage()).resolved);
  if (!resolvidoEm) return false;
  const [mensagens, contatos] = await Promise.all([
    registros ?? Promise.all(slugs.map(readGroupRecords)).then((listas) => listas.flat()),
    buildContacts(),
  ]);
  return !mensagens.some((m) => {
    if (m.fromMe || !m.sender || m.type === 'event') return false;
    const ts = Date.parse(m.timestamp);
    return Number.isFinite(ts) && ts > corte && roleOf(contatos, numberFromJid(m.sender)) === 'client';
  });
}

/** O corte de triagem é também a data de resolução registrada pelo painel. */
export async function ultimoAtendimento(
  slugs: readonly string[],
  resolved?: Record<string, string>,
  registros?: readonly MessageRecord[],
): Promise<UltimoAtendimento | null> {
  const { resolvidoEm, corte } = corteMaisRecente(slugs, resolved ?? (await readTriage()).resolved);
  if (!resolvidoEm) return null;

  const [mensagens, contatos] = await Promise.all([
    registros ?? Promise.all(slugs.map(readGroupRecords)).then((listas) => listas.flat()),
    buildContacts(),
  ]);
  let reabertura: MessageRecord | undefined;
  let resposta: MessageRecord | undefined;
  let primeiraEntrada = Infinity;
  let ultimaResposta = -Infinity;
  for (const m of mensagens) {
    const ts = Date.parse(m.timestamp);
    if (!Number.isFinite(ts) || !m.sender || m.type === 'event') continue;
    const papel = m.fromMe ? 'me' : roleOf(contatos, numberFromJid(m.sender));
    if (ts > corte && papel === 'client' && ts < primeiraEntrada) {
      primeiraEntrada = ts;
      reabertura = m;
    }
    if (ts <= corte && papel !== 'client' && ts >= ultimaResposta) {
      ultimaResposta = ts;
      resposta = m;
    }
  }
  if (!reabertura) return null;

  let atendente: string | null = null;
  if (resposta?.fromMe && resposta.ator === 'painel') {
    const login = resposta.usuario?.trim();
    atendente = login ? (await acharUsuario(login))?.nome || login : 'Operador do painel';
  } else if (resposta?.fromMe && resposta.origem === 'ia_meta') {
    atendente = 'IA da Meta';
  } else if (resposta?.fromMe && (resposta.origem === 'celular' || resposta.origem === 'web')) {
    atendente = 'Titular da conta do WhatsApp';
  } else if (resposta && !resposta.fromMe) {
    atendente = displayNameOf(contatos, resposta.senderName, numberFromJid(resposta.sender));
  }
  return { resolvidoEm, reabertoPorMensagem: reabertura.id, atendente };
}
