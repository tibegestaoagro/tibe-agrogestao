"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiGet, apiPatch, apiPost } from "@/lib/client-api";
import {
  CADASTRO_VAZIO,
  CamposDoCadastro,
  corpoDoCadastro,
  valoresDoContato,
  type CampoCadastro,
  type ContatoDoCadastro,
  type ValoresCadastro,
} from "@/components/contatos/campos-do-cadastro";
import type { ClienteView } from "@/lib/actions/emporio-clientes";
import type { Falta } from "@/lib/emporio/cliente-cadastro";
import { formatarTelefone } from "@/lib/emporio/telefone";

// Ordem VISUAL, a mesma de `CamposDoCadastro`.
const ORDEM = [
  "person_kind",
  "name",
  "document",
  "phone",
  "birth_date",
  "responsible_name",
  "state_registration",
  "address_zip",
  "address_street",
  "address_number",
  "address_complement",
  "address_district",
  "city",
  "address_state",
  "delivery_zip",
  "delivery_street",
  "delivery_number",
  "delivery_complement",
  "delivery_district",
  "delivery_city",
  "delivery_state",
] as const;
type Campo = (typeof ORDEM)[number];

const noOrdem = (campo: string): campo is Campo => (ORDEM as readonly string[]).includes(campo);

/**
 * Cadastro do cliente do Empório (a tabela própria do Empório, fora de Contatos).
 *
 * `novo` cria (POST) e `completar` abre o cliente já cadastrado, preenchido, e
 * grava por cima (PATCH): o servidor junta o que está guardado com o que veio e
 * só salva o cadastro completo para o tipo (PF: nome e telefone; PJ: mais CNPJ e
 * endereço principal).
 *
 * Com `open` e `onOpenChange`, quem chama controla o painel (a escolha do cliente
 * o abre pelo "Não achou? Cadastrar novo"); `trigger={null}` tira o gatilho.
 */
export function ClienteForm({
  modo,
  contatoId,
  trigger,
  open,
  onOpenChange,
  inicial,
  faltaInicial = null,
  onSalvo,
}: {
  modo: "novo" | "completar";
  contatoId?: string;
  /** Sem ele, o botão padrão; `null`, nenhum (o painel é aberto por `open`). */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (a: boolean) => void;
  /** Só no `novo`: o que a busca já digitou (o nome, ou o telefone). */
  inicial?: { name?: string; phone?: string };
  /** Só no `completar`: o que falta, embaixo do campo dele (se ele está no ORDEM), com o foco nele. */
  faltaInicial?: Falta | null;
  /** Sem ele (nas telas de Clientes), o formulário só relê a página ao salvar. */
  onSalvo?: (c: ClienteView) => void;
}) {
  const router = useRouter();
  const completar = modo === "completar";
  const err = useErrosDeFormulario(ORDEM, completar ? `completar-${contatoId}` : "cliente-novo");
  const [abertoProprio, setAbertoProprio] = useState(false);
  const aberto = open ?? abertoProprio;
  const [loading, setLoading] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [falhouCarga, setFalhouCarga] = useState(false);
  const [valores, setValores] = useState<ValoresCadastro>(CADASTRO_VAZIO);

  // O painel abre pelo gatilho ou por quem chama (`open`): o preparo é o mesmo,
  // feito no render quando `aberto` muda, e não num efeito.
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    err.limparTudo();
    setFalhouCarga(false);
    setValores(
      aberto && !completar && inicial ? { ...CADASTRO_VAZIO, name: inicial.name ?? "", phone: inicial.phone ? formatarTelefone(inicial.phone) : "" } : CADASTRO_VAZIO,
    );
    setCarregando(aberto && completar && !!contatoId);
  }

  // `completar` lê o cadastro guardado ao abrir.
  useEffect(() => {
    if (!aberto || !completar || !contatoId) return;
    let vivo = true;
    void apiGet<ContatoDoCadastro>(`/api/v1/emporio/customers/${contatoId}`).then((res) => {
      if (!vivo) return;
      setCarregando(false);
      if (!res.ok) {
        setFalhouCarga(true);
        err.setGlobal(res.message);
        return;
      }
      setValores(valoresDoContato(res.data));
      if (faltaInicial && noOrdem(faltaInicial.field)) err.reprovar({ [faltaInicial.field]: faltaInicial.message });
    });
    return () => {
      vivo = false;
    };
    // Só a abertura relê: `err` e `faltaInicial` são lidos no momento da carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, completar, contatoId]);

  function mudarAberto(o: boolean) {
    if (onOpenChange) onOpenChange(o);
    if (open === undefined) setAbertoProprio(o);
  }

  function mudar(campo: CampoCadastro, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
    err.limparCampo(campo);
  }

  async function submit() {
    // Sem o cadastro carregado o formulário está vazio, e salvar apagaria o que está guardado.
    if (completar && falhouCarga) {
      err.setGlobal("Não foi possível carregar o cadastro. Feche e abra de novo.");
      return;
    }
    const novos: Partial<Record<Campo, string>> = {};
    const nome = valores.name.trim();
    if (!valores.person_kind) novos.person_kind = "Escolha pessoa física ou jurídica.";
    if (!nome) novos.name = valores.person_kind === "pj" ? "Informe o nome da empresa." : "Informe o nome do cliente.";
    if (!valores.phone.trim()) novos.phone = "Informe o telefone.";
    // As mesmas frases de `faltaNoCadastro`: a PJ exige o CNPJ e o endereço principal.
    if (valores.person_kind === "pj") {
      if (!valores.document.trim()) novos.document = "Informe o CNPJ.";
      if (!valores.address_zip.trim()) novos.address_zip = "Informe o CEP do endereço principal.";
      if (!valores.address_street.trim()) novos.address_street = "Informe a rua do endereço principal.";
      if (!valores.address_number.trim()) novos.address_number = "Informe o número do endereço principal.";
      if (!valores.address_district.trim()) novos.address_district = "Informe o bairro do endereço principal.";
      if (!valores.city.trim()) novos.city = "Informe a cidade do endereço principal.";
      if (!valores.address_state.trim()) novos.address_state = "Escolha a UF do endereço principal.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = corpoDoCadastro(valores);
    const res = completar
      ? await apiPatch<ClienteView>(`/api/v1/emporio/customers/${contatoId}`, corpo)
      : await apiPost<ClienteView>("/api/v1/emporio/customers", corpo);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    if (onSalvo) onSalvo(res.data);
    else router.refresh();
    mudarAberto(false);
  }

  return (
    <FormSheet
      trigger={
        trigger !== undefined ? (
          trigger
        ) : (
          <Button type="button" variant="outline" size="sm">
            {completar ? "Completar cadastro" : "Cadastrar novo cliente"}
          </Button>
        )
      }
      title={completar ? "Completar cadastro" : "Cliente novo"}
      description={
        completar
          ? "Faltam dados deste cliente. Confira e complete."
          : "Tipo, nome e telefone são obrigatórios. Na pessoa jurídica, também o CNPJ e o endereço."
      }
      open={aberto}
      onOpenChange={mudarAberto}
      onSubmit={submit}
      submitLabel={completar ? "Salvar cadastro" : "Cadastrar cliente"}
      pending={loading || carregando}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <CamposDoCadastro
        valores={valores}
        aoMudar={mudar}
        erros={err.erros}
        idDe={err.idDe}
        obrigatorios
      />
    </FormSheet>
  );
}
