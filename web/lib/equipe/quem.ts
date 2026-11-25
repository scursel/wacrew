import { cookies } from 'next/headers';
import { slugsIrmaosDeDm } from '../dm-irmaos';
import { ErroHttp, slugCanonico } from './acesso';
import { DONO, registrar } from './atribuicoes';
import { credenciaisDoDono, quemPelaSessao } from './autenticar';
import { lerNomeDono } from './departamentos';
import { contatosDeIdentidade, slugsExistentes } from './identidade';
import { chaveDeSessao, SESSION_COOKIE } from './sessao';
import { acharUsuario } from './usuarios';

export interface QuemAtende {
  id: string;
  nome: string;
  papel: 'dono' | 'atendente';
}

export async function quemAtendeDoPedido(): Promise<QuemAtende> {
  const cred = credenciaisDoDono();
  const chave = chaveDeSessao();
  if (!cred || !chave) throw new ErroHttp(401, 'Autenticação necessária.');
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const quem = await quemPelaSessao(token, cred, acharUsuario, chave);
  if (!quem) throw new ErroHttp(401, 'Autenticação necessária.');
  if (quem.papel === 'dono') return { id: DONO, nome: await lerNomeDono(), papel: 'dono' };
  const usuario = await acharUsuario(quem.login);
  if (!usuario || !usuario.ativo) throw new ErroHttp(401, 'Autenticação necessária.');
  return { id: usuario.login, nome: usuario.nome, papel: 'atendente' };
}

export async function canonicoGlobal(): Promise<(slug: string) => string> {
  const [existentes, contatos] = await Promise.all([slugsExistentes(), contatosDeIdentidade()]);
  return (slug) => slugCanonico(slugsIrmaosDeDm(slug, contatos, existentes), contatos);
}

/** O envio já aconteceu: erro na atribuição não pode transformá-lo em falha. */
export async function registrarResposta(slug: string, por: string): Promise<void> {
  try {
    await registrar((await canonicoGlobal())(slug), { tipo: 'responder', por });
  } catch (e) {
    console.error('[atribuição] não foi possível registrar resposta', e);
  }
}
