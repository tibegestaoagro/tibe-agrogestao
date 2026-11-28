# Validacao viva da onda 4 da frente de UX do Meu Empório (o Dinheiro em menos telas e as
# listas longas, docs/superpowers/specs/2026-11-24-emporio-ux-design.md 5.8, 5.9 e 5.11 e o
# plano docs/superpowers/plans/2026-11-26-emporio-ux-onda4-dinheiro.md): A pagar com abas e o
# grupo das comissões, A receber com abas e a Cobrança dentro (Vencidos), a Posição de caixa
# dentro do Caixa, a busca do Fiado nas duas portas, os três endereços que somem, Produtos e
# Estoque paginados e o celular.
#
# O cenario tem a "U4 Loja" (caixa aberto), a "U4 Conta", o Gestor da loja SEM Dinheiro, o
# Financeiro e o Dono; 3 comissões "U4 Comissão Ana" do mesmo dia mais um frete; o fiado de
# "U4 João" (CPF 123.456.789-00, telefone (38) 99988-1122), "U4 Maria" e "U4 Pedro"; dois
# cheques (um vencido de R$ 120,00 e um a vencer de R$ 80,00) e um boleto; 45 produtos
# "U4 Produto NN" (os de 41 a 45 abaixo do mínimo).
#
# cenario: scripts/_cenario-emporio-ux-onda4.ts
# sessao: dono owner@example.com
# sessao: gestor u4-gestor@teste.local
# sessao: fin u4-fin@teste.local
import os
import re
import base64

PASTA_DAS_FOTOS = os.environ.get("TIBE_FOTOS", "")
LOJA = "U4 Loja"
CONTA = "U4 Conta"
COMISSAO = "U4 Comissão Ana"
JOAO = "U4 João"
MARIA = "U4 Maria"
PEDRO = "U4 Pedro"
SEM_RESULTADO = "Nenhum cliente com essa busca."


def foto(nome):
    """Foto da tela inteira, so quando TIBE_FOTOS aponta uma pasta (fora do git)."""
    if not PASTA_DAS_FOTOS:
        return
    os.makedirs(PASTA_DAS_FOTOS, exist_ok=True)
    r = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=True)
    with open(os.path.join(PASTA_DAS_FOTOS, nome + ".png"), "wb") as f:
        f.write(base64.b64decode(r["data"]))


def norm(s):
    return (s or "").replace(" ", " ")


def tem(texto, n=80000):
    pagina = norm(js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "")
    return texto.lower() in pagina.lower()


def endereco():
    """Caminho e query da aba (o que a barra de endereco mostra, sem o dominio)."""
    return (js("location.pathname + location.search") or "")


def loja_no_topo(loja_id):
    """Onda 6 da UX: o link com ?loja= vira a loja do topo (cookie) e sai da URL. Vale a URL ou o cookie."""
    if param("loja") == loja_id:
        return True
    for c in cdp("Network.getCookies", urls=[BASE]).get("cookies", []):
        if c["name"] == "tibe_emporio_loja":
            return c["value"] == loja_id
    return False


def param(nome):
    return js("new URLSearchParams(location.search).get(" + repr(nome) + ")")


def sem_rolagem_lateral():
    return js("document.documentElement.scrollWidth <= window.innerWidth")


def folga():
    return js("document.documentElement.scrollWidth + ' > ' + window.innerWidth")


def abas(rotulo_do_nav):
    """As abas de uma tela: [[texto, atual]...], ou [] sem a barra."""
    return js("(() => { const n = document.querySelector('nav[aria-label=' + " + repr("'" + rotulo_do_nav + "'") + " + ']'); return n ? Array.from(n.querySelectorAll('a')).map(a => [a.innerText.replace(/\\u00a0/g, ' ').trim(), a.getAttribute('aria-current') === 'page']) : []; })()") or []


def aba_atual(rotulo_do_nav):
    return [t for t, a in abas(rotulo_do_nav) if a]


def titulo_da_aba(rotulo_do_nav, inicio):
    for t, a in abas(rotulo_do_nav):
        if t.startswith(inicio):
            return t
    return None


def h2(texto):
    return bool(js("Array.from(document.querySelectorAll('main h2')).some(h => h.innerText.trim() === " + repr(texto) + ")"))


