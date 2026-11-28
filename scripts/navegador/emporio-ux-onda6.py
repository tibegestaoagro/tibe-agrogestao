# Validacao viva da onda 6 da frente de UX do Meu Emporio (a loja no topo,
# docs/superpowers/plans/2026-11-27-emporio-ux-onda6-loja-no-topo.md e
# docs/superpowers/specs/2026-11-24-emporio-ux-design.md 5.3): o "Loja: Todas" no topo, a escolha no
# cookie tibe_emporio_loja, a URL que vence o cookie, o alcance, a pagina 1 depois de trocar, o formulario
# que ja vem com a loja e as folhas de imprimir com a loja da tela.
#
# O cenario tem a "U6 Loja 1" (Gestor so dela, Caixa dela) e a "U6 Loja 2", o Financeiro e o Dono. Hoje:
# Loja 1 com 23 vendas (22 de 10,00 e o fiado da "U6 Ana", 60,00: 280,00), compra de 123,00, conta "U6 Conta
# Um" de 111,00 e o "U6 Sal" em Precisa repor; Loja 2 com 2 vendas (50,00 e o fiado do "U6 Beto", 80,00:
# 130,00), compra de 456,00 e a conta "U6 Conta Dois" de 222,00. O Dono ainda enxerga as lojas da
# demonstracao em "Todas": os numeros exatos valem com uma loja U6 escolhida.
#
# cenario: scripts/_cenario-emporio-ux-onda6.ts
# sessao: dono owner@example.com
# sessao: gestor u6-gestor@teste.local
# sessao: fin u6-fin@teste.local
# sessao: caixa u6-caixa@teste.local
import os
import re
import base64

PASTA_DAS_FOTOS = os.environ.get("TIBE_FOTOS", "")

# O next dev recarrega a aba aberta quando compila uma rota nova pela primeira vez, e a leitura que estava
# em andamento morre com "Inspected target navigated or closed". Leitura se repete; o que clica ou navega nao.
_js_do_harness = js


def js(expressao, *args, **kwargs):
    pode_repetir = ".click()" not in expressao and "location.href" not in expressao and "click_at" not in expressao
    for tentativa in range(6):
        try:
            return _js_do_harness(expressao, *args, **kwargs)
        except RuntimeError as e:
            if not pode_repetir or "navigated or closed" not in str(e) or tentativa == 5:
                raise
            time.sleep(3)


NBSP = chr(160)
LOJA_1 = "U6 Loja 1"
LOJA_2 = "U6 Loja 2"
COOKIE = "tibe_emporio_loja"


def foto(nome):
    if not PASTA_DAS_FOTOS:
        return
    os.makedirs(PASTA_DAS_FOTOS, exist_ok=True)
    r = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=False)
    with open(os.path.join(PASTA_DAS_FOTOS, nome + ".png"), "wb") as f:
        f.write(base64.b64decode(r["data"]))


def norm(s):
    return (s or "").replace(NBSP, " ")


def tem(texto, n=80000):
    pagina = norm(js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "")
    return texto.lower() in pagina.lower()


def endereco():
    return js("location.pathname + location.search") or ""


def param(nome):
    return js("new URLSearchParams(location.search).get(" + repr(nome) + ")")


def botao_topo():
    """O texto do botao 'Loja: ...' do topo, ou None se o seletor nao esta na tela."""
    return js("(Array.from(document.querySelectorAll('button')).map(b => b.innerText.replace(/\\u00a0/g, ' ').trim()).find(t => t.startsWith('Loja:'))) || null")


def trocar_loja(nome):
    """Abre o seletor do topo e toca no item `nome` ('Todas as lojas' ou o nome da loja)."""
    ok = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Loja:')); if (!b) return false; b.click(); return true; })()")
    if not ok:
        return "SEM SELETOR"
    time.sleep(0.8)
    r = js("(() => { const i = Array.from(document.querySelectorAll('button[type=button]')).find(x => x.innerText.trim() === " + repr(nome) + " && x.closest('.absolute')); if (!i) return false; i.click(); return true; })()")
    if not r:
        return "SEM ITEM"
    time.sleep(3)
    return True


def itens_do_seletor():
    js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Loja:')); if (b) b.click(); })()")
    time.sleep(0.8)
    r = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Loja:')); const m = b && b.parentElement.querySelector('.absolute'); return m ? Array.from(m.querySelectorAll('button')).map(x => x.innerText.trim()) : null; })()")
    js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Loja:')); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); })()")
    return r


def cookie_da_loja():
    r = cdp("Network.getCookies", urls=[BASE])
    for c in r.get("cookies", []):
        if c["name"] == COOKIE:
            return c["value"]
    return None


def por_cookie(valor):
    cdp("Network.enable")
    cdp("Network.deleteCookies", name=COOKIE, domain="localhost", path="/")
    if valor:
        cdp("Network.setCookie", name=COOKIE, value=valor, domain="localhost", path="/")


