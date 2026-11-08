# Validacao viva da projecao, dos relatorios do dinheiro e do rateio automatico
# do Meu Emporio (entrega 4 do financeiro das lojas, plano 2026-11-08).
#
#   1. O Financeiro grava a area e os funcionarios da Pro Loja 2 pela tela da loja
#      (e apaga a area); o Gestor da Loja 1 recebe 403 ao criar despesa fixa por
#      faturamento pela API.
#   2. O Financeiro cria a despesa fixa "Pro Aluguel" de R$ 1.000,00 por
#      faturamento: a Pro Loja 1 fica com o triplo da Pro Loja 2 (R$ 300,00 e
#      R$ 100,00 no mes anterior) e so o mes corrente nasce; muda para area: a
#      Pro Loja 2 (sem area) fica com zero e a tela avisa.
#   3. A aba Projecao, filtrada na Pro Loja 1: o fiado vencido na semana 1, a conta
#      de R$ 200,00 e o cartao na semana 2, o fiado de daqui a 20 dias na semana
#      3; em 60 dias o cheque aparece na semana 6 e a estimativa da despesa fixa
#      do mes seguinte vem marcada.
#   4. A aba Relatorios: o Pro Devedor nas faixas "Em dia" e "16 a 30", a conta de
#      R$ 200,00 na semana certa e a Pro Banco na posicao por lugar.
#   5. A 390 px: Projecao e Relatorios sem rolagem horizontal.
#
# O banco de dev tem lojas de outros cenarios e da demonstracao: o rateio divide
# entre TODAS as lojas ativas, entao o roteiro confere a proporcao entre as duas
# lojas "Pro " e a soma, nao os R$ 750,00 e R$ 250,00 de uma conta so com elas.
#
# cenario: scripts/_cenario-emporio-financeiro-projecao.ts
# sessao: dono owner@damata.com.br
# sessao: financeiro pro-casa@teste.local
# sessao: gestor pro-gestor@teste.local

import datetime

LOJA1 = "Pro Loja 1"
LOJA2 = "Pro Loja 2"
DEVEDOR = "Pro Devedor"
FORNECEDOR = "Pro Fornecedor"
BANCO = "Pro Banco"
ALUGUEL = "Pro Aluguel"
HOJE = datetime.date.today()

_api_da_lib = api


def api(metodo, caminho_api, corpo=None):
    """A primeira chamada de uma rota compila no next dev, e o HMR pode trocar o
    documento no meio do fetch: espera a pagina assentar e repete."""
    for tentativa in range(5):
        try:
            return _api_da_lib(metodo, caminho_api, corpo)
        except RuntimeError as e:
            if "navigated" not in str(e) or tentativa == 4:
                raise
            time.sleep(8)


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def sem_rolagem(rotulo):
    largura = js("document.documentElement.scrollWidth")
    confere(rotulo + " sem rolagem horizontal", largura is not None and largura <= 390, largura)


def dados(caminho_api):
    return (api("GET", caminho_api)["body"] or {}).get("data")


def lista_da_api(caminho_api):
    d = dados(caminho_api)
    if isinstance(d, dict):
        return d.get("items") or []
    return d or []


def brl(v):
    """O dinheiro como a tela escreve: R$ 1.234,50."""
    s = format(abs(v), ",.2f").replace(",", "#").replace(".", ",").replace("#", ".")
    return ("-" if v < 0 else "") + "R$ " + s


def ddmm(dia):
    return dia.strftime("%d/%m")


def abrir_painel_com(acao):
    """No next dev o clique antes da hidratacao nao abre nada: repete ate o painel abrir."""
    fim_em = time.time() + 90
    while time.time() < fim_em:
        acao()
        if esperar(painel_aberto, 6):
            time.sleep(1)
            return True
        time.sleep(2)
    return False


def botao_da_linha(texto_da_linha, rotulo):
    """Clica no botao `rotulo` da linha da tabela que cita `texto_da_linha`."""
    return bool(js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(texto_da_linha) + ") && Array.from(x.querySelectorAll('button')).some(y => y.innerText.trim() === " + repr(rotulo) + ")); const b = tr && Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def linha_tem(texto_da_linha, valor):
    """A linha da tabela que cita `texto_da_linha` tambem cita `valor`."""
    return bool(js("Array.from(document.querySelectorAll('main tbody tr')).some(x => { const t = x.innerText.replace(/\\u00a0/g, ' '); return t.includes(" + repr(texto_da_linha) + ") && t.includes(" + repr(valor) + "); })"))


def celulas_da_linha(nome):
    """As celulas da linha cuja primeira celula e exatamente `nome` (a do cliente nos relatorios)."""
    return js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.children[0] && x.children[0].innerText.replace(/\\u00a0/g, ' ').trim() === " + repr(nome) + "); return tr ? Array.from(tr.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').trim()) : null; })()") or []


def linha_da_semana(numero):
    """O texto da linha 'Semana N' da projecao."""
    return js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.children[0] && x.children[0].innerText.replace(/\\u00a0/g, ' ').trim().startsWith('Semana " + str(numero) + "')); return tr ? tr.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""


