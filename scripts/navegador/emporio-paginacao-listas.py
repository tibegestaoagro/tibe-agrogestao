# Validacao viva da paginacao das listas do Meu Emporio e da curva ABC fechando em 100% (Modulo 39, dividas 5.26 e
# 5.27, Q366 e Q367): docs/superpowers/specs/2026-11-18-emporio-paginacao-listas-design.md
#
# Os valores esperados sao contas feitas a mao a partir do cenario (ver o cabecalho de
# scripts/_cenario-emporio-paginacao-listas.ts), nunca copiadas da resposta do app.
#
#   1. Vendas (45): 20 por pagina, pagina 3, 40 por pagina volta a 1, mais antigos primeiro, filtro na pagina 3 volta a 1
#   2. Compras (45): o mesmo
#   3. Transferencias (45): o mesmo
#   4. Producoes na ficha do produto (25): paginacao compacta, sem seletor, pagina_prod na URL
#   5. Caixa (45 movimentos, 45 entregas pendentes): cada lista com a propria pagina; entregas da mais antiga
#   6. Tela inicial do Emporio: os resumos de sempre, sem barra de paginas
#   7. Curva ABC com tres itens iguais: 33,34 + 33,33 + 33,33 = 100,00 e o seletor de lucro para o Dono
#   8. 390 px sem rolagem horizontal em Vendas, Compras, Caixa e na ficha do produto
#   9. Sobras da 5.28: antecipacoes (45) e conferencias (45) paginam pela API; 80 e 100 por pagina em Compras e
#      Transferencias; o Vendedor nao abre o Relatorios
#
# cenario: scripts/_cenario-emporio-paginacao-listas.ts
# sessao: owner owner@example.com
# sessao: vendedor pag-vendedor@teste.local
import re
import datetime

DIA = "2026-03-10"


def tela(largura, altura, escala=1, movel=False):
    cdp("Emulation.setDeviceMetricsOverride", width=largura, height=altura, deviceScaleFactor=escala, mobile=movel)


def caminho():
    return js("location.pathname + location.search") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText") or ""


def rolagem_horizontal():
    return js("[document.documentElement.scrollWidth, window.innerWidth]")


def br(texto):
    """'R$ 5.000,00' ou '44,44%' vira float."""
    limpo = re.sub(r"[^0-9,\-]", "", texto.replace(".", ""))
    return float(limpo.replace(",", ".")) if limpo not in ("", "-") else None


def perto(a, b, tol=0.011):
    return a is not None and abs(a - b) <= tol


def aria_escolher(aria, opcao):
    """Escolhe `opcao` no Select (Radix) cujo gatilho tem aria-label `aria`. Clique por coordenada, como o Radix pede."""
    xy = js("(() => { const el = document.querySelector('[aria-label=' + JSON.stringify(" + repr(aria) + ") + ']'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()")
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = js("(() => { const o = Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(opcao) + "); if (!o) return null; const b = o.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


# --- leitura de uma lista (a pagina inteira, ou uma secao pelo titulo h2) -----------------------------------------------
def _escopo(titulo):
    """Expressao JS do elemento que contem a lista: a secao do h2 `titulo`, ou o main."""
    if not titulo:
        return "document.querySelector('main')"
    return "(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === " + repr(titulo) + "); return h && h.closest('section'); })()"


def linhas(titulo="", col=0):
    return js("(() => { const s = " + _escopo(titulo) + "; if (!s) return []; return Array.from(s.querySelectorAll('tbody tr')).map(tr => { const td = tr.querySelectorAll('td')[" + str(col) + "]; return td ? td.innerText.replace(/\\s+/g, ' ').trim() : ''; }); })()") or []


def mostrando(titulo=""):
    return js("(() => { const s = " + _escopo(titulo) + "; if (!s) return ''; const p = Array.from(s.querySelectorAll('p')).find(x => x.innerText.trim().startsWith('Mostrando')); return p ? p.innerText.trim() : ''; })()") or ""


def nav(titulo=""):
    return js("(() => { const s = " + _escopo(titulo) + "; const n = s && s.querySelector('nav[aria-label=\"Paginação\"]'); if (!n) return null; return { itens: Array.from(n.children).map(e => ({ t: e.innerText.trim(), tag: e.tagName, atual: e.getAttribute('aria-current'), desab: e.getAttribute('aria-disabled'), href: e.getAttribute('href') })) }; })()")


def item(n, rotulo):
    return next((i for i in (n or {"itens": []})["itens"] if i["t"] == rotulo), None)


def clicar_pagina(n, titulo=""):
    """Clica o link 'Pagina n' da barra (da secao `titulo`, se houver)."""
    return bool(js("(() => { const s = " + _escopo(titulo) + "; const a = s && s.querySelector('nav[aria-label=\"Paginação\"] a[aria-label=\"Página " + str(n) + "\"]'); if (!a) return false; a.click(); return true; })()"))


