import type { Comando } from "@/lib/equipe/admin";
import type { UsuarioPublico } from "@/lib/equipe/usuarios";
import type { Departamento } from "@/lib/equipe/departamentos";

export interface DadosEquipe {
  usuarios: UsuarioPublico[];
  departamentos: Departamento[];
  nomeDono: string;
  donoAssinar: boolean;
}

/** Roda um comando da tela de equipe; devolve a resposta ou null se falhou (o erro já foi avisado). */
export type RodarComando = (c: Comando) => Promise<{ senhaGerada?: string } | null>;

export type { Comando, Departamento, UsuarioPublico };
