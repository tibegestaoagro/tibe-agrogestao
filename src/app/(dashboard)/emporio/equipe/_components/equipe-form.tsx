"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch, apiPost } from "@/lib/client-api";
import { FUNCAO_DE_TODAS_AS_LOJAS, FUNCAO_DESCRICAO, FUNCAO_ROTULO, type FuncaoDaEquipe } from "./funcao";


export type MembroParaEditar = {
  id: string;
  name: string;
  emporio_role: FuncaoDaEquipe | null;
  establishment_ids: string[];
  emporio_keys: string[];
};

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name", "email", "phone", "emporio_role", "establishment_ids", "emporio_keys"] as const;

const classeCaixa = "h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria";

/**
 * Cadastrar pessoa na Equipe (sem `membro`) ou editar a função dela (com
 * `membro`). O cadastro devolve a senha temporária, mostrada uma vez, como o
 * convite de Configurações → Usuários.
 */
export function EquipeForm({
  membro,
  lojas,
  chaves,
}: {
  membro?: MembroParaEditar;
  lojas: { id: string; name: string }[];
  chaves: { id: string; label: string }[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `equipe-${membro?.id ?? "novo"}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [funcao, setFuncao] = useState<FuncaoDaEquipe | "">(membro?.emporio_role ?? "");
  const [lojasSel, setLojasSel] = useState<string[]>(membro?.establishment_ids ?? []);
  const [chavesSel, setChavesSel] = useState<string[]>(membro?.emporio_keys ?? []);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  function reiniciar() {
    setName("");
    setEmail("");
    setPhone("");
    setFuncao(membro?.emporio_role ?? "");
    setLojasSel(membro?.establishment_ids ?? []);
    setChavesSel(membro?.emporio_keys ?? []);
    setTempPassword(null);
    err.limparTudo();
  }

  function fechar() {
    setOpen(false);
    reiniciar();
  }

  function alternar(lista: string[], id: string, ligado: boolean) {
    return ligado ? [...lista, id] : lista.filter((x) => x !== id);
  }

  async function submit() {
    // Com a senha na tela, o botão do rodapé vira "Fechar".
    if (tempPassword) {
      fechar();
      return;
    }

    const novos: Partial<Record<(typeof ORDEM)[number], string>> = {};
    if (!membro && !name.trim()) novos.name = "Informe o nome.";
    if (!membro && !email.trim()) novos.email = "Informe o email de acesso.";
    if (!funcao) novos.emporio_role = "Escolha a função da pessoa.";
    if ((funcao === "gestor" || funcao === "vendedor" || funcao === "caixa") && lojasSel.length === 0) {
      novos.establishment_ids = "Escolha pelo menos uma loja.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    const corpo = {
      emporio_role: funcao,
      establishment_ids: funcao && FUNCAO_DE_TODAS_AS_LOJAS.includes(funcao) ? [] : lojasSel,
      emporio_keys: funcao === "vendedor" ? chavesSel : [],
    };

    err.limparTudo();
    setLoading(true);
    if (membro) {
      const res = await apiPatch(`/api/v1/emporio/team/${membro.id}`, corpo);
      setLoading(false);
      if (!res.ok) {
        err.doServidor(res);
        return;
      }
      aviso.sucesso("Função atualizada.");
      fechar();
      router.refresh();
      return;
    }

    const res = await apiPost<{ id: string; temp_password: string }>("/api/v1/emporio/team", {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      ...corpo,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setTempPassword(res.data.temp_password);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={membro ? <Button variant="outline" size="sm">Editar</Button> : <Button>Cadastrar pessoa</Button>}
      title={membro ? "Editar função" : "Cadastrar pessoa"}
      description={membro ? membro.name : "A pessoa entra com o email e uma senha temporária."}
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : fechar())}
      onSubmit={submit}
      submitLabel={tempPassword ? "Fechar" : membro ? "Salvar" : "Cadastrar"}
      submitPendingLabel="Salvando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {tempPassword ? (
        /* Resultado, não formulário: a senha aparece uma vez e some quando o painel fecha. */
        <div className="space-y-3">
          <p className="rounded-md bg-primaria-suave p-3 text-sm text-primaria-tinta">
            Pessoa cadastrada. Repasse estas credenciais a ela: a senha só aparece aqui uma vez.
          </p>
          <div className="space-y-1">
            <Label htmlFor="equipe-email-criado">Email</Label>
            <Input id="equipe-email-criado" readOnly value={email} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="equipe-senha-criada">Senha temporária</Label>
            <Input id="equipe-senha-criada" readOnly value={tempPassword} className="font-mono" />
          </div>
        </div>
      ) : (
        <>
          {!membro && (
            <>
              <Field label="Nome" required id={err.idDe("name")} error={err.erros.name}>
                {({ id, ...aria }) => (
                  <Input
                    id={id}
                    {...aria}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      err.limparCampo("name");
                    }}
                  />
                )}
              </Field>
              <Field label="Email" required id={err.idDe("email")} error={err.erros.email}>
                {({ id, ...aria }) => (
                  <Input
                    id={id}
                    {...aria}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      err.limparCampo("email");
                    }}
                  />
                )}
              </Field>
              <Field label="Telefone" id={err.idDe("phone")} error={err.erros.phone}>
                {({ id, ...aria }) => (
                  <Input
                    id={id}
                    {...aria}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      err.limparCampo("phone");
                    }}
                  />
                )}
              </Field>
            </>
          )}

          <Field label="Função" required id={err.idDe("emporio_role")} error={err.erros.emporio_role}>
            {({ id, ...aria }) => (
              <Select
                value={funcao}
                onValueChange={(v) => {
                  setFuncao(v as FuncaoDaEquipe);
                  err.limparCampo("emporio_role");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue placeholder="Escolha a função" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FUNCAO_ROTULO) as FuncaoDaEquipe[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FUNCAO_ROTULO[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {funcao && FUNCAO_DESCRICAO[funcao] && (
            <p className="text-xs text-texto-secundario">{FUNCAO_DESCRICAO[funcao]}</p>
          )}

          {(funcao === "gestor" || funcao === "vendedor" || funcao === "caixa") && (
            <Field label="Lojas" required id={err.idDe("establishment_ids")} error={err.erros.establishment_ids}>
              {({ id, ...aria }) => (
                <div id={id} {...aria} tabIndex={-1} className="space-y-2">
                  {lojas.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm text-texto">
                      <input
                        type="checkbox"
                        checked={lojasSel.includes(l.id)}
                        onChange={(e) => {
                          setLojasSel((a) => alternar(a, l.id, e.target.checked));
                          err.limparCampo("establishment_ids");
                        }}
                        className={classeCaixa}
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              )}
            </Field>
          )}

          {funcao === "vendedor" && (
            <Field
              label="Chaves"
              id={err.idDe("emporio_keys")}
              error={err.erros.emporio_keys}
              hint="Tudo começa desligado. Ligue só o que você confia que essa pessoa faça sozinha."
            >
              {({ id, ...aria }) => (
                <div id={id} {...aria} tabIndex={-1} className="space-y-2">
                  {chaves.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-texto">
                      <input
                        type="checkbox"
                        checked={chavesSel.includes(c.id)}
                        onChange={(e) => {
                          setChavesSel((a) => alternar(a, c.id, e.target.checked));
                          err.limparCampo("emporio_keys");
                        }}
                        className={classeCaixa}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </Field>
          )}

        </>
      )}
    </FormSheet>
  );
}
