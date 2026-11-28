import type { PresencaAgente } from './equipe/presenca-interna';

/** Lista em português: "Ana", "Ana e Bruno", "Ana, Bruno e Carla". */
function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * A linha de presença da equipe acima do compositor. Quem está digitando tem
 * prioridade sobre quem só está olhando, e o "também" marca que o leitor já
 * está nesta conversa — por isso o texto não repete "visualizando esta conversa".
 */
export function frasePresencaEquipe(agentes: PresencaAgente[]): string | null {
  if (!agentes.length) return null;
  const digitando = agentes.filter((a) => a.estado === 'digitando').map((a) => a.nome);
  if (digitando.length) {
    const nomes = juntar(digitando);
    return `${nomes} ${digitando.length === 1 ? 'está' : 'estão'} digitando…`;
  }
  const nomes = juntar(agentes.map((a) => a.nome));
  return `${nomes} também ${agentes.length === 1 ? 'está' : 'estão'} nesta conversa`;
}