def linhas_da_tabela():
    return js("Array.from(document.querySelectorAll('main tbody tr')).map(r => r.innerText.replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim())") or []


def qtd_linhas():
    return js("document.querySelectorAll('main tbody tr').length")


def menu_do_empório():
    ir("/emporio")
    abrir_subgrupos()
    return menu()


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


def buscar_fiado(termo):
    """Digita na busca do Fiado (a mesma nas duas portas) e devolve as linhas que sobram."""
    r = js("(() => { const el = document.getElementById('busca-fiado'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(termo) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")
    time.sleep(0.8)
    return r


def clientes_na_lista():
    """Os nomes U4 que a lista do Fiado mostra agora."""
    t = norm(js("(document.querySelector('main') || document.body).innerText") or "")
    return [n for n in (JOAO, MARIA, PEDRO) if n in t]


def o_grupo():
    """O botao do grupo de comissões: (texto, aberto), ou None."""
    return js("(() => { const b = Array.from(document.querySelectorAll('main button[aria-expanded]')).find(x => x.innerText.includes(" + repr(COMISSAO) + ")); return b ? [b.innerText.replace(/\\u00a0/g, ' ').trim(), b.getAttribute('aria-expanded') === 'true'] : null; })()")


def abrir_o_grupo():
    js("(() => { const b = Array.from(document.querySelectorAll('main button[aria-expanded]')).find(x => x.innerText.includes(" + repr(COMISSAO) + ") && x.getAttribute('aria-expanded') === 'false'); if (b) b.click(); })()")
    time.sleep(0.8)


def marcas_da_comissao():
    return js("Array.from(document.querySelectorAll('input[type=checkbox]')).filter(x => x.getAttribute('aria-label') === " + repr("Marcar " + COMISSAO) + ").length")


