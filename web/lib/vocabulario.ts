/**
 * Vocabulário unificado do painel (alinhado ao fluxo de atendimento em equipe).
 */
export const ROTULOS = {
  conversa: 'Conversa',
  conversas: 'Conversas',
  caixaEntrada: 'Caixa de entrada',
  atendente: 'Atendente',
  atendentes: 'Atendentes',
  etiqueta: 'Etiqueta',
  etiquetas: 'Etiquetas',
  notaPrivada: 'Nota privada',
  respostaPronta: 'Resposta pronta',
  adiar: 'Adiar',
  resolver: 'Resolver',
  reabrir: 'Reabrir',
  horarioComercial: 'Horário comercial',
  canalWhatsApp: 'Canal WhatsApp',
} as const;

export function plural(n: number, singular: string, pluralForma: string): string {
  return n === 1 ? singular : pluralForma;
}
