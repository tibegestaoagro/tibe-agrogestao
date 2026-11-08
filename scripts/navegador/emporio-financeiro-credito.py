# Validacao viva do credito do fiado do Meu Emporio (entrega 2 do financeiro das
# lojas, plano 2026-11-08): limite, bloqueio por atraso, liberacao do Gestor e
# a cobranca pelo WhatsApp.
#
#   1. O Financeiro muda o limite padrao e a mensagem em Configuracoes; a <dl> reflete.
#   2. O Caixa tenta vender fiado ao Cred Bloqueado: o aviso diz "Bloqueado: vencido
#      ha 20 dias", o servidor recusa no campo Pagamento com o link da ficha, e a
#      venda nao e gravada.
#   3. O Gestor libera o fiado de hoje na ficha, na Loja 1, com o motivo.
#   4. O Caixa fecha a venda (201); a segunda venda fiado e recusada de novo (a
#      liberacao foi gasta); a ficha mostra "Usada na venda".
#   5. Cred Limite: R$ 30,00 passa do limite ("cabem R$ 20,00"); com R$ 20,00 de
#      fiado e R$ 10,00 em dinheiro fecha. O "Vence em" vazio mostra a dica da data.
#   6. A aba Cobranca: o Bloqueado (20 dias) antes do Semtel (10 dias), sem o
#      Cred Limite; o link do WhatsApp tem o telefone e o texto; o Semtel diz
#      "Sem telefone no cadastro".
#   7. O Financeiro cobra o Bloqueado: o painel confirma, abre o WhatsApp (window.open
#      interceptado), a linha mostra "Cobrado" e a ficha mostra a data.
#   8. A 390 px: a aba Cobranca sem rolagem horizontal; o painel de cobrar abre e fecha.
#
# cenario: scripts/_cenario-emporio-financeiro-credito.ts
# sessao: financeiro cred-casa@teste.local
# sessao: caixa cred-caixa@teste.local
# sessao: gestor cred-gestor@teste.local

import datetime
import urllib.parse

LOJA1 = "Cred Loja 1"
BLOQUEADO = "Cred Bloqueado"
LIMITE = "Cred Limite"
SEMTEL = "Cred Semtel"
RACAO = "Cred Ração"
MENSAGEM = "Oi {nome}, o fiado de {valor} venceu há {dias} na {loja}."
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