def esperar_mostrando(texto, titulo="", segundos=40):
    esperar(lambda: mostrando(titulo).startswith(texto), segundos)
    time.sleep(0.8)


def nums(v):
    return [int(re.sub(r"[^0-9]", "", x)) for x in v]


def data_br(d):
    return d.strftime("%d/%m/%Y")


# --- montagem ----------------------------------------------------------------------------------------------------------
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
cdp("Page.enable")
entrar("owner")
tela(1280, 900)
ir("/emporio")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]


def loja_id(nome):
    x = next((x for x in lojas if x["name"] == "Pag " + nome), None)
    return x["id"] if x else ""


L_VENDAS = loja_id("Vendas")
L_COMPRAS = loja_id("Compras")
L_DESTINO = loja_id("Transf Destino")
L_PRODUCAO = loja_id("Producao")
L_CAIXA = loja_id("Caixa")
L_CURVA = loja_id("Curva")
confere("acha as lojas do cenario pela API", all([L_VENDAS, L_COMPRAS, L_DESTINO, L_PRODUCAO, L_CAIXA, L_CURVA]), len(lojas))


def ir_lista(rota, loja, extra="", titulo=""):
    ir(rota + "?loja=" + loja + extra)
    esperar(lambda: len(linhas(titulo)) > 0, 60)
    time.sleep(1)


def provar_lista(nome, rota, loja, ler_col, esperado_por_k, rotulo_filtro, opcao_filtro):
    """Roda a sequencia da paginacao completa numa lista de 45. `esperado_por_k(k)` e o texto da k-esima linha do mais antigo (k=0) ao mais novo."""
    ir_lista(rota, loja)
    col = linhas("", ler_col)
    n = nav()
    confere(nome + ": padrao 20 linhas e 'Mostrando 1 a 20 de 45'", len(col) == 20 and mostrando() == "Mostrando 1 a 20 de 45", [len(col), mostrando()])
    confere(nome + ": padrao mais novos primeiro (a primeira linha e a do k=44, a ultima a do k=25)", col[:1] == [esperado_por_k(44)] and col[-1:] == [esperado_por_k(25)], [col[:1], col[-1:]])
    confere(nome + ": a barra tem Anterior, 1, 2, 3 e Proxima", [i["t"] for i in n["itens"]] == ["Anterior", "1", "2", "3", "Próxima"] if n else False, n)
    confere(nome + ": os seletores 'Por pagina' e 'Ordem' estao na tela", bool(js("!!document.querySelector('[aria-label=\"Por página\"]') && !!document.querySelector('[aria-label=\"Ordem\"]')")))

    confere(nome + ": clica na pagina 3", clicar_pagina(3))
    esperar(lambda: "pagina=3" in caminho(), 60)
    esperar_mostrando("Mostrando 41 a 45 de 45")
    col = linhas("", ler_col)
    confere(nome + ": pagina 3 'Mostrando 41 a 45 de 45', 5 linhas, a ultima e a mais antiga", mostrando() == "Mostrando 41 a 45 de 45" and len(col) == 5 and col[-1] == esperado_por_k(0) and col[0] == esperado_por_k(4), [mostrando(), col])

    confere(nome + ": filtro (" + opcao_filtro + ") estando na pagina 3", aria_escolher(rotulo_filtro, opcao_filtro) is True)
    esperar(lambda: "pagina=3" not in caminho(), 60)
    esperar_mostrando("Mostrando 1 a 20 de 45")
    confere(nome + ": mudar o filtro na pagina 3 volta a pagina 1 (URL sem 'pagina=', total 45)", "&pagina=" not in caminho() and "?pagina=" not in caminho() and mostrando() == "Mostrando 1 a 20 de 45", [caminho(), mostrando()])

    ir_lista(rota, loja, "&por_pagina=40&pagina=2")
    esperar_mostrando("Mostrando 41 a 45 de 45")
    confere(nome + ": 40 por pagina, pagina 2: 'Mostrando 41 a 45 de 45'", mostrando() == "Mostrando 41 a 45 de 45", mostrando())
    ir_lista(rota, loja, "&pagina=3")
    esperar_mostrando("Mostrando 41 a 45 de 45")
    confere(nome + ": troca 'Por pagina' para 40", aria_escolher("Por página", "40 por página") is True)
    esperar(lambda: "por_pagina=40" in caminho(), 60)
    esperar_mostrando("Mostrando 1 a 40 de 45")
    confere(nome + ": 40 por pagina volta a pagina 1 (URL sem 'pagina=' solto, 40 linhas)", "&pagina=" not in caminho() and "?pagina=" not in caminho() and mostrando() == "Mostrando 1 a 40 de 45" and len(linhas("", ler_col)) == 40, [caminho(), mostrando(), len(linhas("", ler_col))])
    confere(nome + ": agora sao 2 paginas", [i["t"] for i in nav()["itens"]] == ["Anterior", "1", "2", "Próxima"], nav())

    ir_lista(rota, loja, "&por_pagina=40&pagina=2")
    esperar_mostrando("Mostrando 41 a 45 de 45")
    confere(nome + ": troca a ordem para 'Mais antigos primeiro'", aria_escolher("Ordem", "Mais antigos primeiro") is True)
    esperar(lambda: "ordem=asc" in caminho(), 60)
    esperar_mostrando("Mostrando 1 a 40 de 45")
    col = linhas("", ler_col)
    confere(nome + ": ordem crescente volta a pagina 1 e comeca no mais antigo, sobe de 1 em 1", "ordem=asc" in caminho() and "&pagina=" not in caminho() and len(col) == 40 and col == [esperado_por_k(k) for k in range(40)], [caminho(), col[:3]])


