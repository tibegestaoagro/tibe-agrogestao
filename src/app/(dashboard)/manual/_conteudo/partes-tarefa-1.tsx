import Link from "next/link";
import { Chamada } from "../_components/chamada";
import { Animacao } from "../_components/animacao";
import { Figura } from "../_components/figura";
import { Subtitulo, Tarefa } from "../_components/tarefa";
import { BASE_DO_EMPORIO } from "./indice";

const B = BASE_DO_EMPORIO;

export function ParteDePrimeirosPassos() {
  return (
    <Tarefa
      paraQueServe="Deixar a loja pronta para vender, na ordem certa, para os números do resultado não saírem errados."
      passos={[
        <>Abra <strong>Meu Empório</strong> no menu. O cartão <strong>Primeiros passos</strong> aparece no alto.</>,
        "Faça primeiro os itens essenciais: sem eles o resultado da loja fica marcado como estimado.",
        "Clique em cada item. Ele abre o formulário certo: cadastre a loja, os produtos, o preço e o estoque inicial.",
        "Depois faça os recomendados: contas bancárias, taxas de cartão (em Configurações, Cartões), despesas fixas e Equipe.",
        "Quando os essenciais terminam, o cartão some sozinho.",
        <>Antes da primeira venda, abra <Link className="underline" href={`${B}/configuracoes`}>Configurações</Link>: preencha o cabeçalho de cada loja (CNPJ, endereço e telefones) e envie o logo. É o que sai no papel da venda e do orçamento. O cartão Primeiros passos não lembra disso.</>,
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
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Cadastrar as pessoas que trabalham nas suas lojas e dizer o que cada uma pode fazer."
        passos={[
          <>Abra <strong>Meu Empório</strong> e depois <strong>Equipe</strong>. Só o Dono e o Gerente geral veem essa tela.</>,
          <>Clique em <strong>Cadastrar pessoa</strong>.</>,
          <>Preencha <strong>Nome</strong> e <strong>Email</strong>. Use o email que a pessoa realmente lê. O <strong>Telefone</strong> é opcional.</>,
          <>Escolha a <strong>Função</strong>: Gerente geral, Gestor, Vendedor ou Caixa. A função vale para todas as lojas da pessoa.</>,
          <>Em <strong>Lojas</strong>, marque as lojas em que ela trabalha. Gestor, Vendedor e Caixa precisam de pelo menos uma.</>,
          <>Se for Vendedor, ligue em <strong>Chaves</strong> só as permissões extras de que ele precisa. Todas começam desligadas. O Caixa não tem chaves.</>,
          <>Clique em <strong>Cadastrar</strong>. A pessoa ocupa uma das 50 vagas da equipe do Empório, não um assento do seu plano.</>,
          "O painel mostra o email e a senha temporária. Repasse os dois à pessoa: a senha só aparece ali uma vez.",
        ]}
        problemas={[
          {
            quando: "O sistema recusa porque a equipe já tem 50 pessoas ativas",
            fazer: "Esse é o limite da equipe do Empório. Desative na Equipe alguém que saiu da loja: a vaga volta na hora.",
          },
          {
            quando: "Alguém saiu da loja",
            fazer: "Na Equipe, clique em Desativar na linha da pessoa. Ela deixa de entrar, e a função, as lojas e as chaves ficam guardadas. Se ela voltar, clique em Reativar, embaixo, em Desativados.",
          },
          {
            quando: "“Escolha pelo menos uma loja.”",
            fazer: "Gestor, Vendedor e Caixa trabalham em lojas. Marque ao menos uma em Lojas.",
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
            Toda a equipe, o Gerente geral inclusive, vê só o Meu Empório e o necessário. Ninguém da equipe enxerga a
            fazenda, o Financeiro nem a Lista de Compra. Quem precisa da fazenda ganha outra conta, em Configurações &gt;
            Usuários.
          </p>
        </Chamada>
      </Tarefa>
  
      <Subtitulo>A função Caixa</Subtitulo>
      <Tarefa
        paraQueServe="Pôr no balcão uma pessoa que só recebe do cliente e cuida do caixa, sem mexer no estoque nem no preço."
        passos={[
          <>Em <strong>Cadastrar pessoa</strong>, escolha a Função <strong>Caixa</strong> e marque as lojas dele.</>,
          "O Caixa vende, fatura orçamento pelo número, recebe fiado, vê as vendas de hoje e abre, faz sangria e encerra o caixa.",
          "Em cada venda, ele escolhe o vendedor que atendeu o cliente. O Caixa nunca aparece como vendedor.",
          "Ele não abre Produtos, Estoque, Compras, Transferências, Lojas, a lista de Orçamentos, despesas, resultado nem Relatórios. Não devolve, não troca e não cancela venda.",
        ]}
      >
        <Figura id="equipe-caixa" />
        <Chamada tipo="atencao">
          <p>
            Basta uma pessoa ativa com a função Caixa ligada a uma loja para mudar a regra do turno nela. A partir daí, só
            quem abriu o caixa ou o Gestor da loja faz sangria e encerra aquele turno. Na loja sem ninguém com a função
            Caixa, qualquer pessoa da loja abre, faz sangria e encerra.
          </p>
        </Chamada>
        <p>
          O dia a dia do Caixa está em <Link className="underline" href={`${B}/caixa-papel`}>Sou Caixa</Link>.
        </p>
      </Tarefa>
    </div>
  );
}

export function ParteDeProdutos() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Cadastrar o que a loja vende, do jeito que o balcão fala: saca, fardo, quilo, litro, metro ou unidade."
        passos={[
          <>Abra <strong>Meu Empório</strong> e depois <strong>Produtos</strong>. Clique para criar um produto novo.</>,
          "Digite o nome do jeito que o balcão chama.",
          <>Em <strong>Unidade-base</strong>, escolha como o estoque é contado: <strong>Quilo</strong>, <strong>Litro</strong>, <strong>Metro</strong>, <strong>Unidade</strong>, <strong>Saca</strong> ou <strong>Fardo</strong>.</>,
          "Use Metro para o que se vende por medida: o estoque e o custo ficam em metros.",
          "Se for saca ou fardo, informe o conteúdo: quantos quilos, litros ou unidades cabem em uma. Exemplo: saca de 30 kg. Quilo, litro e metro não têm conteúdo.",
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
        <Chamada tipo="saiba">
          <p>
            O fornecedor de quem você compra é cadastrado em{" "}
            <Link className="underline" href={`${B}/fornecedores`}>Fornecedores</Link>, dentro do Meu Empório, e escolhido
            na compra. O CNPJ dele pode ter letras: o sistema aceita o CNPJ alfanumérico da Receita, com 12 posições de
            número ou letra e 2 dígitos no fim. Se for recusado, a frase é “CNPJ inválido. Confira os 14 caracteres.”
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Saca fechada e granel</Subtitulo>
      <Tarefa
        paraQueServe="Vender a saca inteira e também uma parte dela (um quilo, 300 g), cada uma com o seu preço."
        passos={[
          "Para o produto que você vende fracionado, use o quilo (ou o litro) como Unidade-base. A saca vira uma embalagem fechada, com o seu tamanho: por exemplo, Saca 40 kg.",
          "Abra o produto e vá em Apresentações.",
          "Crie a apresentação da saca fechada (a embalagem lacrada), informando o conteúdo: 40 kg, por exemplo.",
          "Crie as frações, informando quanto cada uma vale em quilo: Quilo vale 1 kg, 300 g vale 0,3 kg.",
          "Dê um preço a cada uma, em cada loja. O quilo costuma custar mais que a saca fechada, e isso é permitido.",
        ]}
        problemas={[
          {
            quando: "A fração é recusada: “Esse produto conta o estoque em sacas, e 1 kg não divide a saca de 15 kg em partes exatas. Para vender a granel, converta o produto para quilo.”",
            fazer: <>O produto ainda conta o estoque em sacas, e a fração não fecha em três casas depois da vírgula. Em vez de procurar outra medida, converta o produto para quilo, como mostra a próxima seção. Já em quilo, qualquer fração vale: 300 g, 500 g, 1 kg.</>,
          },
        ]}
      >
        <Figura id="produto-apresentacoes" />
        <Animacao id="produto-fracao-gramas" />
        <Chamada tipo="saiba">
          <p>
            Quando você vende no quilo e não sobrou saca aberta, a saca fechada é aberta sozinha, de qualquer peso. A
            sobra fica como avulso, pronta para a próxima venda. No estoque você vê as sacas fechadas e o resto em quilo.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Converter o produto de saca para quilo</Subtitulo>
      <Tarefa
        paraQueServe="Passar um produto que hoje conta o estoque em sacas para o quilo, sem perder o saldo, o custo nem o histórico. É do Dono."
        passos={[
          <>Abra o produto que está em saca ou fardo e clique em <strong>Converter para quilo</strong> (ou <strong>Converter para litro</strong>, conforme o produto).</>,
          "A prévia mostra, em cada loja, o saldo e o custo antes e depois. O sistema multiplica o saldo pelo conteúdo da saca e divide o custo pelo mesmo número.",
          <>Confira as <strong>formas de venda</strong>: a marca <strong>confira</strong> aponta a fração que não fecha e precisa de ajuste.</>,
          <>Clique em <strong>Converter</strong>. O produto passa a ser contado em quilo, e o histórico continua inteiro.</>,
        ]}
        problemas={[
          {
            quando: "Quero voltar o produto para saca",
            fazer: "Não tem volta. Por isso a prévia vem antes: leia com calma e converta um produto de cada vez.",
          },
          {
            quando: "A tela diz que o produto mudou de unidade",
            fazer: "Alguém converteu o produto enquanto a sua tela estava aberta. Abra o produto de novo e siga com a tela atualizada.",
          },
        ]}
      >
        <Animacao id="produto-converter-quilo" />
        <Chamada tipo="atencao">
          <p>
            Quem só vende a saca fechada não precisa converter: o produto pode seguir em saca. Converta quando a loja vender
            em quilo ou em fração.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Saca com dois nomes: a mesma saca</Subtitulo>
      <p className="text-texto">
        Duas embalagens fechadas do mesmo tamanho, como <strong>Saca 40 kg</strong> e <strong>ATACADO</strong>, são a mesma
        saca no estoque. Só o preço muda de uma para a outra. O estoque mostra uma linha só, vender em qualquer uma tira
        da mesma conta, e a contagem pede um campo por tamanho. Veja em{" "}
        <Link className="underline" href={`${B}/estoque`}>Estoque</Link>.
      </p>
    </div>
  );
}

export function ParteDePreco() {
  return (
    <Tarefa
      paraQueServe="Dar a cada loja o seu preço, sem uma loja mexer no preço da outra."
      passos={[
        "Abra o produto e vá em Preço por loja. Cada linha é uma apresentação numa loja.",
        <>
          A coluna <strong>Custo</strong> mostra um custo só por produto e loja. Enquanto há estoque, é o custo médio
          das compras. Sem estoque, é o da última compra, e a linha diz <strong>sem estoque: última compra</strong>.
          Sem nenhuma compra, vale o custo de referência: em <strong>Dados comerciais</strong>, o campo{" "}
          <strong>Custo por</strong> e a unidade-base (por exemplo, <strong>Custo por saca (R$)</strong>). Sem nada
          disso, a linha diz <strong>sem custo</strong> e o <strong>Sugerido</strong> fica com &quot;-&quot;.
        </>,
        "O Sugerido parte do custo: soma as Despesas e, sobre esse valor, o Lucro da linha.",
        <>
          Linha sem preço: clique em <strong>Aplicar sugerido</strong> para gravar o sugerido como preço. Para digitar
          o seu, clique em <strong>Editar</strong> na linha.
        </>,
        "Quando o custo muda, o Sugerido muda junto e o Preço fica como está. A tela não avisa: confira a coluna Sugerido e, se quiser, troque o preço em Editar, linha por linha.",
      ]}
      problemas={[
        {
          quando: "A apresentação aparece sem preço numa loja",
          fazer: "Ela fica sem preço até alguém definir. No balcão, o sistema pede o valor na hora da venda.",
        },
        {
          quando: "O preço não mudou depois que o custo subiu",
          fazer: "É de propósito. O preço cadastrado nunca muda sozinho. Para usar o novo sugerido, clique em Editar na linha e digite o valor.",
        },
        {
          quando: "A coluna Custo diz sem custo",
          fazer: "O produto nunca foi comprado e não tem custo de referência. Lance a compra ou, em Dados comerciais, clique em Editar e preencha o campo Custo por, com a unidade-base do produto.",
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
        <>Escolha a loja e, se quiser, clique em <strong>Escolher fornecedor</strong> e busque pelo nome, pelo CPF ou CNPJ, ou por um pedaço do telefone. Os fornecedores vêm de <Link className="underline" href={`${B}/fornecedores`}>Fornecedores</Link>.</>,
        "Adicione cada item: produto, quantidade e o valor total do item (não o valor de uma unidade).",
        "Informe o frete, se houver. Ele é dividido entre os itens pelo valor de cada um.",
        "Diga como pagou: à vista, a prazo ou parcelado (com entrada, se tiver). Na compra de uma propriedade do dono, a forma de pagamento some: entra só o custo, sem conta a pagar.",
        <>Se pagou alguma parte na hora (à vista ou a entrada), diga <strong>De onde saiu o dinheiro</strong>: a <strong>Gaveta da loja</strong> (precisa de um caixa com turno aberto na loja; se houver mais de um aberto, escolha qual) ou uma <strong>conta bancária</strong>. O dinheiro sai de lá na hora, e o saldo cai. A parte a prazo vira conta a pagar, que o Financeiro paga depois em <Link className="underline" href={`${B}/financeiro-das-lojas`}>Financeiro das lojas</Link>.</>,
        "Marque se a mercadoria já chegou. Se não chegou, a conta a pagar nasce hoje e o estoque só entra quando você receber.",
        <>Quando a mercadoria chegar, abra a compra e clique em <strong>Receber</strong>.</>,
      ]}
      problemas={[
        {
          quando: "“Diga de onde saiu o dinheiro: a gaveta da loja ou uma conta.”",
          fazer: "Compra à vista precisa dizer de onde saiu o dinheiro. O Vendedor só enxerga a gaveta; para sair de uma conta bancária, peça ao Gestor ou ao Financeiro.",
        },
        {
          quando: "Você esqueceu de lançar a nota de ontem",
          fazer: "Lance como compra a prazo, com o vencimento de ontem. Ela entra já vencida nas contas a pagar, e o Financeiro paga de onde o dinheiro realmente saiu. Não lance à vista com data antiga: o dinheiro sairia do caixa de hoje.",
        },
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
      <Chamada tipo="dica">
        <p>
          Enquanto há estoque, cada compra entra na média. Quando o estoque zera, a média recomeça: a próxima compra
          vira o custo do produto. Se o produto acabou na prateleira mas o sistema ainda mostra saldo, faça a contagem
          antes de lançar a compra, senão o custo novo se mistura com o saldo que não existe.
        </p>
        <p>
          A compra feita hoje entra no estoque na hora em que você a lança. Por isso a ordem certa fica no histórico:
          a contagem antes e a compra depois.
        </p>
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
          "Veja cada produto com o saldo lacrado (embalagens fechadas) e o avulso (solto). Embalagens fechadas do mesmo tamanho aparecem numa linha só, por exemplo “10 sacas de 40 kg (Saca 40 kg / ATACADO)”.",
          <>Para corrigir um saldo, abra o produto e, no cartão da loja, clique em <strong>Contar estoque</strong>. Digite o que você contou nas duas colunas. Para o lacrado, há um campo por tamanho de embalagem, e não um por nome.</>,
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
          {
            quando: "“A mesma embalagem aparece duas vezes”",
            fazer: "Você mandou duas apresentações do mesmo tamanho na mesma operação (contagem, perda ou outra). Elas são a mesma saca: digite a quantidade uma vez só, no campo do tamanho.",
          },
        ]}
      >
        <Figura id="estoque-por-loja" />
        <Animacao id="estoque-atacado-mesma-saca" />
      </Tarefa>

      <Subtitulo>Mínimo, máximo e Precisa repor</Subtitulo>
      <Tarefa
        paraQueServe="Ser avisado do que está acabando e saber quanto comprar."
        passos={[
          "Defina o mínimo (o menor saldo aceitável) e o máximo (até onde vale encher a prateleira) de cada produto.",
          <>Abra <strong>Precisa repor</strong>. Os produtos abaixo do mínimo aparecem com a quantidade sugerida.</>,
          "A quantidade sugerida é o máximo menos o saldo e menos o que já foi comprado e ainda não chegou.",
          <>O Dono vê o botão <strong>Encaminhar à Lista</strong>: ele manda o item para a Lista de Compra. A Lista é da fazenda, e a equipe do Empório, o Gerente geral inclusive, não a vê.</>,
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
