import Link from "next/link";
import { Chamada } from "../_components/chamada";
import { Figura } from "../_components/figura";
import { Subtitulo, Tarefa } from "../_components/tarefa";
import { BASE_DO_EMPORIO } from "./indice";

const B = BASE_DO_EMPORIO;

/** Dinheiro: Hoje, A receber, Aprovações e a conferência com o banco. */
export function ParteDeDinheiro() {
  return (
    <div className="space-y-2">
      <p>
        <strong>Dinheiro</strong> é um grupo do menu de <strong>Meu Empório</strong>, com cinco telas: <strong>Hoje</strong>,{" "}
        <strong>Caixa</strong>, <strong>A receber</strong>, <strong>A pagar</strong> e <strong>Aprovações</strong>. Hoje, A
        receber e Aprovações são de quem cuida do dinheiro das lojas: o Financeiro, o Gerente geral e o Dono. O Financeiro é uma
        função da Equipe, sem loja fixa e sem balcão, e vê só o Meu Empório. O Caixa está em{" "}
        <Link className="underline" href={`${B}/caixa`}>Caixa</Link>, e o A pagar em{" "}
        <Link className="underline" href={`${B}/a-pagar`}>A pagar e despesas</Link>.
      </p>
      <Chamada tipo="saiba">
        <p>
          Quem tem mais de uma loja escolhe a loja no botão <strong>Loja</strong>, no alto da tela (ele mostra “Loja: Todas”
          ou o nome da loja). Hoje, A receber e A pagar obedecem a ele. <strong>Aprovações</strong> e o{" "}
          <strong>Caixa</strong> não: elas mostram sempre tudo o que você alcança. Quem tem uma loja só não vê o botão.
        </p>
      </Chamada>

      <Subtitulo id="hoje">Hoje</Subtitulo>
      <Tarefa
        paraQueServe="Saber onde está o dinheiro das lojas agora, o que pagar e o que receber, sem abrir loja por loja."
        passos={[
          <>Abra <strong>Dinheiro</strong> e <strong>Hoje</strong>. Quem tem só a função Financeiro já cai aqui ao entrar.</>,
          <>O cartão <strong>Posição de caixa</strong> mostra cada gaveta, a gerência de cada loja e cada conta bancária, com o <strong>Total</strong>. O link <strong>Ver as posições e o extrato</strong> leva ao Caixa.</>,
          <>Os cartões <strong>Vence hoje a pagar</strong>, <strong>Vence hoje a receber</strong> e <strong>Fiado vencido</strong> mostram o que pede ação hoje. Cada um tem um link para a tela que resolve.</>,
          <>Alguns cartões só aparecem quando há o que fazer: <strong>Esperando aprovação</strong>, <strong>A conferir com o banco</strong>, <strong>Cheques a completar</strong> e <strong>Cartão a conferir</strong>. Clique no link do cartão e você cai direto nas linhas.</>,
        ]}
        problemas={[
          {
            quando: "Falta um cartão que eu vi ontem",
            fazer: "Os quatro cartões de aviso somem quando não há nada a fazer. É bom sinal.",
          },
        ]}
      >
        <Figura id="financeiro-hoje" />
      </Tarefa>

      <Subtitulo id="a-receber">A receber</Subtitulo>
      <Tarefa
        paraQueServe="Ver tudo o que ainda vai entrar, separado por tipo, e dar baixa no que chegou."
        passos={[
          <>Abra <strong>Dinheiro</strong> e <strong>A receber</strong>. No alto, quatro cartões somam <strong>Vencido</strong>, <strong>Vence hoje</strong>, <strong>A vencer</strong> e <strong>Recebido no período</strong>. Clique num deles para filtrar a aba aberta.</>,
          <>Abaixo do período (escolha um atalho ou use <strong>Escolher</strong>, com <strong>De</strong> e <strong>Até</strong>), ficam as cinco abas: <strong>Fiado</strong>, <strong>Cheques</strong>, <strong>Boletos</strong>, <strong>Cartões</strong> e <strong>Vencidos</strong>. Cada nome traz o total da aba.</>,
          <>Em <strong>Fiado</strong>, digite o nome, o CPF ou o telefone em <strong>Buscar cliente</strong> para achar quem deve. Na linha do cliente, clique em <strong>Receber</strong>. Digite o valor (pode ser parcial) e escolha a loja que recebe. O Financeiro recebe só por Pix, na conta da loja; o dinheiro em espécie entra na gaveta, com o Vendedor ou o Caixa. A entrada aparece no extrato da conta como <strong>Fiado recebido</strong>.</>,
          <>Em <strong>Cheques</strong>, cada cheque passa por recebido, depositado, compensado ou devolvido. O cheque com o selo <strong>A completar</strong> ainda não tem número, banco ou bom para: clique em <strong>Completar</strong>. Ele não se deposita enquanto falta dado.</>,
          <>Em <strong>Boletos</strong>, filtre por <strong>Abertos</strong>, <strong>Vencidos</strong>, <strong>Pagos</strong> ou <strong>No fiado</strong>. Quando o banco pagar, clique em <strong>Boleto pago</strong>. Se o cliente não pagou, clique em <strong>Mandar para o fiado</strong>.</>,
          <>Em <strong>Cartões</strong>, cada parcela mostra a bandeira, a data e o líquido, com um estado: <strong>Prevista</strong>, <strong>A conferir</strong>, <strong>Atrasada</strong> ou <strong>Conferida</strong>. É aqui que se antecipa e que se confere o cartão (veja abaixo).</>,
          <>Em <strong>Vencidos</strong>, ficam os clientes com fiado atrasado, do mais atrasado ao menos, com o valor, há quantos dias e em quais lojas. Para ver só uma faixa de atraso, use <strong>Filtrar por tempo de atraso</strong>. Clique em <strong>Cobrar no WhatsApp</strong>, confira a mensagem (ela já vem com o nome e o valor, e dá para editar) e clique em <strong>Abrir o WhatsApp</strong>. A cobrança fica registrada: a linha mostra <strong>Cobrado em</strong> com a data.</>,
        ]}
        problemas={[
          {
            quando: "“Receber em dinheiro” não aparece, ou é recusado",
            fazer: "O Financeiro recebe fiado só por Pix. Dinheiro é na gaveta da loja, com o Vendedor ou o Caixa e o turno aberto.",
          },
          {
            quando: "O cliente aparece com “Sem telefone no cadastro”",
            fazer: <>Em <strong>Vencidos</strong>, clique em <strong>Completar em Clientes</strong>, cadastre o telefone e volte.</>,
          },
          {
            quando: "O cheque aparece com o selo A completar",
            fazer: "Ele foi registrado na venda sem número, banco ou bom para. Clique em Completar e preencha o que tiver. O cartão Cheques a completar, em Hoje, leva direto a eles.",
          },
        ]}
      >
        <Figura id="financeiro-cobranca" />
      </Tarefa>

      <Subtitulo>Antecipar o cartão</Subtitulo>
      <Tarefa
        paraQueServe="Registrar o que a adquirente pagou antes do prazo, e o custo disso."
        passos={[
          <>Em <strong>A receber</strong>, abra a aba <strong>Cartões</strong>. Marque a caixinha de cada parcela que ainda não caiu (todas da mesma conta). Antecipar é de quem gere a loja da parcela ou cuida do dinheiro.</>,
          <>Clique em <strong>Antecipar</strong>. Confira a <strong>Data da operação</strong> e digite o <strong>Líquido recebido</strong>: o que a adquirente de fato pagou. A tela mostra o custo e a porcentagem ao mês.</>,
          <>Clique em <strong>Registrar antecipação</strong>. As parcelas passam a valer na data da operação, e o custo vira uma despesa chamada Antecipação de recebíveis, que aparece no resultado, fora da margem.</>,
          <>Em <strong>Antecipações</strong>, na mesma aba, ficam as operações feitas. Para voltar atrás, clique em <strong>Desfazer</strong>: as parcelas voltam à data prevista e o custo é cancelado. Operação já conferida com o extrato não se desfaz, e a antecipação automática se desfaz cancelando a venda.</>,
        ]}
      >
        <Chamada tipo="saiba">
          <p>
            O <Link className="underline" href={`${B}/caixa`}>Caixa</Link> mostra as parcelas do cartão só para leitura. Antecipar e conferir são em A receber › Cartões.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Conferir o cartão</Subtitulo>
      <Tarefa
        paraQueServe="Dizer quanto do cartão caiu de fato na conta, para o saldo, o custo do cartão e o resultado baterem com o extrato da adquirente."
        passos={[
          <>Em <strong>A receber</strong>, aba <strong>Cartões</strong>, veja o estado de cada parcela: <strong>Prevista</strong> (ainda não caiu), <strong>A conferir</strong> (caiu ou cai hoje), <strong>Atrasada</strong> (passou um dia útil depois da data e ninguém conferiu) e <strong>Conferida</strong>. O saldo já conta a parcela na data; a conferência só corrige a diferença.</>,
          <>Para conferir tudo o que caiu num dia, clique em <strong>Conferir o dia</strong> na data, adquirente e conta. O painel soma o previsto e já vem preenchido com ele: digite o total que o extrato mostra e clique em <strong>Conferir</strong>. Com a tela numa loja só, confere só as parcelas daquela loja.</>,
          <>Para conferir uma parcela só, clique em <strong>Conferir</strong> na linha e digite o valor que caiu.</>,
          <>Se a diferença passar de 10% do previsto, o painel pergunta antes: confira o valor e clique em <strong>Confirmar e conferir</strong>.</>,
          <>A diferença vira a linha <strong>Ajuste da conferência do cartão</strong> no extrato da conta, já conferida com o banco. No resultado ela entra em <strong>Ajustes da conferência</strong>, no custo do cartão.</>,
          <>Se conferiu errado, clique em <strong>Desfazer</strong> na parcela e diga o motivo. A conferida fica à vista por 7 dias depois da data.</>,
        ]}
        problemas={[
          {
            quando: "O Gestor da loja não vê o botão Conferir",
            fazer: "É de propósito. Conferem o Dono, o Gerente geral e o Financeiro. O Gestor vê o estado das parcelas no Caixa.",
          },
          {
            quando: "“Esta parcela foi conferida pela antecipação”, ao tentar desfazer",
            fazer: "A parcela antecipada nasce conferida. Para voltar atrás, desfaça a antecipação em A receber › Cartões.",
          },
          {
            quando: "Parcelas antigas já aparecem como conferidas",
            fazer: "Quando a conferência chegou, as parcelas com data de mais de 7 dias antes foram conferidas pelo valor previsto, sem ajuste. As dos últimos 7 dias ficaram para conferir.",
          },
        ]}
      />

      <Subtitulo id="aprovacoes">Aprovações</Subtitulo>
      <Tarefa
        paraQueServe="Deixar o Dono ou o Gerente geral decidir os pagamentos grandes, antes de o dinheiro sair."
        passos={[
          <>O Dono ou o Gerente geral define o <strong>Teto sem aprovação (R$)</strong> em <strong>Configurações</strong>, na seção <strong>Alçada de pagamento</strong>. Sem teto, todo pagamento sai direto.</>,
          <>Quem não é Dono nem Gerente geral e paga acima do teto não paga: o aviso diz que o pagamento <strong>ficou esperando aprovação</strong>, e as contas continuam em A pagar.</>,
          <>O Dono ou o Gerente geral abre <strong>Dinheiro</strong> e <strong>Aprovações</strong> (o cartão <strong>Esperando aprovação</strong>, em Hoje, leva para lá). A aba <strong>Esperando</strong> mostra, em cada pedido, as contas, quem pediu e de onde sai o dinheiro.</>,
          <>Clique em <strong>Aprovar</strong> e confirme em <strong>Aprovar e pagar</strong>: o pagamento sai naquele momento, com o saldo conferido de novo. Ou clique em <strong>Recusar</strong> e escreva o <strong>Motivo</strong>.</>,
          <>Em <strong>Decididos</strong> ficam os pedidos aprovados e recusados, com quem decidiu e o motivo.</>,
        ]}
        problemas={[
          {
            quando: "“Aprovar” falha com saldo insuficiente",
            fazer: "A falha fica escrita no pedido, que continua esperando. Ponha dinheiro na conta ou na gaveta e aprove de novo, ou recuse.",
          },
          {
            quando: "O Financeiro não vê os botões Aprovar e Recusar",
            fazer: "É de propósito. Quem pede não decide: só o Dono e o Gerente geral aprovam ou recusam.",
          },
        ]}
      >
        <Figura id="financeiro-aprovacoes" />
      </Tarefa>

      <Subtitulo id="conferir-com-o-banco">Conferir o extrato com o banco</Subtitulo>
      <Tarefa
        paraQueServe="Marcar, linha por linha, o que já foi conferido com o extrato do banco, e ver o que ainda falta."
        passos={[
          <>Abra <strong>Dinheiro</strong> e <strong>Caixa</strong>, e desça até <strong>Saldo de cada lugar</strong>. Essa seção só aparece para quem cuida do dinheiro. Se tiver mais de uma loja, use o campo <strong>Filtrar por loja</strong> da própria seção.</>,
          <>Na linha de uma conta bancária, clique em <strong>Ver extrato</strong>. O extrato mostra as entradas e saídas do período, com o saldo de abertura e o de fechamento. As contas têm a coluna <strong>Conferência</strong>.</>,
          <>Confira a linha com o extrato do banco e clique em <strong>Conferir com o banco</strong>. A linha passa a mostrar <strong>Conferido em</strong> com o dia.</>,
          <>Se conferiu por engano, clique em <strong>Desfazer a conferência</strong>.</>,
          <>O total <strong>A conferir no período</strong> mostra quanto e em quantas linhas ainda falta conferir. Marque <strong>Só a conferir</strong> para esconder as conferidas.</>,
          <>Em <strong>Hoje</strong>, o cartão <strong>A conferir com o banco</strong> avisa quando há linha da conta sem conferir nos últimos 30 dias e leva direto para elas.</>,
        ]}
        problemas={[
          {
            quando: "O extrato recusa o período",
            fazer: "O extrato vai até 92 dias. Escolha datas mais próximas.",
          },
          {
            quando: "Gaveta e gerência não têm a coluna Conferência",
            fazer: "É de propósito. A conferência é feita com o extrato do banco, e gaveta não tem extrato de banco.",
          },
        ]}
      >
        <Figura id="financeiro-extrato" />
      </Tarefa>

      <Chamada tipo="atencao">
        <p>
          As compras à vista lançadas antes de 07/11/2026 não tiraram dinheiro de lugar nenhum: o saldo das gavetas e das
          contas ficou maior do que o real. A partir dessa data, toda compra à vista diz de onde saiu o dinheiro. A
          diferença antiga não se corrige conta por conta: a primeira <strong>conferência de caixa</strong> (ou o{" "}
          <strong>saldo inicial</strong> da conta bancária) absorve o que sobrou. Faça-a logo que puder.
        </p>
      </Chamada>
      <Chamada tipo="saiba">
        <p>
          Quem lança a compra e quem paga podem ser pessoas diferentes. Veja <Link className="underline" href={`${B}/compras`}>Comprar e receber</Link>{" "}
          para lançar, <Link className="underline" href={`${B}/a-pagar#contas`}>A pagar e despesas</Link> para pagar, e{" "}
          <Link className="underline" href={`${B}/caixa`}>Caixa</Link> para as gavetas e as contas. Para o fluxo dos próximos
          dias, veja <Link className="underline" href={`${B}/estatisticas#dinheiro`}>Estatísticas</Link>.
        </p>
      </Chamada>
    </div>
  );
}