# --- 1 ------------------------------------------------------------------------------------------------------------------
passo("1. Vendas paginadas (45 na loja 'Pag Vendas')")
sv = api("GET", "/api/v1/emporio/sales?establishment_id=" + L_VENDAS + "&per_page=100&order=asc")["body"]
numeros_v = [x["number"] for x in sv["data"]]
confere("a API tem as 45 vendas da loja, numeradas em sequencia (conta feita fora da tela)", len(numeros_v) == 45 and numeros_v == list(range(numeros_v[0], numeros_v[0] + 45)), [len(numeros_v), numeros_v[:3]])
N0 = numeros_v[0] if numeros_v else 0


def fmt_num(k):
    return str(N0 + k)


def num_da_tela(texto):
    return str(int(re.sub(r"[^0-9]", "", texto)))


# A tela formata o numero (pode ter ponto de milhar); comparamos so os digitos.
def provar_vendas():
    ir_lista("/emporio/vendas", L_VENDAS)
    col = [num_da_tela(x) for x in linhas("", 0)]
    n = nav()
    confere("vendas: padrao 20 linhas e 'Mostrando 1 a 20 de 45'", len(col) == 20 and mostrando() == "Mostrando 1 a 20 de 45", [len(col), mostrando()])
    confere("vendas: padrao mais novas primeiro (numeros descem de 1 em 1 a partir de " + fmt_num(44) + ")", col == [fmt_num(44 - k) for k in range(20)], col)
    confere("vendas: a barra tem Anterior, 1, 2, 3 e Proxima", [i["t"] for i in n["itens"]] == ["Anterior", "1", "2", "3", "Próxima"] if n else False, n)
    confere("vendas: Anterior desabilitado na pagina 1 (aria-disabled, sem link) e aria-current so no 1", item(n, "Anterior")["desab"] == "true" and item(n, "Anterior")["href"] is None and [i["t"] for i in n["itens"] if i["atual"] == "page"] == ["1"], n)
    confere("vendas: os seletores 'Por pagina' e 'Ordem' estao na tela", bool(js("!!document.querySelector('[aria-label=\"Por página\"]') && !!document.querySelector('[aria-label=\"Ordem\"]')")))

    confere("vendas: clica na pagina 3", clicar_pagina(3))
    esperar(lambda: "pagina=3" in caminho(), 60)
    esperar_mostrando("Mostrando 41 a 45 de 45")
    col = [num_da_tela(x) for x in linhas("", 0)]
    n = nav()
    confere("vendas: pagina 3 'Mostrando 41 a 45 de 45', 5 linhas, ultima e a mais antiga", mostrando() == "Mostrando 41 a 45 de 45" and col == [fmt_num(4 - k) for k in range(5)], [mostrando(), col])
    confere("vendas: Proxima desabilitada na ultima, aria-current no 3", item(n, "Próxima")["desab"] == "true" and [i["t"] for i in n["itens"] if i["atual"] == "page"] == ["3"], n)

    confere("vendas: mudar a situacao para Concluida estando na pagina 3", aria_escolher("Filtrar por situação", "Concluída") is True)
    esperar(lambda: "pagina=3" not in caminho(), 60)
    esperar_mostrando("Mostrando 1 a 20 de 45")
    confere("vendas: filtro na pagina 3 volta a pagina 1 (URL sem 'pagina=', situacao mantida)", "pagina=" not in caminho().replace("por_pagina=", "") and "situacao=concluida" in caminho() and mostrando() == "Mostrando 1 a 20 de 45", [caminho(), mostrando()])

    ir_lista("/emporio/vendas", L_VENDAS, "&pagina=3")
    esperar_mostrando("Mostrando 41 a 45 de 45")
    confere("vendas: troca 'Por pagina' para 40 estando na pagina 3", aria_escolher("Por página", "40 por página") is True)
    esperar(lambda: "por_pagina=40" in caminho(), 60)
    esperar_mostrando("Mostrando 1 a 40 de 45")
    confere("vendas: 40 por pagina volta a pagina 1 (URL sem 'pagina=', 40 linhas)", "pagina=" not in caminho().replace("por_pagina=", "") and mostrando() == "Mostrando 1 a 40 de 45" and len(linhas("", 0)) == 40, [caminho(), mostrando(), len(linhas("", 0))])
    confere("vendas: agora sao 2 paginas", [i["t"] for i in nav()["itens"]] == ["Anterior", "1", "2", "Próxima"], nav())

    ir_lista("/emporio/vendas", L_VENDAS, "&por_pagina=40&pagina=2")
    esperar_mostrando("Mostrando 41 a 45 de 45")
    confere("vendas: troca a ordem para 'Mais antigos primeiro'", aria_escolher("Ordem", "Mais antigos primeiro") is True)
    esperar(lambda: "ordem=asc" in caminho(), 60)
    esperar_mostrando("Mostrando 1 a 40 de 45")
    col = [num_da_tela(x) for x in linhas("", 0)]
    confere("vendas: ordem crescente volta a pagina 1 e comeca na venda mais antiga (" + fmt_num(0) + "), sobe de 1 em 1", "ordem=asc" in caminho() and "pagina=" not in caminho().replace("por_pagina=", "") and col == [fmt_num(k) for k in range(40)], [caminho(), col[:3]])
    confere("vendas: tamanho segue na URL", "por_pagina=40" in caminho(), caminho())

    ir_lista("/emporio/vendas", L_VENDAS, "&pagina=99")
    esperar_mostrando("Mostrando 41 a 45 de 45")
    confere("vendas: ?pagina=99 mostra a ultima ('Mostrando 41 a 45 de 45')", mostrando() == "Mostrando 41 a 45 de 45", mostrando())


