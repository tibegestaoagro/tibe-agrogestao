import Link from "next/link";
import { Chamada } from "../_components/chamada";
import { Animacao } from "../_components/animacao";
import { Figura } from "../_components/figura";
import { Subtitulo, Tarefa } from "../_components/tarefa";
import { BASE_DO_EMPORIO } from "./indice";

const B = BASE_DO_EMPORIO;

export function ParteDeConfiguracoes() {
  return (
    <div className="space-y-2">
      <p>
        Abra <strong>Meu Empório</strong>, <strong>Ajustes</strong> e <strong>Configurações</strong>. O Dono, o Gerente geral e o Gestor veem
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

      <Subtitulo>O limite de desconto e o PIN do gestor</Subtitulo>
      <Tarefa
        paraQueServe="Dizer até quanto de desconto o vendedor dá sozinho, e deixar o gestor liberar o que passa disso."
        passos={[
          <>O limite é o <strong>Desconto máximo (%)</strong> dos dados da loja, em <strong>Lojas</strong> &gt; <strong>Editar</strong>. Até ele, o vendedor dá o desconto sozinho, na linha do item ou no total da venda.</>,
          <>Acima do limite, o balcão pede <strong>Pedir autorização do gestor</strong>: o vendedor escolhe o gestor e o gestor digita o PIN dele. A autorização vale 15 minutos, naquela loja, até aquele percentual de desconto.</>,
          "Quem é gestor da loja não precisa de PIN para o próprio desconto. A loja que quer autorização em todo desconto configura o limite em 0%.",
          <>Cada gestor (Gestor, Gerente geral e Dono) cadastra o PIN dele em <strong>Configurações</strong> &gt; <strong>Minha senha</strong>, com 4 a 6 números e a senha de entrada. Cinco PINs errados travam as tentativas daquele gestor por 15 minutos. O Dono e o Gerente geral apagam o PIN de alguém na Equipe, em <strong>Apagar PIN</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“Nenhum gestor desta loja tem PIN cadastrado.”",
            fazer: "Nenhum gestor da loja cadastrou o PIN ainda. Cada um cadastra o seu em Configurações > Minha senha.",
          },
        ]}
      />

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

      <Subtitulo id="cartoes">Cartões: adquirentes e taxas</Subtitulo>
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
          {
            quando: "A taxa que eu cadastrei não aparece na lista",
            fazer: "A data final dela já passou, e a lista esconde as taxas encerradas. Marque Mostrar encerradas. Se nenhuma venda usou a taxa, ela ainda tem Editar: apague a data final para ela voltar a valer, ou corrija as datas.",
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

      <Subtitulo>Balcão e etiquetas</Subtitulo>
      <Tarefa
        paraQueServe="Escolher as teclas dos atalhos do balcão e ajustar a etiqueta à folha ou à impressora de rolo da loja. É de quem cuida da conta."
        passos={[
          <>Em <strong>Configurações</strong>, na seção <strong>Balcão e etiquetas</strong>, clique em <strong>Mudar</strong>.</>,
          <>Em cada ação (<strong>Buscar produto</strong>, <strong>Escolher cliente</strong>, <strong>Vendedor</strong>, <strong>Forma de pagamento</strong>, <strong>Fechar a venda</strong>), escolha a tecla. Desmarque a <strong>Legenda</strong> se não quiser ver a tecla ao lado de cada campo do balcão. As teclas padrão são F2, F4, F8, F9 e Ctrl+Enter.</>,
          <>Escolha o <strong>Formato padrão</strong> das etiquetas: folha A4 ou rolo.</>,
          <>Ajuste as medidas em milímetros, como estão na caixa da folha de etiquetas ou no manual da impressora: colunas, linhas, largura, altura, margens e espaços.</>,
          <>Clique em <strong>Salvar</strong>. <strong>Voltar ao padrão</strong> preenche a folha de 21 etiquetas (3 x 7, 63,5 x 38,1 mm) e o rolo de 40 x 25 mm.</>,
        ]}
        problemas={[
          {
            quando: "“A tecla ... já está em outra ação.”",
            fazer: "Duas ações não podem usar a mesma tecla. Troque a tecla de uma delas.",
          },
          {
            quando: "A medida da folha é recusada",
            fazer: "As etiquetas, com as margens e os espaços, passaram do tamanho da folha A4 (210 x 297 mm). Confira as medidas na caixa da folha.",
          },
        ]}
      />
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
          <>Busque os produtos e ajuste a quantidade, como numa venda. O preço vem do cadastro da loja e não se digita; produto sem preço na loja não entra. O desconto é o mesmo da venda: <strong>Desconto (%)</strong> em cada linha e <strong>Desconto no total (R$)</strong> para o orçamento inteiro, até o limite da loja. Acima dele, <strong>Pedir autorização do gestor</strong>: o gestor digita o PIN, e a autorização vale 15 minutos, naquela loja, até aquele percentual. Um item cadastrado com preço R$ 0,00 sai como <strong>Brinde</strong>.</>,
          <>O campo <strong>Cliente</strong> já começa em <strong>Consumidor final</strong>, que vale para o orçamento. Para outro cliente, clique em <strong>Trocar</strong> e busque pelo nome, pelo CPF ou CNPJ, ou por um pedaço do telefone. Para o orçamento bastam o nome e o telefone do cliente, de pessoa física ou jurídica: o CPF, o CNPJ e o endereço só são cobrados ao fechar a venda. Para um cliente novo, clique em <strong>Não achou? Cadastrar novo</strong>, na janela.</>,
          <>Se o orçamento é de um franqueado, abra <strong>Mais opções</strong>, escolha o <strong>Franqueado (opcional)</strong> e digite o <strong>Crédito do franqueado (R$)</strong>. O papel do orçamento já sai com o crédito repartido nos itens, e a venda, ao faturar, nasce com os dois.</>,
          <>Se vai ter entrega cobrada, em <strong>Mais opções</strong>, digite o <strong>Frete cobrado do cliente (opcional)</strong>. O papel do orçamento mostra o frete numa linha própria e o total com ele, e a venda, ao faturar, já nasce com o frete. O frete não entra no faturamento da loja.</>,
          <>Se quiser, escreva uma <strong>Observação</strong>.</>,
          <>Confira o <strong>Vendedor</strong>. Ele já vem com o seu nome. Se você é Caixa, escolha quem atendeu.</>,
          <>Clique em <strong>Salvar orçamento</strong>. O quadro verde mostra o número e a data até quando ele vale (<strong>válido até</strong>); vale até o fim desse dia. Se o cadastro do cliente ainda não tem o que a venda pede, um aviso amarelo (<strong>Antes de fechar a venda, complete o cadastro</strong>, ou <strong>Finalize os dados de entrega</strong>) lista o que falta, como o CPF e o endereço de entrega: o orçamento já está salvo, e o cadastro se completa na hora de vender.</>,
          <>Clique em <strong>Imprimir A4</strong> ou <strong>Imprimir cupom</strong> e entregue o papel ao cliente.</>,
        ]}
        problemas={[
          {
            quando: "“Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final.”",
            fazer: "Faltou o cliente. Clique em Trocar e escolha o cliente, ou deixe o Consumidor final, ou cadastre em Não achou? Cadastrar novo.",
          },
          {
            quando: "“Complete o cadastro do cliente antes de salvar o orçamento.”, seguido do que falta (por exemplo, “Informe o telefone.”)",
            fazer: <>O cliente aparece com <strong>Cadastro incompleto</strong>. Clique em <strong>Completar cadastro</strong>, preencha o que a frase pediu e salve. Depois salve o orçamento.</>,
          },
          {
            quando: "“O desconto de X% passa do limite de Y% desta loja. O gestor da loja precisa autorizar com o PIN dele.”",
            fazer: <>O desconto passou do limite da loja. Clique em <strong>Pedir autorização do gestor</strong> e peça que ele digite o PIN. O desconto que ele autoriza no orçamento continua valendo no faturamento, dentro da validade. Se a tela disser “PIN incorreto.”, confira o PIN com o gestor; após cinco erros seguidos, “Muitas tentativas”, as tentativas dele travam por 15 minutos e outro gestor pode autorizar.</>,
          },
          {
            quando: "“Cadastre o preço de ... nesta loja antes de vender.”",
            fazer: "O produto não tem preço nesta loja. Chame o Gestor ou o Dono para cadastrar em Preço por loja, no produto.",
          },
        ]}
      >
        <Figura id="orcamento-balcao" />
        <Figura id="orcamento-salvo" />
        <Chamada tipo="saiba">
          <p>
            Para mudar um orçamento em aberto ou vencido, abra-o em <strong>Orçamentos</strong> e clique em{" "}
            <strong>Editar</strong>: ele mantém o número, ganha nova validade e os itens passam para o preço de hoje do cadastro.
            Para desistir dele, clique em <strong>Cancelar orçamento</strong> e diga o motivo; o cancelamento não tem
            volta, e o orçamento fica no filtro <strong>Cancelados</strong>. O orçamento já faturado não se edita:
            clique em <strong>Novo orçamento a partir deste</strong> (vale para qualquer orçamento) para ajustar itens e
            quantidades num orçamento novo, com outro número. O
            botão <strong>Faturar</strong> do modo Orçamento leva os itens direto para a venda, sem salvar orçamento. O
            botão <strong>Faturar agora</strong>, do quadro verde, fatura o orçamento que você acabou de salvar.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Faturar um orçamento</Subtitulo>
      <Tarefa
        paraQueServe="Transformar o orçamento em venda quando o cliente volta."
        passos={[
          <>Em <strong>Vender</strong>, fique em <strong>Venda</strong> e confira a loja. Abra <strong>Mais opções</strong>, digite o número do papel em <strong>Orçamento nº</strong> e clique em <strong>Carregar</strong>. Quem vê a lista também pode abrir o orçamento em <strong>Orçamentos</strong> e clicar em <strong>Faturar</strong>.</>,
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
            Dentro da validade, a venda mantém o preço e o desconto orçados, mesmo que o cadastro tenha mudado. Vencido, ele
            paga o preço de hoje do cadastro: a faixa diz “Orçamento vencido em ...: vale o preço de hoje.” O orçamento
            vencido ainda pode ser faturado.
          </p>
          <p>
            O desconto do orçamento passa para a venda. Um desconto a mais no faturamento se soma a ele, e o total não pode
            passar do limite da loja. Se o gestor autorizou um desconto acima do limite no orçamento, ele vale; um desconto
            a mais pede nova autorização, com o PIN de um gestor. Um orçamento fatura uma vez só. Se a venda dele for cancelada, ele volta a aberto e pode
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
          <>A lista vem em páginas. Em <strong>Por página</strong>, escolha 20, 40, 80 ou 100. Em <strong>Ordem</strong>, escolha <strong>Mais recentes primeiro</strong> ou <strong>Mais antigos primeiro</strong>. Embaixo, “Mostrando 1 a 20 de 230” diz quantos há, e os números levam às outras páginas.</>,
          <>Clique em <strong>Ver</strong> para abrir. O orçamento mostra os itens, a Observação, <strong>Imprimir A4</strong>, <strong>Imprimir cupom</strong> e, se ainda não foi faturado, <strong>Faturar</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“Nenhum orçamento encontrado”",
            fazer: "Mude o filtro de situação para Todos, ou busque por outro dado do cliente.",
          },
          {
            quando: "Um orçamento antigo não aparece na lista",
            fazer: "Ele está numa página mais adiante. Vá às últimas páginas, escolha Mais antigos primeiro, ou digite o número dele na busca. Faturado e cancelado só aparecem com a situação Faturados ou Todos.",
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
          <>Em <strong>Vender</strong>, monte a venda (ou toque em <strong>Orçamento</strong>) e clique em <strong>Trocar</strong> para escolher o cliente. Para entrega o cliente precisa ser de verdade: o <strong>Consumidor final</strong>, que já vem no campo, não vale.</>,
          <>Abra <strong>Mais opções</strong> e marque <strong>Pedido para entrega</strong>. Aparece o campo <strong>Endereço de entrega</strong>.</>,
          <>Escolha um dos três endereços: <strong>Endereço principal</strong> (o do cadastro), <strong>Endereço de entrega do cadastro</strong> (só aparece se o cliente tem um) ou <strong>Outro endereço (só para este pedido)</strong>.</>,
          <>No <strong>Outro endereço</strong>, preencha <strong>CEP</strong>, <strong>Rua</strong>, <strong>Número</strong>, <strong>Bairro</strong>, <strong>Cidade</strong> e <strong>UF</strong>. O <strong>Complemento</strong> é opcional. Esse endereço vale só para este pedido: o cadastro do cliente não muda.</>,
          <>Se o cliente não tem o CPF ou o endereço no cadastro, a tela diz o que falta e mostra <strong>Completar cadastro</strong>. Clique, preencha e salve ali mesmo: o que você já montou na venda fica.</>,
          <>Clique em <strong>Fechar a venda</strong> (ou <strong>Salvar orçamento</strong>). O resumo oferece <strong>Romaneio A4</strong> e <strong>Romaneio cupom</strong>.</>,
        ]}
        problemas={[
          {
            quando: "“Pedido para entrega precisa do cliente de verdade, não do Consumidor final.”",
            fazer: "Clique em Trocar e escolha o cliente da compra, ou cadastre-o em Não achou? Cadastrar novo.",
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

export function ParteDeClientes() {
  return (
    <Tarefa
      paraQueServe="Guardar quem compra nas suas lojas e ver o que cada cliente já comprou."
      passos={[
        <>Abra <strong>Meu Empório</strong>, <strong>Vendas</strong> e <strong>Clientes</strong>. O Dono, o Gerente geral, o Gestor, o Vendedor e o Caixa veem essa tela.</>,
        <>Na lista de clientes, use o botão <strong>Cadastrar novo cliente</strong> e escolha <strong>Pessoa física</strong> ou <strong>Pessoa jurídica</strong>.</>,
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
        <>Abra <strong>Meu Empório</strong>, <strong>Estoque</strong> e <strong>Fornecedores</strong>. O Caixa não vê essa tela.</>,
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

export function ParteDeFranqueados() {
  return (
    <div className="space-y-2">
      <p>
        O franqueado é quem leva clientes à loja e recebe um crédito por isso. O crédito é digitado na venda, cobrado a
        mais do cliente e guardado numa conta do franqueado, até a loja pagar.
      </p>

      <Subtitulo>Cadastrar o franqueado</Subtitulo>
      <Tarefa
        paraQueServe="Guardar o franqueado, para escolhê-lo na venda e no orçamento."
        passos={[
          <>Abra <strong>Meu Empório</strong>, <strong>Vendas</strong> e <strong>Franqueados</strong>. Clique em <strong>Novo franqueado</strong>.</>,
          "Só o nome e o telefone são obrigatórios. O documento e a observação são opcionais.",
          <>Clique em <strong>Cadastrar franqueado</strong>. Ele aparece na lista com o saldo.</>,
        ]}
        problemas={[
          {
            quando: "Não vejo o botão Novo franqueado",
            fazer: "Cadastrar e editar franqueado é de quem lança compra, como no cadastro de fornecedor: o Gestor, o Gerente geral, o Dono e o Vendedor com a chave Lançar compra.",
          },
        ]}
      >
        <Animacao id="franqueado-cadastrar" />
        <Chamada tipo="saiba">
          <p>
            O cadastro vale para todas as lojas da conta. Franqueado não se mistura com fornecedor: fornecedor vende para
            a loja, franqueado recebe crédito de vendas.
          </p>
        </Chamada>
      </Tarefa>

      <Subtitulo>Lançar o crédito na venda</Subtitulo>
      <Tarefa
        paraQueServe="Registrar quanto o franqueado ganha numa venda, sem sujar o faturamento da loja."
        passos={[
          <>No balcão, monte a venda, abra <strong>Mais opções</strong> e escolha o <strong>Franqueado (opcional)</strong>. Só um por venda.</>,
          <>Digite o <strong>Crédito do franqueado (R$)</strong>. Ele soma ao total: o cliente paga os itens, mais o frete, se houver, mais o crédito.</>,
          <>Feche a venda. O crédito fica fora do faturamento, do custo e da margem, e entra no saldo do franqueado.</>,
          <>O <strong>Orçamento</strong> também aceita franqueado e crédito. Ao faturar, a venda já nasce com os dois.</>,
        ]}
        problemas={[
          {
            quando: "O cliente leu o papel e não achou o crédito",
            fazer: "É de propósito. O impresso para o cliente não mostra o crédito: ele vem repartido nos preços dos itens, para o papel somar o que o cliente paga. Por exemplo, produtos de 60 e 40, com crédito de 10, saem a 66 e 44. O crédito aparece só nas telas internas e nos relatórios.",
          },
          {
            quando: "Cancelei ou editei a venda, e o saldo do franqueado mudou",
            fazer: "É assim mesmo: cancelar ou editar a venda cancela o crédito dela. Se o crédito já tinha sido pago, o saldo do franqueado fica negativo e a tela mostra.",
          },
        ]}
      >
        <Animacao id="balcao-credito-franqueado" />
      </Tarefa>

      <Subtitulo>Pagar o crédito</Subtitulo>
      <Tarefa
        paraQueServe="Acertar com o franqueado o que ele acumulou, e deixar o extrato dizendo quanto foi pago."
        passos={[
          "Abra o franqueado, tocando no nome dele na lista. O extrato mostra os créditos (com a venda, a data e o valor) e os pagamentos. O saldo é o que entrou de crédito menos o que já foi pago.",
          <>Clique em <strong>Pagar crédito</strong>. Digite o <strong>Valor</strong> (até o saldo), a <strong>Data do pagamento</strong> e, em <strong>De onde sai o dinheiro</strong>, a gaveta (de um caixa com turno aberto) ou uma conta bancária.</>,
          <>Confirme. O saldo cai e o pagamento entra no extrato e no Histórico.</>,
        ]}
        problemas={[
          {
            quando: "Não vejo o botão Pagar crédito",
            fazer: "Só quem cuida do dinheiro da loja paga o franqueado.",
          },
          {
            quando: "O valor é recusado",
            fazer: "O pagamento não passa do saldo do franqueado. Confira o extrato.",
          },
        ]}
      >
        <Animacao id="franqueado-pagar" />
        <Chamada tipo="saiba">
          <p>
            O pagamento ao franqueado não vira despesa da loja. No{" "}
            <Link className="underline" href={`${B}/estatisticas#resultado`}>Resultado</Link> e nos relatórios de{" "}
            <Link className="underline" href={`${B}/estatisticas#vendas`}>Vendas</Link>, o crédito aparece como repasse, separado, com o
            que entrou nas vendas e o que foi pago.
          </p>
        </Chamada>
      </Tarefa>
    </div>
  );
}
