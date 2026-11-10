# Validacao viva da rodada "relatorios, exportacao e limpeza" do Meu Emporio
# (Modulo 39, Q268 a Q273): faturamento por origem, planilha e PDF dos relatorios
# do dinheiro, grafico do fluxo projetado, custo do cartao no Resultado e contas
# sem vencimento.
# docs/superpowers/specs/2026-11-09-emporio-relatorios-e-limpeza-design.md
#
# Os numeros do cenario (a "Rel Loja"), conferidos na tela, na API e no arquivo:
#   balcao: 3 vendas, R$ 500,00 de faturamento, sem frete, 62,5%
#   e-commerce: 1 venda, R$ 300,00 de faturamento (o frete NAO entra), R$ 30,00
#     de frete, 37,5%
#   planilhas: text/csv com BOM, separador ";", virgula decimal, data DD/MM/AAAA
#   a pagar: R$ 9.000,00 daqui a 8 dias (a semana do saldo negativo) e R$ 80,00
#     "Sem vencimento", que nao entra nas semanas
#   Resultado: R$ 300,00 no cartao, taxa R$ 10,50, antecipacao R$ 9,00: 6,5%
#
# cenario: scripts/_cenario-emporio-relatorios.ts
# sessao: owner owner@example.com
import datetime
import re

# O dia de hoje em Brasilia (UTC-3), como o app conta.
HOJE = (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).date()


def texto_do_main(n=60000):
    # O dinheiro sai com espaco nao separavel entre "R$" e o valor.
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""


def tem(texto, n=60000):
    return texto.lower() in texto_do_main(n).lower()


def com_retentativa(f):
    """A primeira chamada de uma rota compila no next dev, e o HMR pode trocar o
    documento no meio do fetch: espera a pagina assentar e repete."""
    for tentativa in range(5):
        try:
            return f()
        except RuntimeError as e:
            if ("navigated" not in str(e) and "timed out" not in str(e)) or tentativa == 4:
                raise
            time.sleep(10)


def api_estavel(metodo, caminho):
    return com_retentativa(lambda: api(metodo, caminho))


def baixar(caminho):
    """Baixa o arquivo pelo fetch da pagina. Devolve status, tipo, nome, os tres
    primeiros bytes (o BOM) e o texto SEM descartar o BOM."""
    expr = "fetch(" + repr(caminho) + ").then(async r => { const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, ct: r.headers.get('content-type'), cd: r.headers.get('content-disposition'), bom: Array.from(b.slice(0, 3)), texto: new TextDecoder('utf-8', { ignoreBOM: true }).decode(b) }; })"
    return com_retentativa(lambda: js(expr))


def linhas_do_csv(arq):
    return [l for l in arq["texto"].replace("﻿", "").split("\r\n") if l != ""]


def href_da_acao(rotulo, indice):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).filter(x => x.innerText.trim() === " + repr(rotulo) + "); return a[" + str(indice) + "] ? a[" + str(indice) + "].getAttribute('href') : null; })()")


def linhas_da_tabela_por_origem():
    """As linhas (celulas) da primeira tabela do bloco 'Por origem'."""
    return js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Por origem'); if (!h) return null; const t = h.closest('section').querySelector('table'); if (!t) return null; return Array.from(t.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.replace(/\\u00a0/g, ' ').trim())); })()")


def dmy(d):
    return d.strftime("%d/%m/%Y")


def eh_csv_brasileiro(arq):
    return arq["status"] == 200 and (arq["ct"] or "").startswith("text/csv") and "charset=utf-8" in (arq["ct"] or "").lower() and arq["bom"] == [239, 187, 191]


def nome_do_arquivo(arq, base):
    return re.search(r'attachment; filename="' + base + r'-\d{4}-\d{2}-\d{2}\.csv"', arq["cd"] or "") is not None


passo("0. O cenário: a Rel Loja com 4 vendas, a antecipação e as duas contas a pagar")
entrar("owner")
ir("/emporio")
loja = [l for l in api_estavel("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"] == "Rel Loja"][0]
LOJA = loja["id"]
vendas = api_estavel("GET", "/api/v1/emporio/sales?establishment_id=" + LOJA)["body"]["data"]
confere("a Rel Loja tem 4 vendas", len(vendas) == 4, len(vendas))
# A primeira visita a uma rota compila no next dev e pode recarregar a pagina no meio do passo.
for rota in ["/emporio/relatorios", "/emporio/financeiro/relatorios", "/emporio/financeiro/projecao", "/emporio/resultado", "/emporio/imprimir/relatorio/a-pagar"]:
    js("fetch(" + repr(rota) + ").then(r => r.status)")
