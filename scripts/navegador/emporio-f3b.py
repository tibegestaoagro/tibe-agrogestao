# Validacao viva da F3b do Meu Empório (Modulo 39): cartao, cheque,
# transferencia entre caixas e conferencia.
# docs/specs/module-39-meu-emporio.md, "F3b: contrato (Q88 a Q95)".
#
# Os numeros do aceite, conferidos na tela:
#   credito de R$ 100 com 3% em 30 dias: R$ 97 a receber, nada na gaveta
#   a venda de 40 dias atras (cenario) ja caiu: R$ 97 na conta
#   cheque de R$ 100 depositado e compensado: a conta ganha R$ 100
#   transferir R$ 150 da gaveta para a conta nao cria lancamento financeiro
#   conferir a gaveta com R$ 5 a menos: ajuste e "Diferenca de caixa"
#
# cenario: scripts/_cenario-emporio-f3b.ts
# sessao: owner owner@damata.com.br


def tem(texto, n=40000):
    # O dinheiro sai com espaco nao separavel entre "R$" e o valor.
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


def por_aria(aria, valor):
    return js("(() => { const el = Array.from(document.querySelectorAll('input')).find(x => x.getAttribute('aria-label') === " + repr(aria) + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def por_id_que_comeca(prefixo, valor):
    """Campo do pagamento (cheque) pelo comeco do id, que leva a chave da linha."""
    return js("(() => { const el = document.querySelector(" + repr('[id^="' + prefixo + '"]') + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def escolher_por_inicio(rotulo, inicio):
    """Como `escolher`, mas a opcao e achada pelo comeco do texto (as da
    transferencia trazem o saldo, que muda)."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    xy = _centro(gatilho)
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim().startsWith(" + repr(inicio) + "))")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def escolher_por_id(prefixo_id, opcao):
    xy = _centro("document.querySelector(" + repr('[id^="' + prefixo_id + '"]') + ")")
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(opcao) + ")")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def buscar_e_adicionar(nome):
    js("(() => { const el = document.querySelector('input[aria-label=\"Buscar produto\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(nome) + "); el.dispatchEvent(new Event('input', { bubbles: true })); })()")
    time.sleep(0.8)
    ok = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()")
    time.sleep(0.8)
    return bool(ok)


def fechar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === 'Fechar a venda'); if (b) b.click(); })()")


def resumo():
    return (js("(() => { const s = document.querySelector('[role=status]'); return s ? s.innerText.replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ') : ''; })()") or "")


def clicar_no_bloco(texto_do_bloco, rotulo):
    """Clica no botao `rotulo` dentro do menor bloco que contem `texto_do_bloco`
    (ha uma gaveta e um cheque por linha, de varias lojas)."""
    return bool(js("(() => { const cands = Array.from(document.querySelectorAll('main *')).filter(el => el.innerText && el.innerText.includes(" + repr(texto_do_bloco) + ") && Array.from(el.querySelectorAll('button')).some(b => b.innerText.trim() === " + repr(rotulo) + ")); cands.sort((a, b) => a.innerText.length - b.innerText.length); const c = cands[0]; if (!c) return false; Array.from(c.querySelectorAll('button')).find(b => b.innerText.trim() === " + repr(rotulo) + ").click(); return true; })()"))


def caixa():
    return api("GET", "/api/v1/emporio/cash")["body"]["data"]


def gaveta(loja_id):
    for g in caixa()["drawers"]:
        if g["establishment_id"] == loja_id:
            return g["balance"]
    return None


def conta(conta_id):
    for c in caixa()["accounts"]:
        if c["bank_account_id"] == conta_id:
            return c
    return None


def a_receber(conta_id):
    return round(sum(r.get("net_amount", 0) for r in caixa()["card_receivables"] if r.get("bank_account_id") == conta_id), 2)


def lancamentos():
    return api("GET", "/api/v1/financial-entries?per_page=1")["body"]["meta"].get("total")


passo("0. O cenário: a parcela de 40 dias atrás já caiu na conta")
entrar("owner")
ir("/emporio")
loja = [l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"] == "F3b Loja"][0]
banco = [c for c in api("GET", "/api/v1/emporio/bank-accounts")["body"]["data"] if c["name"] == "F3b Banco"][0]
confere("conta F3b Banco com R$ 97,00 (a parcela que caiu)", conta(banco["id"])["balance"] == 97, conta(banco["id"]))
confere("nada a receber ainda nessa conta", a_receber(banco["id"]) == 0)
confere("gaveta com o saldo inicial de R$ 200,00", gaveta(loja["id"]) == 200)

passo("1. Crédito de R$ 100 no balcão: R$ 97 a receber em 30 dias (aceite)")
ir("/emporio/vender")
confere("escolhe a loja", escolher("Loja", "F3b Loja") is True)
confere("adiciona F3b Ração", buscar_e_adicionar("F3b Ração"))
por_aria("Quantidade do item 1", "5")
time.sleep(0.5)
clicar("+ Crédito")
time.sleep(0.8)
confere("a tela mostra a taxa e o líquido antes de fechar", tem("Taxa 3") and tem("R$ 97,00"))
fechar_venda()
confere("venda de R$ 100,00 registrada", esperar(lambda: "R$ 100,00" in resumo(), 90), resumo()[:200])
confere("R$ 97,00 a receber na F3b Banco", a_receber(banco["id"]) == 97, a_receber(banco["id"]))
confere("a gaveta não mudou", gaveta(loja["id"]) == 200)
confere("a conta continua com R$ 97,00 (a parcela nova é futura)", conta(banco["id"])["balance"] == 97)

passo("2. Parcelado em 3x: três parcelas a receber")
buscar_e_adicionar("F3b Ração")
por_aria("Quantidade do item 1", "5")
time.sleep(0.5)
clicar("+ Parcelado")
time.sleep(0.8)
confere("escolhe 3x", escolher_por_id("parcelas-", "3x") is True)
fechar_venda()
confere("venda parcelada registrada", esperar(lambda: "Parcelado" in resumo(), 90), resumo()[:200])
parcelas = [r for r in caixa()["card_receivables"] if r.get("bank_account_id") == banco["id"]]
confere("quatro parcelas futuras (1 do crédito + 3 do parcelado), R$ 97 + R$ 96", len(parcelas) == 4 and a_receber(banco["id"]) == 193, [r.get("net_amount") for r in parcelas])

passo("3. Cheque: sem cliente é recusado; com a Maria, vai para a carteira")
buscar_e_adicionar("F3b Ração")
por_aria("Quantidade do item 1", "5")
time.sleep(0.5)
clicar("+ Cheque")
time.sleep(0.8)
por_id_que_comeca("cheque-numero-", "000123")
por_id_que_comeca("cheque-banco-", "Banco do Brasil")
por_id_que_comeca("cheque-bom-para-", time.strftime("%Y-%m-%d"))
fechar_venda()
time.sleep(1.5)
confere("cheque sem cliente: recusa embaixo de Cliente", bool(esperar(lambda: erro_do_campo("Cliente"), 30)), erro_do_campo("Cliente"))
confere("escolhe a Maria", escolher("Cliente", "F3b Maria") is True)
fechar_venda()
confere("venda no cheque registrada", esperar(lambda: "Cheque" in resumo() and "F3b Maria" in resumo(), 90), resumo()[:200])
confere("o cheque está na carteira, recebido, e a gaveta não mudou", any(c.get("number") == "000123" and c.get("status") == "recebido" for c in caixa()["checks"]) and gaveta(loja["id"]) == 200)

passo("4. Depositar e compensar o cheque pelo caixa")
ir("/emporio/caixa")
confere("seções novas no caixa", all(tem(x) for x in ["A receber do cartão", "Cheques", "Transferir entre caixas", "Taxas de cartão"]))
confere("abre Depositar do cheque 000123", clicar_no_bloco("000123", "Depositar"))
time.sleep(1.5)
escolher("Conta do depósito", "F3b Banco")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("cheque depositado", esperar(lambda: any(c.get("number") == "000123" and c.get("status") == "depositado" for c in caixa()["checks"]), 30))
ir("/emporio/caixa")
confere("abre Compensou", clicar_no_bloco("000123", "Compensou"))
time.sleep(1.2)
confere("confirma", clicar("Sim, compensou"))
confere("a conta ganha R$ 100,00: R$ 197,00", esperar(lambda: conta(banco["id"])["balance"] == 197, 60), conta(banco["id"]))
confere("o cheque sai da carteira", not any(c.get("number") == "000123" for c in caixa()["checks"]))

passo("5. Transferir R$ 150 da gaveta para a conta: o resultado não muda")
antes = lancamentos()
ir("/emporio/caixa")
confere("abre Transferir entre caixas", clicar("Transferir entre caixas"))
time.sleep(1.5)
escolher_por_inicio("De", "Gaveta: F3b Loja")
escolher_por_inicio("Para", "Conta: F3b Banco")
preencher("Valor (R$)", "150,00")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("gaveta R$ 50,00 e conta R$ 347,00", gaveta(loja["id"]) == 50 and conta(banco["id"])["balance"] == 347, (gaveta(loja["id"]), conta(banco["id"])["balance"]))
confere("nenhum lançamento financeiro novo", lancamentos() == antes, (antes, lancamentos()))

passo("6. Conferir a gaveta com R$ 5 a menos")
ir("/emporio/caixa")
confere("abre Conferir da F3b Loja", clicar_no_bloco("F3b Loja", "Conferir"))
time.sleep(1.5)
preencher("Valor contado (R$)", "45,00")
enviar_painel()
time.sleep(1.5)
confere("diferença sem motivo: recusa embaixo do motivo", bool(esperar(lambda: erro_do_campo("Motivo da diferença"), 30)), erro_do_campo("Motivo da diferença"))
preencher("Motivo da diferença", "Troco dado a mais")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a gaveta passa a R$ 45,00", gaveta(loja["id"]) == 45, gaveta(loja["id"]))
confere("a última conferência aparece na gaveta", any(g.get("last_count") for g in caixa()["drawers"] if g["establishment_id"] == loja["id"]))

passo("7. O balcão com as sete formas no celular (390 px)")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/vender")
buscar_e_adicionar("F3b Ração")
largura = js("document.documentElement.scrollWidth")
confere("sem rolagem horizontal com os botões de pagamento", largura is not None and largura <= 390, largura)
botoes = js("Array.from(document.querySelectorAll('button')).filter(b => b.innerText.trim().startsWith('+ ')).map(b => b.innerText.trim())")
confere("as sete formas aparecem", all(x in (botoes or []) for x in ["+ Dinheiro", "+ PIX", "+ Fiado", "+ Débito", "+ Crédito", "+ Parcelado", "+ Cheque"]), botoes)
cdp("Emulation.clearDeviceMetricsOverride")
