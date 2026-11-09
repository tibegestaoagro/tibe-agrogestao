# Validacao viva da entrega 1 das taxas de cartao do Meu Empório (Modulo 39):
# adquirente e bandeira. docs/superpowers/specs/2026-11-09-emporio-taxas-de-cartao-design.md
# (Q250 a Q258).
#
# Os numeros, conferidos na tela e pela API:
#   o Caixa nao tem mais o bloco de taxas: so a linha com o link para Configurações
#   balcao com uma adquirente (Stone Crt): sem bandeira o "Fechar a venda" fica
#     desabilitado; 3x no Elo de R$ 100,00 com 4,5%: líquido R$ 95,50
#   3x no Visa/Master de R$ 300,00 com 3,5%: taxa de R$ 10,50
#   o detalhe, o recibo e o "Cartões a receber" mostram bandeira e adquirente
#   Configurações: criar adquirente, criar taxa (Cielo Crt, Hipercard, débito),
#     a sobreposicao e recusada no campo "Vale a partir de", nova vigência encerra
#     a antiga na véspera, "em uso" nas linhas da Stone Crt, arquivar a Rede Crt
#   balcao com duas adquirentes: aparece o seletor; sem taxa para Amex no parcelado
#
# cenario: scripts/_cenario-emporio-cartoes.ts
# sessao: owner owner@damata.com.br


def tem(texto, n=40000):
    # O dinheiro sai com espaco nao separavel entre "R$" e o valor.
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def por_aria(aria, valor):
    return js("(() => { const el = Array.from(document.querySelectorAll('input')).find(x => x.getAttribute('aria-label') === " + repr(aria) + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


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


def fechar_desabilitado():
    return js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === 'Fechar a venda'); return b ? b.disabled : null; })()")


def resumo():
    return (js("(() => { const s = document.querySelector('[role=status]'); return s ? s.innerText.replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ') : ''; })()") or "")


def clicar_no_bloco(texto_do_bloco, rotulo):
    """Clica no botao `rotulo` dentro do menor bloco que contem `texto_do_bloco`."""
    return bool(js("(() => { const cands = Array.from(document.querySelectorAll('main *')).filter(el => el.innerText && el.innerText.includes(" + repr(texto_do_bloco) + ") && Array.from(el.querySelectorAll('button')).some(b => b.innerText.trim() === " + repr(rotulo) + ")); cands.sort((a, b) => a.innerText.length - b.innerText.length); const c = cands[0]; if (!c) return false; Array.from(c.querySelectorAll('button')).find(b => b.innerText.trim() === " + repr(rotulo) + ").click(); return true; })()"))


def vendas_da_loja(loja_id):
    return api("GET", "/api/v1/emporio/sales?establishment_id=" + loja_id)["body"]["data"]


def taxas(loja_id):
    return api("GET", "/api/v1/emporio/card-fee-rates?establishment_id=" + loja_id + "&incluir_encerradas=1")["body"]["data"]


def abrir_balcao_com_racao(qtd):
    ir("/emporio/vender")
    ok = escolher("Loja", "Crt Loja") is True and buscar_e_adicionar("Crt Ração")
    por_aria("Quantidade do item 1", str(qtd))
    time.sleep(0.5)
    return ok


def vender_parcelado(qtd, bandeira, parcelas):
    """Venda de `qtd` kg (R$ 20,00 o kg) no parcelado, ate fechar. Devolve o id da venda nova."""
    antes = {v["id"] for v in vendas_da_loja(loja["id"])}
    abrir_balcao_com_racao(qtd)
    clicar("+ Parcelado")
    time.sleep(0.8)
    escolher_por_id("parcelas-", str(parcelas) + "x")
    clicar(bandeira)
    time.sleep(0.8)
    escolher_cliente("Consumidor final")
    fechar_venda()
    esperar(lambda: "Parcelado" in resumo(), 90)
    novas = [v["id"] for v in vendas_da_loja(loja["id"]) if v["id"] not in antes]
    return novas[0] if len(novas) == 1 else None


