# Validacao viva de "Empório, entrega 4: orçamento" (Modulo 39, spec
# docs/specs/module-39-meu-emporio.md, Q176 em diante): o Vendedor salva o
# orçamento (cliente completo, número, validade, papel A4 e bobina), o Caixa
# digita o número e fatura pelo preço orçado com o vendedor do orçamento, o
# Gestor cancela a venda e o orçamento volta a aberto, o orçamento vencido vale
# o preço de hoje, e a lista de Orçamentos não é do Caixa.
#
# cenario: scripts/_cenario-emporio-orcamento.ts
# sessao: caixa orc-caixa@teste.local
# sessao: gestor orc-gestor@teste.local
# sessao: vendedor orc-vendedor@teste.local

import re
import urllib.parse
from datetime import datetime, timedelta

LOJA = "Orc Loja"
RACAO = "Orc Ração"
ESCASSO = "Orc Escasso"
VENDEDOR = "Orc Vendedor"
CAIXA = "Orc Caixa"
CLIENTE = "Orc Cliente"
VENCIDO = "Orc Vencido"
TELEFONE = "(11) 98765-4321"
RECUSA_CLIENTE = "Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final."

# Brasília não tem horário de verão: UTC menos 3 horas.
HOJE = datetime.utcnow() - timedelta(hours=3)


def data_br(d):
    return d.strftime("%d/%m/%Y")


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def valor_aria(aria):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); return el ? el.value : 'SEM CAMPO'; })()") or ""


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    """Clica no botao de enviar (submit) do formulario cujo texto contem `texto`."""
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def sem_rolagem_horizontal():
    return js("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def medida():
    return js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth")


def campo_existe(rotulo):
    return bool(js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return !!(l && document.getElementById(l.htmlFor)); })()"))


def texto_do_campo(rotulo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText.replace(/\\u00a0/g, ' ') : 'SEM CAMPO'; })()") or ""


def tag_do_campo(rotulo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.tagName : 'SEM CAMPO'; })()") or ""


