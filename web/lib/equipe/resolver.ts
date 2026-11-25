import { slugsIrmaosDeDm } from '../dm-irmaos';
import { setResolved } from '../triage';
import { DONO, registrar } from './atribuicoes';
import { contatosDeIdentidade, slugsExistentes } from './identidade';
import { canonicoGlobal } from './quem';

/**
 * "Resolvido" pelo painel do dono (`/api/triage`): grava o corte em todos os lados da conversa
 * (DM partida em telefone × LID) e solta o responsável. `iso` vazio desfaz o resolvido e não mexe
 * no responsável. O corte é o que importa; falha ao soltar o responsável só loga.
 */
export async function resolverConversa(slug: string, iso: string): Promise<void> {
  const existentes = await slugsExistentes();
  const irmaos = existentes.has(slug) ? slugsIrmaosDeDm(slug, await contatosDeIdentidade(), existentes) : [slug];
  for (const s of irmaos.includes(slug) ? irmaos : [slug, ...irmaos]) await setResolved(s, iso);
  if (!iso) return;
  try {
    await registrar((await canonicoGlobal())(slug), { tipo: 'resolver', por: DONO });
  } catch (e) {
    console.error('[atribuição] não foi possível soltar o responsável', e);
  }
}