def lista_de(chave):
    return (api("GET", "/api/v1/emporio/" + chave) or {}).get("body", {}).get("data", []) or []


def buscar(caminho):
    expr = "fetch(" + repr(caminho) + ").then(async r => ({ status: r.status, tipo: r.headers.get('content-type') || '', texto: await r.text() }))"
    for tentativa in range(4):
        try:
            return js(expr)
        except RuntimeError as e:
            if "timed out" not in str(e) or tentativa == 3:
                raise
            time.sleep(20)


def linhas_da_tabela():
    return js("Array.from(document.querySelectorAll('main tbody tr')).map(r => Array.from(r.children).map(c => c.innerText.trim()))") or []


def lojas_da_coluna_vendas():
    return sorted(set(l[2] for l in linhas_da_tabela() if len(l) > 2))


def cabecalhos_da_tabela():
    return [norm(t).strip().lower() for t in (js("Array.from(document.querySelectorAll('main thead th')).map(h => h.innerText.trim())") or [])]


def seletor_local():
    """Sobrou algum filtro de loja DENTRO da tela? (o Select 'Loja' ou 'Filtrar por loja')."""
    return bool(js("!!document.querySelector('main [aria-label=\"Loja\"], main [aria-label=\"Filtrar por loja\"]')"))


def cartao_numero(titulo):
    """O 'R$ ...' que vem logo depois do titulo no texto do Inicio."""
    t = re.sub(r"\s+", " ", norm(js("document.querySelector('main').innerText") or ""))
    m = re.search(re.escape(titulo) + r" (R\$ [\d.,]+) (\d+) venda", t)
    return (m.group(1), m.group(2)) if m else None


def avisos_do_inicio():
    """O texto da secao 'Precisa de voce' (do titulo ate 'Vendas hoje')."""
    t = re.sub(r"\s+", " ", norm(js("document.querySelector('main').innerText") or ""))
    i, j = t.find("Precisa de você"), t.find("Vendas hoje")
    return t[i:j] if i >= 0 and j > i else t[:300]


def menu_ir(href):
    """Navega pelo MENU (link da sidebar, navegacao de cliente do Next), nao por goto."""
    abrir_subgrupos()
    ok = js("(() => { const a = document.querySelector('nav a[href=' + " + repr('"' + href + '"') + " + ']'); if (!a) return false; a.click(); return true; })()")
    if not ok:
        return "SEM LINK"
    return bool(esperar(lambda: js("location.pathname") == href, 60)) and (time.sleep(3) or True)


def aba_nova_depois(href):
    return href


# --- 0. Computador -------------------------------------------------------------------------
cdp("Emulation.setDeviceMetricsOverride", width=1280, height=900, deviceScaleFactor=1, mobile=False)

entrar("dono")
ir("/emporio")
lojas = lista_de("establishments")
l1 = next((x["id"] for x in lojas if x.get("name") == LOJA_1), None)
l2 = next((x["id"] for x in lojas if x.get("name") == LOJA_2), None)
print("   lojas do cenario:", l1, l2, "| total ao alcance do Dono:", len(lojas))
confere("achou a " + LOJA_1 + " e a " + LOJA_2 + " pela API", bool(l1) and bool(l2), [x.get("name") for x in lojas][:8])

# --- 1. O Inicio e o menu ------------------------------------------------------------------------
passo("1. Dono: o seletor no Inicio, trocar muda os numeros, o menu leva a loja ate Vendas, Estoque e A pagar")
por_cookie(None)
ir("/emporio")
confere("o seletor aparece no Inicio e diz 'Loja: Todas'", botao_topo() == "Loja: Todas", botao_topo())
itens = itens_do_seletor()
print("   itens do seletor:", itens)
confere("os itens: 'Todas as lojas' e depois as lojas em ordem de nome", bool(itens) and itens[0] == "Todas as lojas" and LOJA_1 in itens and LOJA_2 in itens and itens[1:] == sorted(itens[1:], key=lambda s: s.lower()), itens)
print("   Inicio em Todas:", cartao_numero("Vendas hoje"))
todas = cartao_numero("Vendas hoje")
# Em Todas entram tambem as vendas de hoje das lojas da demonstracao e de
# outros roteiros: o exato so vale com uma loja U6 escolhida (cabecalho).
def reais(s):
    return float(s.replace("R$", "").replace(".", "").replace(",", ".").strip())
