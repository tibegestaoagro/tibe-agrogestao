import Link from "next/link";
import { Chamada } from "../_components/chamada";
import { Figura } from "../_components/figura";
import { Subtitulo, Tarefa } from "../_components/tarefa";
import { BASE_DO_EMPORIO } from "./indice";

const B = BASE_DO_EMPORIO;

export function ParteDeConfiguracoes() {
  return (
    <div className="space-y-2">
      <p>
        Abra <strong>Meu Empório</strong> e depois <strong>Configurações</strong>. O Dono, o Gerente geral e o Gestor veem
        essa tela. O Vendedor e o Caixa não.
      </p>

      <Subtitulo>O cabeçalho da loja</Subtitulo>
      <Tarefa
        paraQueServe="Dizer o que sai no alto do papel da venda e do orçamento: o CNPJ, o endereço e os telefones da loja."
        passos={[
          <>Em <strong>Cabeçalho das lojas</strong>, ache o cartão da loja e clique em <strong>Editar</strong>.</>,
          <>Preencha <strong>CNPJ</strong>, <strong>Endereço</strong>, <strong>Cidade</strong>, <strong>UF</strong>, <strong>CEP</strong>, <strong>Telefone</strong> e <strong>WhatsApp</strong>. Todos são opcionais.</>,
          <>Clique em <strong>Salvar</strong>. O próximo papel já sai com os dados novos.</>,
        ]}
        problemas={[
          {
            quando: "O CNPJ é recusado: “CNPJ inválido. Confira os 14 caracteres.”",
            fazer: "Confira cada posição. O sistema aceita o CNPJ só de números e também o CNPJ com letras da Receita (o alfanumérico).",
          },
          {
            quando: "O Gestor não vê o botão Editar numa loja",
            fazer: "O Gestor edita só as lojas dele. As outras ele não muda.",
          },
        ]}
      >
        <Figura id="configuracoes-loja" />
      </Tarefa>

      <Subtitulo>Mais de um caixa na loja</Subtitulo>
      <Tarefa
        paraQueServe="Ter duas gavetas trabalhando ao mesmo tempo, cada uma com o seu troco e o seu turno."
        passos={[
          <>No cartão da loja, em <strong>Caixas</strong>, clique em <strong>Novo caixa</strong>. Ele recebe o próximo número: Caixa 2, Caixa 3.</>,
          <>O caixa novo nasce fechado e sem dinheiro. Na primeira abertura, ponha o troco com o <strong>Reforço da gerência (R$)</strong>. O reforço sai de Com a gerência: se lá não houver dinheiro bastante, o sistema recusa com “Não há dinheiro suficiente para isso.” Enquanto o caixa nunca foi aberto, o Gestor pode, em vez disso, clicar em <strong>Saldo inicial</strong> na linha dele, em <strong>Caixa</strong>, digitar o <strong>Saldo inicial (R$)</strong> e clicar em <strong>Lançar saldo inicial</strong>. Ele só pode ser lançado uma vez.</>,
          "Cada caixa tem no máximo um turno aberto. Cada um abre, faz sangria e encerra separado.",
          <>Com dois caixas abertos, o balcão mostra o campo <strong>Caixa</strong> para escolher em qual a venda cai. Vem marcado o caixa que você abriu.</>,
        ]}
        problemas={[
          {
            quando: "“Há mais de um caixa aberto. Escolha o caixa.”",
            fazer: <>Escolha no campo <strong>Caixa</strong> a gaveta em que o dinheiro entra.</>,
          },
        ]}
      >
        <Chamada tipo="saiba">
          <p>
            Toda loja nasce com o Caixa 1. A lista <strong>Caixas</strong> mostra quem abriu cada um, ou Fechado. Como
            abrir, fazer sangria e encerrar está em <Link className="underline" href={`${B}/caixa`}>Caixa</Link>.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Impressão, validade do orçamento e logo</Subtitulo>
      <Tarefa
        paraQueServe="Ajustar o que vale para todas as lojas da conta: a validade do orçamento, a bobina, os rodapés e o logo. Só o Dono e o Gerente geral mudam isso."
        passos={[
          <>Em <strong>Impressão e orçamento</strong>, clique em <strong>Editar</strong>.</>,
          <>Em <strong>Validade do orçamento (dias)</strong>, digite de 1 a 365. A conta começa com 7 dias.</>,
          <>Em <strong>Rodapé do orçamento</strong> e <strong>Rodapé da venda</strong>, escreva o texto do fim do papel, até 500 caracteres. Em branco, o papel sai sem rodapé.</>,
          <>Em <strong>Largura da bobina</strong>, escolha 80 mm ou 58 mm, a da sua impressora de cupom.</>,
          <>Clique em <strong>Salvar</strong>.</>,
          <>Em <strong>Logo</strong>, clique em <strong>Enviar logo</strong> (ou <strong>Trocar logo</strong>), escolha a <strong>Imagem</strong> e clique em <strong>Enviar</strong>. Para tirar, clique em <strong>Remover logo</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“A validade deve ser de 1 a 365 dias.”",
            fazer: "Digite um número de dias entre 1 e 365.",
          },
          {
            quando: "O logo é recusado: “O logo deve ser PNG ou JPEG.” ou “O logo deve ter até 200 KB.”",
            fazer: "Salve a imagem em PNG ou JPEG e diminua o tamanho dela antes de enviar.",
          },
          {
            quando: "O Gestor não vê o botão Editar em Impressão e orçamento",
            fazer: "A tela avisa: “Só o dono ou o gerente geral muda a impressão e o logo.” O Gestor só lê.",
          },
        ]}
      >
        <Figura id="configuracoes-impressao" />
        <Chamada tipo="saiba">
          <p>
            O logo sai só no papel A4. A bobina sai sem logo. Sem logo, o A4 sai só com o nome da loja. A validade nova vale
            para os orçamentos salvos depois dela: o orçamento já salvo mantém a data dele.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Imprimir a venda e o orçamento</Subtitulo>
      <Tarefa
        paraQueServe="Entregar ao cliente o papel da venda ou do orçamento, em folha A4 ou no cupom da bobina."
        passos={[
          <>Depois de fechar a venda, o quadro <strong>Venda registrada</strong> mostra <strong>Imprimir A4</strong> e <strong>Imprimir cupom</strong>. O orçamento salvo mostra os mesmos dois.</>,
          <>O papel abre numa aba nova. Clique em <strong>Imprimir</strong>.</>,
          <>Na janela de impressão, escolha a impressora. Para guardar o papel, escolha <strong>Salvar como PDF</strong>.</>,
          <>Para imprimir de novo depois, abra a venda em <strong>Vendas</strong> ou o orçamento em <strong>Orçamentos</strong>. Os dois botões estão no alto.</>,
        ]}
        problemas={[
          {
            quando: "O papel sai sem CNPJ, endereço ou telefone",
            fazer: "Preencha o cabeçalho da loja, nesta mesma tela de Configurações.",
          },
          {
            quando: "O cupom sai na largura errada",
            fazer: "Confira a Largura da bobina em Configurações: 80 mm ou 58 mm.",
          },
        ]}
      >
        <Figura id="venda-impressa" />
        <Chamada tipo="atencao">
          <p>
            O papel diz “sem valor fiscal”: ele não é nota fiscal. A venda cancelada sai marcada como VENDA CANCELADA.
          </p>
        </Chamada>
      </Tarefa>
    </div>
  );
}

