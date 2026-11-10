import Link from "next/link";
import { Chamada } from "../_components/chamada";
import { Figura } from "../_components/figura";
import { Subtitulo, Tarefa } from "../_components/tarefa";
import { BASE_DO_EMPORIO } from "./indice";

const B = BASE_DO_EMPORIO;

export function ParteDeVender() {
  return (
    <Tarefa
      paraQueServe="Registrar a venda no balcão em poucos segundos, tirar do estoque e lançar o dinheiro no caixa aberto."
      passos={[
        <>Abra <strong>Vender</strong>. A tela já abre em <strong>Venda</strong>. Se você trabalha em mais de uma loja, confira a <strong>Loja</strong>.</>,
        "Busque o produto pelo nome, pela marca ou pelo código e toque nele. Repita para cada item.",
        "Ajuste a quantidade. Se o preço cadastrado estiver vazio, digite o valor.",
        "Se precisar dar desconto, digite um preço menor que o sugerido no item. A tela mostra o desconto. Até o limite da loja você mesmo dá.",
        <>No campo <strong>Cliente</strong>, clique em <strong>Escolher cliente</strong> e busque pelo nome, pelo CPF ou CNPJ, ou por um pedaço do telefone. Quem não quer se identificar entra como <strong>Consumidor final</strong>, que fica sempre no alto da janela. Para cadastrar na hora, clique em <strong>Cadastrar novo cliente</strong>: na pessoa física, nome e telefone; na jurídica, também o CNPJ e o endereço principal.</>,
        <>Se aparecer <strong>Cadastro incompleto</strong>: se quiser, clique em <strong>Completar cadastro</strong>; a venda passa assim mesmo.</>,
        <>Em <strong>Pagamento</strong>, toque em <strong>+ Dinheiro</strong>, <strong>+ PIX</strong>, <strong>+ Débito</strong>, <strong>+ Crédito</strong>, <strong>+ Parcelado</strong>, <strong>+ Cheque</strong> ou <strong>+ Fiado</strong> e digite o valor. Dá para dividir em mais de uma forma. A soma precisa fechar o total, e só o dinheiro dá troco.</>,
        <>No cartão, escolha a <strong>bandeira</strong> (Visa/Master, Elo, Hipercard, Amex ou Outra): nenhuma vem marcada, e o botão <strong>Fechar a venda</strong> só libera depois. Se a loja tem mais de uma adquirente (Cielo, Stone, Rede), escolha também a <strong>adquirente</strong>. A tela mostra a taxa e o valor líquido antes de fechar, e a venda guarda a taxa que valia na hora. A taxa fixa em reais, quando existe, aparece separada da porcentagem. Se a adquirente conta o prazo em dias úteis, a data da parcela já vem ajustada para um dia útil (fim de semana e feriado nacional passam para o dia seguinte). Se a adquirente antecipa sozinha as vendas no crédito, a tela mostra também a linha <strong>Antecipado: cai em</strong> a data e o <strong>líquido estimado</strong> depois do custo da antecipação.</>,
        <>Se a loja cobra a entrega do cliente, digite o valor em <strong>Frete cobrado do cliente (opcional)</strong>. O cliente paga os itens mais o frete, e a soma do pagamento precisa fechar o <strong>Total com frete</strong>. Em <strong>Origem da venda</strong>, escolha <strong>Balcão</strong> ou <strong>E-commerce</strong>.</>,
        <>Confira o <strong>Vendedor</strong>. Ele já vem com o seu nome: se outro colega atendeu, escolha o nome dele. O Caixa escolhe quem atendeu em toda venda.</>,
        <>Clique em <strong>Fechar a venda</strong>. A venda cai no caixa aberto da loja.</>,
        <>O quadro <strong>Venda registrada</strong> mostra o valor, a <strong>Venda nº</strong> e o troco. Se o cliente quiser o papel, clique em <strong>Imprimir A4</strong> ou <strong>Imprimir cupom</strong>.</>,
      ]}
      problemas={[
        {
          quando: "“Nenhum caixa aberto nesta loja. Abra o caixa com o troco inicial para vender.”",
          fazer: <>Toda venda precisa de um caixa aberto. O balcão mostra <strong>Abrir o Caixa 1</strong> (ou pede para escolher em <strong>Escolha o caixa a abrir</strong>). Conte o troco e abra ali mesmo. Se foi o Fechar a venda que parou, a venda fecha sozinha assim que o caixa abre, com os mesmos itens.</>,
        },
        {
          quando: "“Há mais de um caixa aberto. Escolha o caixa.”",
          fazer: <>Escolha no campo <strong>Caixa</strong> em qual gaveta o dinheiro entra.</>,
        },
        {
          quando: "“Escolha o cliente da venda.”",
          fazer: "Toda venda tem cliente. Se a pessoa não quer se identificar, escolha Consumidor final.",
        },
        {
          quando: "“Fiado precisa do cliente de verdade, não do Consumidor final.” (ou o mesmo para o cheque)",
          fazer: "Escolha o cliente de verdade, ou cadastre pelo botão Cadastrar novo cliente.",
        },
        {
          quando: "“Escolha o vendedor que atendeu.”",
          fazer: "Aparece para o Caixa. Escolha no campo Vendedor quem atendeu o cliente.",
        },
        {
          quando: "A venda de saca fechada é recusada",
          fazer: "Não há saca lacrada no estoque. Vender saca fechada exige saca fechada de verdade. Faça uma contagem, lance a compra, ou venda a granel.",
        },
        {
          quando: "O PIX é recusado",
          fazer: "A loja não tem conta bancária de PIX escolhida. Chame o Dono ou o Gestor para cadastrar.",
        },
        {
          quando: "O cartão é recusado",
          fazer: <>A loja não tem taxa para essa combinação de adquirente, bandeira e forma de cartão (débito, crédito ou parcelado, com o número de parcelas). O Gestor cadastra em <Link className="underline" href={`${B}/configuracoes#cartoes`}>Configurações</Link>, em Cartões.</>,
        },
        {
          quando: "O desconto é recusado: “O desconto de X% passa do limite de Y% desta loja. Peça ao gestor da loja.”",
          fazer: "Passou do limite da loja. Chame o Gestor ou o Dono para dar o desconto.",
        },
      ]}
    >
      <Figura id="balcao-venda" />
      <Figura id="balcao-cliente-vendedor" />
      <Figura id="balcao-escolher-cliente" />
      <Figura id="balcao-pagamento" />
      <Figura id="venda-impressa" />
      <Chamada tipo="atencao">
        <p>
          O papel diz “sem valor fiscal”: ele não é nota fiscal. Para imprimir de novo depois, abra a venda em Vendas (o Caixa vê só as de hoje). Como
          ajustar o papel está em <Link className="underline" href={`${B}/configuracoes`}>Configurações e impressão</Link>.
          Para salvar um preço para o cliente decidir depois, veja{" "}
          <Link className="underline" href={`${B}/orcamento`}>Orçamento</Link>.
        </p>
      </Chamada>
      <Chamada tipo="saiba">
        <p>
          Se a venda saiu com <strong>custo provisório</strong>, o sistema vendeu sem ter a compra lançada. Quando a
          compra entrar, a venda antiga não muda. O resultado dela fica marcado como estimado.
        </p>
      </Chamada>
    </Tarefa>
  );
}