confere("em Todas, 'Vendas hoje' inclui as duas lojas U6 (pelo menos R$ 410,00 e 25 vendas)", bool(todas) and reais(todas[0]) >= 410 and int(todas[1]) >= 25, todas)
confere("troca para " + LOJA_1, trocar_loja(LOJA_1) is True)
esperar(lambda: cartao_numero("Vendas hoje") == ("R$ 280,00", "23"), 40)
confere("o botao diz 'Loja: " + LOJA_1 + "'", botao_topo() == "Loja: " + LOJA_1, botao_topo())
confere("o Inicio da " + LOJA_1 + ": R$ 280,00 em 23 vendas", cartao_numero("Vendas hoje") == ("R$ 280,00", "23"), cartao_numero("Vendas hoje"))
confere("os avisos do Inicio da " + LOJA_1 + ": o de repor e so dela e nenhum da Loja Centro", "U6 Loja 1" in avisos_do_inicio() and "Loja Centro" not in avisos_do_inicio(), avisos_do_inicio())
print("   'Primeiros passos' com a Loja 1 no topo lista:", [n for n in ("Depósito Central", "Loja Centro", "Loja da Rodovia", "U6 Loja 1", "U6 Loja 2") if tem(n)])
confere("o cookie guardou a loja", cookie_da_loja() == l1, cookie_da_loja())
foto("topo-dono-inicio-loja1-1280")
confere("troca para " + LOJA_2, trocar_loja(LOJA_2) is True)
esperar(lambda: cartao_numero("Vendas hoje") == ("R$ 130,00", "2"), 40)
confere("o Inicio da " + LOJA_2 + ": R$ 130,00 em 2 vendas (os numeros mudaram)", cartao_numero("Vendas hoje") == ("R$ 130,00", "2"), cartao_numero("Vendas hoje"))
confere("nenhum aviso de repor na " + LOJA_2 + " (o Sal e so da Loja 1)", not tem("para repor"), texto_principal(300))

ok_menu = menu_ir("/emporio/vendas")
confere("pelo MENU ate Vendas: chegou", ok_menu is True, ok_menu)
esperar(lambda: botao_topo() is not None, 30)
print("   Vendas pelo menu:", botao_topo(), lojas_da_coluna_vendas(), len(linhas_da_tabela()))
confere("em Vendas (pelo menu) o botao continua 'Loja: " + LOJA_2 + "'", botao_topo() == "Loja: " + LOJA_2, botao_topo())
confere("e a lista e so da " + LOJA_2 + " (2 vendas)", lojas_da_coluna_vendas() == [LOJA_2] and len(linhas_da_tabela()) == 2, [lojas_da_coluna_vendas(), len(linhas_da_tabela())])
confere("a tela de Vendas nao tem mais o filtro de loja", not seletor_local())

ok_menu = menu_ir("/emporio/estoque")
confere("pelo MENU ate Estoque: chegou", ok_menu is True, ok_menu)
esperar(lambda: botao_topo() is not None, 30)
print("   Estoque pelo menu:", botao_topo(), cabecalhos_da_tabela())
confere("em Estoque o botao continua 'Loja: " + LOJA_2 + "'", botao_topo() == "Loja: " + LOJA_2, botao_topo())
confere("o Estoque da " + LOJA_2 + " nao tem o Sal e nao tem os botoes de loja", not tem("U6 Sal") and not tem("Loja Centro") and not js("!!Array.from(document.querySelectorAll('main nav button, main nav a')).find(x => x.innerText.trim() === 'Todas as lojas')"), texto_principal(300))

ok_menu = menu_ir("/emporio/financeiro/pagar")
confere("pelo MENU ate A pagar: chegou", ok_menu is True, ok_menu)
esperar(lambda: botao_topo() is not None, 30)
confere("em A pagar o botao continua 'Loja: " + LOJA_2 + "'", botao_topo() == "Loja: " + LOJA_2, botao_topo())
esperar(lambda: tem("U6 Conta Dois"), 30)
print("   A pagar Loja 2:", [tem("U6 Conta Dois"), tem("R$ 456,00"), tem("U6 Loja 1"), tem("U6 Conta Um")], norm(texto_principal(2500))[300:1500])
confere("A pagar da " + LOJA_2 + ": 'U6 Conta Dois' e a compra de R$ 456,00, sem a conta da Loja 1", tem("U6 Conta Dois") and tem("R$ 456,00") and not tem("U6 Loja 1") and not tem("U6 Conta Um"), texto_principal(300))
confere("A pagar nao tem mais o filtro de loja", not seletor_local())

# O seletor some fora das telas que filtram (e a escolha fica guardada): pelo menu, de uma tela que o tem
# para uma que nao tem, e de volta.
ok_menu = menu_ir("/emporio/produtos")
confere("pelo MENU ate Produtos: chegou", ok_menu is True, ok_menu)
time.sleep(2)
print("   Produtos pelo menu: botao =", botao_topo())
confere("em Produtos (pelo menu) o seletor SOME", botao_topo() is None, botao_topo())
ok_menu = menu_ir("/emporio/vendas")
esperar(lambda: botao_topo() is not None, 30)
print("   de volta a Vendas pelo menu: botao =", botao_topo())
confere("de volta a Vendas (pelo menu) o seletor reaparece com a loja guardada", botao_topo() == "Loja: " + LOJA_2, botao_topo())
confere("e a lista segue so da " + LOJA_2, lojas_da_coluna_vendas() == [LOJA_2], lojas_da_coluna_vendas())