def clicar_no_card(nome, rotulo):
    return bool(js("(() => { const li = Array.from(document.querySelectorAll('main li')).find(x => x.innerText.includes(" + repr(nome) + ") && !x.querySelector('li')); const b = li && Array.from(li.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def escolher_vendedor(nome):
    """Abre o Select do Vendedor, espera as opcoes aparecerem e toca na que cita `nome`."""
    gatilho = "(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === 'Vendedor'); return l && document.getElementById(l.htmlFor); })()"
    opcao = "Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.includes(" + repr(nome) + "))"
    for _ in range(4):
        # O toque por coordenada cai na barra do total, que flutua sobre o campo: abre pelo clique do elemento.
        if not js("(() => { const e = " + gatilho + "; if (!e) return false; e.click(); return true; })()"):
            return False
        if esperar(lambda: js("!!(" + opcao + ")"), 8):
            time.sleep(1.5)  # a lista anima ao abrir
            # A barra do total flutua sobre a lista e come o toque por coordenada: escolhe pelo teclado.
            js("(" + opcao + ").focus()")
            cdp("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter", windowsVirtualKeyCode=13)
            cdp("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter", windowsVirtualKeyCode=13)
            time.sleep(1.5)
            if nome in texto_do_campo("Vendedor"):
                return True
            print("   vendedor: o Enter nao escolheu, tentando de novo", texto_do_campo("Vendedor"))
        esc()
    return False


def abrir_balcao():
    ir("/emporio/vender")
    confere("o balcao abre", caminho() == "/emporio/vender" and tem("Total da venda"), caminho())
    if campo_existe("Loja") and LOJA1 not in texto_do_campo("Loja"):
        confere("escolhe " + LOJA1, escolher("Loja", LOJA1) is True)


def montar_venda(cliente, quantidade, fiado):
    """Racao, o cliente e o fiado: deixa o balcao pronto para fechar."""
    abrir_balcao()
    confere("busca " + RACAO, preencher_aria("Buscar produto", "Cred Ra") != "SEM CAMPO")
    confere("adiciona " + RACAO, esperar(lambda: clicar_resultado(RACAO), 30))
    confere("a quantidade e " + quantidade, preencher_aria("Quantidade do item 1", quantidade) != "SEM CAMPO")
    confere("escolhe " + cliente, escolher_cliente(cliente) is True)
    # O Caixa escolhe quem atendeu em toda venda.
    time.sleep(2)
    confere("escolhe o vendedor", escolher_vendedor("Cred Gestor"), texto_do_campo("Vendedor"))
    confere("adiciona o fiado", clicar("+ Fiado"))
    time.sleep(1)
    confere("o valor do fiado e " + fiado, preencher_aria("Valor em Fiado (R$)", fiado) != "SEM CAMPO")
    time.sleep(1)


def aviso_do_fiado():
    return texto_do_main()


# --- 1 ---------------------------------------------------------------------------------
passo("1. O Financeiro muda o limite padrao e a mensagem em Configuracoes")
entrar("financeiro")
ir("/emporio/configuracoes")
confere("a secao Fiado mostra os padroes (30 dias, 15 dias, sem limite)", tem("Prazo padrão") and tem("30 dias") and tem("15 dias de atraso") and tem("Sem limite de valor"), texto_principal(300))
abre = abrir_painel_com(lambda: js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Fiado'); const b = h && Array.from(h.parentElement.querySelectorAll('button')).find(x => x.innerText.trim() === 'Mudar'); if (b) b.click(); })()"))
confere("o painel Fiado abre", abre)
confere("preenche o limite padrao", preencher("Limite padrão (R$)", "500,00") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche a mensagem com {nome}", preencher("Mensagem de cobrança", MENSAGEM) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou (gravou)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Limite padrão (R$)"))
confere("a lista mostra o limite padrao de R$ 500,00", esperar(lambda: tem("Limite padrão") and tem("R$ 500,00"), 30), texto_principal(600))
confere("e a mensagem nova", tem("Oi {nome}"), texto_principal(900))

# --- 2 ---------------------------------------------------------------------------------
passo("2. O Caixa tenta fiado ao Cred Bloqueado: aviso, recusa e venda nao gravada")
entrar("caixa")
bloqueado_id = id_do_cliente(BLOQUEADO)
confere("o Caixa acha o Cred Bloqueado pela API", bool(bloqueado_id), bloqueado_id)
antes_bloqueado = vendas_concluidas(bloqueado_id)
montar_venda(BLOQUEADO, "3", "30,00")
confere("a linha de aviso diz 'Bloqueado: vencido há 20 dias'", esperar(lambda: tem("Bloqueado: vencido há 20 dias"), 60), texto_principal(1200))
enviar_venda()
recusa = esperar(lambda: erro_do_campo("Pagamento"), 60)
confere("a recusa fica no campo Pagamento, com 'vencido há 20 dias'", "vencido há 20 dias" in (recusa or ""), recusa)
confere("e o link para a ficha do cliente", tem("Abrir a ficha do cliente para o gestor liberar"), texto_principal(1500))
confere("nenhuma venda foi registrada na tela", not tem("Venda registrada"))
confere("a API nao tem venda nova do cliente", vendas_concluidas(bloqueado_id) == antes_bloqueado, [antes_bloqueado, vendas_concluidas(bloqueado_id)])

# --- 3 ---------------------------------------------------------------------------------
passo("3. O Gestor libera o fiado de hoje na ficha")
entrar("gestor")
ir("/emporio/clientes/" + bloqueado_id)
confere("a ficha mostra o selo Bloqueado", esperar(lambda: tem("Bloqueado: fiado vencido há 20 dias"), 40), texto_principal(500))
abre = abrir_painel_com(lambda: clicar("Liberar fiado hoje"))
confere("o painel Liberar fiado hoje abre", abre)
if campo_existe("Loja") or js("Array.from((document.querySelector('[role=dialog]') || document).querySelectorAll('label')).some(l => l.innerText.replace('*','').trim() === 'Loja')"):
    escolhida = escolher("Loja", LOJA1)
    confere("escolhe a Loja 1 (ou ela ja vem escolhida)", escolhida is True or escolhida == "SEM OPCAO", escolhida)
    if escolhida == "SEM OPCAO":
        esc()
confere("preenche o motivo", preencher("Motivo", "Vai pagar sexta") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou (liberou)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Motivo"))
confere("a ficha mostra a liberacao valida", esperar(lambda: tem("Válida até hoje") and tem("Vai pagar sexta"), 40), texto_principal(1500))

# --- 4 ---------------------------------------------------------------------------------
passo("4. O Caixa fecha a venda; a segunda e recusada; a ficha mostra a liberacao usada")
entrar("caixa")
montar_venda(BLOQUEADO, "3", "30,00")
enviar_venda()
confere("a venda fecha (Venda registrada)", esperar(lambda: tem("Venda registrada"), 90), texto_principal(300) + " | " + (erro_do_campo("Pagamento") or ""))
confere("a API tem a venda nova do cliente (201 gravado)", esperar(lambda: vendas_concluidas(bloqueado_id) == antes_bloqueado + 1, 30), [antes_bloqueado, vendas_concluidas(bloqueado_id)])
montar_venda(BLOQUEADO, "3", "30,00")
enviar_venda()
recusa = esperar(lambda: erro_do_campo("Pagamento"), 60)
confere("a segunda venda fiado e recusada de novo (liberacao consumida)", "vencido há 20 dias" in (recusa or ""), recusa)
confere("e nao foi gravada", vendas_concluidas(bloqueado_id) == antes_bloqueado + 1, vendas_concluidas(bloqueado_id))
entrar("gestor")
ir("/emporio/clientes/" + bloqueado_id)
confere("a ficha mostra a liberacao 'Usada na venda'", esperar(lambda: tem("Usada na venda"), 40), texto_principal(1500))

# --- 5 ---------------------------------------------------------------------------------
passo("5. Cred Limite: passa do limite, cabe o que sobra")
entrar("caixa")
montar_venda(LIMITE, "3", "30,00")
dica = (HOJE + datetime.timedelta(days=30)).strftime("%d/%m/%Y")
confere("o 'Vence em' vazio mostra a dica com a data (30 dias)", esperar(lambda: tem("Sem data, vence em " + dica), 40), texto_principal(1500))
enviar_venda()
recusa = esperar(lambda: erro_do_campo("Pagamento"), 60)
confere("a recusa diz 'cabem R$ 20,00'", "cabem R$ 20,00" in (recusa or "").replace(" ", " "), recusa)
confere("o fiado muda para R$ 20,00", preencher_aria("Valor em Fiado (R$)", "20,00") != "SEM CAMPO")
confere("adiciona dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("R$ 10,00 em dinheiro", preencher_aria("Valor em Dinheiro (R$)", "10,00") != "SEM CAMPO")
time.sleep(1)
enviar_venda()
confere("a venda fecha", esperar(lambda: tem("Venda registrada"), 90), erro_do_campo("Pagamento"))

# --- 6 ---------------------------------------------------------------------------------
passo("6. A aba Cobranca: ordem, sem o Cred Limite, link do WhatsApp, sem telefone")
entrar("financeiro")
ir("/emporio/financeiro/cobranca")
confere("a Cobranca abre com o Cred Bloqueado", esperar(lambda: tem(BLOQUEADO), 60), texto_principal(500))
t = texto_do_main()
confere("o Cred Bloqueado vem antes do Cred Semtel", BLOQUEADO in t and SEMTEL in t and t.index(BLOQUEADO) < t.index(SEMTEL), [t.find(BLOQUEADO), t.find(SEMTEL)])
confere("o Cred Limite nao aparece", LIMITE not in t)
confere("20 dias e R$ 80,00 no Bloqueado", "há 20 dias" in t and "R$ 80,00" in t, t[:800])
confere("10 dias no Semtel", "há 10 dias" in t)
confere("o Semtel diz 'Sem telefone no cadastro'", "Sem telefone no cadastro" in t)
cobranca = lista_da_api("/api/v1/emporio/finance/collections")
linha = next((c for c in cobranca if c.get("customer_name") == BLOQUEADO), {})
url = urllib.parse.unquote(linha.get("whatsapp_url") or "")
confere("o link do WhatsApp do Bloqueado tem wa.me/5534998761234", "wa.me/5534998761234" in url, url)
confere("e o texto cita Cred Bloqueado e R$ 80,00", BLOQUEADO in url and "R$ 80,00" in url, url)

# --- 7 ---------------------------------------------------------------------------------
passo("7. O Financeiro cobra o Bloqueado: confirma, abre o WhatsApp, fica registrado")
abre = abrir_painel_com(lambda: clicar_no_card(BLOQUEADO, "Cobrar no WhatsApp"))
confere("o painel de cobrar abre", abre)
confere("a mensagem pronta cita o cliente", BLOQUEADO in (js("(document.querySelector('[role=dialog] textarea') || { value: '' }).value") or ""))
js("window.__wa = null; window.open = (u) => { window.__wa = u; return null; }")
enviar_painel()
confere("o painel fechou (cobranca registrada)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Mensagem"))
aberta = urllib.parse.unquote(esperar(lambda: js("window.__wa"), 20) or "")
confere("o WhatsApp foi aberto com o telefone e o texto", "wa.me/5534998761234" in aberta and BLOQUEADO in aberta and "R$ 80,00" in aberta, aberta)
confere("a linha mostra 'Cobrado'", esperar(lambda: tem("Cobrado hoje") or tem("Cobrado em"), 30), texto_principal(1200))
ir("/emporio/financeiro/cobranca")
confere("recarregada, a linha mostra 'Cobrado em dd/mm'", esperar(lambda: tem("Cobrado em " + HOJE.strftime("%d/%m")), 60), texto_principal(1200))
ir("/emporio/clientes/" + bloqueado_id)
confere("a ficha do cliente mostra a data da cobranca", esperar(lambda: tem("Cobrado pela última vez") and tem(HOJE.strftime("%d/%m/%Y")), 40), texto_principal(1500))

# --- 8 ---------------------------------------------------------------------------------
passo("8. A 390 px: a Cobranca sem rolagem horizontal, o painel abre e fecha")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/financeiro/cobranca")
esperar(lambda: tem(BLOQUEADO), 60)
sem_rolagem("Cobranca")
abre = abrir_painel_com(lambda: clicar_no_card(BLOQUEADO, "Cobrar no WhatsApp"))
confere("o painel de cobrar abre no celular", abre)
esc()
confere("e fecha", esperar(lambda: not painel_aberto(), 20))
sem_rolagem("Cobranca depois de fechar o painel")
cdp("Emulation.clearDeviceMetricsOverride")

fim()