for rota in [
    "/api/v1/emporio/reports/sales?from=" + HOJE.strftime("%Y-%m-01") + "&to=" + HOJE.isoformat(),
    "/api/v1/emporio/finance/reports/payables-by-due",
    "/api/v1/emporio/finance/reports/receivables-aging",
    "/api/v1/emporio/finance/reports/cash-by-place",
    "/api/v1/emporio/finance/projection",
    "/api/v1/emporio/result?establishment_id=" + LOJA + "&month=" + HOJE.strftime("%Y-%m"),
]:
    api_estavel("GET", rota)
time.sleep(2)

passo("1. Relatório de vendas: o bloco 'Por origem' (a tela e a API)")
ir("/emporio/relatorios?loja=" + LOJA)
confere("o bloco 'Por origem' existe", tem("Por origem"), texto_do_main(1500))
tabela = linhas_da_tabela_por_origem() or []
confere("a tabela tem as duas linhas, Balcão e E-commerce", len(tabela) == 2 and tabela[0][0] == "Balcão" and tabela[1][0] == "E-commerce", tabela)
if len(tabela) == 2:
    confere("Balcão: 3 vendas, R$ 500,00, frete R$ 0,00, 62,5%", tabela[0][1:] == ["3", "R$ 500,00", "R$ 0,00", "62,5%"], tabela[0])
    confere("E-commerce: 1 venda, R$ 300,00 (sem o frete), frete R$ 30,00, 37,5%", tabela[1][1:] == ["1", "R$ 300,00", "R$ 30,00", "37,5%"], tabela[1])
sales = api_estavel("GET", "/api/v1/emporio/reports/sales?establishment_id=" + LOJA + "&from=" + HOJE.strftime("%Y-%m-01") + "&to=" + HOJE.isoformat())
origem = {o["origin"]: o for o in (sales["body"]["data"].get("by_origin") or [])}
confere("a API: e-commerce net 300 (frete 30 fora), balcão net 500", origem.get("ecommerce", {}).get("net") == 300 and origem.get("ecommerce", {}).get("freight") == 30 and origem.get("balcao", {}).get("net") == 500, origem)
ir("/emporio/relatorios")
confere("todas as lojas: o bloco traz 'Em cada loja' com a Rel Loja", tem("Em cada loja") and tem("Rel Loja"), texto_do_main(2500))

passo("2. Financeiro, relatórios: as três planilhas e as três folhas para imprimir")
ir("/emporio/financeiro/relatorios?loja=" + LOJA)
confere("três botões 'Baixar planilha' e três 'Imprimir ou salvar em PDF'", js("Array.from(document.querySelectorAll('main a')).filter(x => x.innerText.trim() === 'Baixar planilha').length") == 3 and js("Array.from(document.querySelectorAll('main a')).filter(x => x.innerText.trim() === 'Imprimir ou salvar em PDF').length") == 3)
confere("o botão de imprimir abre em outra aba", js("Array.from(document.querySelectorAll('main a')).filter(x => x.innerText.trim() === 'Imprimir ou salvar em PDF').every(a => a.target === '_blank')") is True)
csv_receber = href_da_acao("Baixar planilha", 0)
csv_pagar = href_da_acao("Baixar planilha", 1)
csv_posicao = href_da_acao("Baixar planilha", 2)
print_pagar = href_da_acao("Imprimir ou salvar em PDF", 1)
print_receber = href_da_acao("Imprimir ou salvar em PDF", 0)
print_posicao = href_da_acao("Imprimir ou salvar em PDF", 2)
confere("os hrefs trazem format=csv e a loja", all((h or "") and "format=csv" in h and LOJA in h for h in [csv_receber, csv_pagar, csv_posicao]), [csv_receber, csv_pagar, csv_posicao])

