"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPut } from "@/lib/client-api";
import { useAviso } from "@/components/ui/toast";

export type RecursoView = { feature_key: string; enabled: boolean; user_ids: string[] };
export type UsuarioDaConta = { id: string; name: string; email: string; role: string; emporio_role: string | null };

const FUNCAO_DO_EMPORIO: Record<string, string> = {
  gerente_geral: "Gerente geral",
  gestor: "Gestor",
  vendedor: "Vendedor",
};

/** Rótulo e efeito de cada recurso em teste. Hoje só o Empório (Módulo 39). */
const RECURSOS: Record<string, { nome: string; efeito: string }> = {
  emporio: {
    nome: "Meu Empório",
    efeito:
      "Ligar o Meu Empório ativa o perfil de comércio da conta. Conta nova criada aqui e ligada antes do primeiro acesso entra direto como comércio, sem fazenda.",
  },
};

/**
 * Cartão "Recursos em teste" do detalhe da conta. Equipe vê o estado; só o
 * master_admin recebe `podeEditar` e, com ele, os controles. A recusa do
 * servidor aparece embaixo da lista de usuários (`user_ids`) ou no rodapé.
 */
export default function RecursosCard({
  tenantId,
  recursos,
  usuarios,
  podeEditar,
}: {
  tenantId: string;
  recursos: RecursoView[];
  usuarios: UsuarioDaConta[];
  podeEditar: boolean;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-sm font-semibold text-gray-300">Recursos em teste</h2>
      <div className="mt-3 divide-y divide-gray-800">
        {recursos.map((r) => (
          <LinhaDeRecurso
            key={r.feature_key}
            tenantId={tenantId}
            recurso={r}
            usuarios={usuarios}
            podeEditar={podeEditar}
          />
        ))}
      </div>
    </section>
  );
}