# --- 2. Onde o seletor nao aparece -----------------------------------------------------------------
passo("2. O seletor nao aparece em Vender, Caixa, Produtos nem numa ficha de venda; aparece nas doze telas")
vendas1 = (api("GET", "/api/v1/emporio/sales?establishment_id=" + str(l1) + "&limit=1") or {}).get("body", {}).get("data", [])
venda_id = vendas1[0]["id"] if vendas1 else None
confere("achou uma venda da " + LOJA_1 + " para a ficha", bool(venda_id), vendas1)
for caminho in ["/emporio/vender", "/emporio/caixa", "/emporio/produtos", "/emporio/clientes", "/emporio/vendas/" + str(venda_id)]:
    h = buscar(caminho)
    confere("o HTML de " + caminho.replace(str(venda_id), "<id>") + " (Dono) nao tem o seletor 'Loja:'", h["status"] == 200 and "Loja: " not in re.sub(r"<[^>]+>", " ", h["texto"]).replace("&nbsp;", " ") or "Loja: " not in h["texto"], h["status"])
for caminho in ["/emporio", "/emporio/vendas", "/emporio/orcamentos", "/emporio/fiado", "/emporio/estoque", "/emporio/compras", "/emporio/transferencias", "/emporio/financeiro", "/emporio/financeiro/receber", "/emporio/financeiro/pagar", "/emporio/estatisticas", "/emporio/historico"]:
    ir(caminho)
    b = botao_topo()
    confere("o seletor aparece em " + caminho + " (diz a loja guardada)", b == "Loja: " + LOJA_2, [b, endereco()])
    confere(caminho + " sem filtro de loja local", not seletor_local())
# Na ficha, pelo navegador (a navegacao completa, nao o HTML do servidor so).
ir("/emporio/vendas/" + str(venda_id))
confere("na ficha de venda, aberta no navegador, nao ha seletor", botao_topo() is None, botao_topo())
ir("/emporio/produtos")
confere("em Produtos, aberto no navegador, nao ha seletor", botao_topo() is None, botao_topo())

# --- 3. Gestor de uma loja so ---------------------------------------------------------------------
passo("3. Gestor so da " + LOJA_1 + ": sem seletor, o Estoque dele e o da loja dele, sem a coluna Loja")
entrar("gestor")
por_cookie(None)
ir("/emporio/estoque")
print("   cabecalhos do Estoque do Gestor:", cabecalhos_da_tabela())
confere("o Gestor nao tem seletor", botao_topo() is None, botao_topo())
confere("o Estoque do Gestor mostra o U6 Sal (Precisa repor) e nenhuma outra loja", tem("U6 Sal") and not tem("Loja Centro") and not tem(LOJA_2), texto_principal(300))
confere("sem a coluna Loja", "loja" not in cabecalhos_da_tabela(), cabecalhos_da_tabela())
ir("/emporio/estoque?aba=tudo&por_pagina=100&pagina=2")
print("   Tudo do Gestor:", cabecalhos_da_tabela())
confere("na aba Tudo tambem sem coluna Loja", "loja" not in cabecalhos_da_tabela() and tem("U6 Ração"), cabecalhos_da_tabela())
ir("/emporio/vendas")
confere("as Vendas do Gestor sao so da " + LOJA_1, lojas_da_coluna_vendas() == [LOJA_1], lojas_da_coluna_vendas())
foto("topo-gestor-vendas-1280")

# Foco 2: o cookie guarda uma loja que a pessoa nao alcanca (Gestor tirado da loja).
passo("3b. Loja que saiu do alcance: o cookie do Gestor guarda a " + LOJA_2 + " e a tela segue normal")
por_cookie(l2)
ir("/emporio/vendas")
print("   Vendas do Gestor com cookie da Loja 2:", lojas_da_coluna_vendas(), len(linhas_da_tabela()))
confere("o Gestor com o cookie de uma loja fora do alcance ve a " + LOJA_1 + ", sem erro e sem tela vazia", lojas_da_coluna_vendas() == [LOJA_1] and len(linhas_da_tabela()) > 0 and not eh_404(), [lojas_da_coluna_vendas(), len(linhas_da_tabela())])
ir("/emporio/estoque")
confere("e o Estoque dele segue com o Sal", tem("U6 Sal") and not eh_404(), texto_principal(200))
ir("/emporio/vendas?loja=" + str(l2))
confere("o Gestor com ?loja=<Loja 2> na URL ve so a " + LOJA_1, lojas_da_coluna_vendas() == [LOJA_1], lojas_da_coluna_vendas())

