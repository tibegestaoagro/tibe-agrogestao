# Validacao viva do ajuste de 09/11 do Meu Empório (Modulo 39): frete cobrado do
# cliente, origem da venda (balcao ou e-commerce) e editar venda faturada.
# docs/superpowers/specs/2026-11-09-emporio-frete-ecommerce-design.md (Q244 a Q249).
#
# Os numeros, conferidos na tela e pela API:
#   vender 5 kg de ração a R$ 20,00 (itens R$ 100,00) com frete de R$ 20,00 e
#   origem E-commerce: total R$ 120,00; o faturamento segue sendo os itens
#   a conta "Frete de entrega" de R$ 20,00 nasce no A pagar
#   o Resultado da Loja traz a linha "Frete de entrega (repasse)", fora das vendas
#   editar a venda do balcão (sem frete) para incluir R$ 20,00: a antiga fica
#   cancelada e "Substituída pela venda nº", a nova "Substitui a venda nº"
#
# cenario: scripts/_cenario-emporio-frete.ts
# sessao: owner owner@example.com


def tem(texto, n=30000):
    # O dinheiro sai com espaço não separável entre "R$" e o valor.
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def caminho():
    return js("location.pathname") or ""


def por_aria(aria, valor):
    """Preenche o campo pelo aria-label (os campos de item e de pagamento do
    balcao nao tem <label> proprio), pelo setter nativo, como `preencher`."""
    return js("(() => { const el = Array.from(document.querySelectorAll('input')).find(x => x.getAttribute('aria-label') === " + repr(aria) + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def buscar_e_adicionar(nome):
    r = js("(() => { const el = document.querySelector('input[aria-label=\"Buscar produto\"]'); if (!el) return 'SEM BUSCA'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(nome) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")
    time.sleep(0.8)
    ok = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()")
    time.sleep(0.8)
    return r is True and bool(ok)


def enviar_balcao(rotulo):
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (b) b.click(); })()")


def resumo():
    return (js("(() => { const s = document.querySelector('[role=status]'); return s ? s.innerText.replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ') : ''; })()") or "")


def clicar_link(rotulo):
    """Clica no link (a) cujo texto e exatamente `rotulo`."""
    return bool(js("(() => { const a = Array.from(document.querySelectorAll('a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!a) return false; a.click(); return true; })()"))


def marcado(rotulo):
    """O botao de origem (aria-pressed) cujo texto e `rotulo` esta marcado?"""
    return js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + " && x.hasAttribute('aria-pressed')); return b ? b.getAttribute('aria-pressed') === 'true' : null; })()")


def vendas_da_loja(loja_id, extra=""):
    return api("GET", "/api/v1/emporio/sales?establishment_id=" + loja_id + extra)["body"]["data"]


def estoque(loja_id, nome):
    linhas = api("GET", "/api/v1/emporio/stock?establishment_id=" + loja_id)["body"]["data"]
    achada = [x for x in linhas if x["product_name"] == nome]
    return achada[0] if achada else None


def contas_de_frete(loja_id):
    linhas = api("GET", "/api/v1/emporio/payables?establishment_id=" + loja_id)["body"]["data"]
    return [c for c in linhas if c.get("origin") == "frete"]


def resultado(loja_id):
    mes = js("new Date().toISOString().slice(0, 7)")
    return api("GET", "/api/v1/emporio/result?establishment_id=" + loja_id + "&month=" + mes)["body"]["data"]