function LinhaDeRecurso({
  tenantId,
  recurso,
  usuarios,
  podeEditar,
}: {
  tenantId: string;
  recurso: RecursoView;
  usuarios: UsuarioDaConta[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const info = RECURSOS[recurso.feature_key] ?? { nome: recurso.feature_key, efeito: "" };
  const idPrefixo = `recurso-${recurso.feature_key}`;

  const [editando, setEditando] = useState(false);
  const [confirmandoDesligar, setConfirmandoDesligar] = useState(false);
  // No Empório quem vê é definido pela Equipe, dentro da conta (F6b, Q119): não há lista de usuários.
  const ehEmporio = recurso.feature_key === "emporio";
  const [escopo, setEscopo] = useState<"conta" | "usuarios">(
    !ehEmporio && recurso.user_ids.length > 0 ? "usuarios" : "conta",
  );
  const [marcados, setMarcados] = useState<string[]>(recurso.user_ids);
  const [pending, setPending] = useState(false);
  const [erroUsuarios, setErroUsuarios] = useState<string | null>(null);
  const aviso = useAviso();

  const nomesDosUsuarios = recurso.user_ids
    .map((id) => usuarios.find((u) => u.id === id)?.name)
    .filter((n): n is string => !!n);

  function limparErros() {
    setErroUsuarios(null);
  }

  async function enviar(enabled: boolean, user_ids: string[]): Promise<boolean> {
    limparErros();
    setPending(true);
    const res = await apiPut<RecursoView>(
      `/api/platform/tenants/${tenantId}/features/${recurso.feature_key}`,
      { enabled, user_ids },
    );
    setPending(false);
    if (!res.ok) {
      if (res.field === "user_ids") setErroUsuarios(res.message);
      else aviso.erro(res.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function ligar() {
    if (escopo === "usuarios" && marcados.length === 0) {
      setErroUsuarios("Marque ao menos um usuário, ou escolha a conta inteira.");
      document.getElementById(`${idPrefixo}-user_ids`)?.focus();
      return;
    }
    const ok = await enviar(true, escopo === "conta" ? [] : marcados);
    if (ok) setEditando(false);
  }

  async function desligar() {
    // Mantém a lista de usuários: religar traz tudo de volta como estava.
    const ok = await enviar(false, recurso.user_ids);
    if (ok) setConfirmandoDesligar(false);
  }

  function alternar(id: string) {
    limparErros();
    setMarcados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white">{info.nome}</p>
          <p className="text-xs text-gray-400">
            {recurso.enabled
              ? ehEmporio
                ? "Ligado para o Dono e a Equipe"
                : recurso.user_ids.length > 0
                  ? `Ligado só para: ${nomesDosUsuarios.join(", ") || `${recurso.user_ids.length} usuário(s)`}`
                  : "Ligado para a conta inteira"
              : "Desligado"}
          </p>
        </div>
        {podeEditar && !editando && !confirmandoDesligar && (
          <div className="flex gap-2">
            {!(ehEmporio && recurso.enabled) && (
              <button
                type="button"
                onClick={() => {
                  limparErros();
                  setEditando(true);
                }}
                className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-300"
              >
                {recurso.enabled ? "Alterar quem usa" : "Ligar"}
              </button>
            )}
            {recurso.enabled && (
              <button
                type="button"
                onClick={() => {
                  limparErros();
                  setConfirmandoDesligar(true);
                }}
                className="rounded-md border border-red-800 px-3 py-1 text-xs text-red-400"
              >
                Desligar
              </button>
            )}
          </div>
        )}
      </div>

      {info.efeito && <p className="mt-2 text-xs text-gray-500">{info.efeito}</p>}

      {ehEmporio && recurso.enabled && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-gray-400">Quem vê o Empório é definido pela Equipe, dentro da conta.</p>
          <ul className="space-y-0.5">
            {usuarios.map((u) => (
              <li key={u.id} className="text-sm text-white">
                {u.name}{" "}
                <span className="text-xs text-gray-500">
                  (
                  {u.role === "OWNER"
                    ? "Dono"
                    : u.emporio_role
                      ? (FUNCAO_DO_EMPORIO[u.emporio_role] ?? u.emporio_role)
                      : "Sem função"}
                  )
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {podeEditar && confirmandoDesligar && (
        <div className="mt-3 space-y-2 rounded-md border border-gray-700 p-3">
          <p className="text-xs text-gray-300">
            Desligar o {info.nome}? Nada é apagado: religar traz tudo de volta.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={desligar}
              disabled={pending}
              className="rounded-md bg-red-700 px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {pending ? "Desligando..." : "Sim, desligar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmandoDesligar(false);
                limparErros();
              }}
              className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {podeEditar && editando && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) void ligar();
          }}
          className="mt-3 space-y-3 rounded-md border border-gray-700 p-3"
        >
          {!ehEmporio && (
          <fieldset className="space-y-2">
            <legend className="text-xs text-gray-400">Quem usa</legend>
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="radio"
                name={`${idPrefixo}-escopo`}
                checked={escopo === "conta"}
                onChange={() => {
                  setEscopo("conta");
                  limparErros();
                }}
              />
              A conta inteira
            </label>
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="radio"
                name={`${idPrefixo}-escopo`}
                checked={escopo === "usuarios"}
                onChange={() => {
                  setEscopo("usuarios");
                  limparErros();
                }}
              />
              Só estes usuários
            </label>
          </fieldset>
          )}

          {escopo === "usuarios" && (
            <div
              id={`${idPrefixo}-user_ids`}
              tabIndex={-1}
              aria-invalid={erroUsuarios ? true : undefined}
              aria-describedby={erroUsuarios ? `${idPrefixo}-user_ids-erro` : undefined}
              className="space-y-1 pl-6"
            >
              {usuarios.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={marcados.includes(u.id)}
                    onChange={() => alternar(u.id)}
                  />
                  <span>
                    {u.name} <span className="text-xs text-gray-500">({u.email}, {u.role})</span>
                  </span>
                </label>
              ))}
              {usuarios.length === 0 && <p className="text-xs text-gray-500">A conta não tem usuário ativo.</p>}
              {erroUsuarios && (
                <p id={`${idPrefixo}-user_ids-erro`} role="alert" className="text-xs text-red-400">
                  {erroUsuarios}
                </p>
              )}
            </div>
          )}

          {erroUsuarios && escopo === "conta" && (
            <p role="alert" className="text-xs text-red-400">
              {erroUsuarios}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-primaria px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {pending ? "Salvando..." : recurso.enabled ? "Salvar" : "Ligar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando(false);
                limparErros();
              }}
              className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

    </div>
  );
}