# --- 4. A URL vence o cookie, e o cookie fora do alcance do Dono -------------------------------------
passo("4. Dono: ?loja= vence o cookie, trocar no seletor tira loja da URL; cookie invalido vira Todas")
entrar("dono")
por_cookie(l1)
ir("/emporio/vendas?loja=" + str(l2))
print("   endereco:", endereco(), "| botao:", botao_topo())
confere("com o cookie da Loja 1, /emporio/vendas?loja=<Loja 2> mostra a Loja 2", lojas_da_coluna_vendas() == [LOJA_2], lojas_da_coluna_vendas())
confere("e o botao diz o nome da Loja 2, nao o do cookie", botao_topo() == "Loja: " + LOJA_2, botao_topo())
confere("troca para " + LOJA_1 + " no seletor", trocar_loja(LOJA_1) is True)
esperar(lambda: param("loja") is None and lojas_da_coluna_vendas() == [LOJA_1], 40)
print("   endereco depois de trocar:", endereco())
confere("trocar no seletor tirou 'loja' da URL", param("loja") is None, endereco())
confere("o botao diz a Loja 1 e a lista e da Loja 1", botao_topo() == "Loja: " + LOJA_1 and lojas_da_coluna_vendas() == [LOJA_1], [botao_topo(), lojas_da_coluna_vendas()])
ir("/emporio/historico?establishment_id=" + str(l2))
confere("no Historico, ?establishment_id=<Loja 2> vence o cookie e o botao diz a Loja 2", botao_topo() == "Loja: " + LOJA_2, botao_topo())
confere("o campo Loja saiu do formulario do Historico", not js("!!Array.from(document.querySelectorAll('main label')).find(l => l.innerText.replace('*','').trim() === 'Loja')"))
trocar_loja("Todas as lojas")
esperar(lambda: param("establishment_id") is None, 40)
confere("no Historico, trocar tira establishment_id da URL", param("establishment_id") is None and botao_topo() == "Loja: Todas", [endereco(), botao_topo()])

por_cookie("cmloja-que-nao-existe-000000")
ir("/emporio/vendas")
print("   com cookie invalido:", botao_topo(), lojas_da_coluna_vendas())
confere("o Dono com um cookie de loja invalida ve 'Loja: Todas', sem erro", botao_topo() == "Loja: Todas" and not eh_404(), botao_topo())
confere("e a lista traz as duas lojas U6", LOJA_1 in lojas_da_coluna_vendas() and LOJA_2 in lojas_da_coluna_vendas(), lojas_da_coluna_vendas())
por_cookie(l2)
ir("/emporio/vendas?loja=cmloja-que-nao-existe-000000")
confere("?loja=<invalida> cai no cookie (Loja 2)", botao_topo() == "Loja: " + LOJA_2 and lojas_da_coluna_vendas() == [LOJA_2], [botao_topo(), lojas_da_coluna_vendas()])

# --- 4b. Link com ?loja= (manual, folha, link antigo): a loja fica depois do primeiro clique -----------
passo("4b. Link com ?loja=: a loja vira a do topo e continua depois de 'Próxima'")
por_cookie(None)
ir("/emporio/vendas?loja=" + str(l1))
esperar(lambda: param("loja") is None and botao_topo() == "Loja: " + LOJA_1, 40)
time.sleep(2)
print("   depois do link:", endereco(), "| botao:", botao_topo(), "| cookie:", cookie_da_loja())
confere("o link com a Loja 1 tira 'loja' da URL e o botao diz a Loja 1", param("loja") is None and botao_topo() == "Loja: " + LOJA_1, [endereco(), botao_topo()])
confere("o cookie passou a ser a Loja 1", cookie_da_loja() == l1, cookie_da_loja())
confere("clica em 'Próxima'", bool(js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim().startsWith('Próxima')); if (!a) return false; a.click(); return true; })()")))
esperar(lambda: param("pagina") == "2", 30)
time.sleep(2)
print("   depois de Próxima:", endereco(), "| botao:", botao_topo(), lojas_da_coluna_vendas(), len(linhas_da_tabela()))
confere("depois de 'Próxima' segue a Loja 1: o botao e as 3 vendas da pagina 2", botao_topo() == "Loja: " + LOJA_1 and lojas_da_coluna_vendas() == [LOJA_1] and len(linhas_da_tabela()) == 3, [endereco(), botao_topo(), lojas_da_coluna_vendas(), len(linhas_da_tabela())])
# O mesmo link outra vez, sem recarregar o documento (o seletor continua montado): adota de novo.
confere("volta a 'Todas as lojas' no seletor", trocar_loja("Todas as lojas") is True)
esperar(lambda: botao_topo() == "Loja: Todas", 30)
time.sleep(1)
js("window.next.router.push('/emporio/vendas?loja=" + str(l1) + "')")
esperar(lambda: param("loja") is None and botao_topo() == "Loja: " + LOJA_1, 40)
time.sleep(2)
print("   o mesmo link de novo:", endereco(), "| botao:", botao_topo(), "| cookie:", cookie_da_loja())
confere("o mesmo link de novo, sem recarregar, adota a Loja 1 outra vez (URL limpa e cookie)", param("loja") is None and cookie_da_loja() == l1 and botao_topo() == "Loja: " + LOJA_1, [endereco(), botao_topo(), cookie_da_loja()])

