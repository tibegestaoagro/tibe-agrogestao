# Validacao viva da F4a do Meu Empório (Modulo 39): "Vendeu, Pagou", despesa
# fixa e Resultado da Loja.
# docs/specs/module-39-meu-emporio.md, "F4a: contrato (Q96 a Q102)".
#
# Os numeros do cenario, conferidos na tela:
#   vendas 600, custo 300, comissao 30, margem 270 (45%), perdas 20, fixas
#   1.000, resultado -750; ponto de equilibrio R$ 2.222,22, faltando 1.622,22
#   pagar as tres comissoes pela gaveta: a gaveta cai R$ 30
#   pagar o aluguel do mes: o resultado deixa de ser estimado
#   nova despesa fixa de R$ 100: doze contas, uma por mes
#
# cenario: scripts/_cenario-emporio-f4a.ts
# sessao: owner owner@damata.com.br


def tem(texto, n=60000):
    # O dinheiro sai com espaco nao separavel entre "R$" e o valor.
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


def escolher_por_inicio(rotulo, inicio):
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


def marcar_primeira(aria):
    return bool(js("(() => { const c = Array.from(document.querySelectorAll('input[type=checkbox]')).find(x => x.getAttribute('aria-label') === " + repr(aria) + " && !x.checked); if (!c) return false; c.click(); return true; })()"))


def marcar_todas(aria):
    return js("(() => { const cs = Array.from(document.querySelectorAll('input[type=checkbox]')).filter(x => x.getAttribute('aria-label') === " + repr(aria) + " && !x.checked); cs.forEach(c => c.click()); return cs.length; })()")


def resultado(loja_id, mes):
    return api("GET", "/api/v1/emporio/result?establishment_id=" + loja_id + "&month=" + mes)["body"]["data"]


def gaveta(loja_id):
    for g in api("GET", "/api/v1/emporio/cash")["body"]["data"]["drawers"]:
        if g["establishment_id"] == loja_id:
            return g["balance"]
    return None


def contas(nome):
    linhas = api("GET", "/api/v1/emporio/payables")["body"]["data"]
    return [c for c in linhas if c.get("name") == nome or c.get("category") == nome]


passo("0. Achar a loja e o mês do cenário")
entrar("owner")
ir("/emporio")
loja = [l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"] == "F4a Loja"][0]
mes = time.strftime("%Y-%m")
confere("cartões Resultado e Despesas no início", tem("Resultado") and tem("Despesas"))

passo("1. O Resultado da Loja na tela (o mês do cenário)")
ir("/emporio/resultado?loja=" + loja["id"] + "&mes=" + mes)
r = resultado(loja["id"], mes)
confere("a conta do mês pela API: 600, 300, 30, 270, 20, 1.000, -750", (r["sales"], r["cost"], r["variable_expenses"], r["margin"], r["losses"], r["fixed_expenses"], r["result"]) == (600, 300, 30, 270, 20, 1000, -750), r)
confere("a tela mostra vendas, custo, comissão e margem", all(tem(x) for x in ["R$ 600,00", "R$ 300,00", "R$ 30,00", "R$ 270,00"]))
confere("a tela mostra a margem de 45%", tem("45"))
confere("a tela mostra perdas, fixas e o resultado negativo", tem("R$ 20,00") and tem("R$ 1.000,00") and tem("750,00"))
confere("ponto de equilíbrio R$ 2.222,22, faltando R$ 1.622,22", tem("R$ 2.222,22") and tem("Faltam R$ 1.622,22"))
confere("avisa que é estimado, e diz por quê (o aluguel não está pago)", r["estimated"] is True and tem("Este resultado é uma estimativa") and tem("conta fixa do mês ainda não paga"), r.get("estimated_reasons"))
confere("o gráfico do mês aparece", bool(js("!!document.querySelector('main svg.recharts-surface')")))

passo("2. Pagar as três comissões de uma vez, pela gaveta")
antes = gaveta(loja["id"])
ir("/emporio/despesas")
confere("três comissões a pagar de R$ 10,00", len([c for c in contas("F4a Comissão") if c.get("status") == "pending"]) == 3, contas("F4a Comissão"))
confere("marca as três", marcar_todas("Marcar F4a Comissão") == 3)
time.sleep(0.5)
confere("abre Pagar selecionadas (3)", clicar("Pagar selecionadas (3)"))
time.sleep(1.5)
confere("escolhe a gaveta da F4a Loja", escolher_por_inicio("De onde sai o dinheiro", "Gaveta: F4a Loja") is True)
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a gaveta cai R$ 30,00", esperar(lambda: gaveta(loja["id"]) == antes - 30, 30), (antes, gaveta(loja["id"])))
confere("nenhuma comissão pendente", not [c for c in contas("F4a Comissão") if c.get("status") == "pending"])

passo("3. Pagar o aluguel do mês: o resultado deixa de ser estimado")
ir("/emporio/despesas")
confere("marca o primeiro aluguel (o do mês)", marcar_primeira("Marcar F4a Aluguel"))
time.sleep(0.5)
confere("abre Pagar selecionadas (1)", clicar("Pagar selecionadas (1)"))
time.sleep(1.5)
escolher_por_inicio("De onde sai o dinheiro", "Gaveta: F4a Loja")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
r = resultado(loja["id"], mes)
confere("o resultado continua -750 e não é mais estimado", r["result"] == -750 and r["estimated"] is False, (r["result"], r["estimated"], r.get("estimated_reasons")))
confere("a gaveta pagou R$ 1.000,00", gaveta(loja["id"]) == antes - 1030, gaveta(loja["id"]))

passo("4. Nova despesa fixa pela tela: doze contas")
ir("/emporio/despesas")
confere("abre Nova despesa fixa", clicar("Nova despesa fixa"))
time.sleep(1.5)
preencher("Nome", "F4a Internet")
preencher("Valor por mês", "100,00")
preencher("Dia do vencimento", "15")
preencher("F4a Loja", "100")
time.sleep(0.5)
enviar_painel()
fechou = esperar(lambda: not painel_aberto(), 60)
confere("painel fechou", fechou, erro_do_campo("Dia do vencimento") or erro_do_campo("Dividir entre as lojas") or erro_do_campo("Valor por mês"))
confere("doze contas de R$ 100,00 da internet", esperar(lambda: len(contas("F4a Internet")) == 12, 30), len(contas("F4a Internet")))

passo("5. As telas no celular (390 px)")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
for caminho in ["/emporio/resultado?loja=" + loja["id"] + "&mes=" + mes, "/emporio/despesas"]:
    ir(caminho)
    largura = js("document.documentElement.scrollWidth")
    confere("sem rolagem horizontal em " + caminho.split("?")[0], largura is not None and largura <= 390, largura)
cdp("Emulation.clearDeviceMetricsOverride")