def href_do_link(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def linha_da_tabela(trecho):
    """O texto da primeira linha da tabela que contem `trecho` (colunas separadas por ' | ')."""
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


def abrir_balcao(modo_orcamento=False):
    ir("/emporio/vender")
    confere("o balcão abre", caminho() == "/emporio/vender" and tem("Total da venda"), caminho())
    if campo_existe("Loja") and LOJA not in texto_do_campo("Loja"):
        confere("escolhe " + LOJA, escolher("Loja", LOJA) is True)
    if modo_orcamento:
        confere("troca para o modo Orçamento", clicar("Orçamento"))
        time.sleep(1)
        confere("o balcão mostra Salvar orçamento", esperar(lambda: tem("Total do orçamento"), 10) and "Salvar orçamento" in texto_do_main())


def adicionar(produto, busca, quantidade, n):
    confere("busca " + produto, preencher_aria("Buscar produto", busca) != "SEM CAMPO")
    confere("adiciona " + produto, esperar(lambda: clicar_resultado(produto), 15))
    confere("a quantidade do item " + str(n) + " é " + quantidade, preencher_aria("Quantidade do item " + str(n), quantidade) != "SEM CAMPO")


def carregar_orcamento(numero):
    confere("o campo Orçamento nº existe", preencher("Orçamento nº", numero) not in ("SEM ROTULO", "SEM CAMPO"))
    confere("clica em Carregar", clicar("Carregar"))
    return esperar(lambda: tem("Faturando o orçamento nº"), 30)


def esc():
    js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(1)


# --- 1. O Vendedor salva o orçamento ---------------------------------------------------
entrar("vendedor")
passo("1. O Vendedor salva um orçamento: cliente completo, número, validade, A4 e bobina")
abrir_balcao(modo_orcamento=True)
adicionar(RACAO, "Orc Ra", "2", 1)
adicionar(ESCASSO, "Orc Esc", "5", 2)
# Frente 1 (06/11): o orçamento aceita o Consumidor final; a recusa é a de sem cliente.
confere("clica em Salvar orçamento sem escolher o cliente", enviar_botao("Salvar orçamento"))
recusa = esperar(lambda: erro_do_campo("Cliente"), 20)
confere("sem cliente: a recusa aparece no campo Cliente", recusa == RECUSA_CLIENTE, recusa)
confere("o orçamento não foi salvo", not tem("salvo, válido até"), texto_principal(200))
confere("escolhe o cliente completo", escolher("Cliente", CLIENTE) is True)
confere("a recusa some ao escolher", esperar(lambda: not erro_do_campo("Cliente"), 10))
confere("clica em Salvar orçamento de novo", enviar_botao("Salvar orçamento"))
confere("o orçamento é salvo", esperar(lambda: tem("salvo, válido até"), 60), texto_principal(300))
resumo = texto_do_main()
achou = re.search(r"Orçamento nº (\d+) salvo, válido até (\d{2}/\d{2}/\d{4})", resumo)
numero = achou.group(1) if achou else ""
validade = achou.group(2) if achou else ""
confere("o resumo traz o número do orçamento", numero != "", resumo[:300])
confere("a validade é hoje mais 7 dias: " + data_br(HOJE + timedelta(days=7)), validade == data_br(HOJE + timedelta(days=7)), validade)
confere("o resumo mostra o total R$ 90,00", "R$ 90,00" in resumo, resumo[:400])
confere("o resumo mostra o cliente e o vendedor", "cliente " + CLIENTE in resumo and "vendedor " + VENDEDOR in resumo, resumo[:400])
confere("o resumo oferece Faturar agora e Novo atendimento", "Faturar agora" in resumo and "Novo atendimento" in resumo)
href_a4 = href_do_link("Imprimir A4")
href_cupom = href_do_link("Imprimir cupom")
confere("o resumo tem os dois links de impressão", href_a4.startswith("/emporio/imprimir/orcamento/") and href_cupom.endswith("formato=cupom"), href_a4 + " " + href_cupom)
orcamento_id = href_a4.split("/emporio/imprimir/orcamento/")[1].split("?")[0] if "/emporio/imprimir/orcamento/" in href_a4 else ""

ir(href_a4)
papel = texto_da_pagina()
confere("o A4 abre", caminho() == "/emporio/imprimir/orcamento/" + orcamento_id, caminho())
confere("o A4 tem o título ORÇAMENTO", "ORÇAMENTO" in papel, papel[:300])
confere("o A4 tem Válido até com a data", "Válido até " + validade in papel, papel[:600])
confere("o A4 mostra o cliente", CLIENTE in papel, papel[:600])
ir(href_cupom)
papel = texto_da_pagina()
confere("a bobina tem ORÇAMENTO e SEM VALOR FISCAL", "ORÇAMENTO" in papel and "SEM VALOR FISCAL" in papel, papel[:300])
confere("a bobina tem Válido até com a data", "Válido até " + validade in papel, papel[:600])
confere("a bobina tem o número do orçamento", "Orçamento nº" in papel and numero in papel, papel[:600])

# --- 2. O preço sobe, o Caixa fatura pelo orçado -------------------------------------------
entrar("gestor")
passo("2. A ração sobe para R$ 25,00 e o escasso cai para R$ 8,00; o Caixa carrega o orçamento e fatura pelo menor preço")
ir("/emporio")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
loja = next((l for l in lojas if l["name"] == LOJA), None)
confere("acha a loja pela API", loja is not None, len(lojas))


def definir_preco(nome, preco):
    produtos = api("GET", "/api/v1/emporio/products?q=" + urllib.parse.quote(nome))
    lista = produtos["body"]["data"] if produtos["body"] and "data" in produtos["body"] else []
    produto = next((p for p in lista if p["name"] == nome), None)
    confere("acha " + nome + " pela API", produto is not None, [produtos["status"], len(lista)])
    detalhe = api("GET", "/api/v1/emporio/products/" + produto["id"])
    apresentacao = detalhe["body"]["data"]["presentations"][0]["id"]
    r = api("PUT", "/api/v1/emporio/prices", {"establishment_id": loja["id"], "presentation_id": apresentacao, "price": preco})
    confere("o Gestor põe " + nome + " a R$ " + str(preco), r["status"] == 200, r)


definir_preco(RACAO, 25)
definir_preco(ESCASSO, 8)

entrar("caixa")
abrir_balcao()
confere("na Venda, o Caixa vê o campo Orçamento nº", campo_existe("Orçamento nº"))
confere("carrega o orçamento pelo número", carregar_orcamento(numero), texto_principal(300))
confere("a faixa mostra o cliente e o vendedor do orçamento", "Cliente " + CLIENTE in texto_do_main() and "vendedor " + VENDEDOR in texto_do_main(), texto_principal(500))
confere("a faixa mostra Válido até " + validade, "Válido até " + validade in texto_do_main())
confere("o vendedor está travado no do orçamento", tag_do_campo("Vendedor") == "P" and VENDEDOR in texto_do_campo("Vendedor"), tag_do_campo("Vendedor") + " " + texto_do_campo("Vendedor"))
confere("aviso do escasso, que baixou: orçado R$ 10,00, hoje vale R$ 8,00", "O preço mudou: orçado R$ 10,00, hoje vale R$ 8,00." in texto_do_main(), texto_principal(800))
confere("a ração, que subiu, não ganha aviso de preço", "orçado R$ 20,00" not in texto_do_main() and "hoje vale R$ 25,00" not in texto_do_main(), texto_principal(800))
confere("aviso de estoque: há 3 na loja", "Falta estoque: há 3" in texto_do_main() and " na loja." in texto_do_main(), texto_principal(800))
confere("a ração fica no preço do orçamento, R$ 20,00 (hoje vale R$ 25,00)", "Preço do orçamento R$ 20,00" in texto_do_main(), texto_principal(800))
confere("o escasso vem pelo menor, R$ 8,00", "Preço do orçamento R$ 8,00" in texto_do_main(), texto_principal(800))
confere("os dois itens vieram do orçamento", valor_aria("Quantidade do item 1") == "2" and valor_aria("Quantidade do item 2") == "5", valor_aria("Quantidade do item 1") + " / " + valor_aria("Quantidade do item 2"))
confere("o Caixa baixa o escasso para 3 (o que há)", preencher_aria("Quantidade do item 2", "3") != "SEM CAMPO")
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("o valor em dinheiro é 64", preencher_aria("Valor em Dinheiro (R$)", "64") != "SEM CAMPO")
confere("fecha a venda", enviar_botao("Fechar a venda"))
confere("a venda sai", esperar(lambda: tem("Venda registrada"), 60), texto_principal(400))
resumo = texto_do_main()
confere("a venda soma R$ 64,00 (2 x 20 + 3 x 8; a R$ 25 e R$ 10 seriam R$ 80,00)", "Venda registrada: R$ 64,00" in resumo, resumo[:300])
confere("o resumo cita o orçamento e o vendedor dele", "do orçamento nº " + numero in resumo and "vendedor " + VENDEDOR in resumo, resumo[:500])
href_venda = href_do_link("Ver a venda")
venda_id = href_venda.split("/emporio/vendas/")[1] if "/emporio/vendas/" in href_venda else ""
confere("o resumo tem o link da venda", venda_id != "", href_venda)
ir(href_venda)
pagina = texto_da_pagina()
confere("a venda mostra Orçamento nº " + numero, "Orçamento nº " + numero in pagina, pagina[:400])
confere("a venda mostra o Vendedor do orçamento e Registrada por o Caixa", "Vendedor: " + VENDEDOR in pagina and "Registrada por " + CAIXA in pagina, pagina[:500])

# --- 3. O Gestor cancela a venda: o orçamento volta a aberto --------------------------------
entrar("gestor")
passo("3. O Gestor cancela a venda: o orçamento volta a Aberto, e a busca pelo telefone com máscara acha")
ir("/emporio/orcamentos?situacao=todos")
confere("a lista abre", caminho() == "/emporio/orcamentos" and tem("Orçamentos"), caminho())
antes = linha_da_tabela(CLIENTE)
confere("com a venda ativa, o orçamento está Faturado", "Faturado" in antes and "Aberto" not in antes, antes)
ir(href_venda)
confere("abre o painel de cancelar", clicar("Cancelar venda") and esperar(painel_aberto, 15))
confere("preenche o motivo", preencher("Motivo", "teste do roteiro") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60))
confere("a venda fica cancelada", esperar(lambda: tem("cancelada"), 30), texto_principal(300))
confere("a venda cancelada continua dizendo o orçamento de origem", "Orçamento nº " + numero in texto_da_pagina())
ir("/emporio/orcamentos")
depois = linha_da_tabela(CLIENTE)
confere("o orçamento volta a Aberto", "Aberto" in depois and "Faturado" not in depois, depois)
confere("a linha mostra o número, o telefone e o vendedor", depois.startswith(numero) and "11987654321" in depois.replace("(", "").replace(")", "").replace(" ", "").replace("-", "") and VENDEDOR in depois, depois)
confere("o vencido também está na lista de acompanhamento", "Vencido" in linha_da_tabela(VENCIDO), linha_da_tabela(VENCIDO))
confere("busca pelo telefone com máscara", preencher_aria("Buscar orçamento", TELEFONE) != "SEM CAMPO" and clicar("Buscar"))
confere("a busca vai para a URL", esperar(lambda: "q=" in (js("location.search") or ""), 20), js("location.search"))
confere("a busca acha o orçamento do cliente", esperar(lambda: CLIENTE in linha_da_tabela(CLIENTE) and numero in linha_da_tabela(CLIENTE), 30), linha_da_tabela(CLIENTE))
confere("a busca não traz o outro cliente", linha_da_tabela(VENCIDO) == "", linha_da_tabela(VENCIDO))
confere("busca por telefone que ninguém tem: lista vazia", preencher_aria("Buscar orçamento", "(11) 90000-0000") != "SEM CAMPO" and clicar("Buscar") and esperar(lambda: tem("Nenhum orçamento encontrado"), 30), texto_principal(200))

