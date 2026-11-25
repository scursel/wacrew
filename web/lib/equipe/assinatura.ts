import { lerNomeDono } from './departamentos';
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

/** Nome que assina o envio: o dono pelo painel não é conta de `usuarios.json`. */
export async function nomeDeQuemEnvia(usuario: string, nomeDono: () => Promise<string> = lerNomeDono): Promise<string> {
  if (usuario === process.env.PANEL_USER) return nomeDono();
  const u = await acharUsuario(usuario);
  return u?.nome || usuario;
}