provar_vendas()

# --- 2 ------------------------------------------------------------------------------------------------------------------
passo("2. Compras paginadas (45 na loja 'Pag Compras', uma por dia desde 01/01/2026)")
D0 = datetime.date(2026, 1, 1)
provar_lista("compras", "/emporio/compras", L_COMPRAS, 0, lambda k: data_br(D0 + datetime.timedelta(days=k)), "Filtrar por situação", "Pendente")

# --- 3 ------------------------------------------------------------------------------------------------------------------
passo("3. Transferencias paginadas (45, destino 'Pag Transf Destino', uma por dia desde 01/01/2026)")
provar_lista("transferencias", "/emporio/transferencias", L_DESTINO, 0, lambda k: data_br(D0 + datetime.timedelta(days=k)), "Filtrar por situação", "Em trânsito")

# --- 4 ------------------------------------------------------------------------------------------------------------------
passo("4. Producoes na ficha do produto (25): paginacao compacta")
prods = api("GET", "/api/v1/emporio/products")["body"]["data"]
PROD = next((p for p in prods if p["name"] == "Pag Prod"), None)
confere("acha 'Pag Prod' pela API", PROD is not None, len(prods))
if PROD:
    ficha = "/emporio/produtos/" + PROD["id"]
    ir(ficha)
    esperar(lambda: len(linhas("Produções")) > 0, 60)
    time.sleep(1)
    esperar_mostrando("Mostrando 1 a 20 de 25", "Produções")
    n = nav("Produções")
    confere("producoes: 20 linhas e 'Mostrando 1 a 20 de 25'", len(linhas("Produções")) == 20 and mostrando("Produções") == "Mostrando 1 a 20 de 25", [len(linhas("Produções")), mostrando("Produções")])
    confere("producoes: barra com Anterior, 1, 2 e Proxima", [i["t"] for i in n["itens"]] == ["Anterior", "1", "2", "Próxima"] if n else False, n)
    confere("producoes: compacta, sem seletor 'Por pagina' nem 'Ordem'", not js("!!document.querySelector('[aria-label=\"Por página\"]') || !!document.querySelector('[aria-label=\"Ordem\"]')"))
    confere("producoes: o link da pagina 2 usa pagina_prod", "pagina_prod=2" in ((item(n, "Próxima") or {}).get("href") or ""), item(n, "Próxima"))
    confere("producoes: clica na pagina 2", clicar_pagina(2, "Produções"))
    esperar(lambda: "pagina_prod=2" in caminho(), 60)
    esperar_mostrando("Mostrando 21 a 25 de 25", "Produções")
    confere("producoes: pagina 2 'Mostrando 21 a 25 de 25', 5 linhas, URL com pagina_prod=2", mostrando("Produções") == "Mostrando 21 a 25 de 25" and len(linhas("Produções")) == 5 and "pagina_prod=2" in caminho(), [mostrando("Produções"), len(linhas("Produções")), caminho()])
    confere("producoes: Proxima desabilitada na ultima", item(nav("Produções"), "Próxima")["desab"] == "true", nav("Produções"))

# --- 5 ------------------------------------------------------------------------------------------------------------------
passo("5. Caixa: movimentos e entregas, cada uma com a propria pagina")
ENT = "Aguardando o gerente"
MOV = "Movimentos"


def ir_caixa(extra=""):
    ir("/emporio/caixa" + extra)
    esperar(lambda: len(linhas(ENT)) > 0 and len(linhas(MOV)) > 0, 60)
    time.sleep(1)


def valores(titulo, col):
    return [br(x) for x in linhas(titulo, col)]


