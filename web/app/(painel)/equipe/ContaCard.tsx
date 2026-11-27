"use client";

import { useState } from "react";
import { haQuanto } from "@/app/components/tempo";
import { Avatar, Badge, BotaoConfirmar, Button, Card, Field, Input, Pares } from "@/app/components/ui";
import { instanteLongo } from "@/lib/formatar-data";
import type { Departamento, RodarComando, UsuarioPublico } from "./tipos";

/** Uma conta da equipe: dados, nome, senha, ativar/desativar e apagar. */
export function ContaCard({
  conta,
  departamentos,
  rodar,
  aoSenhaNova,
}: {
  conta: UsuarioPublico;
  departamentos: Departamento[];
  rodar: RodarComando;
  aoSenhaNova: (senha: string) => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [assinaturaTexto, setAssinaturaTexto] = useState(conta.assinatura ?? "");
  type CampoOcupado = "nome" | "ativo" | "assinatura" | "assinaturaTexto" | "restringir" | "copiloto";
  const [ocupado, setOcupado] = useState<CampoOcupado | null>(null);
  const depsDaConta = departamentos.filter((d) => d.membros.includes(conta.login));
  const temDepartamento = depsDaConta.length > 0;
  const rotuloAssinatura = (assinaturaTexto.trim() || conta.nome);

  async function comOcupado(qual: CampoOcupado, fn: () => Promise<void>) {
    setOcupado(qual);
    try {
      await fn();
    } finally {
      setOcupado(null);
    }
  }

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault();
    await comOcupado("nome", async () => {
      if (await rodar({ acao: "editar", login: conta.login, nome: nome.trim() })) setRenomeando(false);
    });
  }

  return (
    <Card
      id="conta"
      titulo={conta.nome}
      icone={<Avatar nome={conta.nome} tipo="dm" tamanho="xs" />}
      meta={`@${conta.login}`}
      acoes={
        <Badge variant={conta.ativo ? "ok" : "neutral"} dot>
          {conta.ativo ? "Ativa" : "Desativada"}
        </Badge>
      }
    >
      {renomeando ? (
        <form onSubmit={(e) => void salvarNome(e)} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Field label="Nome" htmlFor="conta-nome">
              <Input
                id="conta-nome"
                // biome-ignore lint/a11y/noAutofocus: o campo só aparece depois do clique em Renomear
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </Field>
          </div>
          <Button type="submit" loading={ocupado === "nome"} disabled={!nome.trim()}>
            Salvar nome
          </Button>
          <Button variant="ghost" onClick={() => setRenomeando(false)}>
            Cancelar
          </Button>
        </form>
      ) : null}

      <Pares
        itens={[
          {
            rotulo: "Último acesso",
            valor: conta.ultimoAcesso ? <span title={instanteLongo(conta.ultimoAcesso)}>{haQuanto(conta.ultimoAcesso)}</span> : "Nunca entrou",
          },
          { rotulo: "Criada em", valor: <span className="font-mono tabular-nums">{instanteLongo(conta.criadoEm)}</span> },
          { rotulo: "Departamentos", valor: depsDaConta.map((d) => d.nome).join(", ") || "Nenhum" },
          {
            rotulo: "Acesso",
            valor: !conta.ativo
              ? "Bloqueado até você ativar de novo"
              : conta.restringirDepartamentos
                ? "Restrito aos seus departamentos e atribuídas"
                : "Entra e vê todas as conversas",
          },
        ]}
      />

      <div className="mt-4 flex flex-col gap-2.5 rounded-control border border-line bg-surface-2 p-3 text-[12.5px]">
        <label className={`flex items-center justify-between gap-3 ${temDepartamento ? "cursor-pointer text-fg" : "cursor-not-allowed text-fg-faint"}`}>
          <span>
            Assinar mensagens (*{rotuloAssinatura}:*)
            {!temDepartamento && (
              <span className="mt-0.5 block text-[11.5px] text-fg-faint">
                Adicione esta conta a um departamento para liberar a assinatura.
              </span>
            )}
          </span>
          <input
            type="checkbox"
            checked={temDepartamento && conta.assinarMensagens !== false}
            disabled={ocupado !== null || !temDepartamento}
            onChange={(e) =>
              void comOcupado("assinatura", async () => {
                await rodar({ acao: "editar", login: conta.login, nome: conta.nome, assinarMensagens: e.target.checked });
              })
            }
          />
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void comOcupado("assinaturaTexto", async () => {
              await rodar({ acao: "editar", login: conta.login, nome: conta.nome, assinatura: assinaturaTexto.trim() });
            });
          }}
          className="flex flex-wrap items-end gap-2 border-t border-line/70 pt-2.5"
        >
          <Field
            label="Texto da assinatura (opcional)"
            htmlFor={`conta-assinatura-${conta.login}`}
            className="min-w-[180px] flex-1"
          >
            <Input
              id={`conta-assinatura-${conta.login}`}
              value={assinaturaTexto}
              onChange={(e) => setAssinaturaTexto(e.target.value)}
              placeholder={conta.nome}
              disabled={ocupado !== null || !temDepartamento}
            />
          </Field>
          <Button
            type="submit"
            size="sm"
            variant="subtle"
            loading={ocupado === "assinaturaTexto"}
            disabled={ocupado !== null || !temDepartamento}
          >
            Salvar assinatura
          </Button>
        </form>
        <label className="flex cursor-pointer items-center justify-between gap-3 text-fg">
          <span>Restringir fila aos departamentos do agente</span>
          <input
            type="checkbox"
            checked={Boolean(conta.restringirDepartamentos)}
            disabled={ocupado !== null}
            onChange={(e) =>
              void comOcupado("restringir", async () => {
                await rodar({ acao: "editar", login: conta.login, nome: conta.nome, restringirDepartamentos: e.target.checked });
              })
            }
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3 text-fg">
          <span>Liberar Copiloto IA na conversa</span>
          <input
            type="checkbox"
            checked={Boolean(conta.copilotoLiberado)}
            disabled={ocupado !== null}
            onChange={(e) =>
              void comOcupado("copiloto", async () => {
                await rodar({ acao: "editar", login: conta.login, nome: conta.nome, copilotoLiberado: e.target.checked });
              })
            }
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!renomeando && (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              setNome(conta.nome);
              setRenomeando(true);
            }}
          >
            Renomear
          </Button>
        )}
        <BotaoConfirmar
          variante="subtle"
          perigo={false}
          pergunta="A senha atual deixa de valer e a sessão aberta cai."
          confirmar="Gerar nova senha"
          aoConfirmar={async () => {
            const r = await rodar({ acao: "senha", login: conta.login });
            if (r?.senhaGerada) aoSenhaNova(r.senhaGerada);
          }}
        >
          Nova senha…
        </BotaoConfirmar>
        <Button
          variant="subtle"
          size="sm"
          loading={ocupado === "ativo"}
          title={conta.ativo ? "A sessão aberta cai na hora." : undefined}
          onClick={() => void comOcupado("ativo", async () => void (await rodar({ acao: "ativo", login: conta.login, ativo: !conta.ativo })))}
        >
          {conta.ativo ? "Desativar" : "Ativar"}
        </Button>
        <BotaoConfirmar
          variante="ghost"
          pergunta={`Apagar a conta de ${conta.nome}?`}
          confirmar="Apagar conta"
          aoConfirmar={async () => void (await rodar({ acao: "apagar", login: conta.login }))}
        >
          Apagar…
        </BotaoConfirmar>
      </div>
    </Card>
  );
}
