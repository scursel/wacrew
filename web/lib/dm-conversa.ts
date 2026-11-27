import { buildContacts, type Contacts } from './contacts';
import { listGroups } from './data';
import { slugCanonicoDm, slugsIrmaosDeDm } from './dm-irmaos';

export interface IrmaosDm {
  irmaos: string[];
  canonico: string;
}

/**
 * Resolve irmãos de DM (telefone × LID) a partir de contatos e slugs já
 * conhecidos. Grupo (não `dm-<dígitos>`) devolve só o próprio slug.
 */
export function resolverIrmaosDmDe(
  slug: string,
  contacts: Contacts,
  existentes: ReadonlySet<string>,
): IrmaosDm {
  if (!/^dm-\d+$/.test(slug)) return { irmaos: [slug], canonico: slug };
  const irmaos = slugsIrmaosDeDm(slug, contacts, existentes);
  return { irmaos, canonico: slugCanonicoDm(irmaos, contacts) || slug };
}

/**
 * Painel do dono: lê contatos + grupos no disco e resolve irmãos/canônico
 * da conversa. Use na página `/g/[slug]` e em `/api/messages` / `/api/history`.
 */
export async function resolverIrmaosDm(slug: string): Promise<IrmaosDm> {
  if (!/^dm-\d+$/.test(slug)) return { irmaos: [slug], canonico: slug };
  const [contacts, groups] = await Promise.all([buildContacts(), listGroups()]);
  return resolverIrmaosDmDe(slug, contacts, new Set(groups.map((g) => g.slug)));
}
