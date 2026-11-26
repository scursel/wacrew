export type EstadoPresencaInterna = 'vendo' | 'digitando' | 'saindo';

export interface PresencaAgente {
  login: string;
  nome: string;
  estado: 'vendo' | 'digitando';
  atualizadoEm: number;
}

const TTL_MS = 15_000;
const salas = new Map<string, Map<string, PresencaAgente>>();

export function atualizarPresencaInterna(
  slug: string,
  user: { login: string; nome: string },
  estado: EstadoPresencaInterna,
  agoraMs: number = Date.now(),
): PresencaAgente[] {
  let sala = salas.get(slug);
  if (!sala) {
    sala = new Map();
    salas.set(slug, sala);
  }
  if (estado === 'saindo') {
    sala.delete(user.login);
  } else {
    sala.set(user.login, {
      login: user.login,
      nome: user.nome,
      estado,
      atualizadoEm: agoraMs,
    });
  }

  for (const [k, v] of sala.entries()) {
    if (agoraMs - v.atualizadoEm > TTL_MS) sala.delete(k);
  }
  if (sala.size === 0) salas.delete(slug);

  const outros: PresencaAgente[] = [];
  for (const v of sala.values()) {
    if (v.login !== user.login) outros.push(v);
  }
  return outros;
}

export function limparPresencaInterna(): void {
  salas.clear();
}