passo("0. Achar a loja do cenário e as duas vendas já lançadas")
entrar("owner")
ir("/emporio")
lojas = {l["name"]: l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"]}
loja = lojas["Frete Loja"]
vs = vendas_da_loja(loja["id"])
confere("o cenário lançou duas vendas na loja", len(vs) == 2, [(v["net_amount"], v.get("origin")) for v in vs])
venda_ecom = [v for v in vs if v.get("origin") == "ecommerce"][0]
venda_balcao = [v for v in vs if v.get("origin") == "balcao"][0]
confere("a do e-commerce: itens 100, frete 20, total 120", venda_ecom["net_amount"] == 100 and venda_ecom["freight_amount"] == 20 and venda_ecom["total_amount"] == 120, venda_ecom["total_amount"])
confere("a do balcão: sem frete, total 100", venda_balcao["freight_amount"] == 0 and venda_balcao["total_amount"] == 100, venda_balcao["total_amount"])

passo("1. Vender no balcão com frete de R$ 20,00 e origem E-commerce")
ir("/emporio/vender")
confere("o balcão abre na venda", tem("Fechar a venda") and bool(js("!!document.querySelector('input[aria-label=\"Buscar produto\"]')")))
confere("escolhe a loja", escolher("Loja", "Frete Loja") is True)
confere("os campos do frete e da origem existem na venda", bool(js("!!document.getElementById('freight_amount')")) and tem("Origem da venda") and marcado("Balcão") is True, marcado("Balcão"))
confere("adiciona Frete Ração pela busca", buscar_e_adicionar("Frete Ração"))
por_aria("Quantidade do item 1", "5")
time.sleep(0.5)
confere("sem frete o resumo não mostra Total com frete", not tem("Total com frete"))
confere("preenche o frete de R$ 20,00", preencher("Frete cobrado do cliente (opcional)", "20,00") == "freight_amount")
time.sleep(0.5)
confere("escolhe a origem E-commerce", clicar("E-commerce") and marcado("E-commerce") is True and marcado("Balcão") is False)
confere("o resumo mostra o Frete e o Total com frete de R$ 120,00", tem("Total com frete") and tem("R$ 120,00") and tem("Frete"), texto_principal(900))
clicar("+ Dinheiro")
time.sleep(0.5)
por_aria("Valor em Dinheiro (R$)", "120,00")
time.sleep(0.5)
confere("toda venda tem cliente: escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
enviar_balcao("Fechar a venda")
confere("venda registrada: itens R$ 100,00 e frete R$ 20,00 no resumo", esperar(lambda: "R$ 100,00" in resumo() and "frete R$ 20,00" in resumo(), 90), resumo()[:240])
vs = vendas_da_loja(loja["id"])
confere("três vendas na loja", len(vs) == 3, len(vs))
nova = [v for v in vs if v["id"] not in (venda_ecom["id"], venda_balcao["id"])]
venda_ui = nova[0] if nova else None
confere("a nova gravou frete 20, origem ecommerce, total 120, itens 100", bool(venda_ui) and venda_ui["freight_amount"] == 20 and venda_ui.get("origin") == "ecommerce" and venda_ui["total_amount"] == 120 and venda_ui["net_amount"] == 100, venda_ui)
confere("ração: 100 - 15 kg = 85", estoque(loja["id"], "Frete Ração")["total_qty"] == 85, estoque(loja["id"], "Frete Ração"))

passo("2. O recibo traz a linha Frete e o pedido do e-commerce")
ir("/emporio/imprimir/venda/" + venda_ui["id"] + "?formato=a4")
pagina = texto_da_pagina()
confere("o recibo abre", caminho() == "/emporio/imprimir/venda/" + venda_ui["id"], caminho())
confere("tem a linha Frete de R$ 20,00 e o Total de R$ 120,00", "Frete" in pagina and "R$ 20,00" in pagina and "R$ 120,00" in pagina, pagina[:400])
confere("tem Pedido do e-commerce", "Pedido do e-commerce" in pagina, pagina[:400])

passo("3. A lista filtrada por E-commerce")
ir("/emporio/vendas?loja=" + loja["id"] + "&origin=ecommerce")
linhas = js("document.querySelectorAll('main tbody tr').length")
confere("duas linhas: as duas do e-commerce, sem a do balcão", linhas == 2, linhas)
confere("tem o selo E-commerce e o Frete R$ 20,00", tem("E-commerce") and tem("Frete R$ 20,00"), texto_principal(500))
confere("a API filtra igual: 2 vendas", len(vendas_da_loja(loja["id"], "&origin=ecommerce")) == 2)
ir("/emporio/vendas?loja=" + loja["id"])
linhas = js("document.querySelectorAll('main tbody tr').length")
confere("sem filtro, as três", linhas == 3, linhas)

passo("4. O detalhe da venda")
ir("/emporio/vendas/" + venda_ui["id"])
confere("mostra Frete, Total com frete e a origem", tem("Frete: R$ 20,00") and tem("Total com frete: R$ 120,00") and tem("E-commerce"), texto_principal(900))
confere("tem o botão Editar", bool(js("Array.from(document.querySelectorAll('a')).some(a => a.innerText.trim() === 'Editar')")))

passo("5. A conta Frete de entrega no A pagar")
ir("/emporio/financeiro/pagar?loja=" + loja["id"])
confere("a tela lista Frete de entrega", tem("Frete de entrega"), texto_principal(600))
fretes = contas_de_frete(loja["id"])
confere("duas contas de frete de R$ 20,00 pendentes (e-commerce do cenário e da tela)", len(fretes) == 2 and all(c["open_amount"] == 20 for c in fretes), [(c["name"], c["open_amount"]) for c in fretes])
confere("a conta aponta a venda", all(c.get("sale_id") for c in fretes), fretes[:1])

passo("6. O Resultado da Loja: a linha Frete de entrega (repasse)")
ir("/emporio/resultado?loja=" + loja["id"])
confere("a tela mostra a linha do repasse", tem("Frete de entrega (repasse)"), texto_principal(900))
r = resultado(loja["id"])
confere("recebido 40 e pago 40, diferença 0", r["freight"]["received"] == 40 and r["freight"]["paid"] == 40 and r["freight"]["difference"] == 0, r["freight"])
confere("as vendas do mês são os itens (300), sem o frete", r["sales"] == 300, r["sales"])

passo("7. Editar a venda do balcão para incluir frete de R$ 20,00")
ir("/emporio/vendas/" + venda_balcao["id"])
confere("clica em Editar", clicar_link("Editar"))
confere("abre o balcão em modo edição", esperar(lambda: "editar=" + venda_balcao["id"] in (js("location.search") or "") and tem("Editando a venda nº"), 90), texto_principal(300))
time.sleep(2)
confere("o botão é Salvar a venda nova", bool(js("Array.from(document.querySelectorAll('button[type=submit]')).some(b => b.innerText.trim() === 'Salvar a venda nova')")))
confere("a origem vem marcada Balcão", marcado("Balcão") is True, marcado("Balcão"))
confere("preenche o frete de R$ 20,00", preencher("Frete cobrado do cliente (opcional)", "20,00") == "freight_amount")
time.sleep(0.5)
if por_aria("Valor em Dinheiro (R$)", "120,00") != True:
    clicar("+ Dinheiro")
    time.sleep(0.5)
    por_aria("Valor em Dinheiro (R$)", "120,00")
time.sleep(0.5)
confere("o resumo mostra o Total com frete de R$ 120,00", tem("Total com frete") and tem("R$ 120,00"), texto_principal(900))
enviar_balcao("Salvar a venda nova")
confere("vai ao detalhe da venda nova", esperar(lambda: caminho().startswith("/emporio/vendas/") and caminho() != "/emporio/vendas/" + venda_balcao["id"], 90), caminho())
nova_id = caminho().split("/")[-1]
time.sleep(1.5)
confere("a nova diz Substitui a venda nº e traz o Frete", tem("Substitui a venda nº") and tem("Frete: R$ 20,00"), texto_principal(700))
antiga = api("GET", "/api/v1/emporio/sales/" + venda_balcao["id"])["body"]["data"]
confere("a antiga ficou cancelada", antiga["status"] == "cancelada", antiga["status"])
ir("/emporio/vendas/" + venda_balcao["id"])
confere("a antiga diz Substituída pela venda nº", tem("Substituída pela venda nº"), texto_principal(500))
confere("sem o botão Editar na antiga (cancelada)", not js("Array.from(document.querySelectorAll('a')).some(a => a.innerText.trim() === 'Editar')"))
vs = vendas_da_loja(loja["id"])
confere("quatro vendas na loja (a antiga continua listada)", len(vs) == 4, len(vs))
confere("ração volta ao saldo: 85 kg (a antiga devolve 5, a nova baixa 5)", estoque(loja["id"], "Frete Ração")["total_qty"] == 85, estoque(loja["id"], "Frete Ração"))
fretes = contas_de_frete(loja["id"])
confere("três contas de frete pendentes agora", len(fretes) == 3, len(fretes))
r = resultado(loja["id"])
confere("o repasse: recebido 60 e pago 60", r["freight"]["received"] == 60 and r["freight"]["paid"] == 60, r["freight"])

passo("8. O balcão no celular (390 px)")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/vender")
largura = js("document.documentElement.scrollWidth")
confere("sem rolagem horizontal com os campos novos", largura is not None and largura <= 390, largura)
cdp("Emulation.clearDeviceMetricsOverride")

fim()
