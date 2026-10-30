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

export function ParteDono() {
  return (
    <div className="space-y-4">
      <p>
        Você é o Dono. Tudo o que o sistema faz, você pode fazer, em todas as lojas. O Gerente geral tem o mesmo poder,
        só não cria nem altera o Dono. Este texto vale para os dois.
      </p>

      <h2 className="text-xl font-semibold text-texto">O que você faz no dia a dia</h2>
      <Lista
        itens={[
          <>Olhar o <Link className="underline" href={`${B}/resultado`}>resultado das lojas</Link> e ver se a conta fecha.</>,
          <>Montar e ajustar a <Link className="underline" href={`${B}/equipe`}>Equipe</Link>: quem é Gestor, quem é Vendedor.</>,
          <>Decidir preço, desconto e despesas fixas, ou deixar isso com o Gestor de cada loja.</>,
          <>Conferir o <Link className="underline" href={`${B}/historico`}>Histórico</Link> quando precisar saber quem fez o quê.</>,
        ]}
      />

      <h2 className="text-xl font-semibold text-texto">O que só você faz</h2>
      <Lista
        itens={[
          "Criar e arquivar loja, e cadastrar as contas bancárias.",
          "Definir a composição e os percentuais do produto.",
          "Ver Todas as lojas somadas no Resultado.",
          "Cadastrar a Equipe e ligar as permissões extras do Vendedor.",
          "Liberar o estoque negativo de uma loja, quando for preciso vender antes de lançar a compra.",
        ]}
      />

      <Figura id="inicio-primeiros-passos" />

      <h2 className="text-xl font-semibold text-texto">Por onde começar</h2>
      <ol className="list-decimal space-y-1 pl-5 text-texto marker:font-semibold">
        <li>Siga os <Link className="underline" href={`${B}/primeiros-passos`}>Primeiros passos</Link>.</li>
        <li>Cadastre a <Link className="underline" href={`${B}/equipe`}>Equipe</Link>.</li>
        <li>Cadastre os <Link className="underline" href={`${B}/produtos`}>produtos</Link> e ponha o preço em cada loja.</li>
        <li>Lance a primeira <Link className="underline" href={`${B}/compras`}>compra</Link> ou o estoque inicial.</li>
      </ol>

      <Chamada tipo="dica">
        <p>Para treinar um Vendedor novo, imprima o <Link className="underline" href={`${B}/vendedor-imprimir`}>Guia do Vendedor</Link> e deixe junto do balcão.</p>
      </Chamada>

      <h2 className="text-xl font-semibold text-texto">Quem pode o quê</h2>
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

      <h2 className="text-xl font-semibold text-texto">O que você faz no dia a dia</h2>
      <Lista
        itens={[
          <>Confere o <Link className="underline" href={`${B}/estoque`}>estoque</Link> e manda repor o que está acabando.</>,
          <>Lança <Link className="underline" href={`${B}/compras`}>compras</Link> e envia <Link className="underline" href={`${B}/transferencias`}>transferências</Link> para outras lojas.</>,
          <>Resolve a transferência que chegou a menos (ela fica aguardando você).</>,
          <>Cancela venda, autoriza desconto maior e acompanha o <Link className="underline" href={`${B}/caixa`}>caixa</Link>.</>,
          <>Cuida das <Link className="underline" href={`${B}/despesas`}>despesas</Link> e olha o <Link className="underline" href={`${B}/resultado`}>resultado</Link> da loja.</>,
        ]}
      />

      <h2 className="text-xl font-semibold text-texto">O que você não pode</h2>
      <Lista
        itens={[
          "Criar ou arquivar loja, nem mexer nas contas bancárias.",
          "Mudar a composição e os percentuais do produto.",
          "Ver as vendas, o caixa e o resultado das outras lojas. O estoque delas você pode olhar, só olhar.",
          "Liberar estoque negativo.",
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

      <h2 className="text-xl font-semibold text-texto">Quem pode o quê</h2>
      <TabelaDePermissoes />
    </div>
  );
}

export function ParteVendedor() {
  return (
    <div className="space-y-4">
      <p>
        Você é Vendedor. O seu trabalho é o balcão: vender, receber o fiado, conferir a gaveta e receber a mercadoria
        que chega. Se quiser um resumo de uma folha, abra o{" "}
        <Link className="underline" href={`${B}/vendedor-imprimir`}>Guia do Vendedor para imprimir</Link>.
      </p>

      <h2 className="text-xl font-semibold text-texto">O que você faz no dia a dia</h2>
      <Lista
        itens={[
          <><Link className="underline" href={`${B}/vender`}>Vende</Link> em dinheiro, PIX, cartão, cheque ou fiado.</>,
          <><Link className="underline" href={`${B}/fiado`}>Recebe o fiado</Link> quando o cliente volta para pagar.</>,
          <>Confere a <Link className="underline" href={`${B}/caixa`}>gaveta</Link> no fim do dia.</>,
          <>Recebe a compra e a transferência que chegam na loja.</>,
          <>Olha o estoque, as vendas e o caixa da sua loja.</>,
        ]}
      />

      <h2 className="text-xl font-semibold text-texto">O que você não pode</h2>
      <Lista
        itens={[
          "Cancelar venda, mudar preço ou dar desconto acima do limite. Chame o Gestor.",
          "Ver Financeiro, despesas, resultado e Histórico.",
          "Enviar transferência ou resolver uma que chegou a menos.",
          "Ver o estoque das outras lojas.",
        ]}
      />

      <Chamada tipo="atencao">
        <p>
          Algumas coisas o Dono pode liberar só para você: devolver e trocar, lançar compra, fazer contagem, registrar
          perda, levar a gaveta ao banco, depositar cheque e cadastrar produto. Se o botão não aparece ou o sistema
          recusa, é porque essa permissão está desligada. Peça ao Dono.
        </p>
      </Chamada>

      <Figura id="balcao-venda" />

      <h2 className="text-xl font-semibold text-texto">Quando o sistema recusa</h2>
      <p>
        A recusa vem escrita embaixo do campo que precisa mudar, em letras vermelhas. Leia a frase: ela diz o que
        fazer. Se não resolver, olhe as <Link className="underline" href={`${B}/perguntas`}>Perguntas frequentes</Link>.
      </p>

      <h2 className="text-xl font-semibold text-texto">Quem pode o quê</h2>
      <TabelaDePermissoes />
    </div>
  );
}
