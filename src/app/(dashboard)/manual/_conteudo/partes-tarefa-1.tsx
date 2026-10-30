import { Chamada } from "../_components/chamada";
import { Figura } from "../_components/figura";
import { Subtitulo, Tarefa } from "../_components/tarefa";

export function ParteDePrimeirosPassos() {
  return (
    <Tarefa
      paraQueServe="Deixar a loja pronta para vender, na ordem certa, para os números do resultado não saírem errados."
      passos={[
        <>Abra <strong>Meu Empório</strong> no menu. O cartão <strong>Primeiros passos</strong> aparece no alto.</>,
        "Faça primeiro os itens essenciais: sem eles o resultado da loja fica marcado como estimado.",
        "Clique em cada item. Ele abre o formulário certo: cadastre a loja, os produtos, o preço e o estoque inicial.",
        "Depois faça os recomendados: contas bancárias, regra de cartão, despesas fixas e Equipe.",
        "Quando os essenciais terminam, o cartão some sozinho.",
      ]}
      problemas={[
        {
          quando: "Aparece o aviso “Loja sem Gestor”",
          fazer: "É só um aviso. Enquanto ninguém for nomeado, você (Dono ou Gerente geral) cobre a loja. Nomeie um Gestor na Equipe quando quiser.",
        },
        {
          quando: "O cartão Primeiros passos sumiu e você quer ver de novo",
          fazer: "Ele só some quando os essenciais estão feitos. Se algo mudou (loja nova, por exemplo), ele volta.",
        },
      ]}
    >
      <Figura id="inicio-primeiros-passos" />
      <Figura id="estabelecimentos-lista" />
    </Tarefa>
  );
}

export function ParteDeEquipe() {
  return (
    <Tarefa
      paraQueServe="Cadastrar as pessoas que trabalham nas suas lojas e dizer o que cada uma pode fazer."
      passos={[
        <>Abra <strong>Meu Empório</strong> e depois <strong>Equipe</strong>. Só o Dono e o Gerente geral veem essa tela.</>,
        <>Clique em <strong>Cadastrar pessoa</strong>.</>,
        "Preencha nome e email. Use o email que a pessoa realmente lê.",
        "Escolha a função: Gestor ou Vendedor. A função vale para todas as lojas da pessoa.",
        "Marque as lojas em que ela trabalha.",
        "Se for Vendedor, ligue só as permissões extras de que ele precisa. Todas começam desligadas.",
        "Salve. A pessoa ocupa um assento do seu plano.",
      ]}
      problemas={[
        {
          quando: "O sistema recusa porque não há assento livre",
          fazer: "O plano tem um limite de pessoas. Desative alguém que saiu da loja ou suba de plano.",
        },
        {
          quando: "Um Vendedor de confiança precisa fazer mais",
          fazer: "Ligue a permissão extra dele na Equipe, ou promova a Gestor. Subir e descer de função é livre. Quem volta a Vendedor volta com as permissões extras desligadas.",
        },
      ]}
    >
      <Figura id="equipe-lista" />
      <Figura id="equipe-cadastrar" />
      <Chamada tipo="saiba">
        <p>
          Gestor e Vendedor veem só o Meu Empório e o necessário. Eles não enxergam a fazenda, o Financeiro nem a Lista
          de Compra.
        </p>
      </Chamada>
    </Tarefa>
  );
}