passo("0. O cenário: a Stone Crt com quatro taxas, a Rede Crt sem nenhuma")
entrar("owner")
ir("/emporio")
loja = [l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"] == "Crt Loja"][0]
confere("quatro taxas da loja", len(taxas(loja["id"])) == 4, len(taxas(loja["id"])))
# A primeira visita a uma rota compila no next dev e pode recarregar a pagina no meio do
# passo (a venda sumia da tela). Compila as rotas do roteiro antes, por fetch.
for rota in ["/emporio/vender", "/emporio/caixa", "/emporio/configuracoes", "/emporio/financeiro/receber", "/emporio/vendas/x", "/emporio/imprimir/venda/x"]:
    js("fetch(" + repr(rota) + ").then(r => r.status)")
time.sleep(2)

passo("1. O Caixa não tem mais o bloco de taxas")
ir("/emporio/caixa")
confere("o Caixa abre", tem("A receber do cartão"))
confere("sem a seção 'Taxas de cartão'", not tem("Taxas de cartão"))
confere("sem o botão 'Nova taxa'", not clicar("Nova taxa"))
confere("a linha aponta Configurações", tem("As taxas de cartão agora ficam em Configurações"))
confere("o link leva a #cartoes", js("Array.from(document.querySelectorAll('main a')).some(a => (a.getAttribute('href') || '').includes('/emporio/configuracoes#cartoes'))") is True)

passo("2. Balcão com uma adquirente: sem bandeira não fecha")
abrir_balcao_com_racao(5)
clicar("+ Parcelado")
esperar(lambda: tem("Adquirente: Stone Crt"), 30)
confere("a adquirente única aparece como texto", tem("Adquirente: Stone Crt"))
confere("as bandeiras aparecem sem nenhuma marcada", js("Array.from(document.querySelectorAll('button[aria-pressed]')).filter(b => ['Visa/Master','Elo','Hipercard','Amex','Outra'].includes(b.innerText.trim())).every(b => b.getAttribute('aria-pressed') === 'false')") is True)
confere("pede a bandeira para mostrar a taxa", tem("Escolha a bandeira para ver a taxa"))
escolher_cliente("Consumidor final")
confere("Fechar a venda desabilitado sem bandeira", fechar_desabilitado() is True, fechar_desabilitado())
escolher_por_id("parcelas-", "3x")
clicar("Elo")
time.sleep(1)
confere("prévia: taxa 4,5%, líquido R$ 95,50", tem("Taxa 4,5") and tem("R$ 95,50"), texto_principal(900))
confere("com a bandeira, Fechar a venda habilita", fechar_desabilitado() is False, fechar_desabilitado())
clicar("Amex")
time.sleep(1)
confere("Amex no parcelado: sem taxa, aponta Configurações", tem("Sem taxa para Amex") and tem("cadastre em Configurações"), texto_principal(900))
confere("sem taxa a venda não fecha", fechar_desabilitado() is True, fechar_desabilitado())

passo("3. Duas vendas no cartão: Elo 3x de R$ 100,00 e Visa/Master 3x de R$ 300,00")
venda_elo = vender_parcelado(5, "Elo", 3)
confere("venda no Elo registrada", venda_elo is not None)
venda_visa = vender_parcelado(15, "Visa/Master", 3)
confere("venda no Visa/Master registrada", venda_visa is not None)
if venda_elo and venda_visa:
    elo = api("GET", "/api/v1/emporio/sales/" + venda_elo)["body"]["data"]["payments"][0]
    visa = api("GET", "/api/v1/emporio/sales/" + venda_visa)["body"]["data"]["payments"][0]
    confere("Elo: bandeira, taxa 4,5% e R$ 4,50", elo.get("brand") == "elo" and elo.get("fee_pct") == 4.5 and elo.get("fee_amount") == 4.5, elo)
    confere("Visa/Master: taxa 3,5% e R$ 10,50", visa.get("brand") == "visa_master" and visa.get("fee_pct") == 3.5 and visa.get("fee_amount") == 10.5, visa)

passo("4. Detalhe, recibo e Cartões a receber")
if venda_visa and venda_elo:
    ir("/emporio/vendas/" + venda_visa)
    confere("detalhe: Visa/Master, Stone Crt, 3x, taxa 3,5% (R$ 10,50)", tem("Visa/Master, Stone Crt, 3x, taxa 3,5% (R$ 10,50)"), texto_principal(1500))
    ir("/emporio/imprimir/venda/" + venda_elo)
    p = texto_da_pagina()
    confere("recibo: a linha do cartão traz Elo e Stone Crt", "Elo" in p and "Stone Crt" in p, p[:600])
    ir("/emporio/financeiro/receber?loja=" + loja["id"])
    # O innerText devolve o cabeçalho já com o uppercase (atrito 7 do cofre): compara sem caixa.
    cabecalhos = [x.lower() for x in (js("Array.from(document.querySelectorAll('main th')).map(th => th.innerText.trim())") or [])]
    confere("Cartões a receber: colunas Bandeira e Adquirente", "bandeira" in cabecalhos and "adquirente" in cabecalhos, cabecalhos)
    confere("as parcelas do Elo e do Visa/Master com a Stone Crt", tem("Elo") and tem("Visa/Master") and tem("Stone Crt") and tem("1/3"), texto_principal(1500))

passo("5. Configurações: a seção, o 'em uso' e arquivar a Rede Crt")
ir("/emporio/configuracoes")
confere("a seção Cartões: adquirentes e taxas", tem("Cartões: adquirentes e taxas"))
confere("as duas adquirentes do cenário", tem("Stone Crt") and tem("Rede Crt"))
confere("as linhas da Stone Crt têm o selo 'em uso' (as duas vendas)", js("Array.from(document.querySelectorAll('main td')).filter(td => td.innerText.includes('em uso')).length") >= 2)
confere("a linha em uso oferece Encerrar, não Remover", clicar_no_bloco("Elo", "Encerrar"))
time.sleep(1)
confere("o diálogo explica que a taxa não se apaga", "não se apaga" in texto_da_pagina(), "")
clicar("Voltar")
time.sleep(1)
confere("arquiva a Rede Crt", clicar_no_bloco("Rede Crt", "Arquivar"))
confere("a Rede Crt fica Arquivada", bool(esperar(lambda: js("Array.from(document.querySelectorAll('main li')).some(li => li.innerText.includes('Rede Crt') && li.innerText.includes('Arquivada'))"), 30)))

passo("6. Configurações: criar adquirente e criar taxa")
confere("abre Nova adquirente", clicar("Nova adquirente"))
time.sleep(1.5)
preencher("Nome", "Cielo Crt")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a Cielo Crt aparece", bool(esperar(lambda: tem("Cielo Crt"), 30)))


def preencher_taxa_cielo(desde):
    confere("abre Nova taxa", clicar("Nova taxa"))
    time.sleep(1.5)
    escolher("Loja", "Crt Loja")
    escolher("Adquirente", "Cielo Crt")
    escolher("Bandeira", "Hipercard")
    escolher("Modalidade", "Débito")
    preencher("Taxa (%)", "1,5")
    preencher("Prazo para cair (dias)", "1")
    escolher("Conta que recebe", "Crt Banco")
    preencher("Vale a partir de", desde)


preencher_taxa_cielo("2026-01-01")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Vale a partir de"))
cielo = lambda: [t for t in taxas(loja["id"]) if t["acquirer_name"] == "Cielo Crt"]
confere("a taxa da Cielo Crt (Hipercard, débito) existe", bool(esperar(lambda: len(cielo()) == 1, 30)), len(cielo()))

passo("7. A mesma combinação, outra data de início: a sobreposição é recusada no campo")
ir("/emporio/configuracoes")
preencher_taxa_cielo("2026-06-01")
enviar_painel()
time.sleep(2)
recusa = esperar(lambda: erro_do_campo("Vale a partir de"), 30)
confere("a recusa aparece embaixo de 'Vale a partir de'", bool(recusa), recusa)
confere("o painel segue aberto", painel_aberto())
confere("nada foi gravado", len(cielo()) == 1, len(cielo()))

passo("8. Nova vigência: a antiga termina na véspera")
ir("/emporio/configuracoes")
confere("abre Nova vigência da Hipercard", clicar_no_bloco("Hipercard", "Nova vigência"))
time.sleep(1.5)
preencher("Taxa (%)", "2,5")
preencher("A partir de", "2027-01-01")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60), erro_do_campo("A partir de"))
confere("duas linhas da Cielo Crt", bool(esperar(lambda: len(cielo()) == 2, 30)), len(cielo()))
antiga = [t for t in cielo() if t["fee_pct"] == 1.5]
nova = [t for t in cielo() if t["fee_pct"] == 2.5]
confere("a antiga termina em 31/12/2026 e a nova começa em 01/01/2027", len(antiga) == 1 and len(nova) == 1 and str(antiga[0]["valid_to"])[:10] == "2026-12-31" and str(nova[0]["valid_from"])[:10] == "2027-01-01" and nova[0]["valid_to"] is None, (antiga, nova))
ir("/emporio/configuracoes")
confere("a tabela mostra as duas vigências", tem("até 31/12/2026") and tem("desde 01/01/2027"))

passo("9. Balcão com duas adquirentes: o seletor aparece")
# A Rede Crt está arquivada e sem taxa; a Cielo Crt tem a Hipercard no débito (1,5% hoje).
abrir_balcao_com_racao(5)
clicar("+ Débito")
time.sleep(1.5)
confere("com duas adquirentes o seletor aparece", not tem("Adquirente: Stone Crt") and tem("Adquirente"), texto_principal(900))
confere("escolhe a Cielo Crt", escolher("Adquirente", "Cielo Crt") is True)
clicar("Hipercard")
time.sleep(1)
confere("prévia da Hipercard na Cielo Crt: taxa 1,5%", tem("Taxa 1,5"), texto_principal(900))
clicar("Elo")
time.sleep(1)
confere("Elo na Cielo Crt: sem taxa, cai no aviso (a Cielo só tem Hipercard)", tem("Sem taxa para Elo, Cielo Crt"), texto_principal(900))