/** A pagar e despesas: as três abas da tela A pagar. */
export function ParteDeAPagar() {
  return (
    <div className="space-y-2">
      <p>
        Abra <strong>Dinheiro</strong> e <strong>A pagar</strong>. É a tela de quem gere a loja ou cuida do dinheiro: o Gestor,
        o Gerente geral, o Financeiro e o Dono. Ela tem três abas: <strong>Contas</strong>, <strong>Despesas fixas</strong> e{" "}
        <strong>Vendeu, Pagou</strong>. Quem tem mais de uma loja escolhe a loja no botão <strong>Loja</strong>, no alto da
        tela. Quem tem uma loja só não vê esse botão.
      </p>

      <Subtitulo id="contas">Contas: pagar a conta de uma compra</Subtitulo>
      <Tarefa
        paraQueServe="Pagar o fornecedor de uma compra a prazo, ou qualquer outra conta, e tirar o dinheiro do lugar certo."
        passos={[
          <>Na aba <strong>Contas</strong>, quatro cartões somam <strong>Vencida</strong>, <strong>Vence hoje</strong>, <strong>A vencer</strong> e <strong>Pago no período</strong>. Clique num deles para filtrar a lista. A lista <strong>Contas a pagar</strong> traz a compra como uma conta, com o nome do fornecedor e a loja.</>,
          <>Marque a conta (ou <strong>Marcar todas</strong>) e clique em <strong>Pagar selecionadas</strong>.</>,
          <>Em <strong>De onde sai o dinheiro</strong>, escolha a conta bancária. O Gestor da loja escolhe também a gaveta; o Financeiro não, porque a gaveta é da loja.</>,
          <>Confira a <strong>Data do pagamento</strong> e clique no botão com o total. O saldo da conta cai e a saída entra no extrato como <strong>Conta paga</strong>.</>,
          <>Para dar mais prazo, clique em <strong>Adiar</strong> na conta e escolha a nova data. Para desistir da conta, clique em <strong>Cancelar</strong> e diga o motivo; a compra em si continua valendo. Adiar e cancelar são de quem cuida do dinheiro.</>,
          <>Para uma conta que não veio de compra, clique em <strong>Adicionar conta</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“Não é possível cancelar: a conta já tem pagamento.”",
            fazer: "Conta com pagamento não se cancela. Desfaça o pagamento antes, se foi engano.",
          },
          {
            quando: "O Financeiro do Tibé (da fazenda) não mostra essa conta",
            fazer: "É de propósito. As contas do Empório se pagam só aqui, porque aqui o pagamento tira dinheiro de uma gaveta ou conta. O Tibé recusa pagar uma conta do Empório.",
          },
          {
            quando: "O pagamento “ficou esperando aprovação”",
            fazer: <>O valor passou do teto da conta. O Dono ou o Gerente geral decide em <Link className="underline" href={`${B}/dinheiro#aprovacoes`}>Aprovações</Link>.</>,
          },
        ]}
      >
        <Figura id="financeiro-pagar" />
        <Chamada tipo="saiba">
          <p>
            As comissões do Vendeu, Pagou com o mesmo nome, loja e vencimento aparecem numa linha só, como “Comissão · 12
            contas · R$ 340,00”. Clique na linha (a setinha ▸) para abrir as contas e marcar uma a uma. Marcar a linha
            inteira paga o grupo todo.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo id="despesas-fixas">Despesas fixas</Subtitulo>
      <Tarefa
        paraQueServe="Cadastrar as contas que se repetem todo mês, como aluguel e luz, e dividir entre as lojas."
        passos={[
          <>Abra <strong>Dinheiro</strong>, <strong>A pagar</strong>, aba <strong>Despesas fixas</strong>, e clique em <strong>Nova despesa fixa</strong>.</>,
          <>Digite o <strong>Nome</strong>, o <strong>Valor por mês</strong>, o <strong>Dia do vencimento</strong> e, se quiser, a <strong>Categoria</strong>. Em <strong>Começa em</strong>, escolha o mês.</>,
          <>Em <strong>Dividir entre as lojas</strong>, divida em porcentagem ou em valor. A soma precisa fechar 100% ou o valor total.</>,
          <>Clique em <strong>Cadastrar despesa</strong>. O sistema cria as contas dos próximos 12 meses, uma por loja e por mês.</>,
          <>Quando pagar, volte à aba <strong>Contas</strong>. Dá para pagar várias de uma vez.</>,
        ]}
        problemas={[
          { quando: "A divisão é recusada", fazer: "A soma das partes não fecha. Ajuste até dar 100% ou o valor total." },
          { quando: "A conta do mês veio com outro valor", fazer: "Pague com o valor real. O sistema corrige aquele mês." },
          {
            quando: "A despesa aparece com “Renovar”",
            fazer: "As contas dos 12 meses acabaram. Clique em Renovar para gerar mais.",
          },
        ]}
      >
        <Figura id="despesas-fixas" />
      </Tarefa>

      <Subtitulo>Rateio automático da despesa fixa</Subtitulo>
      <Tarefa
        paraQueServe="Dividir uma despesa entre as lojas sem fazer conta: o sistema divide pelo faturamento, pela área ou pelo número de funcionários."
        passos={[
          <>Em <strong>Ajustes</strong> e <strong>Lojas</strong>, preencha a <strong>Área (m²)</strong> e os <strong>Funcionários</strong> de cada loja. O Financeiro também pode preencher esses dois campos.</>,
          <>Em <strong>Despesas fixas</strong>, cadastre a despesa e, em <strong>Dividir entre as lojas</strong>, escolha <strong>Proporcional ao faturamento</strong>, <strong>Por área (m²)</strong> ou <strong>Por funcionários</strong>. Não precisa digitar a parte de cada loja.</>,
          "A despesa é dividida entre todas as lojas ativas. No faturamento, vale o que cada loja vendeu no mês anterior.",
          "Só a conta do mês atual é criada de uma vez. A de cada mês seguinte nasce quando o mês chega, com a divisão daquele momento.",
          <>Na lista, a coluna <strong>Rateio</strong> mostra a parte de cada loja e avisa a loja que ficou sem base, por exemplo <strong>sem área cadastrada</strong>. Essa loja recebe zero.</>,
        ]}
        problemas={[
          {
            quando: "“O rateio automático divide entre todas as lojas”",
            fazer: "Só quem vê todas as lojas pode usar esse rateio. O Gestor de uma loja só não pode: peça ao Dono, ao Gerente geral ou ao Financeiro.",
          },
          {
            quando: "Uma loja ficou com zero",
            fazer: "Ela não tem a área, os funcionários ou o faturamento do mês anterior. Cadastre o dado em Lojas para as próximas contas.",
          },
          {
            quando: "Abri uma loja ou mudei os funcionários no meio do mês e o mês atual não mudou",
            fazer: "Na aba Despesas fixas, na despesa de rateio automático, clique em Recalcular este mês e confirme. O valor do mês é dividido de novo entre as lojas de hoje: as contas ainda não pagas são canceladas e nascem as novas. Se alguma conta do mês já foi paga, nada muda. Só vale para o mês atual ou os seguintes.",
          },
        ]}
      >
        <Figura id="despesa-rateio-automatico" />
      </Tarefa>

      <Subtitulo id="vendeu-pagou">Vendeu, Pagou</Subtitulo>
      <Tarefa
        paraQueServe="Contar na margem as despesas que nascem junto com a venda, como comissão, entrega e taxa de cartão."
        passos={[
          <>Abra <strong>Dinheiro</strong>, <strong>A pagar</strong>, aba <strong>Vendeu, Pagou</strong>, e clique em <strong>Nova regra</strong>.</>,
          "Escolha a loja, o nome (por exemplo, Entrega), o cálculo (percentual, valor fixo ou embalagem que sai do estoque) e, se quiser, a forma de pagamento e o produto a que ela vale.",
          <>Clique em <strong>Cadastrar regra</strong>. A cada venda, o sistema reconhece a despesa na margem. O dinheiro só sai quando você paga a conta, na aba <strong>Contas</strong>.</>,
        ]}
      />
      <Chamada tipo="saiba">
        <p>
          O desconto não entra no Vendeu, Pagou: ele diminui a venda. A taxa de cartão é descontada do valor que você
          vai receber.
        </p>
      </Chamada>
    </div>
  );
}