def lojas_do_cenario():
    lojas = lista_da_api("/api/v1/emporio/establishments")
    return {l["name"]: l for l in lojas if l.get("name") in (LOJA1, LOJA2)}


def modelo(nome):
    return next((d for d in lista_da_api("/api/v1/emporio/fixed-expenses") if d.get("name") == nome), None)


def parte(m, loja):
    return float(next((s["value"] for s in (m or {}).get("splits", []) if s.get("establishment_name") == loja), -1))


def mes_corrente():
    return HOJE.strftime("%Y-%m")


# --- 1 ---------------------------------------------------------------------------------
passo("1. O Financeiro grava a area e os funcionarios da Pro Loja 2; o Gestor recebe 403 no rateio automatico")
entrar("financeiro")
ir("/emporio/estabelecimentos")
lojas = lojas_do_cenario()
confere("o Financeiro ve as duas lojas Pro pela API", set(lojas) == {LOJA1, LOJA2}, list(lojas))
loja1_id = (lojas.get(LOJA1) or {}).get("id", "")
loja2_id = (lojas.get(LOJA2) or {}).get("id", "")
confere("a Pro Loja 2 nasce sem area e com 1 funcionario", lojas.get(LOJA2, {}).get("area_m2") is None and lojas.get(LOJA2, {}).get("employees_count") == 1, lojas.get(LOJA2))
confere("a Pro Loja 1 nasce com 80 m2 e 3 funcionarios", float(lojas.get(LOJA1, {}).get("area_m2") or 0) == 80 and lojas.get(LOJA1, {}).get("employees_count") == 3, lojas.get(LOJA1))
confere("a lista de lojas mostra a Pro Loja 2", esperar(lambda: tem(LOJA2), 60), texto_principal(400))
abre = abrir_painel_com(lambda: botao_da_linha(LOJA2, "Editar"))
confere("o painel Editar estabelecimento abre", abre)
painel = js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""
confere("o painel tem os campos Area (m2) e Funcionarios", "Área (m²)" in painel and "Funcionários" in painel, painel[:300])
confere("preenche a area com 40", preencher("Área (m²)", "40") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche os funcionarios com 2", preencher("Funcionários", "2") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou (loja gravada)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Área (m²)") or erro_do_campo("Funcionários"))
l2 = lojas_do_cenario().get(LOJA2, {})
confere("a API guarda 40 m2 e 2 funcionarios na Pro Loja 2", esperar(lambda: float(lojas_do_cenario().get(LOJA2, {}).get("area_m2") or 0) == 40, 30) and l2.get("employees_count") in (1, 2), lojas_do_cenario().get(LOJA2))
confere("a API guarda 2 funcionarios", lojas_do_cenario().get(LOJA2, {}).get("employees_count") == 2, lojas_do_cenario().get(LOJA2))
ir("/emporio/estabelecimentos")
esperar(lambda: tem(LOJA2), 60)
abre = abrir_painel_com(lambda: botao_da_linha(LOJA2, "Editar"))
confere("o painel abre de novo", abre)
confere("a area aparece preenchida", "40" in (js("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.trim() === 'Área (m²)'); const el = l && document.getElementById(l.htmlFor); return el ? el.value : ''; })()") or ""))
confere("apaga a area", preencher("Área (m²)", "") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou (area apagada)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Área (m²)"))
confere("a API volta a ter a Pro Loja 2 sem area e com 2 funcionarios", esperar(lambda: lojas_do_cenario().get(LOJA2, {}).get("area_m2") is None, 30) and lojas_do_cenario().get(LOJA2, {}).get("employees_count") == 2, lojas_do_cenario().get(LOJA2))

entrar("gestor")
ir("/emporio")
corpo_gestor = {"name": "Pro Tentativa do Gestor", "amount": 10, "due_day": 10, "split_kind": "faturamento", "splits": []}
r = api("POST", "/api/v1/emporio/fixed-expenses", corpo_gestor)
confere("o Gestor da Loja 1 recebe 403 no rateio por faturamento", r["status"] == 403, r)
confere("a recusa e CRITERIO_SEM_LOJAS, no campo split_kind", ((r["body"] or {}).get("error") or {}).get("code") == "CRITERIO_SEM_LOJAS" and ((r["body"] or {}).get("error") or {}).get("field") == "split_kind", r["body"])
r = api("GET", "/api/v1/emporio/finance/projection?days=30")
confere("o Gestor tambem nao le a projecao (403)", r["status"] == 403, r)

# --- 2 ---------------------------------------------------------------------------------
passo("2. O Financeiro cria a despesa por faturamento (3 para 1), troca para area (a Loja 2 fica com zero)")
entrar("financeiro")
ir("/emporio/despesas")
confere("a tela Despesas abre com Nova despesa fixa", esperar(lambda: tem("Nova despesa fixa"), 60), texto_principal(400))
vencimento = HOJE + datetime.timedelta(days=16)
dia_do_aluguel = vencimento.day if vencimento.month == HOJE.month else 28
abre = abrir_painel_com(lambda: clicar("Nova despesa fixa"))
confere("o painel Nova despesa fixa abre", abre)
confere("preenche o nome", preencher("Nome", ALUGUEL) not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o valor", preencher("Valor por mês", "1000,00") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o dia do vencimento", preencher("Dia do vencimento", str(dia_do_aluguel)) not in ("SEM ROTULO", "SEM CAMPO"))
confere("escolhe Proporcional ao faturamento", escolher("Dividir entre as lojas", "Proporcional ao faturamento") is True)
painel = js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""
confere("o painel diz a base: faturamento do mes anterior", "Base: faturamento do mês anterior" in painel, painel[-500:])
confere("o painel nao pede a parte de cada loja", "Parte de cada loja" not in painel, painel[-500:])
enviar_painel()
confere("o painel fechou (despesa gravada)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Nome") or erro_do_campo("Valor por mês") or erro_do_campo("Dia do vencimento"))
m = esperar(lambda: modelo(ALUGUEL), 30)
confere("a API tem a despesa Pro Aluguel por faturamento", bool(m) and m.get("split_kind") == "faturamento", m)
p1, p2 = parte(m, LOJA1), parte(m, LOJA2)
soma = round(sum(float(s["value"]) for s in (m or {}).get("splits", [])), 2)
confere("as partes somam R$ 1.000,00 entre todas as lojas", soma == 1000.0, soma)
confere("a Pro Loja 1 fica com o triplo da Pro Loja 2 (300 contra 100 no mes anterior)", p2 > 0 and abs(p1 - 3 * p2) <= 0.05, [p1, p2])
confere("so o mes corrente nasceu", (m or {}).get("generated_until") == mes_corrente() and (m or {}).get("months_ahead") == 1, [(m or {}).get("generated_until"), (m or {}).get("months_ahead")])
confere("a lista mostra a parte da Pro Loja 1", esperar(lambda: linha_tem(ALUGUEL, LOJA1 + ": " + brl(p1)), 40), texto_principal(600))
confere("a lista mostra a parte da Pro Loja 2", linha_tem(ALUGUEL, LOJA2 + ": " + brl(p2)))
confere("a lista rotula o criterio", linha_tem(ALUGUEL, "Proporcional ao faturamento"))

