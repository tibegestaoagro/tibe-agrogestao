import type { Metadata } from "next";

export const metadata: Metadata = { title: "Glossário agro" };

const TERMS: [string, string][] = [
  ["Brinco (ear tag)", "Identificador numérico ou alfanumérico preso à orelha do animal — é a chave usada para localizá-lo no sistema (ear_tag), único por tenant."],
  ["Cabeça", "Sinônimo de \"animal\", no contexto de rebanho bovino (\"50 cabeças de gado\")."],
  ["GMD (Ganho Médio Diário)", "Ganho de peso médio por dia entre duas pesagens, em kg/dia. Calculado automaticamente pelo Tibé a cada nova pesagem registrada."],
  ["Rebanho", "O conjunto de animais de uma propriedade — no Tibé, também o nome do módulo que gerencia animais, pesagens, vacinação e movimentação."],
  ["Manejo", "Conjunto de práticas de cuidado e controle do rebanho (alimentação, vacinação, movimentação entre pastos)."],
  ["Movimentação", "Registro de compra, venda, transferência entre propriedades ou morte de um animal — usado no Tibé como o termo genérico para qualquer mudança de status/local de um animal."],
  ["Talhão", "Uma área delimitada dentro de uma propriedade, destinada a um cultivo específico — a unidade básica do módulo Lavoura (equivalente a um \"campo\" ou \"gleba\")."],
  ["Ciclo (de cultura)", "O período entre o plantio e a colheita de uma cultura em um talhão. Um talhão só pode ter um ciclo ativo (plantado ou em crescimento) por vez."],
  ["Safra", "Uso coloquial para uma temporada de produção agrícola — no sistema, corresponde a um CropCycle."],
  ["Insumo", "Qualquer produto aplicado na lavoura para viabilizar ou melhorar a produção: fertilizante, defensivo (agrotóxico/pesticida) ou semente."],
  ["Defensivo (agrícola)", "Produto usado para controle de pragas, doenças ou plantas invasoras (pesticida/agrotóxico) — um dos tipos de insumo no Tibé."],
  ["Produtividade", "Quantidade colhida dividida pela área do talhão (ex: sacas por hectare) — indicador de eficiência de um ciclo de cultura."],
  ["Hectare (ha)", "Unidade de área agrária (10.000 m²), usada para medir propriedades e talhões."],
  ["Saca", "Unidade de medida de peso para grãos, tradicionalmente 60 kg — uma das unidades aceitas para yield_unit ao registrar colheita."],
  ["Nelore", "Raça bovina de origem indiana, a mais comum no rebanho de corte brasileiro — aparece como exemplo de breed nesta documentação."],
  ["Aftosa, Brucelose, Raiva, Clostridiose", "Vacinas de aplicação comum no rebanho bovino brasileiro, incluídas no catálogo padrão provisionado ao ativar o perfil Fazenda."],
  ["Prestador de serviço", "No contexto do Tibé, uma empresa ou profissional que presta serviços agrícolas a terceiros (ex: aplicação aérea, colheita mecanizada, transporte) — perfil de tenant separado do perfil Fazenda."],
  ["Ordem de serviço", "Registro de um serviço prestado a um cliente, com valor calculado a partir da quantidade e do preço unitário do serviço — segue o fluxo scheduled → completed → invoiced."],
  ["DRE (Demonstrativo de Resultado do Exercício)", "Relatório que agrupa receitas e despesas por período (e, no Tibé, por módulo de origem), mostrando o resultado — regime de competência (due_date), independente de já ter sido pago."],
  ["Fluxo de caixa", "Movimentação real de dinheiro em um período — regime de caixa (paid_at), diferente do DRE por não incluir lançamentos ainda não pagos."],
  ["Regime de competência vs. regime de caixa", "Competência considera o lançamento na data em que a obrigação nasceu (due_date), pago ou não; caixa considera só o que efetivamente entrou/saiu (paid_at). O Tibé usa competência no DRE e caixa no fluxo de caixa."],
  ["Inadimplência", "Atraso no pagamento da assinatura. No Tibé, dispara um bloqueio progressivo de acesso (ver Arquitetura) em vez de suspensão imediata."],
  ["Tenant", "Termo de arquitetura SaaS (não é termo agro): representa uma empresa cliente do Tibé, com seus dados isolados dos demais tenants."],
];

export default function GlossarioPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold text-tibe-dark">Glossário</h1>
      <p className="mt-3 text-gray-600">
        Termos do domínio agropecuário — e alguns termos financeiros e de arquitetura — usados no código e nesta
        documentação.
      </p>

      <dl className="mt-8 divide-y divide-gray-100">
        {TERMS.map(([term, def]) => (
          <div key={term} className="py-4">
            <dt className="font-semibold text-gray-900">{term}</dt>
            <dd className="mt-1 text-sm text-gray-600">{def}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