export function ParteDeProdutos() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Cadastrar o que a loja vende, do jeito que o balcão fala: saca, fardo, quilo, litro ou unidade."
        passos={[
          <>Abra <strong>Meu Empório</strong> e depois <strong>Produtos</strong>. Clique para criar um produto novo.</>,
          "Digite o nome do jeito que o balcão chama.",
          <>Escolha como o estoque é contado: <strong>Saca</strong>, <strong>Fardo</strong>, quilo, litro ou unidade.</>,
          "Se for saca ou fardo, informe o conteúdo: quantos quilos, litros ou unidades cabem em uma. Exemplo: saca de 30 kg.",
          "Preencha marca, fabricante, código interno e espécie (cão, gato, bovino e outras). Isso ajuda a separar produtos parecidos e a achar no balcão.",
          "Salve e abra o produto para cadastrar as apresentações e o preço.",
        ]}
        problemas={[
          {
            quando: "O código interno é recusado",
            fazer: "Já existe outro produto com esse código. Ele precisa ser único na conta. Mude o código ou deixe em branco.",
          },
          {
            quando: "O conteúdo da saca ou do fardo está vazio",
            fazer: "Ele é obrigatório para saca e fardo, porque é com ele que o sistema sabe quanto pesa cada uma.",
          },
        ]}
      >
        <Figura id="produto-novo" />
      </Tarefa>

      <Subtitulo>Saca fechada e granel</Subtitulo>
      <Tarefa
        paraQueServe="Vender a saca inteira e também uma parte dela, cada uma com o seu preço."
        passos={[
          "Abra o produto e vá em Apresentações.",
          "Crie a apresentação da saca fechada (a embalagem lacrada).",
          "Crie a apresentação a granel, informando o conteúdo: por exemplo, 1 kg de uma saca de 10 kg.",
          "Dê um preço a cada uma. O quilo costuma custar mais que a saca fechada, e isso é permitido.",
        ]}
        problemas={[
          {
            quando: "A apresentação a granel é recusada",
            fazer: "A parte precisa dividir a saca em até três casas depois da vírgula. 1 kg de uma saca de 10 kg dá 0,1 saca e passa. 1 kg de uma saca de 30 kg não fecha em três casas e é recusado. Use outra medida, como 500 g ou 3 kg.",
          },
        ]}
      >
        <Figura id="produto-apresentacoes" />
        <Chamada tipo="saiba">
          <p>
            Quando você vende no quilo e não sobrou saca aberta, a saca fechada menor é aberta sozinha. A sobra fica
            como avulso, pronta para a próxima venda.
          </p>
        </Chamada>
      </Tarefa>
    </div>
  );
}

export function ParteDePreco() {
  return (
    <Tarefa
      paraQueServe="Dar a cada loja o seu preço, sem uma loja mexer no preço da outra."
      passos={[
        "Abra o produto e vá em Preço por loja.",
        "Para cada apresentação e cada loja, veja o preço atual e o sugerido (custo mais os percentuais).",
        <>Clique em <strong>aplicar</strong> para aceitar o sugerido, ou digite o seu preço.</>,
        "Quando o custo subir, a tela avisa e mostra o novo sugerido. Você aplica um a um ou em lote.",
      ]}
      problemas={[
        {
          quando: "A apresentação aparece sem preço numa loja",
          fazer: "Ela fica sem preço até alguém definir. No balcão, o sistema pede o valor na hora da venda.",
        },
        {
          quando: "O preço não mudou depois que o custo subiu",
          fazer: "É de propósito. O preço cadastrado nunca muda sozinho. Aplique o novo sugerido se quiser.",
        },
      ]}
    >
      <Figura id="produto-preco-por-loja" />
    </Tarefa>
  );
}

export function ParteDeCompras() {
  return (
    <Tarefa
      paraQueServe="Lançar o que você comprou, guardar o custo e dar entrada no estoque quando a mercadoria chegar."
      passos={[
        <>Abra <strong>Meu Empório</strong> e depois <strong>Compras</strong>. Clique em nova compra.</>,
        "Escolha a loja e, se quiser, o fornecedor.",
        "Adicione cada item: produto, quantidade e o valor total do item (não o valor de uma unidade).",
        "Informe o frete, se houver. Ele é dividido entre os itens pelo valor de cada um.",
        "Diga como pagou: à vista, a prazo ou parcelado (com entrada, se tiver).",
        "Marque se a mercadoria já chegou. Se não chegou, a conta a pagar nasce hoje e o estoque só entra quando você receber.",
        <>Quando a mercadoria chegar, abra a compra e clique em <strong>Receber</strong>.</>,
      ]}
      problemas={[
        {
          quando: "Você lançou errado",
          fazer: "Cancele a compra, desde que nenhuma parcela tenha sido paga. O sistema desfaz a conta a pagar e, se o estoque já entrou, tira também. Nada é apagado: fica no Histórico.",
        },
        {
          quando: "Chegou só parte da mercadoria",
          fazer: "O recebimento é do pedido inteiro. Receba quando chegar tudo, ou cancele e lance de novo só com o que veio.",
        },
      ]}
    >
      <Figura id="compra-nova" />
      <Figura id="compra-receber" />
      <Chamada tipo="dica">
        <p>O custo de cada compra alimenta o custo médio. É ele que faz o resultado da loja ser verdadeiro.</p>
      </Chamada>
    </Tarefa>
  );
}

