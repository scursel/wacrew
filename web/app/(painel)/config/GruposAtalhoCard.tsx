"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCarregar } from "@/app/components/pedirJson";
import { Card, Icone } from "@/app/components/ui";
import type { GroupWithTags } from "@/lib/config";
import { ANCORA_CARD, type AoResumir } from "./secoes";

/** Atalho em Configurações para a tela de Gestão de grupos, com o estado de agora. */
export function GruposAtalhoCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados: grupos } = useCarregar<GroupWithTags[]>("/api/groups");
  const { dados: pessoas } = useCarregar<Array<{ role: "team" | "client" }>>("/api/team");

  const monitorados = grupos?.filter((g) => g.watch).length ?? 0;
  const noTime = pessoas?.filter((p) => p.role === "team").length ?? 0;
  useEffect(() => {
    if (grupos) aoResumir("grupos", { texto: `${monitorados}/${grupos.length}` });
  }, [aoResumir, grupos, monitorados]);

  return (
    <Card id="grupos" largura="inteiro" className={ANCORA_CARD} titulo="Gestão de grupos" icone={<Icone nome="users" />}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-[320px]">
          <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-fg-dim">
            Quais grupos o WACrew acompanha, quem é do seu time nesses grupos e a sincronização do histórico ficam numa
            tela própria.
          </p>
          {(grupos || pessoas) && (
            <p className="mt-2 text-[12.5px] text-fg-faint">
              {grupos && (
                <>
                  <span className="font-mono tabular-nums">{monitorados}</span> de{" "}
                  <span className="font-mono tabular-nums">{grupos.length}</span> grupos monitorados
                </>
              )}
              {grupos && pessoas && " · "}
              {pessoas && (
                <>
                  <span className="font-mono tabular-nums">{noTime}</span> {noTime === 1 ? "pessoa" : "pessoas"} no time
                </>
              )}
            </p>
          )}
        </div>
        <Link
          href="/config/grupos"
          className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-ink bg-ink px-3 text-[13px] font-medium text-on-ink transition-colors hover:bg-ink/85"
        >
          Abrir gestão de grupos
          <Icone nome="chev-r" tamanho={14} />
        </Link>
      </div>
    </Card>
  );
}
