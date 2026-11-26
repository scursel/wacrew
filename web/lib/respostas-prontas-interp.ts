export interface RespostaPronta {
  id: string;
  atalho: string;
  titulo: string;
  texto: string;
}

/** Substitui {{nome}}, {{atendente}} e {{departamento}} (case-insensitive). */
export function interpolarResposta(
  texto: string,
  vars: { nome?: string; atendente?: string; departamento?: string },
): string {
  const map: Record<string, string> = {
    nome: (vars.nome ?? '').trim(),
    atendente: (vars.atendente ?? '').trim(),
    departamento: (vars.departamento ?? '').trim(),
  };
  return texto.replace(/\{\{\s*(nome|atendente|departamento)\s*\}\}/gi, (_, key: string) => {
    return map[key.toLowerCase()] ?? '';
  });
}
