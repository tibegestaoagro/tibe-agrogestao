import type { ClienteView } from "@/lib/actions/emporio-clientes";
import type { ClienteParaConferir } from "@/lib/emporio/cliente-cadastro";
import { CONSUMIDOR_FINAL } from "@/lib/contatos/cadastro";

/**
 * O cliente como a escolha do balcão o carrega: o cadastro inteiro (o plano 3 confere
 * entrega e endereço sobre ele) mais o que a tela precisa para mostrar o quadro.
 * É, por estrutura, um `ClienteParaConferir`.
 */
export type ClienteEscolhido = Omit<Required<ClienteParaConferir>, "name"> & {
  id: string;
  name: string;
  incomplete: boolean;
  fixed: boolean;
};

export type ClienteDaBusca = ClienteEscolhido & { ultima_compra: { em: string; valor: number } | null };

export function clienteEscolhidoDe(v: ClienteView): ClienteEscolhido {
  return {
    id: v.id,
    name: v.name,
    person_kind: v.person_kind,
    document: v.document,
    phone: v.phone,
    address_zip: v.address_zip,
    address_street: v.address_street,
    address_number: v.address_number,
    address_complement: v.address_complement,
    address_district: v.address_district,
    city: v.city,
    address_state: v.address_state,
    delivery_zip: v.delivery_zip,
    delivery_street: v.delivery_street,
    delivery_number: v.delivery_number,
    delivery_complement: v.delivery_complement,
    delivery_district: v.delivery_district,
    delivery_city: v.delivery_city,
    delivery_state: v.delivery_state,
    system_key: v.fixed ? CONSUMIDOR_FINAL.system_key : null,
    incomplete: v.incomplete,
    fixed: v.fixed,
  };
}

export function consumidorFinalEscolhido(cf: { id: string; name: string }): ClienteEscolhido {
  return {
    id: cf.id,
    name: cf.name,
    person_kind: null,
    document: null,
    phone: null,
    address_zip: null,
    address_street: null,
    address_number: null,
    address_complement: null,
    address_district: null,
    city: null,
    address_state: null,
    delivery_zip: null,
    delivery_street: null,
    delivery_number: null,
    delivery_complement: null,
    delivery_district: null,
    delivery_city: null,
    delivery_state: null,
    system_key: CONSUMIDOR_FINAL.system_key,
    incomplete: false,
    fixed: true,
  };
}
