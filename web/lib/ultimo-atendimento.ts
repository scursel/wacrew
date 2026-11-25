import { buildContacts, displayNameOf, numberFromJid, roleOf } from './contacts';
import { type MessageRecord, readGroupRecords } from './data';
import { acharUsuario } from './equipe/usuarios';
import { readTriage } from './triage';

export interface UltimoAtendimento {
  resolvidoEm: string;
  reabertoPorMensagem: string;
  atendente: string | null;
}

/** O corte de triagem é também a data de resolução registrada pelo painel. */
export async function ultimoAtendimento(
  slugs: readonly string[],
  resolved?: Record<string, string>,
  registros?: readonly MessageRecord[],
): Promise<UltimoAtendimento | null> {
  const cortes = resolved ?? (await readTriage()).resolved;
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