# --- 4. O orçamento vencido -----------------------------------------------------------------
entrar("vendedor")
passo("4. O orçamento vencido ontem: o Vendedor carrega e vê o aviso e o preço de hoje")
ir("/emporio/orcamentos?situacao=vencido")
linha_v = linha_da_tabela(VENCIDO)
confere("a lista de vencidos tem o orçamento do " + VENCIDO, "Vencido" in linha_v and linha_v != "", linha_v)
numero_v = linha_v.split(" | ")[0] if linha_v else ""
confere("o número do vencido sai da primeira coluna", numero_v.isdigit(), numero_v)
confere("a validade do vencido é ontem", data_br(HOJE - timedelta(days=1)) in linha_v, linha_v)
abrir_balcao()
confere("carrega o orçamento vencido", carregar_orcamento(numero_v), texto_principal(300))
principal = texto_do_main()
confere("aviso de vencido com a data de ontem", "Orçamento vencido em " + data_br(HOJE - timedelta(days=1)) + ": vale o preço de hoje." in principal, principal[:800])
preco_v = re.search(r"Preço (?:do orçamento|sugerido) (R\$ [\d.,]+)", principal)
confere("o item vem pelo preço de hoje (R$ 18,00), não pelo orçado (R$ 15,00)", preco_v is not None and preco_v.group(1) == "R$ 18,00", principal[:800])
confere("tira o orçamento", clicar("Tirar orçamento") and esperar(lambda: not tem("Faturando o orçamento nº"), 10))
confere("o campo Orçamento nº volta", campo_existe("Orçamento nº"))

