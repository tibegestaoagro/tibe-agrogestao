# Validacao viva da F5 do Meu Empório (Modulo 39): Meu Dia, Painel,
# Financeiro, primeiros passos e a receita que vira composicao, com um
# usuario da mesma conta FORA da lista do recurso (o aceite "usar TIBE sem
# Meu Empório", Q117).
# docs/specs/module-39-meu-emporio.md, "F5: contrato (Q108 a Q117)".
#
# O cenario libera o recurso so para o Owner e o operador de teste, e monta:
#   compra da "F5 Casa do Adubo" vencida (R$ 300), dois fiados vencidos do
#   "F5 João" (R$ 40 + R$ 60, uma linha so), venda em dinheiro ontem sem
#   conferencia, "F5 Ração" abaixo do minimo, e a conta da fazenda "F5 Diesel".
#
# cenario: scripts/_cenario-emporio-f5.ts
# sessao: owner owner@damata.com.br
# sessao: fora fora-emporio@teste.local


def tem(texto, n=80000):
    # O dinheiro sai com espaco nao separavel entre "R$" e o valor. E o
    # innerText devolve o texto JA com o text-transform: o titulo "Seu
    # Empório" chega como "SEU EMPÓRIO", por isso a comparacao ignora a caixa.
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def dre(area):
    return api("GET", "/api/v1/financial/dre?area=" + area)["body"]["data"]["total_result"]


def produto(nome):
    return next(p for p in api("GET", "/api/v1/emporio/products")["body"]["data"] if p["name"] == nome)


passo("1. Owner: o Empório no Meu Dia, com a loja no título")
entrar("owner")
ir("/meu-dia")
confere("a compra vencida, com a loja", tem("Pagar F5 Casa do Adubo (F5 Loja)"))
confere("os dois fiados do João numa linha só, de R$ 100", tem("Receber de F5 João (fiado, F5 Loja)") and js("document.body.innerText.split('Receber de F5 João').length - 1") == 1)
confere("o caixa de ontem sem conferência", tem("Caixa de ontem da F5 Loja não foi conferido"))
confere("o cartão Seu Empório", tem("Seu Empório") and tem("Vendas de hoje") and tem("Fiado a receber"))
confere("a linha da reposição", tem("precisa de reposição") or tem("precisam de reposição"))
confere("a conta da fazenda continua", tem("F5 Diesel"))
link = js("(() => { const a = Array.from(document.querySelectorAll('a')).find(x => x.innerText.includes('Pagar F5 Casa do Adubo')); return a ? a.getAttribute('href') : null; })()")
confere("o link da conta leva ao Empório, não ao Financeiro", link == "/emporio/compras", link)

passo("2. Owner: o Financeiro tem a área do Empório")
tudo_o, fazenda_o = dre("tudo"), dre("fazenda")
confere("para o Owner, Tudo é diferente de Fazenda (o Empório entra)", abs(tudo_o - fazenda_o) > 0.01, (tudo_o, fazenda_o))

passo("3. Owner: primeiros passos da loja nova")
ir("/emporio")
confere("o cartão Primeiros passos com a F5 Loja", tem("Primeiros passos") and tem("F5 Loja") and tem("Essenciais"))
passos = api("GET", "/api/v1/emporio/first-steps")["body"]["data"]
f5 = next((l for l in passos["establishments"] if l["name"] == "F5 Loja"), None)
feitos = {s["key"]: s["done"] for s in (f5 or {}).get("steps", [])}
confere("preço e estoque feitos, caixa e despesa fixa pendentes", feitos.get("preco") is True and feitos.get("estoque_inicial") is True and feitos.get("saldo_caixa") is False and feitos.get("despesa_fixa") is False, feitos)

