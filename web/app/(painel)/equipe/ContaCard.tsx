"use client";

import { useState } from "react";
import { haQuanto } from "@/app/components/tempo";
import { Avatar, Badge, BotaoConfirmar, Button, Card, Field, Input, Pares } from "@/app/components/ui";
import { instanteLongo } from "@/lib/formatar-data";
import type { RodarComando, UsuarioPublico } from "./tipos";

/** Uma conta da equipe: dados, nome, senha, ativar/desativar e apagar. */
export function ContaCard({
  conta,
  rodar,
  aoSenhaNova,
}: {
  conta: UsuarioPublico;
  rodar: RodarComando;
  aoSenhaNova: (senha: string) => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [ocupado, setOcupado] = useState<"nome" | "ativo" | null>(null);

  async function comOcupado(qual: "nome" | "ativo", fn: () => Promise<void>) {
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
          {
            rotulo: "Acesso",
            valor: conta.ativo ? "Entra e vê todas as conversas" : "Bloqueado até você ativar de novo",
          },
        ]}
      />

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