a_pagar = baixar(csv_pagar)
confere("a pagar: text/csv utf-8, BOM EF BB BF e nome a-pagar-por-vencimento-AAAA-MM-DD.csv", eh_csv_brasileiro(a_pagar) and nome_do_arquivo(a_pagar, "a-pagar-por-vencimento"), [a_pagar["status"], a_pagar["ct"], a_pagar["cd"], a_pagar["bom"]])
lp = linhas_do_csv(a_pagar)
confere("a pagar: cabeçalho 'Semana;Conta;Vencimento;Valor;Situa...'", len(lp) > 0 and lp[0].startswith("Semana;Conta;Vencimento;Valor;Situa"), lp[:1])
vence = HOJE + datetime.timedelta(days=8)
linha_9000 = [l for l in lp if re.search(r"(^|;)9000,00(;|$)", l)]
# O relatorio agrupa por semana: a coluna Semana traz "DD/MM/AAAA a DD/MM/AAAA" e a de vencimento, "Na semana".
faixa = re.match(r"(\d{2})/(\d{2})/(\d{4}) a (\d{2})/(\d{2})/(\d{4});", linha_9000[0]) if len(linha_9000) == 1 else None
na_semana = faixa is not None and datetime.date(int(faixa.group(3)), int(faixa.group(2)), int(faixa.group(1))) <= vence <= datetime.date(int(faixa.group(6)), int(faixa.group(5)), int(faixa.group(4)))
confere("a pagar: a conta de R$ 9.000,00 vem com vírgula decimal e na semana do vencimento (datas DD/MM/AAAA)", na_semana, linha_9000)
linha_80 = [l for l in lp if re.search(r"(^|;)80,00(;|$)", l)]
confere("a pagar: a conta sem vencimento vem na planilha (80,00) e sem data", len(linha_80) == 1 and not re.search(r"\d{2}/\d{2}/\d{4}", linha_80[0]), linha_80)
confere("a pagar: a sem vencimento vem depois da com vencimento", len(linha_80) == 1 and len(linha_9000) == 1 and lp.index(linha_80[0]) > lp.index(linha_9000[0]), lp)

a_receber = baixar(csv_receber)
confere("a receber por idade: text/csv, BOM e nome a-receber-por-idade-AAAA-MM-DD.csv", eh_csv_brasileiro(a_receber) and nome_do_arquivo(a_receber, "a-receber-por-idade"), [a_receber["status"], a_receber["ct"], a_receber["cd"], a_receber["bom"]])
confere("a receber por idade: cabeçalho 'Cliente;Loja;Faixa de idade;Valor;Vencimento mais antigo'", linhas_do_csv(a_receber)[:1] == ["Cliente;Loja;Faixa de idade;Valor;Vencimento mais antigo"], linhas_do_csv(a_receber)[:1])

# A conta bancaria e da rede inteira: so aparece em "Todas as lojas" (sem o filtro de loja).
csv_posicao_todas = re.sub(r"establishment_id=[^&]*&?", "", csv_posicao).replace("?&", "?")
print_posicao_todas = re.sub(r"loja=[^&]*&?", "", print_posicao).replace("?&", "?")
posicao = baixar(csv_posicao_todas)
confere("posição de caixa: text/csv e BOM, com o nome do arquivo", eh_csv_brasileiro(posicao) and (posicao["cd"] or "").startswith('attachment; filename="'), [posicao["status"], posicao["ct"], posicao["cd"], posicao["bom"]])
lc = linhas_do_csv(posicao)
confere("posição de caixa: cabeçalho 'Lugar;Tipo;Saldo...'", len(lc) > 0 and lc[0].startswith("Lugar;Tipo;Saldo"), lc[:1])
linha_banco = [l for l in lc if l.startswith("Rel Banco;")]
confere("posição de caixa: a Rel Banco com saldo de vírgula decimal", len(linha_banco) == 1 and re.search(r";\d+,\d{2}(;|$)", linha_banco[0]) is not None, linha_banco)

for rotulo, href in [("a pagar", print_pagar), ("a receber", print_receber), ("posição", print_posicao)]:
    confere("o href de imprimir de " + rotulo + " aponta para /emporio/imprimir/relatorio/ com a loja", (href or "").startswith("/emporio/imprimir/relatorio/") and LOJA in (href or ""), href)

passo("3. A folha para imprimir: cabeçalho da loja, data de emissão e o botão (nada imprime sozinho)")
ir(print_pagar)
folha = texto_do_main()
confere("a pagar: o título, a Rel Loja e 'Emitido em' com a data de hoje", "A pagar por vencimento" in folha and "Rel Loja" in folha and "Emitido em" in folha and dmy(HOJE) in folha, folha[:600])
confere("a pagar: traz a conta sem vencimento e as duas contas", "Sem vencimento" in folha and "R$ 80,00" in folha and "R$ 9.000,00" in folha, folha[:1800])
confere("a folha tem o botão 'Imprimir' (a página não imprime sozinha)", bool(js("Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Imprimir')")))
ir(print_receber)
confere("a receber: título e Rel Loja", tem("A receber por idade") and tem("Rel Loja"), texto_do_main(500))
ir(print_posicao)
confere("posição de uma loja: título e Rel Loja", tem("Posição de caixa por lugar") and tem("Rel Loja"), texto_do_main(600))
ir(print_posicao_todas)
confere("posição de todas as lojas: título, 'Todas as lojas' e a Rel Banco", tem("Posição de caixa por lugar") and tem("Todas as lojas") and tem("Rel Banco"), texto_do_main(1500))
ir("/emporio/imprimir/relatorio/inexistente")
confere("tipo desconhecido é 404", eh_404(), texto_principal(200))