ir_caixa()
mm = mostrando(MOV)
me = mostrando(ENT)
tm = re.search(r"de (\d+)$", mm)
te = re.search(r"de (\d+)$", me)
TM = int(tm.group(1)) if tm else 0
TE = int(te.group(1)) if te else 0
confere("caixa: movimentos 'Mostrando 1 a 20 de N' com N >= 45 e 20 linhas", mm.startswith("Mostrando 1 a 20 de ") and TM >= 45 and len(linhas(MOV)) == 20, [mm, len(linhas(MOV))])
confere("caixa: entregas 'Mostrando 1 a 20 de N' com N >= 45 e 20 linhas", me.startswith("Mostrando 1 a 20 de ") and TE >= 45 and len(linhas(ENT)) == 20, [me, len(linhas(ENT))])
confere("caixa: as entregas comecam pela mais antiga (sangrias de R$ 500,00 a R$ 519,00, criadas em 2020)", valores(ENT, 1) == [float(500 + k) for k in range(20)], valores(ENT, 1))

ir_caixa("?pagina_ent=2&pagina_mov=2")
esperar_mostrando("Mostrando 21 a 40 de", ENT)
esperar_mostrando("Mostrando 21 a 40 de", MOV)
confere("caixa: pagina_ent=2&pagina_mov=2 mostram, cada uma, 21 a 40", mostrando(ENT).startswith("Mostrando 21 a 40 de") and mostrando(MOV).startswith("Mostrando 21 a 40 de"), [mostrando(ENT), mostrando(MOV)])
confere("caixa: a pagina 2 das entregas segue a ordem da mais antiga (R$ 520,00 a R$ 539,00)", valores(ENT, 1) == [float(520 + k) for k in range(20)], valores(ENT, 1))
href_mov3 = js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Movimentos'); const a = h.closest('section').querySelector('nav a[aria-label=\"Página 3\"]'); return a ? a.getAttribute('href') : null; })()")
confere("caixa: o link da pagina 3 dos movimentos preserva pagina_ent=2 e muda so pagina_mov=3", href_mov3 is not None and "pagina_ent=2" in href_mov3 and "pagina_mov=3" in href_mov3, href_mov3)
confere("caixa: clica na pagina 3 dos movimentos", clicar_pagina(3, MOV))
esperar(lambda: "pagina_mov=3" in caminho(), 60)
esperar_mostrando("Mostrando 41 a", MOV)
confere("caixa: mudar os movimentos para a pagina 3 NAO mexe nas entregas (seguem em 21 a 40, URL com pagina_ent=2)", mostrando(MOV).startswith("Mostrando 41 a") and mostrando(ENT).startswith("Mostrando 21 a 40 de") and "pagina_ent=2" in caminho() and "pagina_mov=3" in caminho(), [mostrando(ENT), mostrando(MOV), caminho()])
confere("caixa: as entregas continuam em R$ 520,00 a R$ 539,00", valores(ENT, 1) == [float(520 + k) for k in range(20)], valores(ENT, 1))

href_ent1 = js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Aguardando o gerente'); const a = h.closest('section').querySelector('nav a[aria-label=\"Página 1\"]'); return a ? a.getAttribute('href') : null; })()")
confere("caixa: o link da pagina 1 das entregas preserva pagina_mov=3 e nao leva pagina_ent", href_ent1 is not None and "pagina_mov=3" in href_ent1 and "pagina_ent" not in href_ent1, href_ent1)
confere("caixa: clica na pagina 1 das entregas", clicar_pagina(1, ENT))
esperar(lambda: "pagina_ent" not in caminho(), 60)
esperar_mostrando("Mostrando 1 a 20 de", ENT)
confere("caixa: mudar as entregas para a pagina 1 NAO mexe nos movimentos (seguem em 41 a ..., URL com pagina_mov=3 e sem pagina_ent)", mostrando(ENT).startswith("Mostrando 1 a 20 de") and mostrando(MOV).startswith("Mostrando 41 a") and "pagina_mov=3" in caminho() and "pagina_ent" not in caminho(), [mostrando(ENT), mostrando(MOV), caminho()])
confere("caixa: as entregas voltam a R$ 500,00 a R$ 519,00 (a mais antiga primeiro)", valores(ENT, 1) == [float(500 + k) for k in range(20)], valores(ENT, 1))