export function ParteDeEstoque() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Saber o que tem na loja, corrigir quando a prateleira não bate e ser avisado do que precisa repor."
        passos={[
          <>Abra <strong>Meu Empório</strong> e depois <strong>Estoque</strong>. Escolha a loja.</>,
          "Veja cada produto com o saldo lacrado (embalagens fechadas) e o avulso (solto).",
          <>Para corrigir um saldo, abra o produto e, no cartão da loja, clique em <strong>Contar estoque</strong>. Digite o que você contou nas duas colunas.</>,
          <>Para registrar o que estragou, venceu ou sumiu, clique em <strong>Registrar perda</strong> no mesmo cartão e escolha o motivo.</>,
          <>Defina o mínimo e o máximo de cada produto naquela loja, no botão <strong>Limites</strong> do mesmo cartão.</>,
        ]}
        problemas={[
          {
            quando: "A perda é recusada por falta de saldo",
            fazer: "Você não pode perder mais do que existe. Faça uma contagem antes, ou peça ao Dono para liberar o estoque negativo.",
          },
          {
            quando: "A venda foi recusada por falta de saldo",
            fazer: "Confira a contagem. Se a mercadoria existe mas a compra ainda não foi lançada, lance a compra ou peça ao Dono para liberar o negativo.",
          },
        ]}
      >
        <Figura id="estoque-por-loja" />
      </Tarefa>

      <Subtitulo>Mínimo, máximo e Precisa repor</Subtitulo>
      <Tarefa
        paraQueServe="Ser avisado do que está acabando e saber quanto comprar."
        passos={[
          "Defina o mínimo (o menor saldo aceitável) e o máximo (até onde vale encher a prateleira) de cada produto.",
          <>Abra <strong>Precisa repor</strong>. Os produtos abaixo do mínimo aparecem com a quantidade sugerida.</>,
          "A quantidade sugerida é o máximo menos o saldo e menos o que já foi comprado e ainda não chegou.",
          <>O Dono e o Gerente geral veem o botão <strong>Encaminhar à Lista</strong>: ele manda o item para a Lista de Compra da loja.</>,
        ]}
      >
        <Figura id="estoque-precisa-repor" />
      </Tarefa>
    </div>
  );
}

export function ParteDeTransferencias() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Mandar mercadoria de uma loja para outra e conferir quando ela chega."
        passos={[
          <>Quem envia é o Gestor da loja de origem, o Dono ou o Gerente geral. Abra <strong>Transferências</strong> e clique em nova transferência.</>,
          "Escolha a loja de destino. Você sempre envia da sua loja para outra, nunca o contrário.",
          "Adicione os itens, com a quantidade lacrada e a avulsa separadas.",
          "Envie. A mercadoria sai do seu estoque e fica em trânsito.",
          "Quem está na loja de destino abre a transferência e digita, em cada item, o que chegou.",
          "Se chegou tudo, confirme: o estoque do destino aumenta na hora.",
        ]}
        problemas={[
          {
            quando: "Você enviou errado",
            fazer: "Enquanto ela está em trânsito, quem enviou, o Gestor da origem, o Dono ou o Gerente geral podem cancelar. Tudo volta para a sua loja.",
          },
          {
            quando: "Você tentou receber mais do que foi enviado",
            fazer: "O sistema recusa. Confira o envio com a loja de origem.",
          },
          {
            quando: "A transferência está parada há mais de dois dias",
            fazer: "Ela aparece no Meu Dia de quem cuida das duas lojas. Ligue para a outra loja e confirme.",
          },
        ]}
      >
        <Figura id="transferencia-nova" />
        <Figura id="transferencia-receber" />
      </Tarefa>

      <Subtitulo>Quando chega com diferença</Subtitulo>
      <Tarefa
        paraQueServe="Resolver a transferência que chegou a menos, sem esconder o erro."
        passos={[
          "No recebimento, digite o que chegou de verdade, mesmo que seja menos.",
          <>A transferência vira <strong>Aguardando o Gestor</strong>. Nada entra no estoque do destino ainda.</>,
          "O Gestor do destino, o Dono ou o Gerente geral abrem a transferência e escolhem como resolver, sempre com um motivo.",
          <><strong>Perda no caminho</strong>: a diferença vira perda da loja que enviou.</>,
          <><strong>Não foi enviada</strong>: a diferença volta para o estoque da loja que enviou.</>,
        ]}
        problemas={[
          {
            quando: "Chegou mais do que o enviado",
            fazer: "O sistema recusa. Sobra escondida esconde erro de envio. Confira a quantidade com a loja de origem.",
          },
        ]}
      >
        <Figura id="transferencia-aguardando-gestor" />
        <Chamada tipo="saiba">
          <p>A transferência aguardando o Gestor aparece no Meu Dia dele, para ninguém esquecer.</p>
        </Chamada>
      </Tarefa>
    </div>
  );
}