export function ParteDeDevolver() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Desfazer uma venda, ou parte dela, sem apagar nada: tudo fica gravado."
        passos={[
          <>Abra <strong>Vendas</strong> e clique na venda.</>,
          <><strong>Devolver</strong>: escolha os itens e as quantidades. A mercadoria volta para o estoque (ou vira perda, se estiver estragada). Em <strong>Como devolver o valor</strong>, escolha <strong>Devolver em dinheiro (sai da gaveta)</strong> ou <strong>Abater do fiado do cliente</strong>.</>,
          <><strong>Trocar</strong>: devolve os itens e já abre uma venda nova, ligada à primeira.</>,
          <><strong>Editar</strong>: para corrigir itens, frete ou pagamento de uma venda concluída. Ele cancela a venda e registra outra no lugar, com outro número, e as duas ficam ligadas (<strong>Substituída pela venda nº</strong> e <strong>Substitui a venda nº</strong>). É do Gestor e do Dono, e não vale para venda com devolução.</>,
          <><strong>Cancelar venda</strong>: desfaz a venda inteira, com o <strong>Motivo</strong>. O estoque volta e o dinheiro sai de onde entrou. É do Gestor e do Dono.</>,
          <>Quando o dinheiro sai do caixa, a loja precisa de um caixa aberto. Com mais de um aberto, escolha em <strong>Caixa de onde sai o dinheiro</strong>.</>,
        ]}
        problemas={[
          {
            quando: "Os botões Devolver e Trocar não aparecem para o Vendedor",
            fazer: "É uma permissão extra, desligada por padrão. Peça ao Dono para ligar.",
          },
          {
            quando: "O Caixa não vê Devolver, Trocar nem Cancelar venda",
            fazer: "É assim mesmo: o Caixa não devolve, não troca e não cancela. Chame o Gestor.",
          },
          {
            quando: "“Nenhum caixa aberto nesta loja.”",
            fazer: "A devolução ou o cancelamento em dinheiro sai de um caixa aberto. Abra o caixa em Caixa e tente de novo.",
          },
          {
            quando: "O cancelamento é recusado",
            fazer: "Se a venda teve cheque que já foi depositado ou compensado, não dá para cancelar. Resolva o cheque primeiro, ou faça uma devolução.",
          },
          {
            quando: "O cliente quer crédito na loja",
            fazer: "Ainda não existe crédito na loja. Devolva o dinheiro ou abata o fiado dele.",
          },
        ]}
      >
        <Figura id="venda-detalhe" />
      </Tarefa>
      <Chamada tipo="saiba">
        <p>
          Cartão: as parcelas que ainda não caíram são canceladas. A que já caiu vira uma saída da conta. Cheque
          recebido volta para o cliente.
        </p>
        <p>
          Se a venda veio de um orçamento, cancelar a venda devolve o orçamento a aberto, e ele pode ser faturado de novo.
        </p>
      </Chamada>
    </div>
  );
}

