"use client";

import { useState } from "react";
import { BotaoConfirmar, Button, Card, Field, Input } from "@/app/components/ui";
import type { Departamento, RodarComando, UsuarioPublico } from "./tipos";

export function DepartamentosCard({ departamentos, usuarios, nomeDono, rodar }: {
  departamentos: Departamento[];
  usuarios: UsuarioPublico[];
  nomeDono: string;
  rodar: RodarComando;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [assinatura, setAssinatura] = useState(nomeDono);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    try {
      if (await rodar({ acao: "dep-criar", nome: nome.trim(), descricao: descricao.trim() })) {
        setNome("");
        setDescricao("");
      }
    } finally {
      setCriando(false);
    }
  }

  async function salvarAssinatura(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await rodar({ acao: "nome-dono", nome: assinatura.trim() });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card id="departamentos" titulo="Departamentos" largura="inteiro">
      <p className="text-[13px] text-fg-dim">Organize as conversas e escolha quem participa de cada departamento.</p>
      <div className="mt-4 space-y-4">
        {departamentos.length === 0 && <p className="text-[13px] text-fg-faint">Nenhum departamento criado ainda.</p>}
        {departamentos.map((departamento) => (
          <DepartamentoItem key={departamento.id} departamento={departamento} usuarios={usuarios} rodar={rodar} />
        ))}
      </div>
      <form onSubmit={(e) => void criar(e)} className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <Field label="Novo departamento" htmlFor="dep-novo-nome" className="min-w-[180px] flex-1">
          <Input id="dep-novo-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        <Field label="Descrição" htmlFor="dep-novo-descricao" className="min-w-[180px] flex-1">
          <Input id="dep-novo-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
        <Button type="submit" size="sm" loading={criando} disabled={!nome.trim()}>Criar departamento</Button>
      </form>
      <form onSubmit={(e) => void salvarAssinatura(e)} className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <Field label="Seu nome na assinatura" htmlFor="nome-assinatura" hint="Aparece nas mensagens enviadas pelo painel." className="min-w-[180px] flex-1">
          <Input id="nome-assinatura" value={assinatura} onChange={(e) => setAssinatura(e.target.value)} />
        </Field>
        <Button type="submit" size="sm" variant="subtle" loading={salvando}>Salvar assinatura</Button>
      </form>
    </Card>
  );
}

function DepartamentoItem({ departamento, usuarios, rodar }: {
  departamento: Departamento;
  usuarios: UsuarioPublico[];
  rodar: RodarComando;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(departamento.nome);
  const [descricao, setDescricao] = useState(departamento.descricao);
  const [ocupado, setOcupado] = useState(false);
  const ativos = usuarios.filter((u) => u.ativo);

  async function editar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      if (await rodar({ acao: "dep-editar", id: departamento.id, nome: nome.trim(), descricao: descricao.trim() })) setEditando(false);
    } finally {
      setOcupado(false);
    }
  }

  async function mudarMembro(login: string, marcado: boolean) {
    setOcupado(true);
    try {
      const membros = marcado ? [...departamento.membros, login] : departamento.membros.filter((m) => m !== login);
      await rodar({ acao: "dep-membros", id: departamento.id, membros });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="rounded-control border border-line p-4" aria-label={departamento.nome}>
      {editando ? (
        <form onSubmit={(e) => void editar(e)} className="flex flex-wrap items-end gap-2">
          <Field label="Nome" htmlFor={`dep-nome-${departamento.id}`} className="min-w-[180px] flex-1">
            <Input id={`dep-nome-${departamento.id}`} value={nome} onChange={(e) => setNome(e.target.value)} required />
          </Field>
          <Field label="Descrição" htmlFor={`dep-descricao-${departamento.id}`} className="min-w-[180px] flex-1">
            <Input id={`dep-descricao-${departamento.id}`} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" loading={ocupado} disabled={!nome.trim()}>Salvar</Button>
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => setEditando(false)}>Cancelar</Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-[13.5px] font-semibold text-fg">{departamento.nome}</h4>
            {departamento.descricao && <p className="mt-1 text-[13px] text-fg-dim">{departamento.descricao}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="subtle" size="sm" disabled={ocupado} onClick={() => { setNome(departamento.nome); setDescricao(departamento.descricao); setEditando(true); }}>Renomear</Button>
            <BotaoConfirmar pergunta={`Apagar ${departamento.nome}? As conversas ficam sem departamento.`} confirmar="Apagar departamento" disabled={ocupado} aoConfirmar={async () => void (await rodar({ acao: "dep-apagar", id: departamento.id }))}>Apagar…</BotaoConfirmar>
          </div>
        </div>
      )}
      <fieldset disabled={ocupado} className="mt-4">
        <legend className="text-[12.5px] font-medium text-fg-dim">Membros</legend>
        {ativos.length === 0 ? <p className="mt-2 text-[13px] text-fg-faint">Nenhuma conta ativa.</p> : (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {ativos.map((u) => (
              <label key={u.login} className="flex items-center gap-2 text-[13px] text-fg">
                <input type="checkbox" checked={departamento.membros.includes(u.login)} onChange={(e) => void mudarMembro(u.login, e.target.checked)} />
                {u.nome} <span className="text-fg-faint">@{u.login}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-line pt-3 text-[12.5px] text-fg-dim">
        <input
          type="checkbox"
          checked={Boolean(departamento.roundRobin)}
          disabled={ocupado}
          onChange={async (e) => {
            setOcupado(true);
            try {
              await rodar({
                acao: "dep-editar",
                id: departamento.id,
                nome: departamento.nome,
                descricao: departamento.descricao,
                roundRobin: e.target.checked,
              });
            } finally {
              setOcupado(false);
            }
          }}
        />
        <span>Distribuição automática (round-robin entre membros online)</span>
      </label>
    </section>
  );
}
