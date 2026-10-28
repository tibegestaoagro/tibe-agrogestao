# Validacao viva da F3a do Meu Empório (Modulo 39): venda, fiado e caixa.
# docs/specs/module-39-meu-emporio.md, "F3a: contrato (Q81 a Q87)".
#
# Os numeros do aceite (§25), conferidos na tela:
#   vender 1 kg de sal com 3 sacas de 10 kg lacradas e nada avulso: abre 1 saca,
#   ficam 2 lacradas e 9 kg avulsos (total 29, menos 0,10 saca)
#   pagamento misto de R$ 200 (120 em dinheiro e 80 fiado): uma venda, 120
#   recebidos e 80 a receber
#   receber 50 do fiado: a divida cai para 30, sem venda nova
#   cancelar e devolver ajustam estoque e caixa, preservando o historico
#
# cenario: scripts/_cenario-emporio-f3a.ts
# sessao: owner owner@damata.com.br


def tem(texto, n=30000):
    # O dinheiro sai com espaço não separável entre "R$" e o valor.
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


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


def fechar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === 'Fechar a venda'); if (b) b.click(); })()")


def resumo():
    return (js("(() => { const s = document.querySelector('[role=status]'); return s ? s.innerText.replace(/\\s+/g, ' ') : ''; })()") or "")


def estoque(loja_id, nome):
    linhas = api("GET", "/api/v1/emporio/stock?establishment_id=" + loja_id)["body"]["data"]
    achada = [x for x in linhas if x["product_name"] == nome]
    return achada[0] if achada else None


def pacotes(linha):
    return sum(s["packages"] for s in (linha or {}).get("sealed", []))


def gaveta(loja_id):
    caixa = api("GET", "/api/v1/emporio/cash")["body"]["data"]
    for g in caixa.get("drawers", caixa.get("gavetas", [])):
        if g.get("establishment_id") == loja_id:
            return g.get("balance", g.get("saldo"))
    return None


def deve(contato_nome):
    linhas = api("GET", "/api/v1/emporio/receivables")["body"]["data"]
    achada = [x for x in linhas if x.get("contact_name") == contato_nome]
    return achada[0].get("owed", achada[0].get("balance")) if achada else 0