export function ParteDeOrcamento() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Dar ao cliente um preço por escrito, para ele decidir depois. O orçamento não tira do estoque, não reserva mercadoria e não mexe no caixa."
        passos={[
          <>Abra <strong>Vender</strong> e toque em <strong>Orçamento</strong>, no alto da tela.</>,
          "Busque os produtos e ajuste a quantidade e o preço, como numa venda. O desconto segue o mesmo limite da loja.",
          <>No campo <strong>Cliente</strong>, clique em <strong>Escolher cliente</strong> e busque pelo nome, pelo CPF ou CNPJ, ou por um pedaço do telefone. Quem não quer se identificar entra como <strong>Consumidor final</strong>, que vale para o orçamento. O cliente precisa estar com o cadastro completo: na pessoa física, nome e telefone; na jurídica, também o CNPJ e o endereço principal. Para um cliente novo, clique em <strong>Cadastrar novo cliente</strong>.</>,
          <>Se quiser, escreva uma <strong>Observação</strong>.</>,
          <>Confira o <strong>Vendedor</strong>. Ele já vem com o seu nome. Se você é Caixa, escolha quem atendeu.</>,
          <>Clique em <strong>Salvar orçamento</strong>. O quadro verde mostra o número e a data até quando ele vale (<strong>válido até</strong>); vale até o fim desse dia.</>,
          <>Clique em <strong>Imprimir A4</strong> ou <strong>Imprimir cupom</strong> e entregue o papel ao cliente.</>,
        ]}
        problemas={[
          {
            quando: "“Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final.”",
            fazer: "Faltou o cliente. Escolha o cliente, ou o Consumidor final, ou cadastre pelo botão Cadastrar novo cliente.",
          },
          {
            quando: "“Complete o cadastro do cliente antes de salvar o orçamento.”, seguido do que falta (por exemplo, “Informe o telefone.”)",
            fazer: <>O cliente aparece com <strong>Cadastro incompleto</strong>. Clique em <strong>Completar cadastro</strong>, preencha o que a frase pediu e salve. Depois salve o orçamento.</>,
          },
          {
            quando: "O desconto é recusado: “O desconto de X% passa do limite de Y% desta loja. Peça ao gestor da loja.”",
            fazer: "O desconto passou do limite da loja. Chame o Gestor. O desconto que ele autoriza no orçamento continua valendo no faturamento, dentro da validade.",
          },
        ]}
      >
        <Figura id="orcamento-balcao" />
        <Figura id="orcamento-salvo" />
        <Chamada tipo="saiba">
          <p>
            O orçamento salvo não se edita. Para mudar, ajuste os itens na hora de faturar, ou faça um orçamento novo. O
            botão <strong>Faturar</strong> do modo Orçamento leva os itens direto para a venda, sem salvar orçamento. O
            botão <strong>Faturar agora</strong>, do quadro verde, fatura o orçamento que você acabou de salvar.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Faturar um orçamento</Subtitulo>
      <Tarefa
        paraQueServe="Transformar o orçamento em venda quando o cliente volta."
        passos={[
          <>Em <strong>Vender</strong>, fique em <strong>Venda</strong> e confira a loja. Digite o número do papel em <strong>Orçamento nº</strong> e clique em <strong>Carregar</strong>. Quem vê a lista também pode abrir o orçamento em <strong>Orçamentos</strong> e clicar em <strong>Faturar</strong>.</>,
          <>A faixa <strong>Faturando o orçamento nº</strong> mostra o cliente, o vendedor e a validade. Os itens e o cliente entram na venda.</>,
          "Leia os avisos da faixa, se houver: o preço que mudou, o orçamento vencido e o estoque que falta.",
          <>O <strong>Vendedor</strong> é o do orçamento. Ninguém precisa escolher.</>,
          <>Escolha o pagamento e clique em <strong>Fechar a venda</strong>. Como toda venda, ela precisa de um caixa aberto.</>,
        ]}
        problemas={[
          {
            quando: "“Orçamento não encontrado nesta loja.”",
            fazer: "Confira o número no papel e a loja escolhida. O orçamento só fatura na loja em que foi feito.",
          },
          {
            quando: "“Este orçamento já foi faturado na venda nº ...”",
            fazer: "Ele já virou venda. Abra a venda com esse número em Vendas.",
          },
          {
            quando: "O aviso diz “Falta estoque”",
            fazer: "O aviso não trava a venda. Ao fechar, vale a regra de estoque da loja: sem saldo e sem o estoque negativo liberado, a venda é recusada.",
          },
          {
            quando: "Carregou o orçamento errado",
            fazer: <>Clique em <strong>Tirar orçamento</strong>, na faixa, e digite o número certo.</>,
          },
        ]}
      >
        <Figura id="orcamento-faturar" />
        <Chamada tipo="saiba">
          <p>
            Dentro da validade, o cliente paga o menor entre o preço orçado e o preço de hoje. Vencido, ele paga o preço de
            hoje: a faixa diz “Orçamento vencido em ...: vale o preço de hoje.” O orçamento vencido ainda pode ser faturado.
          </p>
          <p>
            O desconto do orçamento passa para a venda. Um desconto a mais no faturamento se soma a ele, e o total não pode
            passar do limite da loja. Se o Gestor autorizou um desconto acima do limite no orçamento, ele vale; um desconto
            a mais, só com o Gestor. Um orçamento fatura uma vez só. Se a venda dele for cancelada, ele volta a aberto e pode
            ser faturado de novo.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Achar e acompanhar os orçamentos</Subtitulo>
      <Tarefa
        paraQueServe="Achar o orçamento pelo que o cliente fala ao telefone e ligar para quem não voltou."
        passos={[
          <>Abra <strong>Orçamentos</strong> no menu. O Dono, o Gerente geral, o Gestor e o Vendedor veem essa lista. O Caixa não: ele fatura pelo número do papel.</>,
          <>A lista começa em <strong>Em acompanhamento</strong>: os abertos e os vencidos, que ainda podem virar venda. Para ver outros, escolha <strong>Em aberto</strong>, <strong>Vencidos</strong>, <strong>Faturados</strong> ou <strong>Todos</strong>.</>,
          <>Na busca, digite o telefone, o CPF, o CNPJ, o nome ou o número e clique em <strong>Buscar</strong>. Do telefone e do documento, bastam 3 números.</>,
          <>Clique em <strong>Ver</strong> para abrir. O orçamento mostra os itens, a Observação, <strong>Imprimir A4</strong>, <strong>Imprimir cupom</strong> e, se ainda não foi faturado, <strong>Faturar</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“Nenhum orçamento encontrado”",
            fazer: "Mude o filtro de situação para Todos, ou busque por outro dado do cliente.",
          },
        ]}
      >
        <Figura id="orcamentos-lista" />
      </Tarefa>
    </div>
  );
}

