import { INTENT_ACCESS, type Intent } from "@/lib/whatsapp-intents";
import { str, type Handler } from "./shared";

// Perfil exigido por tópico não é declarado aqui: vem de INTENT_ACCESS
// (whatsapp-intents.ts), a mesma tabela que o router usa pra checar
// permissão de verdade. Duas fontes pro mesmo fato (achado da auditoria
// de arquitetura, 2026-08-04) deixavam de convergir em silêncio se alguém
// mudasse uma sem lembrar da outra.
const HELP_TEXT: Record<string, { text: string; label: string }> = {
  cadastrar_animal: {
    label: "cadastro de animais",
    text: "Pra cadastrar um animal, me manda o brinco, a raça e o sexo (macho ou fêmea). Se tiver mais de uma propriedade, diz também em qual delas. Exemplo: 'cadastra o boi 1234, nelore, macho'.",
  },
  registrar_peso: {
    label: "pesagens",
    text: "Pra registrar o peso, me manda o brinco do animal e o peso em kg. Exemplo: 'pesei o boi 1234, deu 280 quilos'.",
  },
  registrar_vacina: {
    label: "vacinas",
    text: "Pra registrar uma vacina, me manda o brinco do animal e o nome da vacina (o custo é opcional). Exemplo: 'vacinei o boi 1234 contra aftosa'.",
  },
  registrar_movimento: {
    label: "compra/venda/transferência de animais",
    text: "Pra compra, venda, transferência ou morte de um animal, me manda o brinco e o tipo. Se for venda ou compra, pode dizer o valor também. Se for transferência, me diz pra qual propriedade. Exemplo: 'vendi o boi 1234 por 8000 reais'.",
  },
  cadastrar_servico_ordem: {
    label: "ordens de serviço",
    text: "Pra registrar uma ordem de serviço, me manda o nome do cliente e o serviço prestado. Exemplo: 'fiz uma diária de trator pro cliente João'.",
  },
  consultar_saldo: {
    label: "consulta de saldo",
    text: "É só perguntar! Pode pedir o saldo do mês atual ou de um mês específico. Exemplo: 'qual meu saldo de junho'.",
  },
  consultar_animal: {
    label: "consulta de animal",
    text: "Me manda o brinco do animal que você quer consultar. Exemplo: 'como está o boi 1234'.",
  },
  consultar_cliente: {
    label: "consulta de cliente",
    text: "Me manda o nome do cliente que você quer consultar. Exemplo: 'quanto o João me deve'.",
  },
  gerar_relatorio: {
    label: "relatório financeiro",
    text: "Posso te mandar o relatório financeiro em PDF, é só pedir. (Relatórios de rebanho, lavoura e prestador ainda não estão disponíveis por aqui.)",
  },
  registrar_lancamento_financeiro: {
    label: "lançar despesas (inclusive por foto de recibo)",
    text: "Pra lançar uma despesa, me conta o valor e do que se trata: ou, mais fácil, me manda uma foto ou PDF da nota que eu leio pra você.",
  },
  registrar_uso_estoque: {
    label: "uso de produtos do estoque",
    text: "Quando usar alguma coisa do estoque, é só me contar: 'usei 2 sacas de sal no lote do curral'. Eu baixo do saldo e te digo quanto sobrou. Se quiser saber o que tem, pergunta 'quanto tenho de sal' ou 'o que está acabando'.",
  },
  ajustar_estoque: {
    label: "corrigir o estoque",
    text: "Se você contou e o número não bate, me diz o que TEM de verdade: 'contei e tem só 6 sacas de sal'. Eu calculo a diferença sozinho e guardo o antes e o depois.",
  },
  registrar_negocio_produto: {
    label: "compra de insumos",
    text: "Me conta a compra inteira de uma vez: 'comprei 10 sacas de sal do Zé por 1200, pra pagar dia 10'. Eu somo no estoque e crio a conta a pagar junto. Produto novo precisa ser cadastrado antes no painel, em Estoque.",
  },
};

function requiredProfile(topic: string) {
  return INTENT_ACCESS[topic as Intent]?.profile;
}

export const ajuda: Handler = async ({ parameters, activeProfiles }) => {
  const topic = str(parameters.topic);
  const entry = topic ? HELP_TEXT[topic] : undefined;
  if (entry && topic) {
    const profile = requiredProfile(topic);
    if (profile && !activeProfiles.includes(profile)) {
      const label = profile === "fazenda" ? "Fazenda" : "Prestador de Serviço";
      return {
        reply_text: `Esse recurso requer o perfil "${label}" ativo, que não está habilitado para sua empresa.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "ajuda:perfil_inativo",
      };
    }
    return {
      reply_text: entry.text,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `ajuda:${topic}`,
    };
  }

  const available = Object.entries(HELP_TEXT).filter(([topic]) => {
    const profile = requiredProfile(topic);
    return !profile || activeProfiles.includes(profile);
  });
  const menu = available.map(([, e]) => e.label).join(", ");
  return {
    reply_text: `Posso te ajudar com: ${menu}. Sobre qual desses você quer saber mais? Ou me conta direto o que você quer fazer que eu tento entender.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: "ajuda:geral",
  };
};