passo("4. Projeção: o gráfico do saldo, a planilha e a lista 'Sem vencimento'")
ir("/emporio/financeiro/projecao?loja=" + LOJA)
confere("o gráfico monta (legenda do saldo e linha do Recharts)", bool(esperar(lambda: js("!!document.querySelector('main .recharts-wrapper .recharts-line-curve')") and tem("Saldo ao fim da semana"), 30)), texto_do_main(1200))
confere("o gráfico traz ponto de saldo negativo destacado (r=5) e o aviso", bool(js("document.querySelectorAll('main .recharts-wrapper circle[r=\"5\"]').length > 0")) and re.search(r"\d+ semanas? (fica|ficam) negativas?|1 semana fica negativa", texto_do_main(2500)) is not None, texto_do_main(1500))
confere("a tabela segue como leitura (cabeçalho Semana, A receber, A pagar, Saldo ao fim)", all(t in texto_do_main() for t in ["A receber", "A pagar", "Saldo ao fim"]))
confere("o bloco 'Sem vencimento': 1 conta, R$ 80,00 no total", tem("Sem vencimento") and tem("1 conta, R$ 80,00 no total"), texto_do_main(6000))
csv_proj = href_da_acao("Baixar planilha", 0)
proj = baixar(csv_proj)
confere("projeção: text/csv, BOM e nome projecao-de-caixa-AAAA-MM-DD.csv", eh_csv_brasileiro(proj) and nome_do_arquivo(proj, "projecao-de-caixa"), [proj["status"], proj["ct"], proj["cd"], proj["bom"]])
lj = linhas_do_csv(proj)
confere("projeção: cabeçalho 'Semana;Entradas;Sa...;Saldo projetado' e as linhas das semanas", len(lj) >= 5 and lj[0].startswith("Semana;Entradas;Sa") and lj[0].endswith(";Saldo projetado"), lj[:2])
confere("projeção: o saldo da semana negativa sai com sinal e vírgula decimal", any(re.search(r";-\d+,\d{2}$", l) for l in lj[1:]), lj)
print_proj = href_da_acao("Imprimir ou salvar em PDF", 0)
ir(print_proj)
confere("a folha da projeção: título, 'Próximos 30 dias' e a Rel Loja", tem("Fluxo de caixa projetado") and tem("Próximos 30 dias") and tem("Rel Loja"), texto_do_main(600))

passo("5. Resultado: o 'Custo do cartão'")
ir("/emporio/resultado?loja=" + LOJA)
r = texto_do_main(6000)
confere("'Custo do cartão: 6,5% das vendas no cartão'", "Custo do cartão: 6,5% das vendas no cartão" in r, r[-1500:])
confere("vendas no cartão R$ 300,00, taxa R$ 10,50 e antecipação R$ 9,00", all(t in r for t in ["Vendas no cartão", "R$ 300,00", "Taxa do cartão", "R$ 10,50", "Antecipação", "R$ 9,00"]), r[-1200:])
res = api_estavel("GET", "/api/v1/emporio/result?establishment_id=" + LOJA + "&month=" + HOJE.strftime("%Y-%m"))["body"]["data"]["card_cost"]
confere("a API: card_cost 300 / 10,50 / 9 / 6,5", res["card_sales"] == 300 and res["mdr"] == 10.5 and res["anticipation"] == 9 and res["pct"] == 6.5, res)

passo("6. A 390 px: a projeção com o gráfico e os relatórios sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
for rota, nome in [("/emporio/financeiro/projecao?loja=" + LOJA, "A projeção"), ("/emporio/financeiro/relatorios?loja=" + LOJA, "Os relatórios"), ("/emporio/relatorios?loja=" + LOJA, "O relatório de vendas")]:
    ir(rota)
    largura = js("document.documentElement.scrollWidth")
    confere(nome + " sem rolagem horizontal", largura is not None and largura <= 390, largura)
cdp("Emulation.clearDeviceMetricsOverride")

fim()