export function ParteDeRelatorios() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Ver quem vendeu, o que vendeu e o que ficou parado, num período à sua escolha. Serve para acertar a comissão."
        passos={[
          <>Abra <strong>Relatórios</strong> no menu. O Dono, o Gerente geral e o Gestor veem essa tela. O Vendedor e o Caixa não.</>,
          "A tela abre no mês atual, do dia 1 até hoje.",
          <>Para outro período, mude <strong>De</strong> e <strong>Até</strong> e clique em <strong>Ver relatório</strong>. Os dois dias entram na conta. O botão <strong>Mês atual</strong> volta ao começo.</>,
          <>Se você cuida de mais de uma loja, escolha a <strong>Loja</strong> ou deixe <strong>Todas as minhas lojas</strong>. O Gestor vê só as lojas dele.</>,
          "Leia os quatro blocos, de cima para baixo.",
        ]}
        problemas={[
          {
            quando: "Aparece um aviso e a tela mostra o mês atual",
            fazer: "O período estava errado: “A data final não pode ser antes da inicial.” ou “O período vai até 366 dias.” Corrija De e Até.",
          },
          {
            quando: "Um produto não aparece em Produtos parados",
            fazer: "Só entra o produto com preço na loja e que não está arquivado. Produto sem preço na loja fica de fora.",
          },
        ]}
      >
        <Figura id="relatorios-periodo" />
      </Tarefa>

      <Subtitulo>Os quatro blocos</Subtitulo>
      <ul className="list-disc space-y-2 pl-5 text-texto marker:text-texto-discreto">
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
      </ul>

      <Chamada tipo="saiba">
        <p>
          Venda cancelada não conta. A devolução feita no período desconta do vendedor e da loja da venda original, mesmo
          que a venda seja de antes do período. Por isso um total pode ficar negativo. A venda nova de uma troca soma no
          total, mas não conta como mais uma venda.
        </p>
      </Chamada>
      <Chamada tipo="dica">
        <p>
          Relatórios conta vendas, não lucro. Para saber se a loja deu lucro, abra o{" "}
          <Link className="underline" href={`${B}/resultado`}>Resultado</Link>.
        </p>
      </Chamada>
    </div>
  );
}

