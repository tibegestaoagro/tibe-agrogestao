# Validacao viva da F4b do Meu Empório (Modulo 39): visao somada, produtos,
# margem negativa e a area no Financeiro.
# docs/specs/module-39-meu-emporio.md, "F4b: contrato (Q103 a Q107)".
#
# Os numeros do cenario, conferidos na tela:
#   Loja 1: resultado -710 (perda de R$ 10 da transferencia, so na origem)
#   Loja 2: resultado -805, e a venda de 1 kg a R$ 5 com margem negativa
#   o somado e a soma das lojas (a conta do seed tem as lojas das outras fases)
#   o aluguel de R$ 2.000 dividido 50/50 entra uma vez
#   no Financeiro, Fazenda + Empório = Tudo
#
# cenario: scripts/_cenario-emporio-f4b.ts
# sessao: owner owner@damata.com.br


def tem(texto, n=80000):
    # O dinheiro sai com espaco nao separavel entre "R$" e o valor.
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


def escolher_por_aria(aria, opcao):
    xy = _centro("Array.from(document.querySelectorAll('button, [role=combobox]')).find(b => b.getAttribute('aria-label') === " + repr(aria) + ")")
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(opcao) + ")")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1.5)
    return True


def resultado(loja, mes):
    return api("GET", "/api/v1/emporio/result?establishment_id=" + loja + "&month=" + mes)["body"]["data"]


def dre(area):
    return api("GET", "/api/v1/financial/dre?area=" + area)["body"]["data"]["total_result"]


passo("0. Achar as lojas do cenário")
entrar("owner")
ir("/emporio")
lojas = {l["name"]: l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"]}
l1, l2 = lojas["F4b Loja 1"], lojas["F4b Loja 2"]
mes = time.strftime("%Y-%m")

passo("1. Cada loja: a diferença da transferência é perda só da origem")
r1, r2 = resultado(l1["id"], mes), resultado(l2["id"], mes)
confere("Loja 1: vendas 600, custo 300, perdas 10, fixas 1.000, resultado -710", (r1["sales"], r1["cost"], r1["losses"], r1["fixed_expenses"], r1["result"]) == (600, 300, 10, 1000, -710), r1["result"])
confere("Loja 2: vendas 405, custo 210, perdas 0, fixas 1.000, resultado -805", (r2["sales"], r2["cost"], r2["losses"], r2["fixed_expenses"], r2["result"]) == (405, 210, 0, 1000, -805), r2["result"])

passo("2. Todas as lojas: o somado é a soma, sem duplicar")
ir("/emporio/resultado?loja=all&mes=" + mes)
todas = resultado("all", mes)
lojas_do_somado = todas.get("stores") or []
soma = round(sum(s["result"] for s in lojas_do_somado), 2)
confere("o resultado somado é a soma das lojas", abs(soma - todas["result"]) < 0.01, (soma, todas["result"]))
confere("as fixas somadas são a soma das partes (o aluguel dividido uma vez)", abs(sum(s["fixed_expenses"] for s in lojas_do_somado) - todas["fixed_expenses"]) < 0.01)
confere("a tela mostra Todas as lojas e a tabela Loja por loja", tem("Todas as lojas") and tem("Loja por loja"))
confere("as duas lojas da F4b aparecem com -710 e -805", tem("F4b Loja 1") and tem("F4b Loja 2") and tem("710,00") and tem("805,00"))

passo("3. Produtos e margem negativa na Loja 2")
ir("/emporio/resultado?loja=" + l2["id"] + "&mes=" + mes)
confere("as duas listas de produtos com a ração", tem("Mais vendem") and tem("Mais dão margem") and tem("F4b Ração"))
confere("a venda de 1 kg a R$ 5 aparece com a causa em português", tem("Preço abaixo do custo") and tem("Ver venda"))
link = js("(() => { const a = Array.from(document.querySelectorAll('a')).find(x => x.innerText.trim() === 'Ver venda'); return a ? a.getAttribute('href') : null; })()")
confere("o link leva à venda", bool(link) and link.startswith("/emporio/vendas/"), link)

passo("4. O Financeiro: Fazenda + Empório = Tudo")
tudo, fazenda, emporio = dre("tudo"), dre("fazenda"), dre("emporio")
confere("o resultado do mês por área fecha: fazenda + empório = tudo", abs((fazenda + emporio) - tudo) < 0.01, (fazenda, emporio, tudo))
ir("/financeiro?area=tudo")
confere("o seletor de área aparece na conta com fazenda e Empório", bool(js("!!Array.from(document.querySelectorAll('button, [role=combobox]')).find(b => b.getAttribute('aria-label') === 'Área')")))
confere("escolhe Empório na tela", escolher_por_aria("Área", "Empório") is True)
confere("a URL passa a ter area=emporio", esperar(lambda: "area=emporio" in (js("location.search") or ""), 30), js("location.search"))
confere("o aviso de que a fazenda não se aplica", esperar(lambda: tem("O seletor de fazenda não se aplica ao Empório."), 30))
ir("/financeiro")
confere("sem area na URL, volta a escolha lembrada (Empório)", esperar(lambda: "area=emporio" in (js("location.search") or ""), 40), js("location.search"))
ir("/financeiro?area=tudo")

passo("5. O Resultado somado no celular (390 px)")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/resultado?loja=all&mes=" + mes)
largura = js("document.documentElement.scrollWidth")
confere("sem rolagem horizontal", largura is not None and largura <= 390, largura)
cdp("Emulation.clearDeviceMetricsOverride")
