import Link from "next/link";
import { Chamada } from "../_components/chamada";
import { Figura } from "../_components/figura";
import { TabelaDePermissoes } from "../_components/tabela-de-permissoes";
import { BASE_DO_EMPORIO } from "./indice";

const B = BASE_DO_EMPORIO;

function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-texto marker:text-texto-discreto">
      {itens.map((i, n) => (
        <li key={n}>{i}</li>
      ))}
    </ul>
  );
}

function Passos({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-texto marker:font-semibold">
      {itens.map((i, n) => (
        <li key={n}>{i}</li>
      ))}
    </ol>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-texto">{children}</h2>;
}

export function ParteDono() {
  return (
    <div className="space-y-4">
      <p>
        Você é o Dono. Tudo o que o sistema faz, você pode fazer, em todas as lojas. O Gerente geral tem o mesmo poder,
        só não cria nem altera o Dono. Este texto vale para os dois.
      </p>

      <Titulo>O que você faz no dia a dia</Titulo>
      <Lista
        itens={[
          <>Olhar o <Link className="underline" href={`${B}/resultado`}>resultado das lojas</Link> e ver se a conta fecha.</>,
          <>Abrir <Link className="underline" href={`${B}/relatorios`}>Relatórios</Link> para ver as vendas por vendedor, por produto e por loja, e os produtos parados. O relatório mostra quanto cada um vendeu, para acertar a comissão. O percentual da comissão o sistema não calcula.</>,
          <>Acompanhar os <Link className="underline" href={`${B}/orcamento`}>Orçamentos</Link> que ainda não viraram venda e ligar para quem não voltou.</>,
          <>Montar e ajustar a <Link className="underline" href={`${B}/equipe`}>Equipe</Link>: quem é Gerente geral, Gestor, Vendedor ou Caixa.</>,
          <>Decidir preço, desconto e despesas fixas, ou deixar isso com o Gestor de cada loja.</>,
          <>Conferir o <Link className="underline" href={`${B}/historico`}>Histórico</Link> quando precisar saber quem fez o quê.</>,
        ]}
      />

      <Titulo>O que só você faz</Titulo>
      <Lista
        itens={[
          "Criar e arquivar loja, e cadastrar as contas bancárias.",
          "Definir a composição e os percentuais do produto.",
          "Ver Todas as lojas somadas no Resultado.",
          "Cadastrar a Equipe e ligar as permissões extras do Vendedor.",
          "Liberar o estoque negativo de uma loja, quando for preciso vender antes de lançar a compra.",
          <>Mudar, em <Link className="underline" href={`${B}/configuracoes`}>Configurações</Link>, o que vale para a conta toda: a validade do orçamento, a largura da bobina, o rodapé do orçamento, o rodapé da venda e o logo.</>,
        ]}
      />

      <Chamada tipo="saiba">
        <p>
          Em <Link className="underline" href={`${B}/configuracoes`}>Configurações</Link>, o Gestor também mexe no que é da loja dele: o cabeçalho (CNPJ, endereço,
          telefone e WhatsApp) e os caixas, com o botão <strong>Novo caixa</strong>. Toda loja nasce com o Caixa 1.
          A validade do orçamento começa em 7 dias.
        </p>
      </Chamada>

      <Titulo>As quatro funções da Equipe</Titulo>
      <p>
        Em <Link className="underline" href={`${B}/equipe`}>Equipe</Link>, clique em <strong>Cadastrar pessoa</strong> e
        escolha a <strong>Função</strong>. Gestor, Vendedor e Caixa precisam de pelo menos uma loja.
      </p>
      <Lista
        itens={[
          <><strong>Gerente geral</strong>: cuida de tudo, em todas as lojas.</>,
          <><strong>Gestor</strong>: comanda as lojas dele.</>,
          <><strong>Vendedor</strong>: vende no balcão e só faz o que você ligar nas chaves.</>,
          <><strong>Caixa</strong>: recebe o pagamento, recebe fiado e opera o caixa. Não tem chave. Ele escolhe, em cada venda, o vendedor que atendeu.</>,
        ]}
      />
      <Chamada tipo="atencao">
        <p>
          Basta uma pessoa ativa com a função Caixa ligada a uma loja para mudar a regra do turno nela. A partir daí, só quem abriu o
          caixa ou o Gestor da loja faz sangria e encerra aquele turno. Na loja sem ninguém com a função Caixa, qualquer
          pessoa da loja abre, faz sangria e encerra.
        </p>
      </Chamada>

      <Figura id="inicio-primeiros-passos" />

      <Titulo>Por onde começar</Titulo>
      <Passos
        itens={[
          <>Siga os <Link className="underline" href={`${B}/primeiros-passos`}>Primeiros passos</Link>.</>,
          <>Cadastre a <Link className="underline" href={`${B}/equipe`}>Equipe</Link>.</>,
          <>Cadastre os <Link className="underline" href={`${B}/produtos`}>produtos</Link> e ponha o preço em cada loja.</>,
          <>Lance a primeira <Link className="underline" href={`${B}/compras`}>compra</Link> ou o estoque inicial.</>,
          <>Em <Link className="underline" href={`${B}/configuracoes`}>Configurações</Link>, preencha o cabeçalho de cada loja e envie o logo. É o que sai no papel da venda e do orçamento.</>,
        ]}
      />

      <Chamada tipo="dica">
        <p>Para treinar um Vendedor novo, imprima o <Link className="underline" href={`${B}/vendedor-imprimir`}>Guia do Vendedor</Link> e deixe junto do balcão.</p>
      </Chamada>

      <Titulo>Quem pode o quê</Titulo>
      <TabelaDePermissoes />
    </div>
  );
}

export function ParteGestor() {
  return (
    <div className="space-y-4">
      <p>
        Você é Gestor. Comanda a sua loja (ou as suas lojas): o Dono confia a você o preço, o estoque, o caixa e as
        despesas. Você enxerga só as lojas em que foi cadastrado.
      </p>

      <Titulo>O que você faz no dia a dia</Titulo>
      <Lista
        itens={[
          <>Confere o <Link className="underline" href={`${B}/estoque`}>estoque</Link> e manda repor o que está acabando.</>,
          <>Lança <Link className="underline" href={`${B}/compras`}>compras</Link> e envia <Link className="underline" href={`${B}/transferencias`}>transferências</Link> para outras lojas.</>,
          <>Resolve a transferência que chegou a menos (ela fica aguardando você).</>,
          <>Cancela venda, autoriza desconto maior e acompanha o <Link className="underline" href={`${B}/caixa`}>caixa</Link>.</>,
          <>Cuida das <Link className="underline" href={`${B}/despesas`}>despesas</Link> e olha o <Link className="underline" href={`${B}/resultado`}>resultado</Link> da loja.</>,
          <>Abre <Link className="underline" href={`${B}/relatorios`}>Relatórios</Link> para ver quem vendeu o quê no período e os produtos parados. O filtro começa em <strong>Todas as minhas lojas</strong> e no mês atual.</>,
          <>Acompanha os <Link className="underline" href={`${B}/orcamento`}>Orçamentos</Link> abertos e vencidos da loja.</>,
        ]}
      />

      <Titulo>O dinheiro que o caixa entrega a você</Titulo>
      <p>
        A sangria e o malote saem do caixa na hora, mas só entram em <strong>Com a gerência</strong> quando você confirma o
        que recebeu. Até lá, eles aparecem em <strong>Aguardando o gerente</strong>, na tela Caixa, e o Meu Dia avisa.
      </p>
      <Passos
        itens={[
          <>Abra <strong>Caixa</strong> e desça até <strong>Aguardando o gerente</strong>.</>,
          <>Na linha da entrega, clique em <strong>Confirmar</strong>.</>,
          <>Conte as notas e digite em <strong>Valor recebido (R$)</strong>.</>,
          <>Se não bater com o entregue, escreva o motivo em <strong>Observação</strong>. Ele é obrigatório.</>,
          <>Clique em <strong>Confirmar o recebimento</strong>. A diferença entra no resultado como Diferença de caixa.</>,
        ]}
      />
      <p>
        O botão <strong>Relatório do turno</strong>, na mesma linha, mostra o fechamento daquele caixa. Para levar o
        dinheiro da gerência ao banco, use <strong>Transferir dinheiro</strong>. O passo a passo está em{" "}
        <Link className="underline" href={`${B}/caixa`}>Caixa</Link>.
      </p>
      <Figura id="caixa-entregas" />

      <Titulo>O turno dos outros</Titulo>
      <Lista
        itens={[
          "Se alguém foi embora sem encerrar, você encerra o turno dele: conta o dinheiro, informa o malote e deixa o troco.",
          "Você também faz sangria no turno que outra pessoa abriu.",
          <>Na abertura, quem está no balcão pode pedir um <strong>Reforço da gerência (R$)</strong>. O valor sai de Com a gerência e entra no caixa, e o Troco contado já inclui o reforço. Se a gerência não tem esse dinheiro, o sistema recusa: “Não há dinheiro suficiente para isso.”</>,
        ]}
      />

      <Titulo>O que você não pode</Titulo>
      <Lista
        itens={[
          "Criar ou arquivar loja, nem mexer nas contas bancárias.",
          "Mudar a composição e os percentuais do produto.",
          "Ver as vendas, o caixa, o resultado e os relatórios das outras lojas. O estoque delas você pode olhar, só olhar.",
          "Liberar estoque negativo.",
          "Mudar, em Configurações, a impressão, a validade do orçamento, os rodapés e o logo. Isso é do Dono e do Gerente geral. O cabeçalho da sua loja e o Novo caixa você muda.",
          "Usar a Equipe. Se um Vendedor precisa de mais permissão, peça ao Dono.",
        ]}
      />

      <Chamada tipo="saiba">
        <p>
          Sua função vale em todas as suas lojas. Ninguém é Gestor numa loja e Vendedor em outra. Seu menu mostra só o
          Meu Empório (com o Histórico, para o Gestor), o Meu Dia, os Contatos, as Calculadoras, o Manual e o seu perfil.
        </p>
      </Chamada>

      <Figura id="estoque-por-loja" />

      <Titulo>Quem pode o quê</Titulo>
      <TabelaDePermissoes />
    </div>
  );
}

export function ParteVendedor() {
  return (
    <div className="space-y-4">
      <p>
        Você é Vendedor. O seu trabalho é o balcão: vender, orçar, receber o fiado, cuidar do caixa e receber a
        mercadoria que chega. Se quiser um resumo de uma folha, abra o{" "}
        <Link className="underline" href={`${B}/vendedor-imprimir`}>Guia do Vendedor para imprimir</Link>.
      </p>

      <Titulo>O que você faz no dia a dia</Titulo>
      <Lista
        itens={[
          <><Link className="underline" href={`${B}/vender`}>Vende</Link> em dinheiro, PIX, cartão, cheque ou fiado.</>,
          <>Faz orçamento para o cliente levar no papel, e fatura quando ele volta.</>,
          <><Link className="underline" href={`${B}/fiado`}>Recebe o fiado</Link> quando o cliente volta para pagar.</>,
          <>Abre o <Link className="underline" href={`${B}/caixa`}>caixa</Link> com o troco, faz sangria, confere quando quiser e encerra no fim do turno.</>,
          <>Recebe a compra e a transferência que chegam na loja.</>,
          <>Olha o estoque, as vendas e o caixa da sua loja.</>,
        ]}
      />

      <Titulo>Na venda: o cliente e o vendedor</Titulo>
      <Lista
        itens={[
          <>Toda venda tem cliente. Escolha no campo <strong>Cliente</strong>. Quem não quer se identificar entra como <strong>Consumidor final</strong>.</>,
          <>O Consumidor final não compra fiado nem paga em cheque. Para isso, escolha o cliente de verdade ou clique em <strong>Cliente novo</strong>.</>,
          <>Se aparecer <strong>Cadastro incompleto</strong>, clique em <strong>Completar cadastro</strong>. A venda passa assim mesmo, mas o orçamento não.</>,
          <>O campo <strong>Vendedor</strong> já vem com o seu nome. Se outro colega atendeu o cliente, escolha o nome dele.</>,
          <>No fim, clique em <strong>Fechar a venda</strong>.</>,
        ]}
      />

      <Titulo>Imprimir a venda</Titulo>
      <Passos
        itens={[
          <>Depois de fechar a venda, clique em <strong>Imprimir A4</strong> (folha) ou em <strong>Imprimir cupom</strong> (bobina).</>,
          <>O papel abre numa aba nova. Clique em <strong>Imprimir</strong>.</>,
          <>Para guardar em PDF, escolha <strong>Salvar como PDF</strong> no lugar da impressora.</>,
          <>Para imprimir de novo depois, abra a venda em <strong>Vendas</strong>. Os mesmos dois botões estão lá.</>,
        ]}
      />
      <p>O papel diz “sem valor fiscal”: ele não é nota fiscal.</p>

      <Titulo>Orçamento</Titulo>
      <p>
        O passo a passo completo está em <Link className="underline" href={`${B}/orcamento`}>Orçamento</Link>.
      </p>
      <Passos
        itens={[
          <>Em <strong>Vender</strong>, toque em <strong>Orçamento</strong>, no alto da tela.</>,
          "Monte os itens como numa venda: produto, quantidade, preço e desconto, no mesmo limite da loja.",
          "Escolha o cliente. O orçamento precisa de nome, CPF ou CNPJ e telefone, para ser achado depois. Consumidor final não serve.",
          <>Clique em <strong>Salvar orçamento</strong>. Ele ganha um número e a data <strong>Válido até</strong>.</>,
          <>Imprima com <strong>Imprimir A4</strong> ou <strong>Imprimir cupom</strong> e entregue ao cliente.</>,
        ]}
      />
      <p>
        O orçamento não tira do estoque nem reserva mercadoria. Quando o cliente voltar, fique em <strong>Venda</strong>,
        digite o número em <strong>Orçamento nº</strong> e clique em <strong>Carregar</strong>. Os itens entram na venda.
        Dentro da validade, o cliente paga o preço orçado ou o de hoje, o que for menor. Depois da validade, vale o preço
        de hoje. Na lista <Link className="underline" href={`${B}/orcamento`}>Orçamentos</Link> você busca pelo telefone,
        CPF, CNPJ, nome ou número.
      </p>

      <Titulo>O seu turno no caixa</Titulo>
      <Lista
        itens={[
          <>Toda venda cai num caixa aberto. Com o caixa fechado, o balcão mostra <strong>Abrir o Caixa 1</strong> (ou pede para escolher o caixa). Conte o troco e abra ali mesmo. Se foi o Fechar a venda que parou no caixa fechado, a venda fecha sozinha assim que o caixa abre.</>,
          <>Muito dinheiro no caixa? Em <strong>Caixa</strong>, clique em <strong>Sangria</strong>. Leve as notas ao gerente: ele confirma o que recebeu.</>,
          <>No fim do turno, clique em <strong>Encerrar</strong>: conte, separe o malote e deixe o troco. Imprima o relatório e leve junto com o malote.</>,
          <>Se a loja tem alguém com a função Caixa, a sangria e o encerramento são de quem abriu o caixa ou do Gestor.</>,
        ]}
      />

      <Titulo>O que você não pode</Titulo>
      <Lista
        itens={[
          "Cancelar venda, mudar preço ou dar desconto acima do limite. Chame o Gestor.",
          "Confirmar a sangria e o malote que chegam ao gerente.",
          "Ver Financeiro, despesas, resultado, Relatórios, Configurações e Histórico.",
          "Enviar transferência ou resolver uma que chegou a menos.",
          "Ver o estoque das outras lojas.",
        ]}
      />

      <Chamada tipo="atencao">
        <p>
          Algumas coisas o Dono pode liberar só para você: devolver e trocar, lançar compra, fazer contagem, registrar
          perda, depositar cheque e cadastrar produto. Se o botão não aparece ou o sistema
          recusa, é porque essa permissão está desligada. Peça ao Dono.
        </p>
      </Chamada>

      <Figura id="balcao-venda" />

      <Titulo>Quando o sistema recusa</Titulo>
      <p>
        A recusa vem escrita embaixo do campo que precisa mudar, em letras vermelhas. Leia a frase: ela diz o que
        fazer. Se não resolver, olhe as <Link className="underline" href={`${B}/perguntas`}>Perguntas frequentes</Link>.
      </p>

      <Titulo>Quem pode o quê</Titulo>
      <TabelaDePermissoes />
    </div>
  );
}

export function ParteCaixa() {
  return (
    <div className="space-y-4">
      <p>
        Você é Caixa. Recebe o pagamento do cliente, recebe o fiado e cuida do dinheiro do seu turno: abre o caixa,
        faz sangria e encerra. Seu menu no Meu Empório mostra só <strong>Início</strong>, <strong>Vender</strong>,{" "}
        <strong>Vendas</strong>, <strong>Fiado</strong> e <strong>Caixa</strong>.
      </p>

      <Titulo>Abrir o caixa</Titulo>
      <Passos
        itens={[
          <>Abra <strong>Caixa</strong>. Em <strong>Caixas de cada loja</strong>, ache o seu caixa (Caixa 1, Caixa 2) e clique em <strong>Abrir</strong>.</>,
          <>Se falta troco, peça o reforço ao gerente e digite em <strong>Reforço da gerência (R$)</strong>. Ponha o reforço na gaveta. É opcional.</>,
          <>Conte tudo e digite em <strong>Troco contado (R$)</strong>: o troco do turno anterior mais o reforço, se houver. A tela mostra quanto o sistema espera.</>,
          <>Se o contado não bate com o esperado, escreva o motivo em <strong>Motivo da diferença</strong>.</>,
          <>Clique em <strong>Abrir o caixa</strong>.</>,
        ]}
      />
      <p>
        Com o caixa fechado, o balcão mostra <strong>Abrir o Caixa 1</strong> (ou pede para escolher o caixa em{" "}
        <strong>Escolha o caixa a abrir</strong>). Abra ali mesmo. A venda continua com os mesmos itens.
      </p>

      <Titulo>Receber uma venda</Titulo>
      <Passos
        itens={[
          <>Abra <strong>Vender</strong> e confira a loja.</>,
          "Busque o produto pelo nome, pela marca ou pelo código e toque nele. Confira a quantidade e o preço.",
          <>Escolha o <strong>Cliente</strong>. Quem não quer se identificar entra como Consumidor final, que não compra fiado nem paga em cheque.</>,
          <>Escolha como o cliente paga, em <strong>Pagamento</strong>.</>,
          <>Escolha o <strong>Vendedor</strong> que atendeu o cliente. Para você, o campo é obrigatório e volta vazio a cada venda.</>,
          <>Clique em <strong>Fechar a venda</strong>. Depois, se o cliente quiser o papel, clique em <strong>Imprimir A4</strong> ou <strong>Imprimir cupom</strong>.</>,
        ]}
      />
      <Figura id="balcao-cliente-vendedor" />

      <Titulo>Faturar um orçamento</Titulo>
      <Passos
        itens={[
          <>Em <strong>Vender</strong>, digite o número que está no papel do cliente em <strong>Orçamento nº</strong> e clique em <strong>Carregar</strong>.</>,
          "Os itens e o cliente entram na venda. O vendedor é o do orçamento: você não precisa escolher.",
          "Leia os avisos na faixa do orçamento: preço que mudou, orçamento vencido ou estoque que falta.",
          <>Escolha o pagamento e clique em <strong>Fechar a venda</strong>.</>,
        ]}
      />
      <p>
        Você também pode montar e salvar um orçamento, tocando em <strong>Orçamento</strong> no alto de Vender. Ao salvar,
        você também escolhe o <strong>Vendedor</strong> que atendeu. A lista de
        Orçamentos não é sua: para achar um orçamento, peça o número ao cliente. Os avisos e o preço que vale estão em{" "}
        <Link className="underline" href={`${B}/orcamento`}>Orçamento</Link>.
      </p>

      <Titulo>Receber fiado</Titulo>
      <p>
        Abra <strong>Fiado</strong>, ache o nome do cliente e clique em <strong>Receber</strong>. Em dinheiro, o valor entra
        no seu caixa aberto; em PIX, entra na conta PIX da loja.
      </p>

      <Titulo>Sangria: tirar o excesso de dinheiro</Titulo>
      <Passos
        itens={[
          <>Em <strong>Caixa</strong>, na linha do seu caixa, clique em <strong>Sangria</strong>.</>,
          <>Digite o <strong>Valor retirado (R$)</strong>. A sangria não passa do que está no caixa.</>,
          <>Clique em <strong>Registrar sangria</strong> e leve as notas ao gerente.</>,
        ]}
      />
      <p>
        O dinheiro sai do caixa na hora e fica aguardando o gerente. Ele conta e confirma o que recebeu. Para conferir o
        caixa no meio do turno, sem encerrar, clique em <strong>Conferir</strong>.
      </p>

      <Titulo>Encerrar o turno</Titulo>
      <Passos
        itens={[
          <>Em <strong>Caixa</strong>, na linha do seu caixa, clique em <strong>Encerrar</strong>.</>,
          <>Conte todo o dinheiro e digite em <strong>Valor contado (R$)</strong>.</>,
          <>Se o contado não bate com o esperado, escreva o motivo em <strong>Motivo da diferença</strong>.</>,
          <>Digite em <strong>Malote (R$)</strong> o que vai para o gerente. O resto fica na gaveta como troco do próximo turno. O malote não passa do que foi contado.</>,
          <>Clique em <strong>Encerrar o turno</strong>.</>,
          <>Imprima o fechamento em <strong>Relatório A4</strong> ou <strong>Relatório na bobina</strong> e leve junto com o malote.</>,
        ]}
      />
      <Figura id="caixa-encerrar" />

      <Chamada tipo="atencao">
        <p>
          Só quem abriu o caixa, ou o Gestor da loja, faz sangria e encerra aquele turno. Se o colega foi embora sem
          encerrar, chame o Gestor. O Meu Dia avisa quando um caixa está aberto desde um dia anterior.
        </p>
      </Chamada>

      <Figura id="caixa-gaveta" />

      <Titulo>O que você não pode</Titulo>
      <Lista
        itens={[
          "Abrir Produtos, Estoque, Compras, Transferências e Lojas. No balcão você busca o produto e vê o preço, e só.",
          "Devolver, trocar ou cancelar uma venda. Chame o Gestor.",
          "Ver a lista de Orçamentos.",
          "Ver as vendas de dias anteriores. Em Vendas aparecem só as de hoje.",
          "Dar desconto acima do limite da loja.",
          "Ver despesas, resultado, Relatórios, Equipe, Configurações e Histórico.",
        ]}
      />

      <Titulo>Quando o sistema recusa</Titulo>
      <Lista
        itens={[
          <>“Escolha o vendedor que atendeu.”: escolha no campo <strong>Vendedor</strong> quem atendeu o cliente.</>,
          <>“Escolha um vendedor desta loja.”: a pessoa escolhida não trabalha mais nesta loja. Escolha outra.</>,
          <>“Só quem abriu o caixa ou o gestor da loja encerra este turno.” ou “Só quem abriu o caixa ou o gestor da loja faz sangria neste turno.”: o turno é de outra pessoa. Chame o Gestor.</>,
          <>“O malote não pode passar do que foi contado.”: diminua o malote. O que sobra fica de troco.</>,
          <>“Não há dinheiro suficiente para isso.”: a sangria passou do que está no caixa, ou o reforço passou do que está com a gerência.</>,
        ]}
      />
      <p>
        Para as outras recusas, olhe as <Link className="underline" href={`${B}/perguntas`}>Perguntas frequentes</Link>.
      </p>

      <Titulo>Quem pode o quê</Titulo>
      <TabelaDePermissoes />
    </div>
  );
}