export function ParteDeClientes() {
  return (
    <Tarefa
      paraQueServe="Guardar quem compra nas suas lojas e ver o que cada cliente já comprou."
      passos={[
        <>Abra <strong>Meu Empório</strong> e depois <strong>Clientes</strong>. O Dono, o Gerente geral, o Gestor, o Vendedor e o Caixa veem essa tela.</>,
        <>Clique em <strong>Cadastrar novo cliente</strong> e escolha <strong>Pessoa física</strong> ou <strong>Pessoa jurídica</strong>.</>,
        "Na pessoa física, bastam o nome e o telefone. O CPF, o nascimento e o endereço são opcionais.",
        "Na pessoa jurídica, também o CNPJ e o endereço principal completo: CEP, rua, número, bairro, município e UF.",
        <>Clique em <strong>Cadastrar cliente</strong>. O cliente já aparece no campo <strong>Cliente</strong> do balcão.</>,
        <>Clique no nome do cliente para abrir a ficha: o total comprado, a última compra, as vendas (com os itens) e os orçamentos das lojas que você vê.</>,
        <>Para corrigir o cadastro, clique em <strong>Editar</strong> na ficha.</>,
      ]}
      problemas={[
        {
          quando: "“Já existe um cliente com esse CPF: <nome>.” (ou CNPJ)",
          fazer: "O cliente já está cadastrado. Busque pelo nome que a frase mostra. Se a frase disser que ele está arquivado, desarquive em Clientes.",
        },
        {
          quando: "O cliente não aparece mais no balcão",
          fazer: <>Ele foi arquivado. Em Clientes, marque <strong>Mostrar arquivados</strong>, abra a ficha e clique em <strong>Desarquivar</strong>. Só o Gestor da loja, o Gerente geral e o Dono arquivam e desarquivam.</>,
        },
        {
          quando: "A ficha não mostra o botão Editar",
          fazer: "O cliente está arquivado, ou é o Consumidor final, que é fixo. Desarquive antes de editar.",
        },
      ]}
    >
      <Figura id="clientes-lista" />
      <Chamada tipo="saiba">
        <p>
          Os clientes da loja não ficam em Contatos. Contatos é da fazenda. Arquivar tira o cliente do balcão, mas as
          vendas e o fiado dele continuam guardados.
        </p>
      </Chamada>
    </Tarefa>
  );
}

