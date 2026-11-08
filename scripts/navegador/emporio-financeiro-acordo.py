# Validacao viva do acordo de fiado, da alcada de pagamento e do carimbo do Meu
# Emporio (entrega 3 do financeiro das lojas, plano 2026-11-08).
#
#   1. O Gerente geral e o Gestor recebem 403 ao fazer acordo pela API; o Financeiro
#      faz o acordo de R$ 130,00 em 2 parcelas na ficha do Aco Devedor; a Cobranca
#      deixa de listar o cliente e a ficha mostra o acordo.
#   2. O Caixa vende fiado ao Aco Devedor (desbloqueado pelo acordo) e e recusado
#      no Aco Atrasado, cuja parcela de acordo venceu ha 20 dias.
#   3. O Financeiro paga a conta de R$ 300,00 (direto) e a de R$ 900,00 (acima do
#      teto de R$ 500,00: fica esperando aprovacao); a aba Aprovacoes lista; o
#      Financeiro nao decide; o Dono aprova e a conta some de A pagar; o Dono
#      recusa o segundo pedido (R$ 700,00) com motivo.
#   4. No extrato da conta, o Financeiro carimba o movimento do pagamento; o
#      filtro "Só sem carimbo" esconde a linha; o Hoje mostra "Sem carimbo".
#   5. A 390 px: a ficha com o acordo, a aba Aprovacoes e o extrato sem rolagem
#      horizontal.
#
# cenario: scripts/_cenario-emporio-financeiro-acordo.ts
# sessao: dono owner@damata.com.br
# sessao: financeiro aco-casa@teste.local
# sessao: caixa aco-caixa@teste.local
# sessao: gestor aco-gestor@teste.local
# sessao: gerente aco-gerente@teste.local

import datetime
import urllib.parse

LOJA1 = "Aco Loja 1"
DEVEDOR = "Aco Devedor"
ATRASADO = "Aco Atrasado"
RACAO = "Aco Ração"
BANCO = "Aco Banco"
HOJE = datetime.date.today()
SET = "(el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }"

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


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def tem_no_corpo(texto):
    pagina = js("(document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def sem_rolagem(rotulo):
    largura = js("document.documentElement.scrollWidth")
    confere(rotulo + " sem rolagem horizontal", largura is not None and largura <= 390, largura)


def lista_da_api(caminho_api):
    d = (api("GET", caminho_api)["body"] or {}).get("data")
    if isinstance(d, dict):
        return d.get("items") or d.get("customers") or []
    return d or []


def id_do_cliente(nome):
    c = next((x for x in lista_da_api("/api/v1/emporio/customers?q=" + urllib.parse.quote(nome)) if x.get("name") == nome), None)
    return (c or {}).get("id", "")


def vendas_concluidas(cliente_id):
    return len(lista_da_api("/api/v1/emporio/sales?status=concluida&customer_id=" + cliente_id + "&limit=200"))


def preencher_aria(aria, valor):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const el = raiz.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; (" + SET + ")(el, " + repr(valor) + "); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Fechar a venda')); if (b) b.click(); })()")


def campo_existe(rotulo):
    return bool(js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return !!(l && document.getElementById(l.htmlFor)); })()"))


def texto_do_campo(rotulo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText.replace(/\\u00a0/g, ' ') : 'SEM CAMPO'; })()") or ""