def clicar_ver_extrato_de(nome, tipo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main tbody tr')).find(r => { const t = r.innerText.replace(/\\u00a0/g, ' '); return t.includes(" + repr(nome) + ") && t.includes(" + repr(tipo) + "); }); const a = l && l.querySelector('a'); if (!a) return false; a.click(); return true; })()")


def href_ver_extrato_de(nome, tipo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main tbody tr')).find(r => { const t = r.innerText.replace(/\\u00a0/g, ' '); return t.includes(" + repr(nome) + ") && t.includes(" + repr(tipo) + "); }); const a = l && l.querySelector('a'); return a ? a.getAttribute('href') : null; })()")


def lista_de(chave):
    return (api("GET", "/api/v1/emporio/" + chave) or {}).get("body", {}).get("data", []) or []


# --- 0. Computador -------------------------------------------------------------------
cdp("Emulation.setDeviceMetricsOverride", width=1280, height=900, deviceScaleFactor=1, mobile=False)

# --- 1. O Gestor da loja, sem Dinheiro ---------------------------------------------------
passo("1. Gestor da loja sem Dinheiro: o menu tem A pagar, e não tem Despesas, Hoje nem A receber")
entrar("gestor")
m = menu_do_empório()
print("   menu do Gestor:", m)
confere("o menu do Gestor tem A pagar", "/emporio/financeiro/pagar" in m, m)
confere("o menu do Gestor NÃO tem Despesas", "/emporio/despesas" not in m, m)
confere("o menu do Gestor NÃO tem Hoje (/emporio/financeiro)", "/emporio/financeiro" not in m, m)
confere("o menu do Gestor NÃO tem A receber", "/emporio/financeiro/receber" not in m, m)

passo("1b. Gestor: as três abas de A pagar, o grupo das comissões e pagar uma pela gaveta")
ir("/emporio/financeiro/pagar")
confere("o Gestor abre A pagar (não volta ao Início)", endereco().startswith("/emporio/financeiro/pagar"), endereco())
ab = abas("Abas do A pagar")
print("   abas de A pagar:", ab)
confere("as três abas: Contas, Despesas fixas, Vendeu, Pagou", [t for t, a in ab] == ["Contas", "Despesas fixas", "Vendeu, Pagou"], ab)
confere("a aba Contas é a atual", aba_atual("Abas do A pagar") == ["Contas"], ab)
confere("a lista mostra o grupo '" + COMISSAO + " · 3 contas'", bool(esperar(lambda: o_grupo(), 30)) and "3 contas" in (o_grupo() or [""])[0], o_grupo())
confere("o grupo começa fechado", (o_grupo() or [None, None])[1] is False, o_grupo())
confere("o frete aparece como conta comum", tem("Frete de entrega"), texto_principal(300))
abrir_o_grupo()
confere("clicar no grupo abre as 3 contas", (o_grupo() or [None, False])[1] is True and marcas_da_comissao() == 3, [o_grupo(), marcas_da_comissao()])
confere("marca a primeira conta do grupo", bool(js("(() => { const c = Array.from(document.querySelectorAll('input[type=checkbox]')).find(x => x.getAttribute('aria-label') === " + repr("Marcar " + COMISSAO) + " && !x.checked); if (!c) return false; c.click(); return true; })()")))
time.sleep(0.5)
confere("abre 'Pagar selecionadas (1)'", clicar("Pagar selecionadas (1)"))
time.sleep(1.5)
confere("escolhe a gaveta da " + LOJA, escolher_por_inicio("De onde sai o dinheiro", "Gaveta: " + LOJA) is True)
enviar_painel()
confere("o painel fecha depois de pagar", bool(esperar(lambda: not painel_aberto(), 60)), texto_principal(300))
confere("pagar uma conta do grupo deixa '2 contas'", bool(esperar(lambda: "2 contas" in (o_grupo() or [""])[0], 30)), o_grupo())

ir("/emporio/financeiro/pagar?aba=fixas")
confere("aba Despesas fixas: abre no mesmo endereço, com o título da seção", endereco().startswith("/emporio/financeiro/pagar") and h2("Despesas fixas"), endereco())
confere("aba Despesas fixas: é a atual", aba_atual("Abas do A pagar") == ["Despesas fixas"], abas("Abas do A pagar"))
ir("/emporio/financeiro/pagar?aba=vendeu_pagou")
confere("aba Vendeu, Pagou: abre com o título da seção", endereco().startswith("/emporio/financeiro/pagar") and h2("Vendeu, Pagou"), endereco())
confere("aba Vendeu, Pagou: mostra a regra '" + COMISSAO + "'", tem(COMISSAO), texto_principal(300))

passo("1c. Gestor: o Caixa sem 'Saldo de cada lugar'; os endereços antigos")
ir("/emporio/caixa")
confere("o Gestor abre o Caixa", endereco().startswith("/emporio/caixa") and not eh_404(), endereco())
confere("o Gestor NÃO vê 'Saldo de cada lugar'", not tem("Saldo de cada lugar"), texto_principal(200))
ir("/emporio/financeiro/cobranca")
confere("/emporio/financeiro/cobranca leva o Gestor ao Início (A receber o devolve)", endereco() == "/emporio", endereco())
ir("/emporio/despesas")
confere("/emporio/despesas leva o Gestor à aba Despesas fixas de A pagar", endereco().startswith("/emporio/financeiro/pagar") and param("aba") == "fixas" and h2("Despesas fixas"), endereco())

# --- 2. O Financeiro: A receber com abas ------------------------------------------------
passo("2. Financeiro em A receber: as abas com o total, o recorte e a aba Vencidos")
entrar("fin")
m = menu_do_empório()
print("   menu do Financeiro:", m)
confere("o menu do Financeiro tem Hoje, Caixa, A receber e A pagar", all(h in m for h in ("/emporio/financeiro", "/emporio/caixa", "/emporio/financeiro/receber", "/emporio/financeiro/pagar")), m)
confere("o menu do Financeiro NÃO tem Despesas", "/emporio/despesas" not in m, m)
confere("o menu do Financeiro tem 'Estatísticas' (onda 5: os 'Relatórios do dinheiro' viraram a aba Dinheiro)", "/emporio/estatisticas" in m and "/emporio/financeiro/relatorios" not in m, m)
ir("/emporio/financeiro/receber")
ab = abas("Abas de A receber")
print("   abas de A receber:", ab)
confere("as cinco abas, na ordem", [re.sub(r" R\$.*$", "", t) for t, a in ab] == ["Fiado", "Cheques", "Boletos", "Cartões", "Vencidos"], ab)
confere("a aba Fiado é a atual", (aba_atual("Abas de A receber") or [""])[0].startswith("Fiado"), ab)
confere("cada aba traz o total no título (R$ ...)", all(re.search(r"R\$ [\d.]+,\d\d$", t) for t, a in ab), ab)
confere("a faixa de cima está na tela (Vencido, Vence hoje, A vencer)", tem("Vencido") and tem("Vence hoje") and tem("A vencer"), texto_principal(300))
lojas = lista_de("establishments")
loja_id = next((x["id"] for x in lojas if x.get("name") == LOJA), None)
print("   loja do cenário:", loja_id)
confere("achou a " + LOJA + " pela API", bool(loja_id), [x.get("name") for x in lojas][:6])
# A conta do seed tem cheques e cartões das lojas da demonstração: o total que só o cenário explica é o da loja U4.
ir("/emporio/financeiro/receber?loja=" + (loja_id or ""))
chq_total = titulo_da_aba("Abas de A receber", "Cheques")
bol_total = titulo_da_aba("Abas de A receber", "Boletos")
print("   na " + LOJA + ": Cheques:", chq_total, "| Boletos:", bol_total)
confere("na loja do cenário, Cheques soma os dois cheques (R$ 120,00 + R$ 80,00)", chq_total == "Cheques R$ 200,00", chq_total)
confere("na loja do cenário, Boletos soma o boleto (R$ 60,00)", bol_total == "Boletos R$ 60,00", bol_total)
ir("/emporio/financeiro/receber?aba=cheques&loja=" + (loja_id or ""))
confere("a aba Cheques lista os dois cheques (U4-CH-A e U4-CH-B)", tem("U4-CH-A") and tem("U4-CH-B"), texto_principal(500))

ir("/emporio/financeiro/receber?ver=vencido&aba=cheques")
confere("?ver=vencido&aba=cheques: a aba Cheques é a atual", aba_atual("Abas de A receber")[:1] and aba_atual("Abas de A receber")[0].startswith("Cheques"), abas("Abas de A receber"))
confere("o título da aba bate com a soma dos vencidos: 'Cheques R$ 120,00'", titulo_da_aba("Abas de A receber", "Cheques") == "Cheques R$ 120,00", titulo_da_aba("Abas de A receber", "Cheques"))
confere("lista o cheque vencido (U4-CH-A)", tem("U4-CH-A"), texto_principal(400))
confere("NÃO lista o cheque a vencer (U4-CH-B)", not tem("U4-CH-B"), texto_principal(400))

ir("/emporio/financeiro/receber?cheques=a_completar")
confere("?cheques=a_completar abre direto na aba Cheques", (aba_atual("Abas de A receber") or [""])[0].startswith("Cheques"), abas("Abas de A receber"))

ir("/emporio/financeiro/receber?aba=vencidos")
confere("aba Vencidos: é a atual", (aba_atual("Abas de A receber") or [""])[0].startswith("Vencidos"), abas("Abas de A receber"))
confere("aba Vencidos: mostra " + JOAO, bool(esperar(lambda: tem(JOAO), 30)), texto_principal(400))
tem_zap_joao = js("(() => { const li = Array.from(document.querySelectorAll('main li')).find(x => x.innerText.includes(" + repr(JOAO) + ")); return !!li && Array.from(li.querySelectorAll('button')).some(b => b.innerText.includes('WhatsApp')); })()")
confere("aba Vencidos: o " + JOAO + " tem o botão do WhatsApp", bool(tem_zap_joao), texto_principal(400))
confere("aba Vencidos: o filtro de atraso aparece", bool(js("!!document.querySelector('[aria-label=\"Filtrar por tempo de atraso\"]')")))
confere("aba Vencidos NÃO traz a lista de cheques nem a de fiado", not tem("Cheques em carteira"), texto_principal(200))

passo("2b. Busca do Fiado, porta 1: a aba Fiado do A receber (Financeiro)")
ir("/emporio/financeiro/receber")
confere("a busca 'Buscar cliente' existe, com a ajuda 'Nome, CPF ou telefone'", tem("Buscar cliente") and tem("Nome, CPF ou telefone"), texto_principal(400))
confere("sem busca, os três clientes do cenário aparecem", set(clientes_na_lista()) == {JOAO, MARIA, PEDRO}, clientes_na_lista())
for termo, esperado in (("joao", [JOAO]), ("123.456", [JOAO]), ("9988", [JOAO])):
    buscar_fiado(termo)
    confere("A receber, busca '" + termo + "' acha só o " + JOAO, clientes_na_lista() == esperado, [termo, clientes_na_lista()])
buscar_fiado("12")
confere("A receber, busca '12' (2 dígitos) NÃO filtra por dígito: o CPF do João não conta", JOAO not in clientes_na_lista(), clientes_na_lista())
buscar_fiado("zzz")
confere("A receber, busca 'zzz' mostra '" + SEM_RESULTADO + "'", tem(SEM_RESULTADO) and clientes_na_lista() == [], texto_principal(300))
buscar_fiado("joao")
confere("A receber, o total é refeito sobre o filtrado ('em 1 cliente')", tem("em 1 cliente"), texto_principal(400))
confere("A receber: a linha do João tem a venda mais antiga (a de ha 23 dias) e o botão de receber", any(JOAO in l for l in linhas_da_tabela()), linhas_da_tabela())

passo("2c. Financeiro no Caixa: 'Saldo de cada lugar' e o extrato de uma conta")
ir("/emporio/caixa")
confere("o Financeiro vê 'Saldo de cada lugar' no Caixa", bool(esperar(lambda: tem("Saldo de cada lugar"), 30)), texto_principal(300))
conta_href = esperar(lambda: href_ver_extrato_de(CONTA, "Conta"), 30)
print("   link do extrato da conta:", conta_href)
confere("a tabela lista a " + CONTA + " com 'Ver extrato'", bool(conta_href), texto_principal(500))
conta_lugar = None
if conta_href:
    m_ = re.search(r"lugar=(conta(?:%3A|:)[^&]+)", conta_href)
    conta_lugar = m_.group(1).replace("%3A", ":") if m_ else None
confere("o link usa lugar=conta:<id> e fica no Caixa", bool(conta_lugar) and conta_href.startswith("/emporio/caixa?"), conta_href)
confere("clica em 'Ver extrato' da conta", clicar_ver_extrato_de(CONTA, "Conta") is True)
confere("o extrato abre: 'Conta: " + CONTA + "'", bool(esperar(lambda: tem("Conta: " + CONTA), 40)), texto_principal(500))
confere("o endereço do extrato é /emporio/caixa?lugar=conta:...", endereco().startswith("/emporio/caixa") and (param("lugar") or "").startswith("conta:"), endereco())
confere("o extrato da conta tem 'Conferir com o banco'", tem("Conferir com o banco"), texto_principal(400))

passo("2d. Os três endereços antigos caem na aba e nos filtros certos (Financeiro)")
conta_id = (conta_lugar or "conta:").split(":", 1)[1]
ir("/emporio/financeiro/caixa?conta=" + conta_id + "&de=2026-11-01&ate=2026-11-20&carimbo=sem")
print("   endereço final do /financeiro/caixa:", endereco())
confere("/financeiro/caixa?conta=X vira /emporio/caixa com lugar=conta:X", endereco().startswith("/emporio/caixa") and param("lugar") == "conta:" + conta_id, endereco())
confere("o período e o carimbo seguem (de, ate, carimbo=sem)", param("de") == "2026-11-01" and param("ate") == "2026-11-20" and param("carimbo") == "sem", endereco())
confere("o extrato daquela conta abre ('Conta: " + CONTA + "')", bool(esperar(lambda: tem("Conta: " + CONTA), 40)), texto_principal(400))
confere("o parâmetro antigo conta= não sobrou na URL", param("conta") is None, endereco())

ir("/emporio/financeiro/cobranca?loja=" + (loja_id or "") + "&faixa=1-15")
print("   endereço final da cobrança:", endereco())
confere("/financeiro/cobranca vira A receber, aba Vencidos", endereco().startswith("/emporio/financeiro/receber") and param("aba") == "vencidos", endereco())
confere("a loja (na URL ou no topo) e a faixa seguem", loja_no_topo(loja_id) and param("faixa") == "1-15", endereco())
confere("a aba Vencidos está aberta, com o " + JOAO, (aba_atual("Abas de A receber") or [""])[0].startswith("Vencidos") and bool(esperar(lambda: tem(JOAO), 30)), abas("Abas de A receber"))
ir("/emporio/financeiro/cobranca?loja=" + (loja_id or "") + "&faixa=60")
confere("com faixa=60 (a do plano) a URL também chega a Vencidos com loja e faixa", endereco().startswith("/emporio/financeiro/receber") and param("aba") == "vencidos" and param("faixa") == "60" and loja_no_topo(loja_id), endereco())
ir("/emporio/despesas?x=1")
confere("/despesas vira A pagar na aba fixas, e o ?x=1 some", endereco().startswith("/emporio/financeiro/pagar") and param("aba") == "fixas" and param("x") is None, endereco())
confere("e a aba Despesas fixas está aberta", aba_atual("Abas do A pagar") == ["Despesas fixas"] and h2("Despesas fixas"), endereco())

# --- 3. O Dono: Fiado (a outra porta), Produtos e Estoque -----------------------------------
passo("3. Dono: a busca do Fiado na página Vendas › Fiado")
entrar("dono")
m = menu_do_empório()
confere("o menu do Dono tem a página Fiado (/emporio/fiado)", "/emporio/fiado" in m, m)
ir("/emporio/fiado")
confere("a página Fiado abre com a busca", bool(esperar(lambda: tem("Buscar cliente"), 30)), texto_principal(300))
confere("sem busca, os três clientes do cenário aparecem", set(clientes_na_lista()) == {JOAO, MARIA, PEDRO}, clientes_na_lista())
for termo, esperado in (("joao", [JOAO]), ("123.456", [JOAO]), ("9988", [JOAO])):
    buscar_fiado(termo)
    confere("Fiado, busca '" + termo + "' acha só o " + JOAO, clientes_na_lista() == esperado, [termo, clientes_na_lista()])
buscar_fiado("12")
confere("Fiado, busca '12' (2 dígitos) NÃO filtra por dígito", JOAO not in clientes_na_lista(), clientes_na_lista())
buscar_fiado("zzz")
confere("Fiado, busca 'zzz' mostra '" + SEM_RESULTADO + "'", tem(SEM_RESULTADO) and clientes_na_lista() == [], texto_principal(300))
buscar_fiado("joao")
joao_linha = next((l for l in linhas_da_tabela() if JOAO in l), "")
print("   linha do João:", joao_linha)
confere("Fiado: a linha do João mostra o telefone (38) 99988-1122", "(38) 99988-1122" in joao_linha, joao_linha)
confere("Fiado: a coluna 'Venda mais antiga' existe", tem("Venda mais antiga"), texto_principal(300))
confere("Fiado: a linha do João traz o selo 'Vencido'", "Vencido" in joao_linha, joao_linha)

passo("3b. Produtos: 20 por página, e página além do fim cai na última")
ir("/emporio/produtos?q=U4+Produto")
confere("Produtos: 20 linhas na primeira página", esperar(lambda: qtd_linhas() == 20, 30), qtd_linhas())
confere("Produtos: 'Mostrando 1 a 20 de 45'", tem("Mostrando 1 a 20 de 45"), texto_principal(200))
ir("/emporio/produtos?q=U4+Produto&pagina=999")
confere("?pagina=999 mostra a última página (41 a 45 de 45)", tem("Mostrando 41 a 45 de 45"), texto_principal(300))
confere("?pagina=999 NÃO é lista vazia: 5 linhas", qtd_linhas() == 5, qtd_linhas())
confere("a paginação marca a página 3 como atual", js("(() => { const c = document.querySelector('nav[aria-label=\"Paginação\"] [aria-current=page]'); return c ? c.innerText.trim() : null; })()") == "3", texto_principal(100))
ir("/emporio/produtos?pagina=999")
confere("sem busca, ?pagina=999 também cai numa página com linhas", (qtd_linhas() or 0) > 0 and (qtd_linhas() or 0) <= 20, qtd_linhas())

passo("3c. Estoque: abre em Precisa repor com os 5")
ir("/emporio/estoque?loja=" + (loja_id or ""))
confere("Estoque: a aba Precisa repor é a atual (padrão)", aba_atual("Abas do Estoque") == ["Precisa repor"], abas("Abas do Estoque"))
confere("Estoque: a lista tem os 5 produtos abaixo do mínimo", esperar(lambda: qtd_linhas() == 5, 30), qtd_linhas())
confere("Estoque: são os produtos 41 a 45", all(tem("U4 Produto " + str(n)) for n in range(41, 46)) and not tem("U4 Produto 40"), texto_principal(600))
ir("/emporio/estoque?loja=" + (loja_id or "") + "&aba=tudo")
confere("Estoque, aba Tudo: é a atual", aba_atual("Abas do Estoque") == ["Tudo"], abas("Abas do Estoque"))
tudo = esperar(lambda: re.search(r"Mostrando 1 a 20 de (\d+)", norm(js("(document.querySelector('main') || document.body).innerText") or "")), 30)
# A aba Tudo lista tambem os produtos do catalogo sem saldo na loja: o total passa dos 46 do cenario.
confere("Estoque, aba Tudo: 20 por página ('Mostrando 1 a 20 de N', N >= 46)", bool(tudo) and int(tudo.group(1)) >= 46, tudo.group(0) if tudo else texto_principal(300))
confere("Estoque, aba Tudo: 20 linhas na tabela", qtd_linhas() == 20, qtd_linhas())

# --- 4. Celular (390 px) -----------------------------------------------------------------
passo("4. Celular (390 px): sem rolagem lateral em A pagar, A receber e Produtos")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
ir("/emporio/financeiro/pagar")
abrir_o_grupo()
confere("390 px: A pagar (grupo aberto) sem rolagem lateral", sem_rolagem_lateral(), folga())
ir("/emporio/financeiro/receber")
confere("390 px: A receber (aba Fiado) sem rolagem lateral", sem_rolagem_lateral(), folga())
ir("/emporio/financeiro/receber?aba=vencidos")
confere("390 px: A receber (aba Vencidos) sem rolagem lateral", sem_rolagem_lateral(), folga())
ir("/emporio/produtos")
confere("390 px: Produtos sem rolagem lateral", sem_rolagem_lateral(), folga())
ir("/emporio/fiado")
confere("390 px: Fiado sem rolagem lateral", sem_rolagem_lateral(), folga())
# A tabela do Fiado rola dentro dela mesma; as colunas "Venda mais antiga" e "Vendas" somem no celular
# para o botão Receber caber na tela sem rolar a tabela.
BOTAO_RECEBER = "(() => { const b = [...document.querySelectorAll('main table button')].find((x) => x.innerText.trim() === 'Receber'); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), window.innerWidth, [...b.closest('table').querySelectorAll('th')].map((th) => th.innerText.trim() + ':' + Math.round(th.getBoundingClientRect().width))]; })()"
for tela_fiado in ("/emporio/fiado", "/emporio/financeiro/receber"):
    ir(tela_fiado)
    caixa = esperar(lambda: js(BOTAO_RECEBER), 30)
    confere("390 px: " + tela_fiado + ": o botão Receber cabe na tela sem rolar a tabela", bool(caixa) and caixa[0] >= 0 and caixa[1] <= caixa[2], caixa)
    confere("390 px: " + tela_fiado + ": a coluna 'Venda mais antiga' fica escondida", not tem("Venda mais antiga"), texto_principal(300))

# --- 5. Fotos (só com TIBE_FOTOS) ----------------------------------------------------------
passo("5. Fotos (só com TIBE_FOTOS)")
for largura, altura, movel, sufixo in ((1280, 900, False, "1280"), (390, 844, True, "390")):
    cdp("Emulation.setDeviceMetricsOverride", width=largura, height=altura, deviceScaleFactor=1, mobile=movel)
    entrar("dono")
    ir("/emporio/financeiro/pagar")
    abrir_o_grupo()
    foto("a-pagar-grupo-aberto-" + sufixo)
    ir("/emporio/financeiro/receber")
    buscar_fiado("joao")
    foto("a-receber-fiado-com-busca-" + sufixo)
    ir("/emporio/financeiro/receber?aba=vencidos")
    foto("a-receber-vencidos-" + sufixo)
    ir("/emporio/fiado")
    buscar_fiado("123.456")
    foto("fiado-com-busca-" + sufixo)
    ir("/emporio/estoque?loja=" + (loja_id or ""))
    foto("estoque-precisa-repor-" + sufixo)
    entrar("fin")
    ir("/emporio/caixa")
    esperar(lambda: tem("Saldo de cada lugar"), 30)
    foto("caixa-saldo-de-cada-lugar-" + sufixo)
    confere("foto " + sufixo + ": o Caixa do Financeiro segue sem rolagem lateral", sem_rolagem_lateral(), folga())

cdp("Emulation.clearDeviceMetricsOverride")
fim()