export function ParteDeFornecedores() {
  return (
    <Tarefa
      paraQueServe="Guardar de quem as lojas compram, e as propriedades do dono que mandam mercadoria para a loja."
      passos={[
        <>Abra <strong>Meu Empório</strong> e depois <strong>Fornecedores</strong>. O Caixa não vê essa tela.</>,
        <>Clique em <strong>Novo fornecedor</strong>.</>,
        <>Para quem vende para a loja, escolha <strong>Fornecedor de fora</strong>. Só o nome é obrigatório; o CPF ou CNPJ, o telefone e o endereço são opcionais.</>,
        <>Para uma fazenda do dono que manda mercadoria (milho, feno, leite), escolha <strong>Propriedade do dono</strong> e a <strong>Propriedade</strong> na lista.</>,
        <>Clique em <strong>Cadastrar fornecedor</strong>. Ele aparece no campo <strong>Fornecedor</strong> da compra.</>,
      ]}
      problemas={[
        {
          quando: "A compra da propriedade não pede a forma de pagamento",
          fazer: "É de propósito. O dono não paga a si mesmo: a compra entra só com o custo, para o estoque e o resultado da loja saírem certos, sem conta a pagar no Financeiro. A lista de Compras mostra “Só custo (propriedade)”.",
        },
        {
          quando: "“Essa propriedade já é fornecedor: <nome>.”",
          fazer: "Cada propriedade vira fornecedor uma vez só. Use o que já está cadastrado.",
        },
        {
          quando: "“Essa propriedade está arquivada no Tibé.”",
          fazer: "Desarquive a propriedade em Minha Fazenda antes de cadastrar o fornecedor.",
        },
      ]}
    >
      <Figura id="fornecedores-lista" />
      <Chamada tipo="saiba">
        <p>
          Lance a compra em <Link className="underline" href={`${B}/compras`}>Comprar e receber</Link>. Cadastrar e
          editar fornecedor é de quem lança compra: o Gestor, o Gerente geral, o Dono e o Vendedor com a chave Lançar
          compra.
        </p>
      </Chamada>
    </Tarefa>
  );
}