export function ParteDeFiado() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Vender para o cliente pagar depois, sem perder a conta de quem deve."
        passos={[
          <>No balcão, clique em <strong>Escolher cliente</strong> e busque o cliente de verdade. O Consumidor final não compra fiado.</>,
          <>Se o cliente ainda não está cadastrado, clique em <strong>Cadastrar novo cliente</strong> e cadastre na hora: na pessoa física, nome e telefone; na jurídica, também o CNPJ e o endereço principal.</>,
          <>Em <strong>Pagamento</strong>, toque em <strong>+ Fiado</strong> e digite o valor que ele não paga agora.</>,
          <>Se combinaram uma data, preencha <strong>Vence em (opcional)</strong>. Não há juros nem multa.</>,
          <>Clique em <strong>Fechar a venda</strong>. Como toda venda, ela precisa de um caixa aberto. O sistema guarda o valor do fiado como dívida do cliente.</>,
        ]}
        problemas={[
          {
            quando: "“Fiado precisa do cliente de verdade, não do Consumidor final.”",
            fazer: "Troque o Consumidor final pelo cliente que vai pagar depois, ou cadastre pelo botão Cadastrar novo cliente.",
          },
        ]}
      >
        <Figura id="fiado-lista" />
      </Tarefa>

      <Subtitulo>Receber fiado</Subtitulo>
      <Tarefa
        paraQueServe="Registrar o pagamento de quem devia, mesmo que seja só uma parte."
        passos={[
          <>Abra <strong>Fiado</strong> e ache o cliente.</>,
          <>Clique em <strong>Receber</strong>.</>,
          <>Digite o <strong>Valor recebido (R$)</strong>. Pode ser menos do que o cliente deve.</>,
          <>Em <strong>Como o cliente pagou</strong>, escolha Dinheiro (entra na gaveta) ou PIX (entra na conta PIX da loja). Confira a <strong>Loja que recebe</strong>.</>,
          <>Em dinheiro, o valor entra num caixa aberto da loja. Com mais de um aberto, escolha em <strong>Caixa que recebe</strong>.</>,
          <>Clique em <strong>Registrar recebimento</strong>. O pagamento abate primeiro a dívida mais antiga.</>,
        ]}
        problemas={[
          {
            quando: "O painel diz “Nenhum caixa aberto nesta loja.”",
            fazer: <>Receber em dinheiro precisa de um caixa aberto. Clique em <strong>Abrir o caixa</strong>, abra com o troco e volte ao Fiado. Em PIX, o caixa não é preciso.</>,
          },
          {
            quando: "O cliente pagou com cheque e o cheque voltou",
            fazer: "A dívida volta para o fiado dele sozinha. Você não precisa lançar nada.",
          },
        ]}
      >
        <Figura id="fiado-receber" />
      </Tarefa>

      <Subtitulo>Limite, bloqueio e liberação</Subtitulo>
      <Tarefa
        paraQueServe="Não deixar o fiado crescer sem controle: cada cliente tem um limite e um prazo, e quem atrasa demais para de comprar fiado."
        passos={[
          <>O Financeiro (ou o Dono) define o prazo, o bloqueio e o limite padrão em <strong>Configurações</strong>, na seção <strong>Fiado</strong>. Para um cliente específico, abra a ficha dele e use <strong>Limite e prazo</strong>.</>,
          <>No balcão, ao escolher o cliente e tocar em <strong>+ Fiado</strong>, uma linha avisa quanto ele já deve e se está no limite ou bloqueado. Sem data em <strong>Vence em (opcional)</strong>, a venda vence no prazo do cliente.</>,
          <>A venda fiado é recusada quando o cliente tem fiado vencido há mais dias que o bloqueio da conta, ou quando o valor passa do limite. A recusa aparece no campo <strong>Pagamento</strong>, com o link para a ficha. Se couber menos, a mensagem diz quanto: troque a forma de pagamento para o resto.</>,
          <>Para vender mesmo assim, o Gestor da loja abre a ficha do cliente, clica em <strong>Liberar fiado hoje</strong>, escolhe a loja e escreve o motivo. A liberação vale para uma venda, até o fim do dia, e fica no Histórico.</>,
        ]}
        problemas={[
          {
            quando: "O Caixa não consegue liberar o cliente bloqueado",
            fazer: "É de propósito. Só o Gestor da loja libera, e o Caixa não digita a senha do gestor. Chame o Gestor, que libera pela ficha do cliente.",
          },
          {
            quando: "A liberação sumiu e a venda foi recusada de novo",
            fazer: "Cada liberação vale para uma venda só. Se a primeira venda fechou, peça outra liberação ao Gestor.",
          },
        ]}
      >
        <Figura id="fiado-credito" />
      </Tarefa>

      <Subtitulo>Cobrar fiado vencido</Subtitulo>
      <Tarefa
        paraQueServe="Lembrar quem está atrasado, do mais atrasado ao menos, sem caçar o cliente em lista nenhuma."
        passos={[
          <>Abra <strong>Meu Empório</strong>, depois <strong>Financeiro</strong> e a aba <strong>Cobrança</strong>. Cada cliente com fiado vencido aparece com o valor, há quantos dias e em quais lojas.</>,
          <>Para filtrar, escolha a loja no alto ou o tempo de atraso.</>,
          <>Clique em <strong>Cobrar no WhatsApp</strong>, confira a mensagem (ela já vem com o nome e o valor, e dá para editar) e clique em <strong>Abrir o WhatsApp</strong>.</>,
          <>O WhatsApp do aparelho abre com o texto da conta, e a cobrança fica registrada: a linha passa a mostrar <strong>Cobrado em</strong> com a data, e a ficha do cliente também.</>,
        ]}
        problemas={[
          {
            quando: "O cliente aparece com “Sem telefone no cadastro”",
            fazer: <>Clique em <strong>Completar em Clientes</strong>, cadastre o telefone e volte à Cobrança.</>,
          },
        ]}
      >
        <Figura id="financeiro-cobranca" />
      </Tarefa>

      <Subtitulo>Fazer acordo de fiado</Subtitulo>
      <Tarefa
        paraQueServe="Juntar o fiado vencido de um cliente em parcelas que ele consegue pagar, sem juros."
        passos={[
          <>Abra <strong>Meu Empório</strong>, depois <strong>Clientes</strong>, e a ficha do cliente. Na seção <strong>Acordos</strong>, clique em <strong>Fazer acordo</strong>.</>,
          <>Em <strong>Fiados do acordo</strong>, marque os fiados que entram. O <strong>Total do acordo</strong> aparece embaixo.</>,
          <>Escolha quantas <strong>Parcelas</strong>, a data da <strong>Primeira parcela em</strong> e o intervalo em <strong>A cada (dias)</strong>. Clique em <strong>Montar parcelas</strong>.</>,
          <>Se precisar, mude a data e o valor de cada parcela. A soma tem de fechar com o total.</>,
          <>Clique em <strong>Fechar o acordo</strong>. Os fiados escolhidos saem da Cobrança, e as parcelas passam a valer como fiado: vencem, bloqueiam e se recebem em <strong>A receber</strong> como qualquer outro.</>,
        ]}
        problemas={[
          {
            quando: "O botão Fazer acordo não aparece",
            fazer: "Só o Dono e o Financeiro fazem acordo. O Gerente geral e o Gestor veem o acordo na ficha, mas não o fazem. Também não aparece se o cliente não tem fiado em aberto.",
          },
          {
            quando: "“As parcelas somam R$ ... e o acordo é de R$ ...”",
            fazer: "Ajuste os valores até a soma bater com o total, ou clique em Montar parcelas de novo para dividir por igual.",
          },
          {
            quando: "O cliente continua bloqueado depois do acordo",
            fazer: "Uma parcela do acordo que venceu e não foi paga bloqueia o fiado como qualquer fiado atrasado. Receba a parcela ou peça ao Gestor a liberação do dia.",
          },
        ]}
      >
        <Figura id="fiado-acordo" />
      </Tarefa>
    </div>
  );
}