# Ordem e tamanho dos Movimentos (divida 5.28): ordem_mov e por_pagina_mov na URL, a pagina de Movimentos volta a 1.
ir_caixa("?pagina_mov=2")
esperar_mostrando("Mostrando 21 a 40 de", MOV)
desc_p2 = linhas(MOV)
confere("caixa: 'Ordem' dos movimentos estando na pagina 2 (Mais antigos primeiro)", aria_escolher("Ordem", "Mais antigos primeiro") is True)
esperar(lambda: "ordem_mov=asc" in caminho(), 60)
esperar_mostrando("Mostrando 1 a 20 de", MOV)
asc_p1 = linhas(MOV)
confere("caixa: ordem_mov=asc volta os movimentos a pagina 1 (URL sem pagina_mov), 20 linhas", "ordem_mov=asc" in caminho() and "?pagina_mov" not in caminho() and "&pagina_mov" not in caminho() and len(asc_p1) == 20, [caminho(), len(asc_p1)])
ir_caixa("?por_pagina_mov=100")
esperar_mostrando("Mostrando 1 a", MOV)
desc_todos = linhas(MOV)
ir_caixa("?por_pagina_mov=100&ordem_mov=asc")
esperar_mostrando("Mostrando 1 a", MOV)
asc_todos = linhas(MOV)
confere("caixa: a ordem crescente inverte a primeira linha dos movimentos (a primeira de asc nao e a primeira de desc)", len(asc_todos) > 0 and asc_todos[0] != desc_todos[0], [asc_todos[:1], desc_todos[:1]])
confere("caixa: a primeira linha em ordem crescente e a ultima em ordem decrescente (tamanho 100 cobre os movimentos)", TM > 100 or asc_todos[0] == desc_todos[-1], [asc_todos[:1], desc_todos[-1:], TM])
ir_caixa("?pagina_mov=3")
esperar_mostrando("Mostrando 41 a", MOV)
confere("caixa: 'Por pagina' dos movimentos 40 estando na pagina 3", aria_escolher("Por página", "40 por página") is True)
esperar(lambda: "por_pagina_mov=40" in caminho(), 60)
esperar_mostrando("Mostrando 1 a 40 de", MOV)
confere("caixa: por_pagina_mov=40 volta a pagina 1 (URL sem pagina_mov), 40 linhas, entregas ainda em 20", "?pagina_mov" not in caminho() and "&pagina_mov" not in caminho() and len(linhas(MOV)) == 40 and len(linhas(ENT)) == 20, [caminho(), len(linhas(MOV)), len(linhas(ENT))])

# --- 5b -----------------------------------------------------------------------------------------------------------------
# Achado do juiz (18/11): a aba Esperando das Aprovacoes cortava em 200 em silencio. Os 25 pedidos do cenario
# (R$ 700 a 724) sao os pendentes mais antigos da conta: a pagina 1 comeca no R$ 700, a 2 traz o R$ 720.
passo("5b. Aprovacoes: os pedidos pendentes paginam (25 do cenario, os mais antigos)")
ir("/emporio/financeiro/aprovacoes?status=pendente")
esperar(lambda: mostrando().startswith("Mostrando 1 a 20 de"), 60)
texto1 = texto_do_main().replace(" ", " ")
confere("aprovacoes: 'Mostrando 1 a 20 de N' (N >= 25) e a barra com a pagina 2", mostrando().startswith("Mostrando 1 a 20 de") and int((re.findall(r"\d+", mostrando()) or ["0"])[-1]) >= 25 and item(nav(), "2") is not None, [mostrando(), nav()])
confere("aprovacoes: a pagina 1 traz o mais antigo (R$ 700,00) e nao o 21o (R$ 720,00)", "R$ 700,00" in texto1 and "R$ 720,00" not in texto1, texto1[:300])
confere("aprovacoes: clica na pagina 2", clicar_pagina(2))
esperar(lambda: mostrando().startswith("Mostrando 21 a"), 60)
texto2 = texto_do_main().replace(" ", " ")
confere("aprovacoes: pagina 2 'Mostrando 21 a ...', com o R$ 720,00 e sem o R$ 700,00, URL com pagina=2", mostrando().startswith("Mostrando 21 a") and "R$ 720,00" in texto2 and "R$ 700,00" not in texto2 and "pagina=2" in caminho(), [mostrando(), caminho()])

# Divida 5.28: 'Por pagina' na aba Esperando (so ele: sem 'Ordem', a fila e sempre do mais antigo).
def cartoes_de_pedido():
    return js("document.querySelectorAll('main li.rounded-lg').length") or 0


ir("/emporio/financeiro/aprovacoes?status=pendente&pagina=2")
esperar(lambda: mostrando().startswith("Mostrando 21 a"), 60)
confere("aprovacoes: o seletor 'Por pagina' esta na tela e o 'Ordem' nao", bool(js("!!document.querySelector('[aria-label=\"Por página\"]') && !document.querySelector('[aria-label=\"Ordem\"]')")))
confere("aprovacoes: troca 'Por pagina' para 40 estando na pagina 2", aria_escolher("Por página", "40 por página") is True)
esperar(lambda: "por_pagina=40" in caminho(), 60)
esperar(lambda: mostrando().startswith("Mostrando 1 a"), 60)
time.sleep(0.8)
n_pedidos = cartoes_de_pedido()
texto40 = texto_do_main().replace(chr(160), " ")
confere("aprovacoes: 40 por pagina volta a pagina 1 (URL sem 'pagina=' solto) e mostra mais de 20 pedidos (inclui R$ 700,00 e R$ 720,00)", "pagina=" not in caminho().replace("por_pagina=", "") and n_pedidos > 20 and "R$ 700,00" in texto40 and "R$ 720,00" in texto40, [caminho(), n_pedidos, mostrando()])