# --- 5. Pagina 2 ---------------------------------------------------------------------------------------
passo("5. Pagina 2 de Vendas: trocar a loja volta a pagina 1")
por_cookie(l1)
ir("/emporio/vendas?pagina=2")
linhas_p2 = len(linhas_da_tabela())
print("   pagina 2 da Loja 1:", linhas_p2, "linhas |", endereco())
confere("a pagina 2 da " + LOJA_1 + " tem as 3 vendas que passam de 20", linhas_p2 == 3 and param("pagina") == "2", [linhas_p2, endereco()])
confere("troca para " + LOJA_2 + " estando na pagina 2", trocar_loja(LOJA_2) is True)
esperar(lambda: param("pagina") is None and lojas_da_coluna_vendas() == [LOJA_2], 40)
print("   depois de trocar:", endereco(), lojas_da_coluna_vendas(), len(linhas_da_tabela()))
confere("a URL perdeu 'pagina' (volta a pagina 1)", param("pagina") is None, endereco())
confere("a lista nao ficou vazia: as 2 vendas da " + LOJA_2, lojas_da_coluna_vendas() == [LOJA_2] and len(linhas_da_tabela()) == 2, [lojas_da_coluna_vendas(), len(linhas_da_tabela())])
ir("/emporio/vendas?pagina=2")
confere("de novo na pagina 2 da Loja 2 (nao existe): a tela nao quebra", not eh_404(), texto_principal(200))
por_cookie(l1)
ir("/emporio/vendas?pagina=2")
trocar_loja("Todas as lojas")
esperar(lambda: param("pagina") is None, 40)
confere("da pagina 2 para 'Todas as lojas' tambem volta a pagina 1", param("pagina") is None and len(linhas_da_tabela()) > 0, [endereco(), len(linhas_da_tabela())])

# --- 6. A lista muda de verdade, em cada tela ------------------------------------------------------
passo("6. Com a " + LOJA_2 + " no topo, as listas mostram so a dela (e os formularios abrem com ela)")
por_cookie(l2)
ir("/emporio/compras")
print("   Compras Loja 2:", [tem("R$ 456,00"), tem("R$ 123,00"), seletor_local()], endereco(), cookie_da_loja())
confere("Compras da Loja 2: R$ 456,00 sim, R$ 123,00 nao", tem("R$ 456,00") and not tem("R$ 123,00") and not seletor_local(), texto_principal(300))
ir("/emporio/fiado")
confere("Fiado da Loja 2: 'U6 Beto' sim, 'U6 Ana' nao", tem("U6 Beto") and not tem("U6 Ana"), texto_principal(300))
por_cookie(l1)
ir("/emporio/fiado")
confere("Fiado da Loja 1: 'U6 Ana' sim, 'U6 Beto' nao", tem("U6 Ana") and not tem("U6 Beto"), texto_principal(300))
ir("/emporio/financeiro/receber")
confere("A receber (aba Fiado) da Loja 1: 'U6 Ana' sim, 'U6 Beto' nao", tem("U6 Ana") and not tem("U6 Beto") and not seletor_local(), texto_principal(300))
ir("/emporio/financeiro/pagar")
confere("A pagar da Loja 1: 'U6 Conta Um' sim, 'U6 Conta Dois' nao", tem("U6 Conta Um") and not tem("U6 Conta Dois"), texto_principal(200))
ir("/emporio/estoque")
confere("Estoque da Loja 1 (uma loja escolhida): o Sal, sem coluna Loja", tem("U6 Sal") and "loja" not in cabecalhos_da_tabela(), cabecalhos_da_tabela())
por_cookie(None)
ir("/emporio/estoque")
confere("Estoque em Todas (varias lojas): soma, com a coluna Loja e o Sal", "loja" in cabecalhos_da_tabela() and tem("U6 Sal") and tem("Loja Centro"), cabecalhos_da_tabela())

passo("6b. Nova compra, Conta avulsa e Nova transferencia abrem com a loja do topo")


def campo_do_formulario(rotulo):
    return norm(js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? (el.innerText || el.value || '') : 'SEM CAMPO'; })()") or "").strip()


por_cookie(l2)
ir("/emporio/compras")
confere("abre Nova compra", clicar("Nova compra"))
esperar(painel_aberto, 20)
time.sleep(1)
confere("Nova compra, com a Loja 2 no topo, abre com 'Loja' = " + LOJA_2, campo_do_formulario("Loja") == LOJA_2, campo_do_formulario("Loja"))
foto("nova-compra-loja2-1280")
js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
time.sleep(1)
por_cookie(None)
ir("/emporio/compras")
clicar("Nova compra")
esperar(painel_aberto, 20)
time.sleep(1)
confere("com 'Todas' no topo, Nova compra abre sem loja marcada (como antes)", campo_do_formulario("Loja") != LOJA_2 and campo_do_formulario("Loja") != LOJA_1, campo_do_formulario("Loja"))
js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
time.sleep(1)
# Trocar a loja na propria tela, com o formulario ja montado: ele precisa abrir com a loja nova.
por_cookie(l1)
ir("/emporio/compras")
confere("em Compras, troca o topo para " + LOJA_2, trocar_loja(LOJA_2) is True)
esperar(lambda: botao_topo() == "Loja: " + LOJA_2, 30)
time.sleep(2)
clicar("Nova compra")
esperar(painel_aberto, 20)
time.sleep(1)
confere("depois de trocar na propria tela, Nova compra abre com 'Loja' = " + LOJA_2, campo_do_formulario("Loja") == LOJA_2, campo_do_formulario("Loja"))
js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
time.sleep(1)

