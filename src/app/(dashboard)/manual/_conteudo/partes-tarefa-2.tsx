import { Chamada } from "../_components/chamada";
import { Figura } from "../_components/figura";
import { Subtitulo, Tarefa } from "../_components/tarefa";

export function ParteDeVender() {
  return (
    <Tarefa
      paraQueServe="Registrar a venda no balcão em poucos segundos, tirar do estoque e lançar o dinheiro no lugar certo."
      passos={[
        <>Abra <strong>Vender</strong>. A tela já abre na venda.</>,
        "Busque o produto pelo nome, pela marca ou pelo código e toque nele. Repita para cada item.",
        "Ajuste a quantidade. Se o preço cadastrado estiver vazio, digite o valor.",
        "Se precisar dar desconto, digite o preço menor ou o valor do desconto. Até o limite da loja você mesmo dá.",
        <>Escolha como o cliente paga: <strong>Dinheiro</strong>, <strong>PIX</strong>, <strong>Débito</strong>, <strong>Crédito</strong>, <strong>Parcelado</strong> ou <strong>Cheque</strong>. Dá para dividir em mais de uma forma.</>,
        "Confira se a soma das formas fecha o total. O que faltar pode ficar como fiado (precisa de cliente).",
        "Conclua a venda.",
      ]}
      problemas={[
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
          fazer: "A loja não tem regra para essa forma de cartão (débito, crédito ou parcelado). O Gestor cadastra a taxa e o prazo.",
        },
        {
          quando: "O desconto é recusado",
          fazer: "Passou do limite da loja. Chame o Gestor ou o Dono para dar o desconto.",
        },
        {
          quando: "O fiado é recusado",
          fazer: "Fiado precisa de cliente cadastrado. Escolha o cliente ou cadastre na hora.",
        },
      ]}
    >
      <Figura id="balcao-venda" />
      <Figura id="balcao-pagamento" />
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
          <><strong>Devolver</strong>: escolha os itens e as quantidades. A mercadoria volta para o estoque (ou vira perda, se estiver estragada) e o valor sai da gaveta ou abate o fiado do cliente.</>,
          <><strong>Trocar</strong>: devolve os itens e já abre uma venda nova, ligada à primeira.</>,
          <><strong>Cancelar venda</strong>: desfaz a venda inteira. O estoque volta e o dinheiro sai de onde entrou. É do Gestor e do Dono.</>,
        ]}
        problemas={[
          {
            quando: "Os botões Devolver e Trocar não aparecem para o Vendedor",
            fazer: "É uma permissão extra, desligada por padrão. Peça ao Dono para ligar.",
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
          <>No balcão, escolha o cliente e deixe o valor que ele não paga agora como <strong>fiado</strong>.</>,
          "Se o cliente ainda não está cadastrado, cadastre na hora, pelo cadastro rápido.",
          "Se combinaram uma data, digite o vencimento. Ele é opcional. Não há juros nem multa.",
          "Conclua a venda. O sistema guarda o valor que falta como dívida do cliente.",
        ]}
        problemas={[
          { quando: "Não consigo escolher fiado", fazer: "Falta o cliente. Sem cliente, o sistema não sabe quem deve." },
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
          "Digite o valor e a forma: dinheiro entra na gaveta, PIX entra na conta bancária.",
          "Salve. O pagamento abate primeiro a dívida mais antiga.",
        ]}
        problemas={[
          {
            quando: "O cliente pagou com cheque e o cheque voltou",
            fazer: "A dívida volta para o fiado dele sozinha. Você não precisa lançar nada.",
          },
        ]}
      >
        <Figura id="fiado-receber" />
      </Tarefa>
    </div>
  );
}

export function ParteDeCaixa() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Saber quanto dinheiro deveria estar na gaveta e conferir se está."
        passos={[
          <>Abra <strong>Caixa</strong>. Cada loja tem a sua gaveta, com o saldo que o sistema calculou.</>,
          <>No fim do dia, conte o dinheiro e clique em <strong>Conferir gaveta</strong>.</>,
          "Digite o valor contado. O sistema compara com o esperado.",
          "Se os dois forem diferentes, escreva o motivo da diferença. Ele é obrigatório.",
          "Salve. A gaveta passa a bater, e a diferença fica registrada no resultado da loja.",
        ]}
        problemas={[
          {
            quando: "A gaveta tem menos que o esperado",
            fazer: "Registre a diferença com o motivo. A falta entra como despesa Diferença de caixa. Se a sobra aparece, entra como receita.",
          },
          {
            quando: "O Meu Dia avisa que um dia ficou sem conferência",
            fazer: "Confira a gaveta hoje, com o que está nela. Você pode conferir a qualquer hora, não precisa abrir nem fechar turno.",
          },
        ]}
      >
        <Figura id="caixa-gaveta" />
        <Figura id="caixa-conferir" />
      </Tarefa>

      <Subtitulo>Levar a gaveta ao banco</Subtitulo>
      <Tarefa
        paraQueServe="Registrar o dinheiro que saiu da gaveta e foi depositado."
        passos={[
          <>Em <strong>Caixa</strong>, clique em <strong>Transferir entre caixas</strong>.</>,
          "Escolha de onde sai (a gaveta) e para onde vai (a conta bancária).",
          "Digite o valor e salve.",
        ]}
        problemas={[
          {
            quando: "O sistema recusa porque não há dinheiro suficiente",
            fazer: "Você não pode levar mais do que o saldo da gaveta. Confira a gaveta primeiro.",
          },
        ]}
      />

      <Subtitulo>Cartão a receber e cheques</Subtitulo>
      <Tarefa
        paraQueServe="Acompanhar o dinheiro que está a caminho."
        passos={[
          <>Em <strong>A receber do cartão</strong>, veja cada parcela com a data e o valor líquido, já sem a taxa. Quando a data chega, ela entra no saldo da conta sozinha.</>,
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
    </div>
  );
}

export function ParteDeHistorico() {
  return (
    <Tarefa
      paraQueServe="Descobrir quem fez cada coisa no Empório e quando, inclusive o que mudou numa edição."
      passos={[
        <>Abra <strong>Histórico</strong>. O Dono e o Gerente geral veem tudo. O Gestor vê as lojas dele. O Vendedor não vê.</>,
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