def esc():
    cdp("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    cdp("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    time.sleep(1)


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


def escolher_vendedor(nome):
    """Abre o Select do Vendedor, espera as opcoes aparecerem e escolhe a que cita `nome` pelo teclado."""
    gatilho = "(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === 'Vendedor'); return l && document.getElementById(l.htmlFor); })()"
    opcao = "Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.includes(" + repr(nome) + "))"
    for _ in range(4):
        if not js("(() => { const e = " + gatilho + "; if (!e) return false; e.click(); return true; })()"):
            return False
        if esperar(lambda: js("!!(" + opcao + ")"), 8):
            time.sleep(1.5)
            js("(" + opcao + ").focus()")
            cdp("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter", windowsVirtualKeyCode=13)
            cdp("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter", windowsVirtualKeyCode=13)
            time.sleep(1.5)
            if nome in texto_do_campo("Vendedor"):
                return True
        esc()
    return False


def escolher_contendo(rotulo, trecho):
    """Escolhe no Select (Radix) do campo `rotulo` a opcao cujo texto CONTEM `trecho` (o saldo muda o rotulo inteiro)."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    xy = _centro(gatilho)
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.includes(" + repr(trecho) + "))")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def abrir_balcao():
    ir("/emporio/vender")
    confere("o balcao abre", caminho() == "/emporio/vender" and tem("Total da venda"), caminho())
    if campo_existe("Loja") and LOJA1 not in texto_do_campo("Loja"):
        confere("escolhe " + LOJA1, escolher("Loja", LOJA1) is True)


def montar_venda(cliente, quantidade, fiado):
    """Racao, o cliente e o fiado: deixa o balcao pronto para fechar."""
    abrir_balcao()
    confere("busca " + RACAO, preencher_aria("Buscar produto", "Aco Ra") != "SEM CAMPO")
    confere("adiciona " + RACAO, esperar(lambda: clicar_resultado(RACAO), 30))
    confere("a quantidade e " + quantidade, preencher_aria("Quantidade do item 1", quantidade) != "SEM CAMPO")
    confere("escolhe " + cliente, escolher_cliente(cliente) is True)
    time.sleep(2)
    confere("escolhe o vendedor", escolher_vendedor("Aco Gestor"), texto_do_campo("Vendedor"))
    confere("adiciona o fiado", clicar("+ Fiado"))
    time.sleep(1)
    confere("o valor do fiado e " + fiado, preencher_aria("Valor em Fiado (R$)", fiado) != "SEM CAMPO")
    time.sleep(1)


def marcar_conta(valor):
    """Marca a conta a pagar cuja linha cita `valor` (A pagar)."""
    return bool(js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(valor) + ")); const c = tr && tr.querySelector('input[type=checkbox]'); if (!c) return false; if (!c.checked) c.click(); return true; })()"))


def linha_tem(valor):
    return bool(js("Array.from(document.querySelectorAll('main tbody tr')).some(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(valor) + "))"))


def pagar_pela_tela(valor):
    """No A pagar, marca a conta de `valor` e paga da conta Aco Banco."""
    ir("/emporio/financeiro/pagar")
    confere("a conta de " + valor + " esta em A pagar", esperar(lambda: linha_tem(valor), 60), texto_principal(500))
    confere("marca a conta de " + valor, esperar(lambda: marcar_conta(valor), 20))
    abre = abrir_painel_com(lambda: js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Pagar selecionadas')); if (b) b.click(); })()"))
    confere("o painel Pagar contas abre", abre)
    escolhida = escolher_contendo("De onde sai o dinheiro", BANCO)
    confere("escolhe a conta " + BANCO, escolhida is True, escolhida)
    time.sleep(1)
    enviar_painel()
    confere("o painel fechou", esperar(lambda: not painel_aberto(), 60), erro_do_campo("De onde sai o dinheiro") or erro_do_campo("Data do pagamento"))


def pedidos_pendentes():
    return lista_da_api("/api/v1/emporio/finance/payment-requests?status=pendente")


def conta_do_extrato():
    pos = (api("GET", "/api/v1/emporio/finance/today")["body"] or {}).get("data", {}).get("positions", [])
    c = next((p for p in pos if p.get("kind") == "conta" and BANCO in (p.get("name") or "")), {})
    return c.get("id", "")


def periodo():
    de = (HOJE - datetime.timedelta(days=29)).isoformat()
    return de, HOJE.isoformat()


def extrato_da_api(conta, so_sem_carimbo=False):
    de, ate = periodo()
    url = "/api/v1/emporio/finance/statement?kind=conta&id=" + conta + "&de=" + de + "&ate=" + ate + ("&apenas_sem_carimbo=1" if so_sem_carimbo else "")
    return (api("GET", url)["body"] or {}).get("data") or {}


def linha_do_extrato(conta, valor):
    return next((l for l in (extrato_da_api(conta).get("lines") or []) if abs(float(l.get("amount") or 0) - valor) < 0.005 and l.get("direction") == "saida"), None)


def carimbar_linha(valor):
    return bool(js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(valor) + ")); const b = tr && Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === 'Carimbar'); if (!b) return false; b.click(); return true; })()"))


# --- 1 ---------------------------------------------------------------------------------
passo("1. O Financeiro faz o acordo na ficha; o Gerente geral e o Gestor recebem 403")
corpo_falso = {"entry_ids": ["inexistente"], "installments": [{"due_date": (HOJE + datetime.timedelta(days=30)).isoformat(), "amount": 1}]}
entrar("gerente")
ir("/emporio")
devedor_id = id_do_cliente(DEVEDOR)
confere("o Gerente geral acha o Aco Devedor pela API", bool(devedor_id), devedor_id)
r = api("POST", "/api/v1/emporio/customers/" + devedor_id + "/agreements", corpo_falso)
confere("o Gerente geral recebe 403 ao fazer acordo pela API", r["status"] == 403, r)
entrar("gestor")
r = api("POST", "/api/v1/emporio/customers/" + devedor_id + "/agreements", corpo_falso)
confere("o Gestor recebe 403 ao fazer acordo pela API", r["status"] == 403, r)

entrar("financeiro")
cobranca = lista_da_api("/api/v1/emporio/finance/collections")
confere("antes do acordo a Cobranca lista o Aco Devedor", any(c.get("customer_name") == DEVEDOR for c in cobranca), [c.get("customer_name") for c in cobranca])
ir("/emporio/clientes/" + devedor_id)
confere("a ficha mostra a secao Acordos com o botao Fazer acordo", esperar(lambda: tem("Acordos") and tem("Fazer acordo"), 40), texto_principal(600))
abre = abrir_painel_com(lambda: clicar("Fazer acordo"))
confere("o painel Fazer acordo abre", abre)
painel = js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""
confere("o total do acordo e R$ 130,00 (os dois fiados vencidos)", "Total do acordo" in painel and "R$ 130,00" in painel, painel[:600])
confere("define 2 parcelas", preencher("Parcelas", "2") not in ("SEM ROTULO", "SEM CAMPO"))
confere("Montar parcelas", clicar("Montar parcelas"))
confere("as duas parcelas nascem de R$ 65,00", esperar(lambda: preencher_aria("Valor da parcela 2", "65,00") != "SEM CAMPO" and "R$ 130,00 de R$ 130,00" in (js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""), 20), js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText.slice(-500)"))
enviar_painel()
confere("o painel fechou (acordo gravado)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Parcelas do acordo"))
confere("a ficha mostra o acordo de R$ 130,00 ativo", esperar(lambda: tem("Acordo de ") and tem("R$ 130,00") and tem("Ativo"), 40), texto_principal(1500))
confere("a ficha mostra a proxima parcela", tem("Próxima: parcela 1"), texto_principal(1500))
cobranca = lista_da_api("/api/v1/emporio/finance/collections")
confere("depois do acordo a Cobranca nao lista o Aco Devedor", not any(c.get("customer_name") == DEVEDOR for c in cobranca), [c.get("customer_name") for c in cobranca])
ir("/emporio/financeiro/cobranca")
esperar(lambda: tem("Cobrança") or tem("cobrar"), 40)
confere("a tela da Cobranca nao cita o Aco Devedor", DEVEDOR not in texto_do_main(), texto_principal(400))
entrar("gerente")
ir("/emporio/clientes/" + devedor_id)
confere("o Gerente geral ve o acordo na ficha, sem o botao Fazer acordo", esperar(lambda: tem("Acordo de "), 40) and not js("Array.from(document.querySelectorAll('button')).some(x => x.innerText.trim() === 'Fazer acordo')"), texto_principal(400))

# --- 2 ---------------------------------------------------------------------------------
passo("2. O Caixa vende fiado ao Aco Devedor (desbloqueado) e e recusado no Aco Atrasado")
entrar("caixa")
atrasado_id = id_do_cliente(ATRASADO)
confere("o Caixa acha o Aco Atrasado pela API", bool(atrasado_id), atrasado_id)
antes_devedor = vendas_concluidas(devedor_id)
montar_venda(DEVEDOR, "3", "30,00")
enviar_venda()
confere("a venda fiado ao Aco Devedor fecha (Venda registrada)", esperar(lambda: tem("Venda registrada"), 90), texto_principal(300) + " | " + (erro_do_campo("Pagamento") or ""))
confere("a API tem a venda nova do Aco Devedor", esperar(lambda: vendas_concluidas(devedor_id) == antes_devedor + 1, 30), [antes_devedor, vendas_concluidas(devedor_id)])
antes_atrasado = vendas_concluidas(atrasado_id)
montar_venda(ATRASADO, "3", "30,00")
confere("a linha de aviso diz 'Bloqueado: vencido há 20 dias'", esperar(lambda: tem("Bloqueado: vencido há 20 dias"), 60), texto_principal(1200))
enviar_venda()
recusa = esperar(lambda: erro_do_campo("Pagamento"), 60)
confere("a recusa fica no campo Pagamento, com 'vencido há 20 dias'", "vencido há 20 dias" in (recusa or ""), recusa)
confere("a API nao tem venda nova do Aco Atrasado", vendas_concluidas(atrasado_id) == antes_atrasado, [antes_atrasado, vendas_concluidas(atrasado_id)])

# --- 3 ---------------------------------------------------------------------------------
passo("3. O Financeiro paga R$ 300,00 e pede R$ 900,00 (acima do teto); o Dono aprova e recusa")
entrar("financeiro")
r = api("PATCH", "/api/v1/emporio/settings/approval", {"payment_approval_limit": 400})
confere("o Financeiro nao muda a alcada pela API (403)", r["status"] == 403, r)
pagar_pela_tela("R$ 300,00")
confere("a conta de R$ 300,00 saiu de A pagar (paga direto)", esperar(lambda: not linha_tem("R$ 300,00"), 40) and linha_tem("R$ 900,00"), texto_principal(600))
confere("nenhum pedido pendente ainda", len(pedidos_pendentes()) == 0, pedidos_pendentes())
pagar_pela_tela("R$ 900,00")
confere("o aviso diz que ficou esperando aprovacao", esperar(lambda: tem_no_corpo("Ficou esperando aprovação do Dono ou do Gerente geral"), 20), texto_principal(300))
confere("a API lista 1 pedido pendente de R$ 900,00", esperar(lambda: len(pedidos_pendentes()) == 1 and abs(float(pedidos_pendentes()[0].get("total")) - 900) < 0.005, 30), pedidos_pendentes())
ir("/emporio/financeiro/pagar")
confere("a conta de R$ 900,00 continua em A pagar (nao foi paga)", esperar(lambda: linha_tem("R$ 900,00"), 40))
ir("/emporio/financeiro")
confere("o Hoje mostra o cartao Esperando aprovacao", esperar(lambda: tem("Esperando aprovação") and tem("1 pedido de pagamento"), 40), texto_principal(800))
ir("/emporio/financeiro/aprovacoes")
confere("a aba Aprovacoes lista o pedido de R$ 900,00 como Esperando", esperar(lambda: tem("R$ 900,00") and tem("Esperando") and tem("Aco Financeiro pediu"), 40), texto_principal(800))
confere("o Financeiro nao ve Aprovar nem Recusar", not js("Array.from(document.querySelectorAll('main button')).some(x => ['Aprovar', 'Recusar'].includes(x.innerText.trim()))"))
r = api("POST", "/api/v1/emporio/finance/payment-requests/" + pedidos_pendentes()[0]["id"] + "/approve", {})
confere("o Financeiro nao aprova pela API (403)", r["status"] == 403, r)

entrar("dono")
ir("/emporio/financeiro/aprovacoes")
confere("o Dono ve o botao Aprovar", esperar(lambda: js("Array.from(document.querySelectorAll('main button')).some(x => x.innerText.trim() === 'Aprovar')"), 40), texto_principal(500))
clicar("Aprovar")
confere("a confirmacao 'Aprovar e pagar?' abre", esperar(lambda: tem_no_corpo("Aprovar e pagar?"), 20), texto_principal(300))
js("(() => { const d = document.querySelector('[role=alertdialog], [role=dialog]'); const b = d && Array.from(d.querySelectorAll('button')).find(x => x.innerText.trim() === 'Aprovar e pagar'); if (b) b.click(); })()")
confere("o pedido some da fila de espera", esperar(lambda: len(pedidos_pendentes()) == 0, 60), pedidos_pendentes())
confere("a tela mostra 'Nada esperando aprovação'", esperar(lambda: tem("Nada esperando aprovação"), 40), texto_principal(500))
entrar("financeiro")
ir("/emporio/financeiro/pagar")
confere("a conta de R$ 900,00 saiu de A pagar depois de aprovada", esperar(lambda: not linha_tem("R$ 900,00"), 40), texto_principal(600))
pagar_pela_tela("R$ 700,00")
confere("o segundo pedido (R$ 700,00) espera aprovacao", esperar(lambda: len(pedidos_pendentes()) == 1, 30), pedidos_pendentes())
entrar("dono")
ir("/emporio/financeiro/aprovacoes")
abre = abrir_painel_com(lambda: clicar("Recusar"))
confere("o painel Recusar pagamento abre", abre)
confere("preenche o motivo", preencher("Motivo", "Fornecedor vai rever o valor") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou (recusou)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Motivo"))
confere("nenhum pedido pendente depois de recusar", esperar(lambda: len(pedidos_pendentes()) == 0, 40), pedidos_pendentes())
ir("/emporio/financeiro/aprovacoes?status=decididos")
confere("Decididos mostra 'Aprovado' e 'Recusado' com o motivo", esperar(lambda: tem("Aprovado por") and tem("Recusado por") and tem("Motivo: Fornecedor vai rever o valor"), 40), texto_principal(1200))
entrar("financeiro")
ir("/emporio/financeiro/pagar")
confere("a conta recusada de R$ 700,00 continua em A pagar", esperar(lambda: linha_tem("R$ 700,00"), 40), texto_principal(600))

# --- 4 ---------------------------------------------------------------------------------
passo("4. O extrato da conta: carimbar, filtrar Só sem carimbo, o Hoje mostra Sem carimbo")
conta = conta_do_extrato()
confere("o Hoje lista a conta Aco Banco", bool(conta), conta)
extrato = extrato_da_api(conta)
sem_antes = extrato.get("unreconciled_count")
confere("o extrato da API tem linhas sem carimbo", isinstance(sem_antes, int) and sem_antes >= 2, [sem_antes, extrato.get("unreconciled_total")])
ir("/emporio/financeiro/caixa?lugar=conta:" + conta)
confere("o extrato abre com a coluna Carimbo", esperar(lambda: tem("Carimbo") and tem("Sem carimbo no período"), 60), texto_principal(800))
confere("o extrato mostra o pagamento de R$ 300,00", linha_tem("300,00"), texto_principal(1200))
confere("carimba o pagamento de R$ 300,00", esperar(lambda: carimbar_linha("300,00"), 20))
confere("a linha mostra 'Carimbado em dd/mm'", esperar(lambda: tem("Carimbado em " + HOJE.strftime("%d/%m")), 40), texto_principal(1200))
linha = linha_do_extrato(conta, 300)
confere("a API guarda o carimbo no movimento de R$ 300,00", bool(linha and linha.get("reconciled_at")), linha)
depois = extrato_da_api(conta)
confere("o total sem carimbo caiu em uma linha", depois.get("unreconciled_count") == sem_antes - 1, [sem_antes, depois.get("unreconciled_count")])
ir("/emporio/financeiro/caixa?lugar=conta:" + conta + "&carimbo=sem")
confere("o filtro Só sem carimbo esta marcado", esperar(lambda: js("!!document.querySelector('input[name=carimbo]:checked')"), 40), texto_principal(500))
confere("com o filtro, a linha carimbada de R$ 300,00 some", esperar(lambda: tem("Sem carimbo no período") and not linha_tem("300,00"), 40) and linha_tem("900,00"), texto_principal(1200))
ir("/emporio/financeiro")
confere("o Hoje mostra o cartao Sem carimbo", esperar(lambda: tem("Sem carimbo") and tem("da conta sem conferir com o banco"), 40), texto_principal(900))

# --- 5 ---------------------------------------------------------------------------------
passo("5. A 390 px: a ficha com o acordo, as Aprovacoes e o extrato sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/clientes/" + devedor_id)
esperar(lambda: tem("Acordo de "), 60)
sem_rolagem("A ficha com o acordo")
ir("/emporio/financeiro/aprovacoes?status=decididos")
esperar(lambda: tem("Aprovado por"), 60)
sem_rolagem("Aprovacoes")
ir("/emporio/financeiro/caixa?lugar=conta:" + conta)
esperar(lambda: tem("Sem carimbo no período"), 60)
sem_rolagem("O extrato com o carimbo")
cdp("Emulation.clearDeviceMetricsOverride")

fim()
