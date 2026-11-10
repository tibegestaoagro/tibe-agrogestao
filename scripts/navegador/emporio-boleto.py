# Validacao viva do boleto na venda e do titular do cheque do Meu Empório
# (Modulo 39, Q278 a Q284): docs/superpowers/specs/2026-11-10-emporio-boleto-e-titular-do-cheque-design.md
#
#   balcao: "+ Boleto" entre "+ Cheque" e "+ Fiado"; venda com dois boletos
#     (R$ 25 com numero, R$ 15 sem) fecha; o detalhe mostra os dois com vencimento
#   cheque: "Em nome de" acompanha o cliente ate ser editado a mao
#   impresso da venda com boleto
#   caixa: a lista Boletos, o filtro Vencidos, "Boleto pago" com conta e data de
#     ontem, "Mandar para o fiado" (recusa sem motivo, depois No fiado)
#   celular (360 px): o balcao com boleto nao rola na horizontal
#
# cenario: scripts/_cenario-emporio-boleto.ts
# sessao: owner owner@example.com

import datetime
import re


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=40000):
    # O dinheiro sai com espaco nao separavel entre "R$" e o valor.
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto in pagina


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def por_aria(aria, valor, indice=0):
    return js("(() => { const els = Array.from(document.querySelectorAll('input')).filter(x => x.getAttribute('aria-label') === " + repr(aria) + "); const el = els[" + str(indice) + "]; if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def por_id(prefixo, valor, indice=0):
    """Campo do pagamento pelo comeco do id, que leva a chave da linha."""
    return js("(() => { const els = Array.from(document.querySelectorAll(" + repr('[id^="' + prefixo + '"]') + ")); const el = els[" + str(indice) + "]; if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def ler_id(prefixo, indice=0):
    return js("(() => { const els = Array.from(document.querySelectorAll(" + repr('[id^="' + prefixo + '"]') + ")); const el = els[" + str(indice) + "]; return el ? el.value : 'SEM CAMPO'; })()")


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


def botoes_de_pagamento():
    return js("Array.from(document.querySelectorAll('main button')).map(b => b.innerText.trim()).filter(t => t.startsWith('+ '))") or []


def clicar_na_linha(texto_da_linha, rotulo):
    """Clica no botao `rotulo` da linha da tabela que contem `texto_da_linha`."""
    return bool(js("(() => { const tr = Array.from(document.querySelectorAll('main tr')).find(r => r.innerText.includes(" + repr(texto_da_linha) + ") && Array.from(r.querySelectorAll('button')).some(b => b.innerText.trim() === " + repr(rotulo) + ")); if (!tr) return false; Array.from(tr.querySelectorAll('button')).find(b => b.innerText.trim() === " + repr(rotulo) + ").click(); return true; })()"))


def linha(texto_da_linha):
    """O texto da linha da tabela de boletos que contem `texto_da_linha` (so as
    linhas do corpo: o filtro e o cabecalho tem as mesmas palavras)."""
    return js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(r => r.innerText.includes(" + repr(texto_da_linha) + ")); return tr ? tr.innerText.replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ') : ''; })()") or ""


def sem_rolagem_horizontal():
    return js("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def brasilia(dias=0):
    return datetime.datetime.utcnow() - datetime.timedelta(hours=3) + datetime.timedelta(days=dias)


def iso(d):
    return d.strftime("%Y-%m-%d")


def br(d):
    return d.strftime("%d/%m/%Y")


def vendas_do(cliente):
    r = api("GET", "/api/v1/emporio/sales")["body"]["data"]
    return [s for s in r if s.get("customer_name") == cliente]


def boletos(situacao):
    return api("GET", "/api/v1/emporio/boletos?status=" + situacao)["body"]["data"]


def abrir_balcao():
    ir("/emporio/vender")
    confere("o balcão abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
    confere("escolhe a Bol Loja", escolher("Loja", "Bol Loja") is True)
    confere("adiciona Bol Ração", esperar(lambda: buscar_e_adicionar("Bol Ração"), 20))


VENC1 = brasilia(10)
VENC2 = brasilia(30)
ONTEM = brasilia(-1)

entrar("owner")
ir("/emporio")
time.sleep(3)
esperar(lambda: api("GET", "/api/v1/emporio/products?q=Bol")["status"] == 200, 90)

passo("1. Balcão: + Boleto entre + Cheque e + Fiado")
abrir_balcao()
formas = botoes_de_pagamento()
confere("existe + Boleto", "+ Boleto" in formas, formas)
confere("+ Boleto fica entre + Cheque e + Fiado", "+ Cheque" in formas and "+ Fiado" in formas and formas.index("+ Cheque") + 1 == formas.index("+ Boleto") == formas.index("+ Fiado") - 1, formas)

passo("2. Venda com dois boletos (R$ 25 com número, R$ 15 sem)")
confere("a quantidade é 2 (R$ 40,00)", por_aria("Quantidade do item 1", "2") is True)
time.sleep(0.5)
confere("adiciona o 1º boleto", clicar("+ Boleto"))
time.sleep(0.8)
confere("adiciona o 2º boleto", clicar("+ Boleto"))
time.sleep(0.8)
confere("valor do 1º boleto", por_aria("Valor em Boleto (R$)", "25", 0) is True)
confere("valor do 2º boleto", por_aria("Valor em Boleto (R$)", "15", 1) is True)
confere("vencimento do 1º", por_id("boleto-vencimento-", iso(VENC1), 0) is True)
confere("vencimento do 2º", por_id("boleto-vencimento-", iso(VENC2), 1) is True)
confere("número do 1º", por_id("boleto-numero-", "BOL-A", 0) is True)
fechar_venda()
time.sleep(1.5)
confere("boleto sem cliente: recusa embaixo de Cliente", bool(esperar(lambda: erro_do_campo("Cliente"), 30)), erro_do_campo("Cliente"))
confere("escolhe a Bol Maria", escolher_cliente("Bol Maria") is True)
fechar_venda()
confere("a venda de R$ 40,00 é registrada", esperar(lambda: "Venda registrada" in texto_principal(300) and "Boleto" in resumo(), 90), resumo()[:300])
vm = [s for s in vendas_do("Bol Maria") if any(p.get("kind") == "boleto" for p in s.get("payments", []))]
confere("a API tem a venda com dois boletos", len(vm) == 1 and len([p for p in vm[0]["payments"] if p["kind"] == "boleto"]) == 2, vm[:1])
venda_boleto = vm[0]["id"] if vm else ""

passo("3. Detalhe da venda com os dois boletos e o vencimento")
ir("/emporio/vendas/" + venda_boleto)
pagina = texto_da_pagina()
confere("mostra Boleto nº BOL-A", "Boleto nº BOL-A" in pagina, pagina[:600])
confere("mostra o vencimento do 1º", ("vence em " + br(VENC1)) in pagina, br(VENC1))
confere("mostra o vencimento do 2º", ("vence em " + br(VENC2)) in pagina, br(VENC2))
confere("os dois estão Em aberto", pagina.count("Em aberto") >= 2, pagina.count("Em aberto"))

passo("4. Impresso da venda com boleto")
ir("/emporio/imprimir/venda/" + venda_boleto + "?formato=a4")
pagina = texto_da_pagina()
confere("o A4 mostra Boleto, vence", "Boleto, vence" in pagina, pagina[:700])
ir("/emporio/imprimir/venda/" + venda_boleto + "?formato=cupom")
pagina = texto_da_pagina()
confere("o cupom mostra Boleto, vence", "Boleto, vence" in pagina, pagina[:700])

passo("5. Cheque: Em nome de acompanha o cliente até ser editado")
abrir_balcao()
confere("a quantidade é 1 (R$ 20,00)", por_aria("Quantidade do item 1", "1") is True)
time.sleep(0.5)
confere("adiciona o cheque", clicar("+ Cheque"))
time.sleep(0.8)
confere("sem cliente, Em nome de vem vazio", ler_id("cheque-titular-") == "", ler_id("cheque-titular-"))
confere("escolhe a Bol Maria", escolher_cliente("Bol Maria") is True)
confere("Em nome de vem com Bol Maria", ler_id("cheque-titular-") == "Bol Maria", ler_id("cheque-titular-"))
confere("trocar o cliente sem editar acompanha: Bol Joao", escolher_cliente("Bol Joao") is True and ler_id("cheque-titular-") == "Bol Joao", ler_id("cheque-titular-"))
confere("edita à mão", por_id("cheque-titular-", "Terceiro Silva") is True)
confere("trocar o cliente mantém o texto editado", escolher_cliente("Bol Maria") is True and ler_id("cheque-titular-") == "Terceiro Silva", ler_id("cheque-titular-"))
por_id("cheque-numero-", "000777")
por_id("cheque-banco-", "Sicoob")
por_id("cheque-bom-para-", iso(brasilia(15)))
fechar_venda()
confere("a venda no cheque é registrada", esperar(lambda: "Venda registrada" in texto_principal(300) and "Cheque" in resumo(), 90), resumo()[:300])
vc = [s for s in vendas_do("Bol Maria") if any(p.get("kind") == "cheque" for p in s.get("payments", []))]
confere("a API tem a venda no cheque", len(vc) == 1, vc[:1])
if vc:
    ir("/emporio/vendas/" + vc[0]["id"])
    pagina = texto_da_pagina()
    confere("o detalhe mostra Em nome de Terceiro Silva", "Em nome de Terceiro Silva" in pagina, pagina[:600])

passo("6. Caixa: seção Boletos, filtro Vencidos")
ir("/emporio/caixa")
confere("a seção Boletos existe", tem("Boletos"), texto_principal(200))
confere("lista os dois boletos da Bol Maria abertos", esperar(lambda: js("Array.from(document.querySelectorAll('main tr')).filter(r => r.innerText.includes('Bol Maria') && r.innerText.includes('R$')).length") >= 2, 20) and tem("BOL-A") and tem("R$ 25,00") and tem("R$ 15,00"), texto_principal(1200))
confere("clica em Vencidos", clicar("Vencidos"))
confere("o Vencidos lista o ATRASO-1 do Bol Atrasado, com o selo Vencido", esperar(lambda: "Vencido" in linha("ATRASO-1") and "Bol Atrasado" in linha("ATRASO-1"), 30), linha("ATRASO-1"))
confere("o Vencidos não lista os da Bol Maria", not tem("BOL-A"))
confere("volta para Abertos", clicar("Abertos"))
confere("os Abertos trazem BOL-A", esperar(lambda: tem("BOL-A"), 30))

passo("7. Boleto pago, com a conta e a data de ontem")
confere("abre Boleto pago do BOL-A", clicar_na_linha("BOL-A", "Boleto pago"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("escolhe a conta Bol Banco", escolher("Conta onde caiu", "Bol Banco") is True)
confere("preenche a data de ontem", preencher("Data do pagamento", iso(ONTEM)) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
pagos = esperar(lambda: [b for b in boletos("pago") if b.get("number") == "BOL-A"], 30) or []
confere("a API tem o BOL-A pago, na data de ontem", len(pagos) == 1 and pagos[0]["paid_on"][:10] == iso(ONTEM) and pagos[0]["status"] == "pago", pagos)
confere("clica em Pagos", clicar("Pagos"))
confere("Pagos mostra BOL-A, Pago, a data de ontem e a conta", esperar(lambda: all(x in linha("BOL-A") for x in ["Pago", br(ONTEM), "Bol Banco"]), 30), linha("BOL-A"))

passo("8. Mandar para o fiado: recusa sem motivo, depois No fiado")
confere("volta para Abertos", clicar("Abertos"))
confere("o outro boleto da Bol Maria segue aberto (R$ 15,00)", esperar(lambda: tem("R$ 15,00") and not tem("BOL-A"), 30), texto_principal(800))
confere("abre Mandar para o fiado", clicar_na_linha("Bol Maria", "Mandar para o fiado"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Motivo"), 20)
confere("sem motivo, a recusa aparece no campo Motivo", "Diga por que o boleto vai para o fiado." in (recusa or ""), recusa)
confere("o painel continua aberto", painel_aberto())
confere("preenche o motivo", preencher("Motivo", "cliente pagou parte no balcão") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
fiado = esperar(lambda: [b for b in boletos("no_fiado") if b.get("customer_name") == "Bol Maria"], 30) or []
confere("a API tem o boleto No fiado, com o motivo", len(fiado) == 1 and fiado[0]["status"] == "no_fiado" and "balcão" in (fiado[0].get("reason") or ""), fiado)
confere("clica em No fiado", clicar("No fiado"))
confere("No fiado mostra a Bol Maria, a situação e o motivo", esperar(lambda: all(x in linha("cliente pagou parte no balcão") for x in ["Bol Maria", "No fiado"]), 30), linha("cliente pagou parte no balcão"))

passo("8b. O detalhe da venda acompanha as duas mudanças")
ir("/emporio/vendas/" + venda_boleto)
pagina = texto_da_pagina()
confere("o 1º boleto aparece Pago, com o dia do pagamento", ("pago em " + br(ONTEM)) in pagina and "Pago" in pagina, pagina[:300])
confere("o 2º aparece No fiado", "No fiado" in pagina, pagina[:300])

passo("9. Celular (360 px): o balcão com boleto não rola na horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=360, height=800, deviceScaleFactor=2, mobile=True)
abrir_balcao()
por_aria("Quantidade do item 1", "1")
time.sleep(0.5)
clicar("+ Boleto")
time.sleep(0.8)
clicar("+ Cheque")
time.sleep(0.8)
confere("o balcão mostra os campos do boleto e do cheque", js("!!document.querySelector('[id^=\"boleto-vencimento-\"]') && !!document.querySelector('[id^=\"cheque-titular-\"]')") is True)
confere("sem rolagem horizontal", sem_rolagem_horizontal(), js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth"))
cdp("Emulation.clearDeviceMetricsOverride")

fim()
