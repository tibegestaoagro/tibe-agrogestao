# Validacao viva de desfazer acordo de fiado e de recalcular o mes do rateio
# automatico do Meu Emporio (Q275 e Q277, plano 2026-11-09).
#
#   1. O Financeiro abre a ficha do Des Livre (acordo sem movimento): ve o botao
#      Desfazer acordo, desfaz com motivo, a ficha lista "Desfeito em dd/mm: motivo"
#      e a Cobranca volta a listar o cliente (a divida voltou). Na ficha do Des Pago
#      (R$ 10,00 pagos na parcela) o botao NAO existe, e a API recusa com 409.
#   2. Na despesa "Des Aluguel" (por funcionarios), a Des Loja 2 ganha funcionarios
#      pela API; as contas do mes ainda tem a parte antiga; o botao Recalcular este
#      mes, com confirmacao, divide de novo: a parte da Des Loja 2 sobe e a soma
#      do mes continua R$ 1.000,00.
#   3. A 390 px: a ficha com o acordo desfeito e a lista de despesas sem rolagem
#      horizontal.
#
# cenario: scripts/_cenario-emporio-acordo-rateio.ts
# sessao: dono owner@example.com
# sessao: financeiro des-casa@teste.local

import datetime
import urllib.parse

LIVRE = "Des Livre"
PAGO = "Des Pago"
LOJA1 = "Des Loja 1"
LOJA2 = "Des Loja 2"
ALUGUEL = "Des Aluguel"
MOTIVO = "Parcelas digitadas erradas"
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