abre = abrir_painel_com(lambda: botao_da_linha(ALUGUEL, "Editar"))
confere("o painel Editar despesa fixa abre", abre)
painel = js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""
confere("o painel mostra a Parte do mes com a base", "Parte do mês" in painel and "Faturamento de" in painel, painel[-600:])
confere("troca para Por area (m2)", escolher("Dividir entre as lojas", "Por área (m²)") is True)
enviar_painel()
confere("o painel fechou (critério trocado)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Dividir entre as lojas"))
m = esperar(lambda: (lambda x: x if x and x.get("split_kind") == "area" else None)(modelo(ALUGUEL)), 30)
confere("a API tem o criterio por area", bool(m), m)
p1, p2 = parte(m, LOJA1), parte(m, LOJA2)
soma = round(sum(float(s["value"]) for s in (m or {}).get("splits", [])), 2)
confere("a Pro Loja 2, sem area, fica com zero", p2 == 0, [p1, p2])
confere("a Pro Loja 1 (80 m2) fica com a maior parte e a soma fecha R$ 1.000,00", p1 > 0 and soma == 1000.0, [p1, soma])
avisos = (m or {}).get("avisos") or []
confere("a API avisa que a Pro Loja 2 recebeu zero", any(LOJA2 + " sem área cadastrada: recebeu zero." == a for a in avisos), [a for a in avisos if "Pro" in a])
confere("a lista da tela mostra o aviso da Pro Loja 2", esperar(lambda: linha_tem(ALUGUEL, LOJA2 + " sem área cadastrada: recebeu zero."), 40), texto_principal(800))
confere("a lista rotula Por area (m2)", linha_tem(ALUGUEL, "Por área (m²)"))
confere("ainda so o mes corrente gerado", (m or {}).get("generated_until") == mes_corrente() and (m or {}).get("months_ahead") == 1, [(m or {}).get("generated_until"), (m or {}).get("months_ahead")])