# --- 5. O Caixa não vê a lista de Orçamentos -------------------------------------------------
entrar("caixa")
passo("5. O Caixa abre /emporio/orcamentos: volta ao início, e o menu não oferece")
ir("/emporio/orcamentos")
confere("volta ao /emporio", caminho() == "/emporio", caminho())
vistos = [h for h in menu() if h.startswith("/emporio")]
confere("o menu do Caixa tem Vender e Vendas", "/emporio/vender" in vistos and "/emporio/vendas" in vistos, vistos)
confere("o menu do Caixa não tem Orçamentos", "/emporio/orcamentos" not in vistos, vistos)
entrar("vendedor")
ir("/emporio")
vistos = [h for h in menu() if h.startswith("/emporio")]
confere("o menu do Vendedor tem Orçamentos logo depois de Vendas", "/emporio/orcamentos" in vistos and vistos.index("/emporio/orcamentos") == vistos.index("/emporio/vendas") + 1, vistos)

# --- 6. Celular -------------------------------------------------------------------------------
passo("6. Celular (390 px): a lista de Orçamentos e o balcão em modo Orçamento sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
entrar("vendedor")
ir("/emporio/orcamentos?situacao=todos")
confere("a lista abre no celular com as linhas", caminho() == "/emporio/orcamentos" and linha_da_tabela(CLIENTE) != "" and linha_da_tabela(VENCIDO) != "", caminho())
confere("a lista sem rolagem horizontal", sem_rolagem_horizontal(), medida())
abrir_balcao(modo_orcamento=True)
adicionar(RACAO, "Orc Ra", "2", 1)
confere("o balcão em modo Orçamento sem rolagem horizontal", sem_rolagem_horizontal(), medida())
cdp("Emulation.clearDeviceMetricsOverride")

fim()