export function ParteDeCaixa() {
  return (
    <div className="space-y-2">
      <p>
        Cada caixa da loja (Caixa 1, Caixa 2) é uma gaveta de dinheiro. O dia dele é um turno: abrir contando o troco,
        vender, fazer sangria quando junta dinheiro demais e encerrar separando o malote para o gerente. Toda venda, todo
        fiado recebido em dinheiro, toda devolução em dinheiro e toda despesa paga da gaveta caem num turno aberto.
      </p>
      <Figura id="caixa-gaveta" />

      <Subtitulo>Abrir o caixa</Subtitulo>
      <Tarefa
        paraQueServe="Começar o turno conferindo o troco que ficou na gaveta."
        passos={[
          <>Abra <strong>Caixa</strong>. Em <strong>Caixas de cada loja</strong>, ache o caixa fechado e clique em <strong>Abrir</strong>.</>,
          <>Se falta troco, peça o reforço ao gerente e digite em <strong>Reforço da gerência (R$)</strong>. Ponha o reforço na gaveta. É opcional.</>,
          <>Conte tudo e digite em <strong>Troco contado (R$)</strong>: o troco do turno anterior mais o reforço, se houver. A tela mostra quanto o sistema espera.</>,
          <>Se o contado não bate com o esperado, escreva o motivo em <strong>Motivo da diferença</strong>.</>,
          <>Clique em <strong>Abrir o caixa</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“Não há dinheiro suficiente para isso.”",
            fazer: "O reforço passou do que está Com a gerência. Diminua o reforço ou fale com o gerente.",
          },
          {
            quando: "“Este caixa já está aberto.”",
            fazer: "Outra pessoa abriu este caixa antes de você. Recarregue a tela e use o turno dela, ou abra outro caixa.",
          },
        ]}
      >
        <Figura id="caixa-abrir" />
        <Chamada tipo="dica">
          <p>
            Com o caixa fechado, o balcão mostra <strong>Abrir o Caixa 1</strong> (ou pede para escolher o caixa em{" "}
            <strong>Escolha o caixa a abrir</strong>). Abra ali mesmo, sem sair da venda.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Conferir no meio do turno</Subtitulo>
      <Tarefa
        paraQueServe="Contar o dinheiro sem encerrar o turno e ver se bate com o que o sistema calculou."
        passos={[
          <>Na linha do caixa aberto, clique em <strong>Conferir</strong>.</>,
          <>Conte o dinheiro e digite em <strong>Valor contado (R$)</strong>. A tela mostra quanto o sistema espera.</>,
          <>Se os dois forem diferentes, escreva o <strong>Motivo da diferença</strong>. Ele é obrigatório.</>,
          <>Clique em <strong>Registrar conferência</strong>. O turno continua aberto.</>,
        ]}
        problemas={[
          {
            quando: "O caixa tem menos que o esperado",
            fazer: "Registre a diferença com o motivo. A falta entra como despesa Diferença de caixa. Se a sobra aparece, entra como receita.",
          },
        ]}
      >
        <Figura id="caixa-conferir" />
      </Tarefa>

      <Subtitulo>Sangria</Subtitulo>
      <Tarefa
        paraQueServe="Tirar o excesso de dinheiro do caixa no meio do turno e levar ao gerente."
        passos={[
          <>Na linha do caixa aberto, clique em <strong>Sangria</strong>.</>,
          <>Digite o <strong>Valor retirado (R$)</strong>. Se quiser, escreva uma <strong>Observação</strong>, como as notas que saíram.</>,
          <>Clique em <strong>Registrar sangria</strong> e leve as notas ao gerente.</>,
          "O dinheiro sai do caixa na hora e fica aguardando o gerente até ele confirmar o que recebeu.",
        ]}
        problemas={[
          {
            quando: "“Não há dinheiro suficiente para isso.”",
            fazer: "A sangria passou do que está no caixa. Diminua o valor.",
          },
          {
            quando: "“Só quem abriu o caixa ou o gestor da loja faz sangria neste turno.”",
            fazer: "O turno é de outra pessoa, numa loja com Caixa. Chame quem abriu ou o Gestor.",
          },
        ]}
      >
        <Figura id="caixa-sangria" />
      </Tarefa>

      <Subtitulo>Encerrar o turno</Subtitulo>
      <Tarefa
        paraQueServe="Fechar o caixa no fim do turno: contar, separar o malote para o gerente e deixar o troco."
        passos={[
          <>Na linha do caixa aberto, clique em <strong>Encerrar</strong>.</>,
          <>Conte todo o dinheiro e digite em <strong>Valor contado (R$)</strong>.</>,
          <>Se o contado não bate com o esperado, escreva o motivo em <strong>Motivo da diferença</strong>.</>,
          <>Digite em <strong>Malote (R$)</strong> o que vai para o gerente. Em branco, nada vai. A tela mostra o <strong>Troco que fica no caixa</strong> para o próximo turno.</>,
          <>Clique em <strong>Encerrar o turno</strong>.</>,
          <>Imprima o fechamento em <strong>Relatório A4</strong> ou <strong>Relatório na bobina</strong> e leve junto com o malote. Depois clique em <strong>Concluir</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“O malote não pode passar do que foi contado.”",
            fazer: "Diminua o malote. O que sobra fica de troco.",
          },
          {
            quando: "“Só quem abriu o caixa ou o gestor da loja encerra este turno.”",
            fazer: "O turno é de outra pessoa, numa loja com Caixa. Se ela foi embora sem encerrar, chame o Gestor: ele encerra com a contagem.",
          },
          {
            quando: "O Meu Dia avisa que um caixa está aberto desde um dia anterior",
            fazer: "O turno daquele caixa não foi encerrado. Ele continua valendo. Quem abriu, ou o Gestor da loja, clica em Encerrar.",
          },
        ]}
      >
        <Figura id="caixa-encerrar" />
        <Chamada tipo="atencao">
          <p>
            Basta uma pessoa ativa com a função Caixa ligada à loja para só quem abriu o caixa, ou o Gestor da loja, fazer
            sangria e encerrar aquele turno. Na loja sem ninguém com a função Caixa, qualquer pessoa da loja abre, faz
            sangria e encerra.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Confirmar o dinheiro que chegou ao gerente</Subtitulo>
      <Tarefa
        paraQueServe="Contar a sangria e o malote que o caixa entregou e pôr o dinheiro em Com a gerência. É do Gestor da loja, do Gerente geral e do Dono."
        passos={[
          <>Abra <strong>Caixa</strong> e desça até <strong>Aguardando o gerente</strong>. O Meu Dia também avisa.</>,
          <>Na linha da entrega, clique em <strong>Confirmar</strong>.</>,
          <>Conte as notas e digite em <strong>Valor recebido (R$)</strong>.</>,
          <>Se não bater com o entregue, escreva o motivo em <strong>Observação</strong>. Ele é obrigatório.</>,
          <>Clique em <strong>Confirmar o recebimento</strong>. O dinheiro passa para <strong>Com a gerência</strong>, e a diferença entra no resultado como Diferença de caixa.</>,
        ]}
        problemas={[
          {
            quando: "“Esta entrega já foi confirmada.”",
            fazer: "Outra pessoa confirmou antes. Recarregue a tela.",
          },
        ]}
      >
        <Figura id="caixa-entregas" />
        <p>
          O botão <strong>Relatório do turno</strong>, na mesma linha, mostra o fechamento do caixa que mandou o dinheiro.
        </p>
      </Tarefa>

      <Subtitulo>Levar o dinheiro da gerência ao banco</Subtitulo>
      <Tarefa
        paraQueServe="Registrar o dinheiro da gerência que foi depositado no banco. É do Gestor da loja, do Gerente geral e do Dono."
        passos={[
          <>Em <strong>Caixa</strong>, na seção <strong>Transferir dinheiro</strong>, clique no botão <strong>Transferir dinheiro</strong>.</>,
          <>Em <strong>De</strong>, escolha a gerência da loja (Com a gerência). Em <strong>Para</strong>, escolha a conta bancária.</>,
          <>Digite o <strong>Valor (R$)</strong> e, se quiser, uma <strong>Observação</strong>.</>,
          <>Clique em <strong>Transferir</strong>. O dinheiro muda de lugar e não vira receita nem despesa.</>,
        ]}
        problemas={[
          {
            quando: "O sistema recusa porque não há dinheiro suficiente",
            fazer: "A transferência não passa do que está com a gerência.",
          },
          {
            quando: "O caixa não aparece como origem da transferência",
            fazer: "É assim mesmo: o dinheiro do caixa vai ao gerente pela sangria ou pelo malote, e só a gerência vai ao banco.",
          },
        ]}
      />

      <Subtitulo>Mais de um caixa na loja</Subtitulo>
      <Tarefa
        paraQueServe="Trabalhar com duas gavetas ao mesmo tempo, cada uma com o seu troco."
        passos={[
          <>O Gestor cria o caixa novo em <Link className="underline" href={`${B}/configuracoes`}>Configurações</Link>, com o botão <strong>Novo caixa</strong>. Toda loja nasce com o Caixa 1.</>,
          "Cada caixa abre, faz sangria e encerra separado, e tem no máximo um turno aberto.",
          <>Com dois caixas abertos, o balcão mostra o campo <strong>Caixa</strong> para escolher onde a venda cai. Vem marcado o caixa que você abriu.</>,
          "O saldo da loja, no alto do cartão dela, é a soma dos caixas.",
        ]}
        problemas={[
          {
            quando: "“Há mais de um caixa aberto. Escolha o caixa.”",
            fazer: <>Escolha no campo <strong>Caixa</strong> a gaveta em que o dinheiro entra.</>,
          },
        ]}
      />

      <Subtitulo>Cartão a receber e cheques</Subtitulo>
      <Tarefa
        paraQueServe="Acompanhar o dinheiro que está a caminho."
        passos={[
          <>Em <strong>A receber do cartão</strong>, veja cada parcela com a bandeira, a adquirente, a data e o valor líquido, já sem a taxa. Quando a data chega, ela entra no saldo da conta sozinha. A data e o valor que aparecem são os que de fato vão cair: numa parcela antecipada, a data da antecipação e o líquido depois do custo, com o selo <strong>Antecipada</strong>.</>,
          <>Para antecipar parcelas que ainda não caíram, marque a caixinha de cada uma (todas da mesma conta) e clique em <strong>Antecipar</strong>. Confira a <strong>Data da operação</strong>, digite o <strong>Líquido recebido</strong> (o que a adquirente de fato pagou) e a tela mostra o custo e a porcentagem ao mês. Clique em <strong>Registrar antecipação</strong>: as parcelas passam a valer na data da operação, e o custo vira uma despesa chamada Antecipação de recebíveis, que aparece no Resultado, fora da margem.</>,
          <>Em <strong>Antecipações</strong>, na mesma tela, ficam as operações feitas. Para voltar atrás, clique em <strong>Desfazer</strong>: as parcelas voltam à data prevista e o custo é cancelado. Uma operação já conferida com o extrato não se desfaz, e a antecipação automática se desfaz cancelando a venda.</>,
          <>Em <strong>Cheques</strong>, cada cheque passa por: recebido, depositado, compensado ou devolvido.</>,
          "Quando você deposita um cheque, escolha a conta. Quando o banco compensa, marque como compensado.",
          "Se o cheque voltar, marque como devolvido: a dívida reabre no fiado do cliente.",
        ]}
      >
        <Figura id="caixa-cartao-cheques" />
      </Tarefa>
    </div>
  );
}