# --- 6 ------------------------------------------------------------------------------------------------------------------
passo("6. Tela inicial do Emporio: os resumos de sempre")
ir("/emporio")
esperar(lambda: "Meu Empório" in texto_do_main(), 60)
t = texto_do_main()
tv = api("GET", "/api/v1/emporio/transfers?status=em_transito&per_page=100")["body"]["meta"]["total"]
tc = api("GET", "/api/v1/emporio/purchases?status=pendente&per_page=100")["body"]["meta"]["total"]
confere("inicio: sem barra de paginas nem 'Mostrando'", nav() is None and "Mostrando" not in t, t[:120])
confere("inicio: os cartoes de sempre estao la", all(x in t for x in ["Lojas", "Produtos", "Estoque", "Compras", "Transferências", "Vendas", "Fiado", "Caixa"]), t[:200])
m_c = re.search(r"(\d+)\s*compras? a receber", t)
m_t = re.search(r"(\d+)\s*transferências? em trânsito", t)
confere("inicio: o cartao de Compras conta todas as pendentes da conta (igual ao total da API: " + str(tc) + ")", m_c is not None and int(m_c.group(1)) == tc and tc >= 45, [m_c and m_c.group(0), tc])
confere("inicio: o cartao de Transferencias conta todas as em transito (igual ao total da API: " + str(tv) + ")", m_t is not None and int(m_t.group(1)) == tv and tv >= 45, [m_t and m_t.group(0), tv])

# --- 7 ------------------------------------------------------------------------------------------------------------------
passo("7. Curva ABC com tres itens iguais (loja 'Pag Curva', dia " + DIA + ")")


def secao_abc():
    return js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Curva ABC'); const s = h && h.closest('section'); if (!s) return null; return { texto: s.innerText.replace(/\\s+/g, ' '), linhas: Array.from(s.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.replace(/\\s+/g, ' ').trim())), resumo: Array.from(s.querySelectorAll('ul li')).map(li => li.innerText.replace(/\\s+/g, ' ').trim()), abas: Array.from(s.querySelectorAll('a')).map(a => [a.innerText.trim(), a.className.includes('bg-superficie-afundada')]) }; })()")


ir("/emporio/relatorios?de=" + DIA + "&ate=" + DIA + "&abc=produtos&medida=faturamento&loja=" + L_CURVA)
esperar(lambda: secao_abc() is not None, 60)
time.sleep(1.5)
s = secao_abc()
if s:
    pct = [br(l[4]) for l in s["linhas"]]
    confere("curva: 3 produtos iguais, R$ 10,00 cada", len(s["linhas"]) == 3 and [br(l[3]) for l in s["linhas"]] == [10.0, 10.0, 10.0], s["linhas"])
    confere("curva: participacao dos itens 33,34 + 33,33 + 33,33", sorted(pct, reverse=True) == [33.34, 33.33, 33.33], pct)
    confere("curva: os itens somam exatamente 100,00%", round(sum(p * 100 for p in pct)) == 10000, pct)
    confere("curva: o acumulado do ultimo item e 100,00", perto(br(s["linhas"][2][5]), 100, 0.001), [l[5] for l in s["linhas"]])
    res = s["resumo"]
    pres = []
    for r in res:
        m = re.search(r"(\d+(?:,\d+)?)%", r)
        pres.append(float(m.group(1).replace(",", ".")) if m else None)
    confere("curva: o resumo das classes soma exatamente 100,00%", len(res) == 3 and None not in pres and round(sum(p * 100 for p in pres)) == 10000, res)
    confere("curva: o resumo mostra o total em reais das classes (A, B e C: 30 no total)", "R$ 30,00" in " ".join(res) or "R$ 20,00" in " ".join(res), res)
    confere("curva: o seletor de lucro aparece para o Dono (Faturamento e Lucro)", ["Faturamento", True] in s["abas"] and ["Lucro (venda menos custo)", False] in s["abas"], s["abas"])
else:
    confere("a secao 'Curva ABC' existe", False, caminho())

# --- 8 ------------------------------------------------------------------------------------------------------------------
passo("8. 390 px: sem rolagem horizontal")
tela(390, 844, 1, True)
for nome, url, extra in [
    ("vendas", "/emporio/vendas?loja=" + L_VENDAS, ""),
    ("vendas pagina 3", "/emporio/vendas?loja=" + L_VENDAS + "&pagina=3", ""),
    ("compras", "/emporio/compras?loja=" + L_COMPRAS, ""),
    ("caixa", "/emporio/caixa?pagina_ent=2&pagina_mov=2", ""),
    ("ficha do produto", "/emporio/produtos/" + (PROD["id"] if PROD else "x") + "?pagina_prod=2", ""),
]:
    ir(url)
    esperar(lambda: js("!!document.querySelector('main h1')"), 60)
    time.sleep(1.5)
    larg = rolagem_horizontal()
    confere("390 px, " + nome + ": a pagina nao rola na horizontal", larg is not None and larg[0] <= larg[1] and larg[1] == 390, larg)
    nv = js("(() => { const n = document.querySelector('nav[aria-label=\"Paginação\"]'); if (!n) return null; const b = n.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; })()")
    confere("390 px, " + nome + ": a barra de paginas cabe na largura", nv is not None and nv[0] >= 0 and nv[1] <= 390, nv)
