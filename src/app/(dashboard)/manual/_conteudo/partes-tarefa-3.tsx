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

      <Subtitulo>Cartões: adquirentes e taxas</Subtitulo>
      <Tarefa
        paraQueServe="Dizer quanto cada máquina de cartão cobra e em quantos dias o dinheiro cai, por loja, adquirente, bandeira e forma de pagamento."
        passos={[
          <>Em <strong>Configurações</strong>, na seção <strong>Cartões: adquirentes e taxas</strong>, o Dono ou o Gerente geral clica em <strong>Nova adquirente</strong> e dá o nome da empresa da maquininha (Cielo, Stone, Rede).</>,
          <>Quem gere a loja clica em <strong>Nova taxa</strong> e escolhe a loja, a adquirente, a bandeira (ou Qualquer bandeira, para as que não têm taxa própria) e a modalidade: débito, crédito à vista ou crédito parcelado.</>,
          "No parcelado, informe a faixa de parcelas (de 2 a 6x, de 7 a 12x). Digite a taxa em %, a taxa fixa em reais se houver, o prazo em dias, a conta que recebe e a data em que a taxa começa a valer.",
          <>Na linha da adquirente, <strong>Editar</strong> define como ela se comporta. Em <strong>Regra de dia útil</strong>, escolha <strong>Próximo dia útil</strong> para a data de cada parcela pular fim de semana e feriado nacional, ou <strong>Dias corridos</strong>. Em <strong>Devolve a taxa no cancelamento</strong>, diga se a adquirente devolve a taxa quando a venda é cancelada.</>,
          <>Se a adquirente já antecipa sozinha as vendas no crédito, ligue <strong>Antecipação automática</strong> e preencha a taxa em % ao mês, os dias úteis até cair e a data a partir da qual vale. Só as vendas dessa data em diante nascem antecipadas, com o custo já descontado.</>,
          <>Quando a taxa muda, clique em <strong>Nova vigência</strong> na linha: a antiga termina na véspera da data escolhida e a nova vale a partir dela. As vendas já feitas guardam a taxa que valia.</>,
          <>Linha que nenhuma venda usou pode ser corrigida em <strong>Editar</strong> ou apagada em <strong>Remover</strong>. Linha com o selo <strong>em uso</strong> só se encerra, com <strong>Encerrar</strong>.</>,
        ]}
        problemas={[
          {
            quando: "A recusa aparece embaixo de Vale a partir de",
            fazer: "Já existe taxa para a mesma loja, adquirente, bandeira, modalidade e faixa de parcelas naquelas datas. Use Nova vigência na linha que vale, em vez de criar outra.",
          },
        ]}
      />

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

