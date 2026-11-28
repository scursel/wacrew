import { conversasDaRequisicao } from "@/lib/caixa-dados";
import { quemNoPainel } from "@/lib/equipe/quem";
import { acharUsuario } from "@/lib/equipe/usuarios";
import { CommandPalette } from "../components/CommandPalette";
import { ProvedorTempoReal } from "../components/TempoRealProvider";
import { Trilho } from "../components/Trilho";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const groups = await conversasDaRequisicao();
  const usuario = await nomeNoMenu();
  return (
    <ProvedorTempoReal>
      {/* Desktop: trilho | conteúdo. Celular: conteúdo em cima, trilho vira barra embaixo. */}
      <div className="relative flex h-dvh overflow-hidden max-[860px]:flex-col-reverse">
        <Trilho groups={groups} usuario={usuario} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <CommandPalette groups={groups} />
    </ProvedorTempoReal>
  );
}

/** Nome no menu da conta: o do dono ou o da conta com acesso de administrador que entrou. */
async function nomeNoMenu(): Promise<string> {
  const dono = process.env.PANEL_USER?.trim() || "você";
  const quem = await quemNoPainel().catch(() => null);
  if (!quem?.admin) return dono;
  return (await acharUsuario(quem.login))?.nome || quem.login;
}