export function ParteDeDespesas() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Cadastrar as contas que se repetem todo mês, como aluguel e luz, e dividir entre as lojas."
        passos={[
          <>Abra <strong>Despesas</strong> e clique em cadastrar despesa fixa.</>,
          "Digite o nome, o valor previsto, o dia do vencimento e a categoria.",
          "Divida entre as lojas (em porcentagem ou em valor). A soma precisa fechar 100% ou o valor total.",
          "Salve. O sistema cria as contas dos próximos 12 meses, uma por loja e por mês.",
          <>Quando pagar, use a lista <strong>Contas a pagar</strong>. Dá para pagar várias de uma vez.</>,
        ]}
        problemas={[
          { quando: "A divisão é recusada", fazer: "A soma das partes não fecha. Ajuste até dar 100% ou o valor total." },
          { quando: "A conta do mês veio com outro valor", fazer: "Pague com o valor real. O sistema corrige aquele mês." },
        ]}
      >
        <Figura id="despesas-fixas" />
      </Tarefa>

      <Subtitulo>Rateio automático da despesa fixa</Subtitulo>
      <Tarefa
        paraQueServe="Dividir uma despesa entre as lojas sem fazer conta: o sistema divide pelo faturamento, pela área ou pelo número de funcionários."
        passos={[
          <>Em <strong>Lojas</strong>, preencha a <strong>Área (m²)</strong> e os <strong>Funcionários</strong> de cada loja. O Financeiro também pode preencher esses dois campos.</>,
          <>Em <strong>Despesas</strong>, cadastre a despesa fixa e, em <strong>Dividir entre as lojas</strong>, escolha <strong>Proporcional ao faturamento</strong>, <strong>Por área (m²)</strong> ou <strong>Por funcionários</strong>. Não precisa digitar a parte de cada loja.</>,
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
        ]}
      >
        <Figura id="despesa-rateio-automatico" />
      </Tarefa>

      <Subtitulo>Vendeu, Pagou</Subtitulo>
      <Tarefa
        paraQueServe="Contar na margem as despesas que nascem junto com a venda, como comissão, entrega e taxa de cartão."
        passos={[
          <>Em <strong>Despesas</strong>, abra a seção <strong>Vendeu, Pagou</strong>.</>,
          "Crie uma regra: a loja, o nome (por exemplo, Entrega), o cálculo (percentual, valor fixo ou embalagem que sai do estoque) e, se quiser, a forma de pagamento e o produto a que ela vale.",
          "A cada venda, o sistema reconhece a despesa na margem. O dinheiro só sai quando você paga a conta.",
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

export function ParteDeResultado() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Saber se a loja deu lucro no mês e quanto falta para pagar as despesas fixas."
        passos={[
          <>Abra <strong>Resultado</strong> e escolha a loja e o mês.</>,
          "Leia de cima para baixo: vendas, menos o custo, menos o Vendeu, Pagou, dá a margem.",
          "Logo abaixo ficam as perdas e quebras, em linha separada, para você ver quanto custaram.",
          "Depois descontam-se as despesas fixas e sobra o resultado.",
          <>O quadro <strong>Custo do cartão</strong> diz quantos por cento do que a loja vendeu no cartão no mês foi para a taxa da maquininha e para a antecipação. Abaixo dele estão o valor vendido no cartão, a taxa e a antecipação. Sem venda no cartão no mês, o quadro diz isso.</>,
          "O ponto de equilíbrio mostra quanto a loja precisa vender para cobrir as fixas, e quanto falta.",
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
        ]}
      >
        <Figura id="resultado-loja" />
        <Figura id="resultado-equilibrio" />
      </Tarefa>
      <Chamada tipo="saiba">
        <p>
          O Dono e o Gerente geral podem escolher <strong>Todas as lojas</strong> e ver tudo somado. Os produtos que mais
          vendem e que mais dão margem aparecem no mesmo lugar.
        </p>
      </Chamada>
      <Chamada tipo="dica">
        <p>
          O Resultado mostra o lucro do mês. Para ver quem vendeu o quê num período qualquer, os produtos parados e as
          vendas de cada vendedor, abra <Link className="underline" href={`${B}/relatorios`}>Relatórios</Link>.
        </p>
      </Chamada>
    </div>
  );
}

export function ParteDeHistorico() {
  return (
    <Tarefa
      paraQueServe="Descobrir quem fez cada coisa no Empório e quando, inclusive o que mudou numa edição."
      passos={[
        <>Abra <strong>Histórico</strong>. O Dono e o Gerente geral veem tudo. O Gestor vê as lojas dele. O Vendedor e o Caixa não veem.</>,
        "Use os filtros de pessoa, loja, período e ação para achar o que procura.",
        "Cada linha diz quem, quando, em que loja e o quê. Nas edições, mostra o antes e o depois.",
      ]}
      problemas={[
        {
          quando: "Não aparece a consulta que eu fiz",
          fazer: "O Histórico guarda só o que alterou alguma coisa. Quem apenas olhou, ou tentou algo que foi recusado, não entra.",
        },
      ]}
    >
      <Figura id="historico-filtros" />
      <Chamada tipo="saiba">
        <p>O Histórico só recebe registros novos. Nada nele é apagado nem editado, e ele é guardado para sempre.</p>
      </Chamada>
    </Tarefa>
  );
}