# --- 3 ---------------------------------------------------------------------------------
passo("3. A Projecao na Pro Loja 1: o fiado, a conta, o cartao, e em 60 dias o cheque")
fluxo30 = dados("/api/v1/emporio/finance/projection?establishment_id=" + loja1_id + "&days=30") or {}
semanas = fluxo30.get("weeks") or []
confere("a API devolve 5 semanas em 30 dias", len(semanas) == 5, len(semanas))
if len(semanas) == 5:
    confere("semana 1: o fiado vencido de R$ 80,00", abs(semanas[0]["receivables"]["fiado"] - 80) < 0.005, semanas[0])
    confere("semana 2: a conta de R$ 200,00", abs(semanas[1]["payables"]["entries"] - 200) < 0.005, semanas[1])
    confere("semana 2: o cartao liquido de R$ 98,00", abs(semanas[1]["receivables"]["cards"] - 98) < 0.005, semanas[1])
    confere("semana 3: o fiado de R$ 60,00 que vence em 20 dias", abs(semanas[2]["receivables"]["fiado"] - 60) < 0.005, semanas[2])
    confere("em 30 dias nao entra cheque", all(s["receivables"]["checks"] == 0 for s in semanas), [s["receivables"]["checks"] for s in semanas])
    fecha = round(fluxo30["opening_balance"] + sum(s["net"] for s in semanas), 2)
    confere("o saldo ao fim e a abertura mais o liquido de cada semana", abs(fecha - fluxo30["closing_balance"]) < 0.005, [fecha, fluxo30["closing_balance"]])
confere("a nota diz que a conta bancaria so entra em Todas as lojas", any("Todas as lojas" in n for n in fluxo30.get("notes", [])), fluxo30.get("notes"))
todas = dados("/api/v1/emporio/finance/projection?days=30") or {}
posicoes = dados("/api/v1/emporio/finance/today")["positions"]
confere("sem loja, a abertura e a soma das posicoes de hoje (com a Pro Banco)", abs(todas.get("opening_balance", -1) - round(sum(float(p["balance"]) for p in posicoes), 2)) < 0.005 and any(BANCO in (p.get("name") or "") for p in posicoes), [todas.get("opening_balance")])

ir("/emporio/financeiro/projecao?loja=" + loja1_id + "&dias=30")
confere("a aba Projecao abre", esperar(lambda: tem("Saldo de hoje:") and tem("Semana 1"), 90), texto_principal(500))
confere("a tela mostra o saldo de hoje da API", tem("Saldo de hoje: " + brl(fluxo30["opening_balance"])), [texto_principal(300), brl(fluxo30["opening_balance"])])
confere("a semana 1 mostra o fiado de R$ 80,00", "fiado " + brl(80) in linha_da_semana(1), linha_da_semana(1))
confere("a semana 2 mostra contas de R$ 200,00", "contas " + brl(200) in linha_da_semana(2), linha_da_semana(2))
confere("a semana 2 mostra o cartao de R$ 98,00", "cartão " + brl(98) in linha_da_semana(2), linha_da_semana(2))
confere("a semana 3 mostra o fiado de R$ 60,00", "fiado " + brl(60) in linha_da_semana(3), linha_da_semana(3))
confere("a tela de 30 dias nao mostra o cheque de R$ 70,00", "cheque " + brl(70) not in linha_da_semana(5) and not tem("cheque " + brl(70)))
confere("a nota da conta bancaria aparece", tem("A conta bancária é da rede inteira e só entra em Todas as lojas."))
confere("o botao 60 dias abre a janela de 60", bool(js("(() => { const a = Array.from(document.querySelectorAll('nav[aria-label=\"Janela da projeção\"] a')).find(x => x.innerText.trim() === '60 dias'); if (!a) return false; a.click(); return true; })()")))
confere("a janela de 60 dias tem a semana 9", esperar(lambda: tem("Semana 9"), 90), texto_principal(300))
confere("em 60 dias o cheque de R$ 70,00 aparece na semana 6", esperar(lambda: "cheque " + brl(70) in linha_da_semana(6), 40), linha_da_semana(6))
confere("em 60 dias a estimativa da despesa fixa vem marcada", tem("Despesas fixas dos meses sem conta gerada são estimativa (as automáticas, com a base de hoje).") and tem("estimativa"), texto_principal(300))