cdp("Emulation.clearDeviceMetricsOverride")
tela(1280, 900)

# --- 9 ------------------------------------------------------------------------------------------------------------------
passo("9. Antecipacoes e conferencias (API), 80 e 100 por pagina, o Vendedor e o Relatorios")
L_CONF = loja_id("Conferencias")
confere("acha a loja 'Pag Conferencias'", bool(L_CONF), len(lojas))


def pagina_api(caminho_api, page, per_page):
    r = api("GET", caminho_api + ("&" if "?" in caminho_api else "?") + "page=" + str(page) + "&per_page=" + str(per_page))
    return r["body"] or {}


def provar_api(nome, caminho_api):
    """45 linhas: 20 + 20 + 5 por paginas de 20, 45 numa so de 80 e de 100."""
    p1, p2, p3 = (pagina_api(caminho_api, k, 20) for k in (1, 2, 3))
    meta = p1.get("meta") or {}
    confere(nome + ": pagina 1 de 20 traz 20 linhas e meta.total 45", len(p1.get("data") or []) == 20 and meta.get("total") == 45 and meta.get("per_page") == 20, [len(p1.get("data") or []), meta])
    confere(nome + ": paginas 2 e 3 trazem 20 e 5 linhas", len(p2.get("data") or []) == 20 and len(p3.get("data") or []) == 5, [len(p2.get("data") or []), len(p3.get("data") or [])])
    ids = [x["id"] for p in (p1, p2, p3) for x in (p.get("data") or [])]
    confere(nome + ": as tres paginas juntas trazem 45 ids distintos (nada repete, nada some)", len(ids) == 45 and len(set(ids)) == 45, [len(ids), len(set(ids))])
    for n in (80, 100):
        pn = pagina_api(caminho_api, 1, n)
        confere(nome + ": " + str(n) + " por pagina traz as 45 numa so", len(pn.get("data") or []) == 45 and (pn.get("meta") or {}).get("per_page") == n, [len(pn.get("data") or []), pn.get("meta")])
    r = api("GET", caminho_api + ("&" if "?" in caminho_api else "?") + "per_page=30")
    confere(nome + ": tamanho fora de 20, 40, 80 e 100 recusa (422)", r["status"] == 422, r["status"])


provar_api("antecipacoes", "/api/v1/emporio/card-anticipations?de=2018-01-01&ate=2018-02-14")
provar_api("conferencias", "/api/v1/emporio/cash/counts?establishment_id=" + L_CONF)

for nome, rota, loja in [("compras", "/emporio/compras", L_COMPRAS), ("transferencias", "/emporio/transferencias", L_DESTINO)]:
    for n in (80, 100):
        ir_lista(rota, loja)
        confere(nome + ": troca 'Por pagina' para " + str(n), aria_escolher("Por página", str(n) + " por página") is True)
        esperar(lambda: "por_pagina=" + str(n) in caminho(), 60)
        esperar_mostrando("Mostrando 1 a 45 de 45")
        confere(nome + ": " + str(n) + " por pagina mostra as 45 linhas numa pagina so, sem Proxima", "por_pagina=" + str(n) in caminho() and mostrando() == "Mostrando 1 a 45 de 45" and len(linhas("", 0)) == 45 and (nav() is None or item(nav(), "Próxima") is None), [caminho(), mostrando(), len(linhas("", 0)), nav()])

# O Vendedor nao abre o Relatorios: a pagina o devolve ao inicio do Emporio.
entrar("vendedor")
ir("/emporio/relatorios")
confere("o Vendedor em /emporio/relatorios cai no inicio do Emporio", caminho() == "/emporio", caminho())
# Duas portas recusam o Vendedor (a do relatorio e a do lucro, as duas com as mesmas permissoes): o faturamento prova
# a primeira, o lucro prova que nenhuma das duas deixa passar.
st_receita = api("GET", "/api/v1/emporio/reports/abc?from=" + DIA + "&to=" + DIA + "&kind=products&measure=revenue")["status"]
st_lucro = api("GET", "/api/v1/emporio/reports/abc?from=" + DIA + "&to=" + DIA + "&kind=products&measure=profit")["status"]
confere("e a curva recusa o Vendedor pela API (403) em faturamento e em lucro", st_receita == 403 and st_lucro == 403, [st_receita, st_lucro])
entrar("owner")
ir("/emporio/relatorios")
confere("o Dono abre o Relatorios (contraprova: o redirecionamento e do papel, nao da rota)", caminho() == "/emporio/relatorios", caminho())