passo("4. Owner: a receita da Calculadora vira composição")
ir("/calculadoras/receitas")
confere("escolhe a receita de exemplo", clicar("Racao de terminacao (exemplo do §18)"))
confere("informa a quantidade final", preencher("Quanto voce quer fazer", "100") != "SEM ROTULO")
confere("calcula", clicar("Calcular"))
confere("o botão Criar composição desta receita aparece", esperar(lambda: tem("Criar composição desta receita"), 40))
mistura, milho, farelo, oleo = produto("F5 Mistura"), produto("F5 Milho"), produto("F5 Farelo"), produto("F5 Óleo")
rota = "/api/v1/emporio/products/" + mistura["id"] + "/composition/from-recipe"
corpo = {"reference_qty": 10, "items": [{"component_emporio_product_id": milho["id"], "quantity": 6}, {"component_emporio_product_id": farelo["id"], "quantity": 4}]}
r = api("POST", rota, corpo)
confere("cria a composição da Mistura", r["status"] in (200, 201), r)
r = api("POST", rota, corpo)
confere("de novo, sem replace: 409 COMPOSITION_EXISTS", r["status"] == 409 and r["body"]["error"]["code"] == "COMPOSITION_EXISTS", r)
r = api("POST", rota, {"reference_qty": 10, "replace": True, "items": [{"component_emporio_product_id": oleo["id"], "quantity": 10}]})
confere("componente em litro: 422 no campo items, em português", r["status"] == 422 and r["body"]["error"].get("field") == "items" and "quilo" in r["body"]["error"]["message"], r)

passo("5. Fora da lista: nada do Empório no Meu Dia")
entrar("fora")
ir("/meu-dia")
confere("o Meu Dia abre", tem("Atenção") or tem("Hoje"))
confere("sem a compra, o fiado e o caixa da loja", not tem("F5 Casa do Adubo") and not tem("F5 João") and not tem("F5 Loja"))
confere("sem o cartão Seu Empório e sem a reposição", not tem("Seu Empório") and not tem("reposição"))
confere("a conta da fazenda aparece", tem("F5 Diesel"))

passo("6. Fora da lista: Painel e Financeiro só da fazenda")
ir("/dashboard")
confere("o Painel não mostra conta de loja", not tem("F5 Casa do Adubo") and not tem("(fiado,") and not tem("Caixa de ontem"))
tudo_f, fazenda_f, emporio_f = dre("tudo"), dre("fazenda"), dre("emporio")
confere("o Tudo dele é igual a Fazenda", abs(tudo_f - fazenda_f) < 0.01, (tudo_f, fazenda_f))
confere("pedir Empório também dá Fazenda", abs(emporio_f - fazenda_f) < 0.01, (emporio_f, fazenda_f))
confere("e o Fazenda dele bate com o Fazenda do Owner", abs(fazenda_f - fazenda_o) < 0.01, (fazenda_f, fazenda_o))
ir("/financeiro?area=emporio")
confere("o Financeiro não tem o seletor de área", not js("!!Array.from(document.querySelectorAll('button, [role=combobox]')).find(b => b.getAttribute('aria-label') === 'Área')"))
confere("nem o aviso do Empório", not tem("O seletor de fazenda não se aplica ao Empório."))

passo("7. Fora da lista: Calculadora e Lista sem o Empório")
ir("/calculadoras/receitas")
clicar("Racao de terminacao (exemplo do §18)")
preencher("Quanto voce quer fazer", "100")
clicar("Calcular")
# Sem o resultado na tela o botao nao existe para ninguem, e a ausencia
# abaixo nao provaria nada: o resultado tem que estar la antes.
confere("o resultado da receita aparece", esperar(lambda: tem("Resultado"), 40))
time.sleep(4)
confere("sem o botão da composição", not tem("Criar composição desta receita"))
confere("a API do Empório dá 404", status_api("/api/v1/emporio/first-steps") == 404)
ir("/lista-de-compra")
confere("a Lista abre sem loja do Empório", not tem("F5 Loja"))

passo("8. Owner: o Meu Dia no celular (390 px)")
entrar("owner")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/meu-dia")
largura = js("document.documentElement.scrollWidth")
confere("sem rolagem horizontal", largura is not None and largura <= 390, largura)
ir("/emporio")
largura = js("document.documentElement.scrollWidth")
confere("o início do Empório com os primeiros passos, sem rolagem horizontal", largura is not None and largura <= 390, largura)
cdp("Emulation.clearDeviceMetricsOverride")