# --- 4 ---------------------------------------------------------------------------------
passo("4. Os Relatorios: a receber por idade, a pagar por vencimento e a posicao por lugar")
ir("/emporio/financeiro/relatorios")
confere("a aba Relatorios abre com os tres blocos", esperar(lambda: tem("A receber por idade") and tem("A pagar por vencimento") and tem("Posição de caixa por lugar"), 90), texto_principal(400))
confere("o Pro Devedor aparece no a receber por idade", esperar(lambda: len(celulas_da_linha(DEVEDOR)) == 6, 40), celulas_da_linha(DEVEDOR))
c = celulas_da_linha(DEVEDOR)
if len(c) == 6:
    confere("Em dia: R$ 60,00", c[1] == brl(60), c)
    confere("1 a 15: R$ 0,00", c[2] == brl(0), c)
    confere("16 a 30: R$ 80,00 (venceu ha 20 dias)", c[3] == brl(80), c)
    confere("Mais de 30: R$ 0,00", c[4] == brl(0), c)
    confere("Total: R$ 140,00", c[5] == brl(140), c)
aging = dados("/api/v1/emporio/finance/reports/receivables-aging") or {}
do_devedor = next((x for x in aging.get("customers", []) if x.get("customer_name") == DEVEDOR), {})
confere("a API tem o Pro Devedor com 60 em dia e 80 na faixa 16-30", do_devedor.get("em_dia") == 60 and do_devedor.get("16-30") == 80 and do_devedor.get("total") == 140, do_devedor)

semana_da_conta = "de " + ddmm(HOJE + datetime.timedelta(days=7)) + " a " + ddmm(HOJE + datetime.timedelta(days=13))
confere("a conta de R$ 200,00 do Pro Fornecedor aparece no a pagar", esperar(lambda: linha_tem(FORNECEDOR, brl(200)), 40), texto_principal(600))
confere("na semana de hoje+7 a hoje+13", linha_tem(semana_da_conta, FORNECEDOR + " " + brl(200)), semana_da_conta)
pagar = dados("/api/v1/emporio/finance/reports/payables-by-due") or {}
confere("a API lista a conta de R$ 200,00 do Pro Fornecedor", any(i.get("name") == FORNECEDOR and abs(i.get("total") - 200) < 0.005 for w in pagar.get("weeks", []) for i in w.get("items", [])), [n for n in pagar.get("by_name", []) if FORNECEDOR in n.get("name", "")])

confere("a posicao por lugar lista a Pro Banco como Conta", esperar(lambda: linha_tem(BANCO, "Conta"), 40), texto_principal(300))
posicao = dados("/api/v1/emporio/finance/reports/cash-by-place") or {}
lugar = next((p for p in posicao.get("places", []) if BANCO in (p.get("name") or "")), {})
confere("a API tem a Pro Banco com R$ 5.320,00 (R$ 5.000,00 mais o Pix de R$ 220,00 e R$ 100,00 do mes anterior)", abs(lugar.get("balance", -1) - 5320) < 0.005, lugar)
confere("a tela mostra o saldo da Pro Banco", linha_tem(BANCO, brl(lugar.get("balance", 0))), brl(lugar.get("balance", 0)))

# --- 5 ---------------------------------------------------------------------------------
passo("5. A 390 px: Projecao e Relatorios sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/financeiro/projecao?loja=" + loja1_id + "&dias=60")
esperar(lambda: tem("Semana 6"), 60)
sem_rolagem("A Projecao")
ir("/emporio/financeiro/relatorios")
esperar(lambda: tem("Posição de caixa por lugar"), 60)
sem_rolagem("Os Relatorios")
cdp("Emulation.clearDeviceMetricsOverride")

fim()