/** Estatísticas: as cinco abas, o filtro único e os relatórios para imprimir. */
export function ParteDeEstatisticas() {
  return (
    <div className="space-y-2">
      <p>
        <strong>Estatísticas</strong> é um item solto do menu de <strong>Meu Empório</strong>, e reúne os números da loja num
        lugar só. É do Gestor, do Gerente geral, do Financeiro e do Dono. O Vendedor e o Caixa não veem. No alto há um filtro de
        período, que vale para todas as abas, e a loja vem do botão <strong>Loja</strong>, no topo da tela.
      </p>
      <Chamada tipo="saiba">
        <p>
          O filtro tem <strong>Hoje</strong>, <strong>7 dias</strong>, <strong>Este mês</strong>, <strong>Mês passado</strong> e{" "}
          <strong>Escolher datas</strong> (com <strong>De</strong> e <strong>Até</strong>, e o botão <strong>Aplicar</strong>).
          Sem escolher nada, vale Este mês. O botão <strong>Loja</strong> só aparece para quem tem duas lojas ou mais: com
          uma loja só, os números já são dela.
        </p>
      </Chamada>

      <Subtitulo id="visao-geral">Visão geral</Subtitulo>
      <Tarefa
        paraQueServe="Ver, numa tela só, como vão as vendas, o dinheiro e o resultado, e saltar para o detalhe."
        passos={[
          <>Abra <strong>Estatísticas</strong>. A aba <strong>Visão geral</strong> abre primeiro.</>,
          <>O cartão <strong>Vendas</strong> mostra quanto se vendeu no período, a comparação com o mesmo trecho do mês anterior, as barras por dia, o produto que mais vendeu, o melhor vendedor e quantos produtos ficaram parados.</>,
          <>O cartão <strong>Dinheiro</strong> só aparece para quem cuida do dinheiro. Ele olha de hoje para a frente e não usa o período do filtro.</>,
          <>O cartão <strong>Resultado</strong> mostra o resultado do mês da data final do período e o ponto de equilíbrio. Se você alcança várias lojas e deixou o botão <strong>Loja</strong> em Todas, ele mostra a soma e uma linha por loja: escolha uma loja para ver o ponto de equilíbrio.</>,
          <>O link no pé de cada cartão (<strong>Ver vendas ›</strong>, <strong>Ver dinheiro ›</strong>, <strong>Ver resultado ›</strong>) abre a aba dele.</>,
        ]}
      >
        <Figura id="estatisticas-visao-geral" />
      </Tarefa>

      <Subtitulo id="vendas">Vendas</Subtitulo>
      <Tarefa
        paraQueServe="Ver quem vendeu, o que vendeu e o que ficou parado, no período e na loja escolhidos. Serve para acertar a comissão."
        passos={[
          <>Abra <strong>Estatísticas</strong> e a aba <strong>Vendas</strong>.</>,
          "Escolha o período no filtro do alto. Os dois dias das pontas entram na conta.",
          "Se tiver mais de uma loja, escolha a loja no botão Loja, no topo. Deixe em Todas para somar as lojas que você alcança. O Gestor vê só as lojas dele.",
          "Leia os blocos, de cima para baixo. A Curva ABC vem primeiro.",
        ]}
        problemas={[
          {
            quando: "Aparece “Período inválido. Mostrando este mês.”",
            fazer: "A data final não pode ser antes da inicial, e o período vai até 366 dias. Corrija De e Até.",
          },
          {
            quando: "Um produto não aparece em Produtos parados",
            fazer: "Só entra o produto com preço na loja e que não está arquivado. Produto sem preço na loja fica de fora.",
          },
        ]}
      >
        <Figura id="relatorios-periodo" />
      </Tarefa>

      <Subtitulo>Os blocos de vendas</Subtitulo>
      <ul className="list-disc space-y-2 pl-5 text-texto marker:text-texto-discreto">
        <li>
          <strong>Por origem</strong>: quanto vendeu o balcão e quanto vendeu o e-commerce, com o número de vendas, o
          faturamento, o frete cobrado, o crédito de franqueado e a parte de cada um no faturamento. O faturamento não
          inclui o frete nem o crédito de franqueado, que aparecem em colunas próprias. Com mais de uma loja, a mesma quebra vem para cada loja.
        </li>
        <li>
          <strong>Vendas por vendedor</strong>: quantas vendas, o total e o ticket médio de cada um. O vendedor é quem
          atendeu, não quem registrou no caixa. O sistema não calcula o percentual da comissão: você aplica o seu sobre o
          total.
        </li>
        <li>
          <strong>Vendas por produto</strong>: a quantidade, na unidade-base, e o total de cada produto, do maior total para
          o menor.
        </li>
        <li>
          <strong>Produtos parados</strong>: têm preço na loja e não venderam nada no período. Com mais de uma loja, cada
          linha diz a loja.
        </li>
        <li>
          <strong>Vendas por loja</strong>: quantas vendas, o total e o ticket médio de cada loja.
        </li>
        <li>
          <strong>PIX por conta</strong>: para cada conta bancária, quantos pagamentos em PIX e quanto valeram, das vendas
          que o relatório conta no período, no total e por loja. Serve para conferir o que entrou em cada conta.
        </li>
      </ul>
      <Chamada tipo="saiba">
        <p>
          Venda cancelada não conta. A devolução feita no período desconta do vendedor e da loja da venda original, mesmo
          que a venda seja de antes do período. Por isso um total pode ficar negativo. A venda nova de uma troca soma no
          total, mas não conta como mais uma venda.
        </p>
      </Chamada>

      <Subtitulo>Curva ABC</Subtitulo>
      <Tarefa
        paraQueServe="Ver os poucos produtos e clientes que fazem a maior parte das vendas, para cuidar do estoque, da promoção e do relacionamento."
        passos={[
          <>Na aba <strong>Vendas</strong>, escolha o período e a loja e veja a <strong>Curva ABC</strong>.</>,
          <>Escolha <strong>Produtos</strong> ou <strong>Clientes</strong>, e a medida: <strong>Faturamento</strong> ou <strong>Lucro (venda menos custo)</strong>. Quem não vê o lucro não recebe a escolha da medida.</>,
          <>A lista vem do maior para o menor. <strong>A</strong> são os que, somados, chegam a 80% do total; <strong>B</strong>, os que levam de 80% a 95%; <strong>C</strong>, o resto.</>,
          <>No alto, o resumo diz quantos itens tem cada classe e quanto eles somam. A coluna <strong>Acumulado</strong> mostra até onde a soma chegou em cada linha.</>,
        ]}
        problemas={[
          {
            quando: "Aparece “Sem vendas positivas no período”",
            fazer: "No período e na loja escolhidos não houve venda, ou tudo foi devolvido. Mude o período ou a loja.",
          },
          {
            quando: "Um produto aparece com “sem custo” ou “custo estimado”",
            fazer: "No Lucro, a venda saiu sem a compra lançada ou com o custo provisório. Lance a compra para o custo ficar certo.",
          },
        ]}
      >
        <Chamada tipo="saiba">
          <p>
            Nos Clientes, o Consumidor final e as vendas sem cliente ficam fora da curva, numa linha à parte: eles juntam
            todo mundo que não se identificou. O Lucro da curva é a venda menos o custo da mercadoria. O{" "}
            <Link className="underline" href={`${B}/estatisticas#resultado`}>Resultado</Link> também desconta as despesas variáveis e a
            taxa do cartão, então os dois números não são iguais.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo id="dinheiro">Dinheiro, a aba que olha para a frente</Subtitulo>
      <Tarefa
        paraQueServe="Saber quem deve há quanto tempo, o que vence a pagar, onde está o dinheiro e se ele vai dar para pagar o que vem pela frente."
        passos={[
          <>Abra <strong>Estatísticas</strong> e a aba <strong>Dinheiro</strong>. Ela só aparece para quem cuida do dinheiro: o Financeiro, o Gerente geral e o Dono.</>,
          <><strong>A receber por idade</strong> mostra cada cliente com o que deve em dia e o que está vencido há 1 a 15 dias, 16 a 30 dias ou mais de 30.</>,
          <><strong>A pagar por vencimento</strong> junta as contas dos próximos 30 dias por semana e por nome. O que já venceu fica na primeira semana, com a marca <strong>Vencido</strong>. As contas sem data de vencimento ficam no quadro <strong>Sem vencimento</strong>, fora das semanas.</>,
          <><strong>Posição de caixa por lugar</strong> mostra o saldo de hoje de cada gaveta, gerência e conta, e o que entrou e saiu no período do filtro.</>,
          <>Em <strong>Fluxo projetado</strong>, escolha <strong>30 dias</strong>, <strong>60 dias</strong> ou <strong>90 dias</strong>. No alto está o <strong>Saldo de hoje</strong>: a soma do dinheiro de todas as gavetas, gerências e contas bancárias.</>,
          <>O gráfico traz uma linha com o saldo ao fim de cada semana. A semana em que o saldo fica abaixo de zero ganha um ponto vermelho, e a frase diz quantas semanas ficam negativas: é o aviso de que o dinheiro aperta.</>,
          <>Cada semana mostra o que deve entrar (fiado, parcela de cartão e cheque) e o que deve sair (contas a pagar e despesas fixas). A última coluna é o saldo ao fim da semana. O fiado e a conta que já venceram entram na <strong>Semana 1</strong>, porque ainda precisam ser recebidos e pagos.</>,
          <>Cada relatório tem dois botões. <strong>Baixar planilha</strong> entrega um arquivo que o Excel abre sem ajuste (colunas separadas por ponto e vírgula, números com vírgula e datas no formato dia/mês/ano). <strong>Imprimir ou salvar em PDF</strong> abre uma folha A4 em outra aba, com o nome da loja e a data de emissão: clique em <strong>Imprimir</strong> e escolha a impressora ou “Salvar como PDF”.</>,
        ]}
        problemas={[
          {
            quando: "Os números não mudam quando escolho outro período",
            fazer: "É de propósito. O a receber, o a pagar e o fluxo olham de hoje para a frente. Só a posição por lugar usa o período do filtro.",
          },
          {
            quando: "A despesa fixa dos meses seguintes vem com a marca “estimativa”",
            fazer: "É uma despesa com rateio automático que ainda não nasceu. O valor usa a divisão de hoje e pode mudar quando o mês chegar.",
          },
          {
            quando: "A conta bancária não aparece quando escolho uma loja",
            fazer: "A conta bancária é da rede inteira e só entra com o botão Loja em Todas.",
          },
        ]}
      >
        <Figura id="financeiro-projecao" />
        <Figura id="financeiro-relatorios" />
      </Tarefa>

      <Subtitulo id="resultado">Resultado e ponto de equilíbrio</Subtitulo>
      <Tarefa
        paraQueServe="Saber se a loja deu lucro no mês e quanto falta para pagar as despesas fixas."
        passos={[
          <>Abra <strong>Estatísticas</strong> e a aba <strong>Resultado</strong>. O resultado é sempre de um mês: vale o mês da data final do período. Se o período pega mais de um mês, a tela avisa qual mês mostra.</>,
          <>Escolha a loja no botão <strong>Loja</strong>, no topo. Quem tem uma loja só já vê o resultado dela. O Dono e o Gerente geral podem deixar em Todas e ver tudo somado. Quem alcança só algumas lojas vê, em Todas, a soma e <strong>Loja por loja</strong>, sem o detalhe do mês.</>,
          "Leia de cima para baixo: vendas, menos o custo, menos o Vendeu, Pagou, dá a margem.",
          "Logo abaixo ficam as perdas e quebras, em linha separada, para você ver quanto custaram.",
          "Depois descontam-se as despesas fixas e sobra o resultado.",
          <>O quadro <strong>Custo do cartão</strong> diz quantos por cento do que a loja vendeu no cartão no mês foi para a taxa da maquininha e para a antecipação. Abaixo dele estão o valor vendido no cartão, a taxa e a antecipação. Sem venda no cartão no mês, o quadro diz isso.</>,
          <>O <strong>Ponto de equilíbrio</strong> mostra quanto a loja precisa vender para cobrir as fixas, e quanto falta. O <strong>Acompanhamento do mês</strong> mostra o ritmo, dia a dia.</>,
          <>Perto do fim ficam as linhas de repasse: <strong>Frete de entrega (repasse)</strong> e <strong>Créditos de franqueado (repasse)</strong>. O dinheiro do crédito entra e sai do caixa, mas não é venda, custo nem lucro. Ele aparece separado, discriminado em recebido nas vendas e pago aos franqueados, fora do faturamento e da margem. A linha dos créditos só aparece quando houve crédito no mês.</>,
          <>Embaixo, <strong>Produtos do mês</strong> lista os que mais vendem e os que mais dão margem, e <strong>Vendas com margem negativa</strong> mostra onde o prejuízo está.</>,
        ]}
        problemas={[
          {
            quando: "O resultado vem marcado como estimado",
            fazer: "Algum custo está provisório ou falta (venda sem compra lançada, estoque inicial sem custo), ou uma despesa fixa ainda não foi paga. Lance a compra ou o custo e o selo some.",
          },
          {
            quando: "Aparece “sem dados ainda” no ponto de equilíbrio",
            fazer: "A loja ainda não vendeu. Com menos de dez vendas no mês, o sistema usa os últimos 30 dias.",
          },
          {
            quando: "O ponto de equilíbrio diz que a loja não se paga",
            fazer: "A margem está zero ou negativa. Revise preço e custo. A lista de vendas com margem negativa mostra onde o prejuízo está.",
          },
          {
            quando: "Em Todas, só vejo a soma e Loja por loja",
            fazer: "Você alcança só algumas lojas. Escolha uma loja no botão Loja para ver o mês detalhado.",
          },
        ]}
      >
        <Figura id="resultado-loja" />
        <Figura id="resultado-equilibrio" />
      </Tarefa>

      <Subtitulo id="imprimir">Relatórios para imprimir</Subtitulo>
      <Tarefa
        paraQueServe="Ter a folha pronta, ou a planilha, de cada relatório, para imprimir, guardar ou levar ao contador."
        passos={[
          <>Abra <strong>Estatísticas</strong> e a aba <strong>Relatórios para imprimir</strong>. Os relatórios vêm em grupos: <strong>Vendas</strong>, <strong>Dinheiro</strong> (só para quem cuida do dinheiro) e <strong>Resultado</strong>.</>,
          <>Cada relatório tem dois botões: <strong>Imprimir ou PDF</strong>, que abre a folha A4 em outra aba, e <strong>Planilha</strong>, que baixa o arquivo para o Excel.</>,
          <>Os dois usam o período do filtro e a loja do topo. O resultado do mês vale o mês da data final.</>,
        ]}
        problemas={[
          {
            quando: "A folha sai com datas diferentes das que escolhi",
            fazer: "A pagar por vencimento e Fluxo projetado olham sempre os próximos 30 dias, a partir de hoje.",
          },
        ]}
      />
      <Chamada tipo="dica">
        <p>
          Os blocos de vendas contam vendas, não lucro. Para saber se a loja deu lucro, olhe o Resultado. O crédito do
          franqueado aparece ali como repasse, separado. Veja <Link className="underline" href={`${B}/franqueados`}>Franqueados</Link>.
        </p>
      </Chamada>
    </div>
  );
}