def tem_no_dialogo(texto):
    d = js("(document.querySelector('[role=alertdialog], [role=dialog]') || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in d.lower()


def sem_rolagem(rotulo):
    largura = js("document.documentElement.scrollWidth")
    confere(rotulo + " sem rolagem horizontal", largura is not None and largura <= 390, largura)


def dados(caminho_api):
    return (api("GET", caminho_api)["body"] or {}).get("data")


def lista_da_api(caminho_api):
    d = dados(caminho_api)
    if isinstance(d, dict):
        return d.get("items") or d.get("customers") or []
    return d or []


def id_do_cliente(nome):
    c = next((x for x in lista_da_api("/api/v1/emporio/customers?q=" + urllib.parse.quote(nome)) if x.get("name") == nome), None)
    return (c or {}).get("id", "")


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


def botao_existe(rotulo, raiz="main"):
    return bool(js("Array.from(document.querySelectorAll(" + repr(raiz) + " + ' button')).some(x => x.innerText.trim() === " + repr(rotulo) + ")"))


def botao_da_linha(texto_da_linha, rotulo):
    return bool(js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(texto_da_linha) + ") && Array.from(x.querySelectorAll('button')).some(y => y.innerText.trim() === " + repr(rotulo) + ")); const b = tr && Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def modelo(nome):
    return next((d for d in lista_da_api("/api/v1/emporio/fixed-expenses") if d.get("name") == nome), None)


def partes_do_mes():
    """As contas do mes corrente do Des Aluguel, por loja: {nome da loja: valor}."""
    itens = lista_da_api("/api/v1/emporio/payables?status=pending&limit=500")
    m = modelo(ALUGUEL)
    saida = {}
    for c in itens:
        if c.get("origin") == "despesa_fixa" and c.get("template_id") == (m or {}).get("id") and (c.get("period") or "")[:7] == HOJE.strftime("%Y-%m"):
            saida[c.get("establishment_name")] = float(c.get("amount"))
    return saida


# --- 1 ---------------------------------------------------------------------------------
passo("1. Desfazer o acordo do Des Livre pela ficha; o do Des Pago nao se desfaz")
entrar("financeiro")
ir("/emporio")
livre_id = id_do_cliente(LIVRE)
pago_id = id_do_cliente(PAGO)
confere("acha o Des Livre pela API", bool(livre_id), livre_id)
confere("acha o Des Pago pela API", bool(pago_id), pago_id)

cobranca = lista_da_api("/api/v1/emporio/finance/collections")
confere("com o acordo, a Cobranca nao lista o Des Livre", not any(c.get("customer_name") == LIVRE for c in cobranca), [c.get("customer_name") for c in cobranca])

ir("/emporio/clientes/" + pago_id)
confere("a ficha do Des Pago mostra o acordo", esperar(lambda: tem("Acordo de ") and tem("R$ 60,00"), 60), texto_principal(600))
confere("a ficha do Des Pago NAO tem o botao Desfazer acordo", not botao_existe("Desfazer acordo"), texto_principal(600))
acordos_pago = dados("/api/v1/emporio/customers/" + pago_id + "/agreements") or []
if isinstance(acordos_pago, dict):
    acordos_pago = acordos_pago.get("items") or []
confere("a API diz que o acordo do Des Pago nao pode ser desfeito", bool(acordos_pago) and acordos_pago[0].get("can_undo") is False, acordos_pago[:1])
r = api("POST", "/api/v1/emporio/customers/" + pago_id + "/agreements/" + (acordos_pago[0]["id"] if acordos_pago else "x") + "/undo", {"reason": "teste"})
confere("desfazer o acordo do Des Pago pela API devolve 409", r["status"] == 409, r)

ir("/emporio/clientes/" + livre_id)
confere("a ficha do Des Livre mostra o acordo de R$ 130,00 ativo", esperar(lambda: tem("Acordo de ") and tem("R$ 130,00") and tem("Ativo"), 60), texto_principal(800))
confere("a ficha do Des Livre tem o botao Desfazer acordo", esperar(lambda: botao_existe("Desfazer acordo"), 30), texto_principal(600))
abre = abrir_painel_com(lambda: clicar("Desfazer acordo"))
confere("o painel Desfazer acordo abre", abre)
enviar_painel()
confere("sem motivo o painel fica aberto e o campo recusa", esperar(lambda: bool(erro_do_campo("Motivo")), 20) and painel_aberto(), erro_do_campo("Motivo"))
confere("preenche o motivo", preencher("Motivo", MOTIVO) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou (acordo desfeito)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Motivo"))
confere("a ficha lista 'Desfeito em dd/mm: motivo'", esperar(lambda: tem("Desfeito em " + HOJE.strftime("%d/%m") + ": " + MOTIVO), 40), texto_principal(1000))
confere("a ficha nao tem mais o botao Desfazer acordo", not botao_existe("Desfazer acordo"), texto_principal(600))
cobranca = lista_da_api("/api/v1/emporio/finance/collections")
confere("a divida voltou: a Cobranca lista o Des Livre", any(c.get("customer_name") == LIVRE for c in cobranca), [c.get("customer_name") for c in cobranca])
ir("/emporio/financeiro/cobranca")
confere("a tela da Cobranca cita o Des Livre", esperar(lambda: tem(LIVRE), 40), texto_principal(500))

# --- 2 ---------------------------------------------------------------------------------
passo("2. Recalcular o mes do Des Aluguel depois que a Des Loja 2 ganha funcionarios")
m = modelo(ALUGUEL)
confere("a API tem o Des Aluguel por funcionarios", bool(m) and m.get("split_kind") == "funcionarios", m)
antes = partes_do_mes()
confere("o mes corrente tem conta para a Des Loja 1 e a Des Loja 2", LOJA1 in antes and LOJA2 in antes, antes)
soma_antes = round(sum(antes.values()), 2)
confere("as contas do mes somam R$ 1.000,00", soma_antes == 1000.0, soma_antes)

lojas = {l["name"]: l for l in lista_da_api("/api/v1/emporio/establishments") if l.get("name") in (LOJA1, LOJA2)}
r = api("PATCH", "/api/v1/emporio/establishments/" + lojas[LOJA2]["id"], {"employees_count": 9})
confere("a Des Loja 2 passa a ter 9 funcionarios", r["status"] == 200, r)
confere("antes de recalcular, as contas do mes seguem com a parte antiga", partes_do_mes().get(LOJA2) == antes.get(LOJA2), [partes_do_mes().get(LOJA2), antes.get(LOJA2)])

ir("/emporio/despesas")
confere("a tela Despesas lista o Des Aluguel", esperar(lambda: tem(ALUGUEL), 60), texto_principal(500))
confere("o Des Aluguel tem o botao Recalcular este mes", esperar(lambda: botao_da_linha(ALUGUEL, "Recalcular este mês"), 30), texto_principal(500))
confere("a confirmacao abre com a frase da regra", esperar(lambda: tem_no_dialogo("Divide de novo o valor do mês entre as lojas de hoje"), 20), js("(document.querySelector('[role=alertdialog], [role=dialog]') || { innerText: '' }).innerText"))
js("(() => { const d = document.querySelector('[role=alertdialog], [role=dialog]'); const b = d && Array.from(d.querySelectorAll('button')).find(x => x.innerText.trim() === 'Recalcular este mês'); if (b) b.click(); })()")
depois = esperar(lambda: (lambda p: p if p.get(LOJA2) and p.get(LOJA2) != antes.get(LOJA2) else None)(partes_do_mes()), 60) or partes_do_mes()
confere("a parte da Des Loja 2 subiu", depois.get(LOJA2, 0) > antes.get(LOJA2, 0), [antes.get(LOJA2), depois.get(LOJA2)])
confere("a parte da Des Loja 1 caiu", depois.get(LOJA1, 0) < antes.get(LOJA1, 0), [antes.get(LOJA1), depois.get(LOJA1)])
confere("as contas do mes continuam somando R$ 1.000,00 (sem duplicar)", round(sum(depois.values()), 2) == 1000.0, depois)

# --- 3 ---------------------------------------------------------------------------------
passo("3. A 390 px: a ficha com o acordo desfeito e as despesas sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/clientes/" + livre_id)
esperar(lambda: tem("Desfeito em "), 60)
sem_rolagem("A ficha com o acordo desfeito")
ir("/emporio/despesas")
esperar(lambda: tem(ALUGUEL), 60)
sem_rolagem("As despesas")
cdp("Emulation.clearDeviceMetricsOverride")

fim()