export function ParteDeEntrega() {
  return (
    <div className="space-y-2">
      <Tarefa
        paraQueServe="Dizer, na venda ou no orçamento, que a mercadoria vai sair da loja até o cliente, e para onde. Sem a marca, o pedido é retirada no balcão."
        passos={[
          <>Em <strong>Vender</strong>, monte a venda (ou toque em <strong>Orçamento</strong>) e escolha o cliente. Para entrega o cliente precisa ser de verdade: o <strong>Consumidor final</strong> não vale.</>,
          <>Marque <strong>Pedido para entrega</strong>. Aparece o campo <strong>Endereço de entrega</strong>.</>,
          <>Escolha um dos três endereços: <strong>Endereço principal</strong> (o do cadastro), <strong>Endereço de entrega do cadastro</strong> (só aparece se o cliente tem um) ou <strong>Outro endereço (só para este pedido)</strong>.</>,
          <>No <strong>Outro endereço</strong>, preencha <strong>CEP</strong>, <strong>Rua</strong>, <strong>Número</strong>, <strong>Bairro</strong>, <strong>Cidade</strong> e <strong>UF</strong>. O <strong>Complemento</strong> é opcional. Esse endereço vale só para este pedido: o cadastro do cliente não muda.</>,
          <>Se o cliente não tem o CPF ou o endereço no cadastro, a tela diz o que falta e mostra <strong>Completar cadastro</strong>. Clique, preencha e salve ali mesmo: o que você já montou na venda fica.</>,
          <>Clique em <strong>Fechar a venda</strong> (ou <strong>Salvar orçamento</strong>). O resumo oferece <strong>Romaneio A4</strong> e <strong>Romaneio cupom</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“Pedido para entrega precisa do cliente de verdade, não do Consumidor final.”",
            fazer: "Escolha o cliente da compra, ou cadastre-o em Cadastrar novo cliente.",
          },
          {
            quando: "“Para entrega, informe o CPF do cliente.” ou “Para entrega, complete o cadastro do cliente: ...”",
            fazer: <>Clique em <strong>Completar cadastro</strong>, embaixo do cliente, e preencha o que a frase pediu. Para entrega, a pessoa física precisa de nome, telefone e CPF; a pessoa jurídica, do cadastro completo.</>,
          },
          {
            quando: "“Escolha o endereço de entrega.”",
            fazer: "Marque uma das três escolhas do Endereço de entrega.",
          },
          {
            quando: "“O endereço principal do cadastro está incompleto.” (ou o de entrega do cadastro)",
            fazer: <>Complete o cadastro do cliente com <strong>Completar cadastro</strong>, ou escolha <strong>Outro endereço</strong>.</>,
          },
          {
            quando: "“Este cliente não tem endereço de entrega no cadastro.”",
            fazer: "Escolha o endereço principal ou outro endereço.",
          },
        ]}
      >
        <Figura id="balcao-entrega" />
        <Chamada tipo="saiba">
          <p>
            O endereço é copiado para o pedido na hora em que ele é gravado. Se o cadastro do cliente mudar depois, o
            papel que você reimprimir continua com o endereço que valeu naquele dia.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Faturar um orçamento para entrega</Subtitulo>
      <Tarefa
        paraQueServe="Transformar em venda um orçamento que já saiu marcado para entrega, sem digitar o endereço de novo."
        passos={[
          <>Carregue o orçamento em <strong>Vender</strong>, como em <Link className="underline" href={`${B}/orcamento`}>Orçamento</Link>. A marca <strong>Pedido para entrega</strong> e o endereço vêm do orçamento, já preenchidos.</>,
          "Confira o endereço. Se precisar, desmarque a entrega ou escolha outro endereço: o que você deixar na tela é o que vale.",
          <>Feche a venda. O orçamento vencido também passa a marca de entrega: só o preço cotado deixa de valer.</>,
        ]}
        problemas={[
          {
            quando: "“Para entrega, complete o cadastro do cliente: ...” ao faturar",
            fazer: <>O cadastro do cliente ficou incompleto depois que o orçamento foi salvo. O Caixa também completa: clique em <strong>Completar cadastro</strong>, salve e feche a venda. O sistema não fatura para entrega com o cadastro incompleto, e o orçamento continua aberto.</>,
          },
        ]}
      >
        <Chamada tipo="saiba">
          <p>
            No Endereço principal e no Endereço de entrega do cadastro, vale o cadastro do cliente de hoje, copiado na hora
            de faturar. No Outro endereço, vale o que foi escrito no orçamento. O orçamento salvo não muda a entrega: quem
            corrige é quem fatura, ou depois, na venda fechada.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Mudar o pedido depois de fechada a venda</Subtitulo>
      <Tarefa
        paraQueServe="Marcar, desmarcar ou trocar o endereço de entrega de uma venda que já foi fechada, sem mexer em estoque, caixa nem Financeiro."
        passos={[
          <>Abra a venda em <strong>Vendas</strong>. Na seção <strong>Pedido para entrega</strong>, clique em <strong>Mudar</strong>. O botão aparece para o Dono e o Gerente geral, e para o Gestor, o Caixa e o Vendedor nas vendas da loja deles.</>,
          <>Marque ou desmarque <strong>Pedido para entrega</strong> e escolha o endereço, como no balcão.</>,
          <>Clique em <strong>Salvar</strong>. A venda guarda só a marca e o endereço. O <strong>Histórico</strong> ganha a linha “Mudou a venda nº ... para entrega”.</>,
        ]}
        problemas={[
          {
            quando: "A venda não mostra o botão Mudar",
            fazer: "Venda cancelada ou trocada não se muda. Se a mercadoria vai sair, faça uma venda nova; na troca, mude na venda nova que ela gerou. O Vendedor também não vê o botão: peça a quem fatura na loja.",
          },
        ]}
      >
        <Chamada tipo="saiba">
          <p>
            O Caixa muda e reimprime o romaneio só de venda de hoje, porque só enxerga a venda de hoje. A venda nova de uma
            troca nasce como retirada no balcão; quem fatura pode marcá-la para entrega depois.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Imprimir o romaneio</Subtitulo>
      <Tarefa
        paraQueServe="Dar a quem separa e a quem entrega a lista do que sai da loja, sem nenhum preço."
        passos={[
          <>Depois de fechar a venda, clique em <strong>Romaneio A4</strong> ou <strong>Romaneio cupom</strong> no resumo. Para reimprimir, abra a venda em <strong>Vendas</strong>: os dois botões estão no alto.</>,
          <>O papel abre numa aba nova. Clique em <strong>Imprimir</strong>.</>,
          "Quem separa marca a caixinha de cada linha. No fim, três pessoas assinam: quem separou, quem conferiu e quem recebeu.",
        ]}
        problemas={[
          {
            quando: "O romaneio diz RETIRADA NO BALCÃO e não tem endereço",
            fazer: <>A venda não tem a marca de entrega. Se o cliente vai receber em casa, abra a venda e clique em <strong>Mudar</strong>, no quadro <strong>Retirada no balcão</strong>.</>,
          },
          {
            quando: "O aviso grande diz VENDA CANCELADA: NÃO SEPARAR (ou VENDA TROCADA: NÃO SEPARAR)",
            fazer: "A venda não vale mais. Não separe a mercadoria.",
          },
          {
            quando: "O aviso diz VENDA COM DEVOLUÇÃO: CONFIRA NA VENDA ANTES DE SEPARAR",
            fazer: "Parte dos itens voltou. Abra a venda e confira as quantidades antes de separar.",
          },
        ]}
      >
        <Figura id="romaneio-impresso" />
        <Chamada tipo="saiba">
          <p>
            Na entrega, a faixa do alto diz ENTREGA e o papel traz o Endereço de entrega. Na retirada, a faixa diz RETIRADA NO
            BALCÃO: o cliente leva a mercadoria na loja, e o romaneio serve de conferência. A entrega em si fica com a
            logística da loja: o sistema não acompanha se o pedido saiu nem se chegou.
          </p>
        </Chamada>
        <Chamada tipo="atencao">
          <p>
            O romaneio não tem preço, de propósito: ele passa pelas mãos de quem separa e de quem entrega. Ele também não conta
            volumes: o que for preciso dizer sobre a carga vai na Observação da venda, que sai no papel.
          </p>
        </Chamada>
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
          "Leia os cinco blocos, de cima para baixo.",
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

      <Subtitulo>Os cinco blocos</Subtitulo>
      <ul className="list-disc space-y-2 pl-5 text-texto marker:text-texto-discreto">
        <li>
          <strong>Por origem</strong>: quanto vendeu o balcão e quanto vendeu o e-commerce, com o número de vendas, o
          faturamento, o frete cobrado e a parte de cada um no faturamento. O faturamento não inclui o frete, que
          aparece em coluna própria. Com mais de uma loja, a mesma quebra vem para cada loja.
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

export function ParteDeFinanceiroDasLojas() {
  return (
    <div className="space-y-2">
      <p>
        O <strong>Financeiro</strong> é uma função da Equipe para quem cuida do dinheiro de todas as lojas, sem vender no
        balcão e sem mexer na Equipe. Ele não fica preso a uma loja e vê só o Meu Empório: a fazenda é do Dono. O Dono e o
        Gerente geral também abrem a mesma casa.
      </p>

      <Subtitulo>A casa do Financeiro, em quatro abas</Subtitulo>
      <Tarefa
        paraQueServe="Saber onde está o dinheiro das lojas hoje, o que pagar e o que receber, sem abrir loja por loja."
        passos={[
          <>Abra <strong>Meu Empório</strong> e depois <strong>Financeiro</strong>. Quem tem só essa função já cai aqui ao entrar.</>,
          <>Em <strong>Hoje</strong>, veja a posição de caixa (cada gaveta, a gerência de cada loja e cada conta bancária), o que vence hoje a pagar e a receber, e o fiado vencido.</>,
          <>Em <strong>A pagar</strong>, marque as contas e clique em <strong>Pagar selecionadas</strong>. Veja a seção abaixo.</>,
          <>Em <strong>A receber</strong>, veja o fiado por cliente, os cheques em carteira e os cartões por data de recebimento. Quem gere a loja ou cuida do dinheiro marca parcelas de cartão ali mesmo e clica em <strong>Antecipar</strong> para registrar o que a adquirente pagou antes do prazo, e em <strong>Desfazer</strong> para voltar atrás. O custo da antecipação aparece no Resultado, na linha <strong>Antecipação de recebíveis</strong>.</>,
          <>Em <strong>Posição de caixa</strong>, clique em <strong>Ver extrato</strong> numa gaveta, na gerência ou numa conta bancária para ver as entradas e saídas do período, com o saldo de abertura e o de fechamento.</>,
          <>Para olhar uma loja só, use o filtro de loja no alto. Ele acompanha você de uma aba para outra.</>,
          <>Em <strong>Configurações</strong>, na seção <strong>Fiado</strong>, defina o prazo, os dias de atraso que bloqueiam o cliente, o limite padrão e a mensagem de cobrança. Na aba <strong>Cobrança</strong>, cobre quem está atrasado pelo WhatsApp.</>,
        ]}
        problemas={[
          {
            quando: "O extrato recusa o período",
            fazer: "O extrato vai até 92 dias. Escolha datas mais próximas.",
          },
          {
            quando: "A coluna dos cheques mostra só um traço",
            fazer: "É de propósito. Depositar, compensar e devolver cheque é do Gestor da loja. O Financeiro só acompanha.",
          },
        ]}
      >
        <Figura id="financeiro-hoje" />
        <Figura id="financeiro-pagar" />
      </Tarefa>

      <Subtitulo>Pagar a conta de uma compra</Subtitulo>
      <Tarefa
        paraQueServe="Pagar o fornecedor de uma compra a prazo e tirar o dinheiro do lugar certo."
        passos={[
          <>Em <strong>A pagar</strong>, a compra aparece como uma conta com o nome do fornecedor e a loja. Marque a conta.</>,
          <>Clique em <strong>Pagar selecionadas</strong>.</>,
          <>Em <strong>De onde sai o dinheiro</strong>, escolha a conta bancária. O Gestor da loja escolhe também a gaveta; o Financeiro não, porque a gaveta é da loja.</>,
          <>Confira a data e clique no botão com o total. O saldo da conta cai e a saída entra no extrato como <strong>Conta paga</strong>.</>,
          <>Para dar mais prazo, clique em <strong>Adiar</strong> na conta e escolha a nova data. Para desistir da conta, clique em <strong>Cancelar</strong> e diga o motivo; a compra em si continua valendo.</>,
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
        ]}
      />

      <Subtitulo>Receber fiado</Subtitulo>
      <Tarefa
        paraQueServe="Dar baixa no fiado de um cliente que pagou, direto da casa do Financeiro."
        passos={[
          <>Em <strong>A receber</strong>, na linha do cliente, clique em <strong>Receber</strong>.</>,
          <>Digite o valor (pode ser parcial) e escolha a loja que recebe. A forma de pagamento já vem em <strong>Pix</strong>.</>,
          <>Clique em receber. A entrada aparece no extrato da conta do Pix da loja como <strong>Fiado recebido</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“Receber em dinheiro” não aparece, ou é recusado",
            fazer: "O Financeiro recebe fiado só por Pix. Dinheiro é na gaveta da loja, com o Vendedor ou o Caixa e o turno aberto.",
          },
        ]}
      />

      <Subtitulo>Aprovar um pagamento</Subtitulo>
      <Tarefa
        paraQueServe="Deixar o Dono ou o Gerente geral decidir os pagamentos grandes, antes de o dinheiro sair."
        passos={[
          <>O Dono ou o Gerente geral define o <strong>Teto sem aprovação (R$)</strong> em <strong>Configurações</strong>, na seção <strong>Alçada de pagamento</strong>. Sem teto, todo pagamento sai direto.</>,
          <>Quem não é Dono nem Gerente geral e paga acima do teto não paga: o aviso diz que o pagamento <strong>ficou esperando aprovação</strong>, e as contas continuam em A pagar.</>,
          <>O Dono ou o Gerente geral abre <strong>Financeiro</strong> e a aba <strong>Aprovações</strong> (o cartão <strong>Esperando aprovação</strong> em Hoje leva para lá). Cada pedido mostra as contas, quem pediu e de onde sai o dinheiro.</>,
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

      <Subtitulo>Conferir o extrato com o carimbo</Subtitulo>
      <Tarefa
        paraQueServe="Marcar, linha por linha, o que já foi conferido com o extrato do banco, e ver o que ainda falta."
        passos={[
          <>Em <strong>Posição de caixa</strong>, clique em <strong>Ver extrato</strong> numa conta bancária. As contas têm a coluna <strong>Carimbo</strong>.</>,
          <>Confira a linha com o extrato do banco e clique em <strong>Carimbar</strong>. A linha passa a mostrar <strong>Carimbado em</strong> com o dia.</>,
          <>Se carimbou por engano, clique em <strong>Retirar</strong>.</>,
          <>O total <strong>Sem carimbo no período</strong> mostra quanto e em quantas linhas ainda falta conferir. Marque <strong>Só sem carimbo</strong> para esconder as conferidas.</>,
          <>Em <strong>Hoje</strong>, o cartão <strong>Sem carimbo</strong> avisa quando há linha da conta sem conferir nos últimos 30 dias e leva direto para elas.</>,
        ]}
        problemas={[
          {
            quando: "Gaveta e gerência não têm a coluna Carimbo",
            fazer: "É de propósito. O carimbo é a conferência com o banco, e gaveta não tem extrato de banco.",
          },
        ]}
      >
        <Figura id="financeiro-extrato" />
      </Tarefa>

      <Subtitulo>Ver o fluxo projetado</Subtitulo>
      <Tarefa
        paraQueServe="Saber, semana a semana, se o dinheiro vai dar para pagar o que vem pela frente."
        passos={[
          <>Abra <strong>Financeiro</strong> e a aba <strong>Projeção</strong>. Escolha <strong>30 dias</strong>, <strong>60 dias</strong> ou <strong>90 dias</strong>.</>,
          <>No alto está o <strong>Saldo de hoje</strong>: a soma do dinheiro de todas as gavetas, gerências e contas bancárias.</>,
          <>Acima da tabela, o gráfico traz uma linha com o saldo ao fim de cada semana. A semana em que o saldo fica abaixo de zero ganha um ponto vermelho e a frase diz quantas semanas ficam negativas: é o aviso de que o dinheiro aperta.</>,
          <>Cada semana mostra o que deve entrar (fiado, parcela de cartão e cheque) e o que deve sair (contas a pagar e despesas fixas). A última coluna é o saldo ao fim da semana.</>,
          <>A conta pendente que não tem data de vencimento não cabe em nenhuma semana. Ela aparece à parte, no quadro <strong>Sem vencimento</strong>, com a quantidade e o total. Ponha uma data nela para entrar nas semanas.</>,
          <>Clique em <strong>Baixar planilha</strong> para abrir a projeção no Excel, ou em <strong>Imprimir ou salvar em PDF</strong> para ter a folha pronta.</>,
          <>O fiado e a conta que já venceram entram na <strong>Semana 1</strong>, porque ainda precisam ser recebidos e pagos.</>,
          <>Para ver uma loja só, escolha a loja no filtro. A conta bancária é da rede inteira e só aparece em <strong>Todas as lojas</strong>.</>,
        ]}
        problemas={[
          {
            quando: "A despesa fixa dos meses seguintes vem com a marca “estimativa”",
            fazer: "É uma despesa com rateio automático que ainda não nasceu. O valor usa a divisão de hoje e pode mudar quando o mês chegar.",
          },
        ]}
      >
        <Figura id="financeiro-projecao" />
      </Tarefa>

      <Subtitulo>Relatórios do dinheiro</Subtitulo>
      <Tarefa
        paraQueServe="Ver quem deve há quanto tempo, o que vence a pagar e onde está o dinheiro."
        passos={[
          <>Abra <strong>Financeiro</strong> e a aba <strong>Relatórios</strong>. Se quiser, escolha a loja e o período em <strong>De</strong> e <strong>Até</strong>, e clique em <strong>Ver relatórios</strong>.</>,
          <><strong>A receber por idade</strong> mostra cada cliente com o que deve em dia e o que está vencido há 1 a 15 dias, 16 a 30 dias ou mais de 30.</>,
          <><strong>A pagar por vencimento</strong> junta as contas por semana e por nome. O que já venceu fica na primeira semana, com a marca <strong>Vencido</strong>.</>,
          <><strong>Posição de caixa por lugar</strong> mostra o saldo de hoje de cada gaveta, gerência e conta, e o que entrou e saiu no período.</>,
          <>No <strong>A pagar por vencimento</strong>, as contas sem data de vencimento ficam no quadro <strong>Sem vencimento</strong>, fora das semanas.</>,
          <>Cada relatório tem dois botões. <strong>Baixar planilha</strong> entrega um arquivo que o Excel abre sem ajuste (colunas separadas por ponto e vírgula, números com vírgula e datas no formato dia/mês/ano). <strong>Imprimir ou salvar em PDF</strong> abre uma folha A4 em outra aba, com o nome da loja e a data de emissão: clique em <strong>Imprimir</strong> e escolha a impressora ou “Salvar como PDF”. Os dois usam a loja e o período que estão na tela.</>,
        ]}
        problemas={[
          {
            quando: "Sem período, o a pagar e a posição mostram datas diferentes",
            fazer: "É de propósito. O a pagar olha os próximos 30 dias, e a posição de caixa olha os últimos 30.",
          },
        ]}
      >
        <Figura id="financeiro-relatorios" />
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
          para lançar, e <Link className="underline" href={`${B}/caixa`}>Caixa</Link> para as gavetas e as contas.
        </p>
      </Chamada>
    </div>
  );
}