por_cookie(l2)
ir("/emporio/financeiro/pagar")
confere("abre Adicionar conta", clicar("Adicionar conta"))
esperar(painel_aberto, 20)
time.sleep(1)
print("   campos da Conta avulsa: Loja =", campo_do_formulario("Loja"))
confere("Conta avulsa, com a Loja 2 no topo, abre com 'Loja' = " + LOJA_2, campo_do_formulario("Loja") == LOJA_2, campo_do_formulario("Loja"))
js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
time.sleep(1)

ir("/emporio/transferencias")
confere("abre Nova transferencia", clicar("Nova transferência"))
esperar(painel_aberto, 20)
time.sleep(1)
confere("Nova transferencia, com a Loja 2 no topo, abre com a 'Loja de origem' = " + LOJA_2, campo_do_formulario("Loja de origem") == LOJA_2, campo_do_formulario("Loja de origem"))
js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
time.sleep(1)

# --- 7. As folhas e planilhas das Estatisticas com a loja da tela -----------------------------------
passo("7. Estatisticas: 'Imprimir ou PDF' e 'Planilha' saem com a loja que a tela mostra (a do cookie)")
por_cookie(l2)
ir("/emporio/estatisticas?aba=imprimir")
rels = js("Array.from(document.querySelectorAll('main li')).map(li => { const t = li.querySelector('p.font-medium'); const ach = (rot) => { const a = Array.from(li.querySelectorAll('a')).find(x => x.innerText.trim() === rot); return a ? a.getAttribute('href') : null; }; return [t ? t.innerText.trim() : '', ach('Imprimir ou PDF'), ach('Planilha')]; })") or []
print("   relatorios:", len(rels), "| botao:", botao_topo())
confere("a aba tem os oito relatorios", len(rels) == 8, [r[0] for r in rels])
confere("o botao do topo diz a Loja 2", botao_topo() == "Loja: " + LOJA_2, botao_topo())
sem_loja = [r[0] for r in rels if "loja=" + str(l2) not in (r[1] or "")]
confere("toda folha de imprimir leva loja=<Loja 2> (aberta noutra aba, sem o cookie da tela)", not sem_loja, sem_loja)
res = next((r for r in rels if r[0] == "Resultado do mês por loja"), None)
folha = buscar(res[1]) if res else {"status": None, "texto": ""}
print("   folha do Resultado:", res[1] if res else None, folha["status"], len(folha["texto"]))
confere("a folha do Resultado da Loja 2 abre e lista a " + LOJA_2 + " sem a " + LOJA_1, folha["status"] == 200 and LOJA_2 in folha["texto"] and LOJA_1 not in folha["texto"], [folha["status"], LOJA_2 in folha["texto"], LOJA_1 in folha["texto"]])
vend = next((r for r in rels if r[0] == "Produtos parados"), None)
folha2 = buscar(vend[1]) if vend else {"status": None, "texto": ""}
confere("a folha de Produtos parados da Loja 2 nao traz o Sal (so da Loja 1)", folha2["status"] == 200 and "U6 Sal" not in folha2["texto"], [folha2["status"], "U6 Sal" in folha2["texto"]])
csv = buscar(res[2]) if res else {"status": None, "texto": ""}
confere("a planilha do Resultado da Loja 2 so tem a " + LOJA_2, csv["status"] == 200 and LOJA_2 in csv["texto"] and LOJA_1 not in csv["texto"], [csv["status"], csv["texto"][:160]])
# O link do Hoje para o Caixa mantem ?loja= (o Caixa tem filtro proprio).
ir("/emporio/financeiro")
links_caixa = js("Array.from(document.querySelectorAll('main a')).map(a => a.getAttribute('href')).filter(h => h && h.startsWith('/emporio/caixa'))") or []
print("   links do Hoje para o Caixa:", links_caixa)
confere("os links do Hoje para o Caixa levam ?loja=<Loja 2>", len(links_caixa) > 0 and all("loja=" + str(l2) in h for h in links_caixa), links_caixa)