passo("0. Achar a loja do cenário e abrir o balcão")
entrar("owner")
ir("/emporio")
lojas = {l["name"]: l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"]}
loja = lojas["F3a Loja"]
confere("cartões Vender, Vendas, Fiado e Caixa no início", all(tem(x) for x in ["Vender", "Vendas", "Fiado", "Caixa"]))
ir("/emporio/vender")
confere("o balcão abre direto na venda", tem("Fechar a venda") and bool(js("!!document.querySelector('input[aria-label=\"Buscar produto\"]')")))
confere("escolhe a loja", escolher("Loja", "F3a Loja") is True)

passo("1. Vender 1 kg de sal: a saca abre sozinha (aceite §25)")
confere("adiciona F3a Sal pela busca", buscar_e_adicionar("F3a Sal"))
confere("vem o Quilo, a menor apresentação, a R$ 12,00", tem("Preço sugerido R$ 12,00"))
clicar("+ Dinheiro")
time.sleep(0.5)
por_aria("Valor em Dinheiro (R$)", "20,00")
time.sleep(0.5)
confere("a tela mostra o troco de R$ 8,00", tem("Troco: R$ 8,00") or tem("R$ 8,00"))
fechar_venda()
confere("venda registrada de R$ 12,00 com troco de R$ 8,00", esperar(lambda: "R$ 12,00" in resumo() and "R$ 8,00" in resumo(), 90), resumo()[:200])
sal = estoque(loja["id"], "F3a Sal")
confere("sal: 2 sacas lacradas, 9 kg avulsos, total 29", sal and pacotes(sal) == 2 and sal["loose_qty"] == 9 and sal["total_qty"] == 29, sal)
confere("gaveta com R$ 12,00 (o troco não entra)", gaveta(loja["id"]) == 12, gaveta(loja["id"]))

passo("2. Pagamento misto: R$ 120 em dinheiro e R$ 80 fiado")
confere("adiciona F3a Ração", buscar_e_adicionar("F3a Ração"))
por_aria("Quantidade do item 1", "10")
time.sleep(0.5)
confere("total de R$ 200,00", tem("R$ 200,00"))
clicar("+ Dinheiro")
time.sleep(0.5)
por_aria("Valor em Dinheiro (R$)", "120,00")
time.sleep(0.5)
clicar("+ Fiado")
time.sleep(0.5)
confere("o fiado já vem com os R$ 80,00 que faltam", js("(() => { const el = Array.from(document.querySelectorAll('input')).find(x => x.getAttribute('aria-label') === 'Valor em Fiado (R$)'); return el ? el.value : ''; })()") in ("80,00", "R$ 80,00", "80"))
fechar_venda()
time.sleep(1.5)
confere("fiado sem cliente: recusa embaixo de Cliente", bool(esperar(lambda: erro_do_campo("Cliente"), 30)), erro_do_campo("Cliente"))
confere("escolhe o cliente F3a José", escolher("Cliente", "F3a José") is True)
fechar_venda()
confere("venda de R$ 200,00 registrada, com o cliente", esperar(lambda: "R$ 200,00" in resumo() and "F3a José" in resumo(), 90), resumo()[:200])
confere("José deve R$ 80,00", deve("F3a José") == 80, deve("F3a José"))
confere("gaveta com R$ 132,00 (12 + 120)", gaveta(loja["id"]) == 132, gaveta(loja["id"]))
vendas = api("GET", "/api/v1/emporio/sales?establishment_id=" + loja["id"])["body"]["data"]
confere("duas vendas na loja, uma delas de R$ 200", len(vendas) == 2 and any(v["net_amount"] == 200 for v in vendas), [v["net_amount"] for v in vendas])
venda_sal = [v for v in vendas if v["net_amount"] == 12][0]
venda_mista = [v for v in vendas if v["net_amount"] == 200][0]

passo("3. Receber R$ 50 do fiado na tela do fiado")
ir("/emporio/fiado")
confere("José aparece devendo R$ 80,00", tem("F3a José") and tem("R$ 80,00"))
confere("abre Receber", clicar("Receber"))
time.sleep(1.5)
preencher("Valor recebido (R$)", "50,00")
escolher("Como o cliente pagou", "Dinheiro (entra na gaveta da loja)")
escolher("Loja que recebe", "F3a Loja")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("José deve R$ 30,00, sem venda nova", deve("F3a José") == 30 and len(api("GET", "/api/v1/emporio/sales?establishment_id=" + loja["id"])["body"]["data"]) == 2, deve("F3a José"))

passo("4. O caixa: a gaveta é a soma dos movimentos")
ir("/emporio/caixa")
confere("gaveta da F3a Loja em R$ 182,00 (12 + 120 + 50)", gaveta(loja["id"]) == 182 and tem("R$ 182,00"), gaveta(loja["id"]))
confere("movimentos com a origem em português", tem("Venda") and tem("Recebimento de fiado"))

passo("5. Cancelar a venda do sal pela tela")
ir("/emporio/vendas/" + venda_sal["id"])
confere("abre Cancelar venda", clicar("Cancelar venda"))
time.sleep(1.5)
preencher("Motivo", "Registrei errado")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
sal = estoque(loja["id"], "F3a Sal")
confere("o quilo volta avulso e a saca segue aberta: 2 lacradas, 10 avulsos, total 30", sal and pacotes(sal) == 2 and sal["loose_qty"] == 10 and sal["total_qty"] == 30, sal)
confere("os R$ 12,00 saem da gaveta: R$ 170,00", gaveta(loja["id"]) == 170, gaveta(loja["id"]))
confere("a venda continua na lista, cancelada", api("GET", "/api/v1/emporio/sales/" + venda_sal["id"])["body"]["data"]["status"] == "cancelada")

passo("6. Devolver 1 kg de ração em dinheiro pela tela")
ir("/emporio/vendas/" + venda_mista["id"])
confere("abre Devolver", clicar("Devolver"))
time.sleep(1.5)
por_aria("Quantidade devolvida de F3a Ração", "1")
time.sleep(0.5)
escolher("Como devolver o valor", "Devolver em dinheiro (sai da gaveta)")
enviar_painel()
fechou = esperar(lambda: not painel_aberto(), 60)
confere("painel fechou", fechou, erro_do_campo("Como devolver o valor") or erro_do_campo("Itens devolvidos"))
confere("R$ 20,00 saem da gaveta: R$ 150,00", gaveta(loja["id"]) == 150, gaveta(loja["id"]))
confere("a ração volta ao estoque: 41 kg", estoque(loja["id"], "F3a Ração")["total_qty"] == 41)

passo("7. O balcão no celular (390 px)")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/vender")
largura = js("document.documentElement.scrollWidth")
confere("sem rolagem horizontal", largura is not None and largura <= 390, largura)
rodape = js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === 'Fechar a venda'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.top, r.bottom, window.innerHeight]; })()")
confere("o botão Fechar a venda está visível na tela sem rolar", rodape is not None and rodape[1] <= rodape[2] and rodape[0] >= 0, rodape)
modo = js("(() => { const el = document.querySelector('input[aria-label=\"Buscar produto\"]'); return el ? el.getAttribute('type') : null; })()")
confere("busca é campo de pesquisa", modo == "search", modo)
buscar_e_adicionar("F3a Ração")
teclado = js("(() => { const el = Array.from(document.querySelectorAll('input')).find(x => x.getAttribute('aria-label') === 'Quantidade do item 1'); return el ? el.getAttribute('inputmode') : null; })()")
confere("quantidade abre o teclado numérico", teclado in ("decimal", "numeric"), teclado)
cdp("Emulation.clearDeviceMetricsOverride")
