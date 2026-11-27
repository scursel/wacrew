import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Contacts } from '../contacts';
import { slugCanonicoDm, slugsIrmaosDeDm } from '../dm-irmaos';
import { credenciaisDoDono } from './autenticar';
import { lerAtribuicoes } from './atribuicoes';
import { departamentosDe, lerDepartamentos } from './departamentos';
import { contatosDeIdentidade, slugsExistentes } from './identidade';
import { chaveDeSessao, lerSessao, SESSION_COOKIE } from './sessao';
import { acharUsuario, type Usuario } from './usuarios';

export class ErroHttp extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface Atendente {
  usuario: Usuario;
  /** Slugs liberados já com os irmãos de DM (telefone × LID). */
  chats: Set<string>;
}

/** O WhatsApp às vezes parte o privado da mesma pessoa em telefone e LID: os dois valem. */
export function chatsEfetivos(chats: string[], c: Contacts, existentes: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const slug of chats) for (const s of slugsIrmaosDeDm(slug, c, existentes)) out.add(s);
  for (const slug of chats) out.add(slug);
  return out;
}

/** Slugs da mesma conversa (DM partida em telefone × LID) que o atendente pode ver, o próprio incluído. */
export function irmaosPermitidos(
  chats: ReadonlySet<string>,
  slug: string,
  c: Contacts,
  existentes: ReadonlySet<string>,
): string[] {
  const out = slugsIrmaosDeDm(slug, c, existentes).filter((s) => s === slug || chats.has(s));
  return out.includes(slug) ? out : [slug, ...out];
}

export const slugCanonico = slugCanonicoDm;

/** Atendente vê todas as conversas existentes; `Usuario.chats` fica no arquivo, sem leitura. */
export async function atendentePeloToken(token: string | undefined): Promise<Atendente | null> {
  const cred = credenciaisDoDono();
  const chave = chaveDeSessao();
  if (!cred || !chave || !token) return null;
  const s = lerSessao(token, chave);
  if (!s || s.p !== 'atendente') return null;
  const usuario = await acharUsuario(s.u);
  if (!usuario || !usuario.ativo || usuario.versao !== s.v) return null;
  const todos = await slugsExistentes();
  if (!usuario.restringirDepartamentos) {
    return { usuario, chats: new Set(todos) };
  }
  const [deptos, atribuicoes, contatos] = await Promise.all([
    lerDepartamentos(),
    lerAtribuicoes(),
    contatosDeIdentidade(),
  ]);
  const meus = new Set(departamentosDe(deptos, usuario.login));
  const permitidos = new Set<string>();
  for (const slug of todos) {
    const canonico = /^dm-\d+$/.test(slug) ? slugCanonico(slugsIrmaosDeDm(slug, contatos, todos), contatos) : slug;
    const atrib = atribuicoes[canonico];
    if (atrib?.responsavel === usuario.login || (atrib?.departamento && meus.has(atrib.departamento))) {
      permitidos.add(slug);
    }
  }
  return { usuario, chats: permitidos };
}

/**
 * Rotas da área revalidam a sessão por conta própria (não confiam só no
 * proxy). O cookie sai de `cookies()`, o mesmo leitor do proxy e das páginas.
 */
export async function atendenteDoPedido(): Promise<Atendente> {
  const a = await atendentePeloToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!a) throw new ErroHttp(401, 'Autenticação necessária.');
  return a;
}

/** Layout e página da mesma renderização dividem a mesma checagem. */
export const atendenteDaPagina = cache(async (): Promise<Atendente | null> => {
  return atendentePeloToken((await cookies()).get(SESSION_COOKIE)?.value);
});

/** `irmaosPermitidos` com contatos e diretórios do coletor (em cache); grupo não paga a leitura. */
export async function irmaosLiberados(a: Atendente, slug: string): Promise<string[]> {
  if (!/^dm-\d+$/.test(slug)) return [slug];
  return irmaosPermitidos(a.chats, slug, await contatosDeIdentidade(), await slugsExistentes());
}

/** Chat fora da lista responde como inexistente. */
export function exigirChat(a: Atendente, slug: string): void {
  if (!a.chats.has(slug)) throw new ErroHttp(404, 'não encontrado');
}

export function respostaDeErro(e: unknown): Response {
  if (e instanceof ErroHttp) return Response.json({ error: e.message }, { status: e.status });
  console.error('[atendimento]', e);
  return Response.json({ error: 'erro interno' }, { status: 500 });
}

/** Slug canônico de cada chat liberado (agrupa a DM partida na lista e no aguardando). */
export async function canonicoDoAtendente(a: Atendente): Promise<(slug: string) => string> {
  if (![...a.chats].some((s) => s.startsWith('dm-'))) return (s) => s;
  const [c, existentes] = await Promise.all([contatosDeIdentidade(), slugsExistentes()]);
  return (slug) => (/^dm-\d+$/.test(slug) ? slugCanonico(irmaosPermitidos(a.chats, slug, c, existentes), c) : slug);
}
