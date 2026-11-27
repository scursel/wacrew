import { DONO } from './atribuicoes';
import { type Departamento, departamentosDe, lerConfigDono, lerDepartamentos, lerNomeDono } from './departamentos';
import { acharUsuario } from './usuarios';

/**
 * Assinatura de quem manda pelo painel: primeira linha `*Nome:*` e o texto
 * embaixo. É colada DEPOIS da revisão, que compara o texto sem ela.
 */
export function assinar(texto: string, nome: string): string {
  return texto ? `*${nome}:*\n${texto}` : `*${nome}:*`;
}

/** Mídia sem legenda ganha a assinatura como legenda; em vários balões, só o primeiro assina. */
export function assinarBaloes(baloes: string[], nome: string): string[] {
  return baloes.map((b, i) => (i === 0 ? assinar(b, nome) : b));
}

const ASSINATURA = /^\*[^*\n]{1,60}:\*\n?/;

export function semAssinatura(texto: string): string {
  return texto.replace(ASSINATURA, '');
}

function ehDono(usuario: string): boolean {
  return usuario === DONO || (Boolean(process.env.PANEL_USER) && usuario === process.env.PANEL_USER);
}

/** O usuário pertence a pelo menos um departamento? Sem departamento, não pode assinar. */
export async function usuarioTemDepartamento(usuario: string, deps?: Departamento[]): Promise<boolean> {
  const lista = deps ?? (await lerDepartamentos());
  const chave = ehDono(usuario) ? DONO : usuario;
  return departamentosDe(lista, chave).length > 0;
}

/** Nome/texto que assina o envio: do próprio usuário (ou do dono pelo painel). */
export async function nomeDeQuemEnvia(usuario: string, nomeDono: () => Promise<string> = lerNomeDono): Promise<string> {
  if (ehDono(usuario)) return nomeDono();
  const u = await acharUsuario(usuario);
  return u?.assinatura?.trim() || u?.nome || usuario;
}

/**
 * Só assina quando o usuário pertence a pelo menos um departamento E a assinatura
 * está ligada na conta dele (dono: desligada por padrão; atendente: ligada por padrão).
 */
export async function deveAssinar(usuario: string): Promise<boolean> {
  if (!(await usuarioTemDepartamento(usuario))) return false;
  if (ehDono(usuario)) return (await lerConfigDono()).assinarMensagens === true;
  const u = await acharUsuario(usuario);
  return u?.assinarMensagens !== false;
}