# --- 8. Financeiro e Caixa -------------------------------------------------------------------------------
passo("8. Financeiro: seletor nas telas do dinheiro. Caixa: sem seletor")
entrar("fin")
por_cookie(None)
ir("/emporio/financeiro/pagar")
confere("o Financeiro (todas as lojas) tem o seletor em A pagar", botao_topo() == "Loja: Todas", botao_topo())
foto("topo-financeiro-pagar-1280")
trocar_loja(LOJA_1)
esperar(lambda: tem("U6 Conta Um") and not tem("U6 Conta Dois"), 40)
confere("o Financeiro escolhe a " + LOJA_1 + " e A pagar mostra so a dela", tem("U6 Conta Um") and not tem("U6 Conta Dois"), texto_principal(200))
entrar("caixa")
por_cookie(None)
h = buscar("/emporio/vender")
confere("o HTML de /emporio/vender do Caixa nao tem o seletor 'Loja:'", h["status"] == 200 and "Loja: Todas" not in h["texto"], h["status"])
h = buscar("/emporio/caixa")
confere("o HTML de /emporio/caixa do Caixa nao tem o seletor 'Loja:'", h["status"] == 200 and "Loja: Todas" not in h["texto"], h["status"])
h = buscar("/emporio/vendas")
confere("o Caixa em /emporio/vendas nao recebe o seletor (uma loja so)", "Loja: Todas" not in h["texto"], h["status"])

# --- 9. A rota ------------------------------------------------------------------------------------------
passo("9. A rota recusa loja fora do alcance e nao grava o cookie")
entrar("gestor")
por_cookie(None)
ir("/emporio/vendas")
r = api("POST", "/api/v1/emporio/loja-do-topo", {"establishment_id": l2})
print("   Gestor escolhendo a Loja 2:", r)
confere("o Gestor escolhendo a " + LOJA_2 + " recebe 404", r["status"] == 404, r)
confere("e o cookie nao foi gravado", cookie_da_loja() is None, cookie_da_loja())
r = api("POST", "/api/v1/emporio/loja-do-topo", {"establishment_id": l1})
confere("o Gestor escolhendo a " + LOJA_1 + " passa (200) e grava o cookie", r["status"] == 200 and cookie_da_loja() == l1, [r["status"], cookie_da_loja()])
r = api("POST", "/api/v1/emporio/loja-do-topo", {"establishment_id": None})
confere("escolher 'Todas' (null) passa e apaga o cookie", r["status"] == 200 and cookie_da_loja() is None, [r["status"], cookie_da_loja()])

# --- 10. Celular (390 px) -------------------------------------------------------------------------------
passo("10. Celular (390 px): o seletor no topo, sem rolagem lateral")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
entrar("dono")
por_cookie(l1)
for caminho in ["/emporio", "/emporio/vendas", "/emporio/estoque", "/emporio/financeiro/pagar"]:
    ir(caminho)
    confere("390 px: " + caminho + " tem o botao do topo 'Loja: " + LOJA_1 + "'", botao_topo() == "Loja: " + LOJA_1, botao_topo())
    confere("390 px: " + caminho + " sem rolagem lateral", js("document.documentElement.scrollWidth <= window.innerWidth"), js("document.documentElement.scrollWidth + ' > ' + window.innerWidth"))
    if caminho == "/emporio/vendas":
        foto("topo-dono-vendas-loja1-390")
ir("/emporio/vendas")
js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Loja:')); if (b) b.click(); })()")
time.sleep(1)
foto("topo-dono-seletor-aberto-390")
caixa_visivel = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Loja:')); const m = b && b.parentElement.querySelector('.absolute'); if (!m) return null; const r = m.getBoundingClientRect(); return [r.left, r.right, window.innerWidth]; })()")
print("   lista aberta (esq, dir, largura):", caixa_visivel)
confere("390 px: a lista do seletor cabe na tela", bool(caixa_visivel) and caixa_visivel[0] >= 0 and caixa_visivel[1] <= caixa_visivel[2], caixa_visivel)
entrar("gestor")
por_cookie(None)
ir("/emporio/vendas")
foto("topo-gestor-vendas-390")
entrar("fin")
ir("/emporio/financeiro/pagar")
foto("topo-financeiro-pagar-390")
entrar("caixa")
try:
    ir("/emporio/vender")
    foto("topo-caixa-vender-390")
except Exception as e:
    print("   foto do Caixa nao tirada:", e)

# --- 11. Fotos no computador (so com TIBE_FOTOS) ------------------------------------------------------------
passo("11. Fotos no computador (so com TIBE_FOTOS)")
cdp("Emulation.setDeviceMetricsOverride", width=1280, height=900, deviceScaleFactor=1, mobile=False)
entrar("dono")
por_cookie(l1)
ir("/emporio/vendas")
foto("topo-dono-vendas-loja1-1280")
js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Loja:')); if (b) b.click(); })()")
time.sleep(1)
foto("topo-dono-seletor-aberto-1280")
entrar("fin")
ir("/emporio/financeiro/pagar")
foto("topo-financeiro-pagar-1280")
entrar("caixa")
try:
    ir("/emporio/vender")
    foto("topo-caixa-vender-1280")
except Exception as e:
    print("   foto do Caixa nao tirada:", e)

cdp("Emulation.clearDeviceMetricsOverride")
fim()
