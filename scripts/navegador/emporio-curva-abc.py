# Validacao viva da curva ABC no Relatorios e da paginacao dos Orcamentos do Meu Emporio (Modulo 39, frente H,
# Q362 a Q365): docs/superpowers/specs/2026-11-18-emporio-curva-abc-design.md
#
# Os valores esperados sao contas feitas a mao a partir do cenario (ver o cabecalho de
# scripts/_cenario-emporio-curva-abc.ts), nunca copiadas da resposta do app.
#
#   1. Curva de Produtos (faturamento): classes A/A/B/B/C, participacao e acumulado, resumo das classes; a soma da
#      curva e igual ao total do "Vendas por produto" da mesma pagina
#   2. Lucro (venda menos custo): valores, "sem custo" e "custo estimado", classes A/A/A/B/C
#   3. Clientes: a linha "Consumidor final e vendas sem cliente" fora da curva
#   4. Filtro de loja (a outra loja nao entra) e "Ver relatorio" com outro periodo mantendo a aba e a medida
#   5. Relatorios a 390 px: sem rolagem horizontal da pagina, a tabela rola dentro do cartao
#   6. Orcamentos (45): 20 por pagina, pagina 3, 40 por pagina volta a 1, mais antigos primeiro, busca por numero,
#      Anterior e Proxima desabilitados nas pontas, aria-current, pagina 99, por_pagina invalido
#   7. Orcamentos a 390 px: sem rolagem horizontal
#
# cenario: scripts/_cenario-emporio-curva-abc.ts
# sessao: owner owner@example.com
import re

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


def espera_main(segundos=60):
    esperar(lambda: js("!!document.querySelector('main h1')"), segundos)
    time.sleep(1.5)


def secao_abc():
    """Linhas da tabela da curva e o texto do cartao da secao 'Curva ABC'."""
    return js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Curva ABC'); const s = h && h.closest('section'); if (!s) return null; return { texto: s.innerText.replace(/\\s+/g, ' '), linhas: Array.from(s.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.replace(/\\s+/g, ' ').trim())), resumo: Array.from(s.querySelectorAll('ul li')).map(li => li.innerText.replace(/\\s+/g, ' ').trim()), abas: Array.from(s.querySelectorAll('a')).map(a => [a.innerText.trim(), a.className.includes('bg-superficie-afundada')]) }; })()")


def tabela_por_produto():
    """Linhas do bloco 'Vendas por produto' da mesma pagina."""
    return js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Vendas por produto'); const s = h && h.closest('section'); if (!s) return null; return Array.from(s.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.replace(/\\s+/g, ' ').trim())); })()")


def ir_relatorio(abc, medida, loja="", de=DIA, ate=DIA):
    q = "/emporio/relatorios?de=" + de + "&ate=" + ate + "&abc=" + abc + "&medida=" + medida
    if loja:
        q += "&loja=" + loja
    ir(q)
    esperar(lambda: secao_abc() is not None, 60)
    time.sleep(1)


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


# --- montagem ----------------------------------------------------------------------------------------------------------
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
cdp("Page.enable")
entrar("owner")
tela(1280, 900)
ir("/emporio")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
L1 = next((x for x in lojas if x["name"] == "Abc Loja 1"), None)
L2 = next((x for x in lojas if x["name"] == "Abc Loja 2"), None)
LO = next((x for x in lojas if x["name"] == "Abc Orcamentos"), None)
confere("acha as tres lojas do cenario pela API", L1 is not None and L2 is not None and LO is not None, len(lojas))
LOJA1 = L1["id"] if L1 else ""
LOJA2 = L2["id"] if L2 else ""
LOJA_ORC = LO["id"] if LO else ""

# --- 1 ------------------------------------------------------------------------------------------------------------------
passo("1. Curva de Produtos (faturamento) na Loja 1, dia " + DIA)
ir_relatorio("produtos", "faturamento", LOJA1)
s = secao_abc()
confere("a secao 'Curva ABC' existe", s is not None, caminho())
if s:
    # Milho: vendeu 5 kg e devolveu 1, entao a quantidade liquida e 4 kg.
    confere(
        "5 produtos: Milho 5000, Soja 3000, Feijao 1000, Arroz 600, Trigo 400; participacao 50/30/10/6/4; acumulado 50/80/90/96/100; classes A/A/B/B/C",
        (
            len(s["linhas"]) == 5
            and [l[1].split(" sem ")[0] for l in s["linhas"]] == ["Abc Milho", "Abc Soja", "Abc Feijao", "Abc Arroz", "Abc Trigo"]
            and [br(l[3]) for l in s["linhas"]] == [5000, 3000, 1000, 600, 400]
            and all(perto(br(l[4]), e) for l, e in zip(s["linhas"], [50, 30, 10, 6, 4]))
            and all(perto(br(l[5]), e) for l, e in zip(s["linhas"], [50, 80, 90, 96, 100]))
            and [l[6] for l in s["linhas"]] == ["A", "A", "B", "B", "C"]
        ),
        s["linhas"],
    )
    confere("posicoes 1 a 5", [l[0] for l in s["linhas"]] == ["1", "2", "3", "4", "5"], [l[0] for l in s["linhas"]])
    confere("a quantidade do Milho e liquida da devolucao (4 kg) e a do Feijao e 2 kg", s["linhas"][0][2].startswith("4") and s["linhas"][2][2].startswith("2"), [s["linhas"][0][2], s["linhas"][2][2]])
    confere("faturamento: a coluna se chama Faturamento e nao ha 'sem custo' nem 'custo estimado'", "Faturamento" in s["texto"] and "sem custo" not in s["texto"] and "custo estimado" not in s["texto"], s["texto"][:200])
    res = s["resumo"]
    confere(
        "resumo: A 2 produtos R$ 8.000,00 80%; B 2 produtos R$ 1.600,00 16%; C 1 produto R$ 400,00 4%",
        len(res) == 3
        and res[0].startswith("A") and "2 produtos" in res[0] and "R$ 8.000,00" in res[0] and "80%" in res[0]
        and res[1].startswith("B") and "2 produtos" in res[1] and "R$ 1.600,00" in res[1] and "16%" in res[1]
        and res[2].startswith("C") and "1 produto," in res[2] and "R$ 400,00" in res[2] and "4%" in res[2],
        res,
    )
    pp = tabela_por_produto() or []
    soma_pp = sum(br(l[2]) for l in pp)
    soma_curva = sum(br(l[3]) for l in s["linhas"])
    confere("o 'Vendas por produto' da mesma pagina soma 10.000 (5 linhas)", len(pp) == 5 and perto(soma_pp, 10000), [len(pp), soma_pp])
    confere("a soma da curva (10.000) e igual a soma do 'Vendas por produto'", perto(soma_curva, soma_pp), [soma_curva, soma_pp])
    confere("a curva e o 'por produto' concordam produto a produto", sorted((l[0], br(l[2])) for l in pp) == sorted((l[1], br(l[3])) for l in s["linhas"]), [pp, s["linhas"]])
    confere("as abas: Produtos ativa, Clientes inativa; o seletor Faturamento ativo", ["Produtos", True] in s["abas"] and ["Clientes", False] in s["abas"] and ["Faturamento", True] in s["abas"], s["abas"])

# --- 2 ------------------------------------------------------------------------------------------------------------------
passo("2. Lucro (venda menos custo): trocar a medida pelo link")
confere("clica em 'Lucro (venda menos custo)'", bool(js("(() => { const a = Array.from(document.querySelectorAll('main section a')).find(x => x.innerText.trim() === 'Lucro (venda menos custo)'); if (!a) return false; a.click(); return true; })()")))
esperar(lambda: "medida=lucro" in caminho(), 60)
esperar(lambda: (secao_abc() or {"texto": ""})["texto"].find("Lucro") >= 0 and "Lucro" in (secao_abc() or {"linhas": [[""]*7]})["texto"], 60)
time.sleep(2)
s = secao_abc()
confere("a URL mantem a aba e passa a medida lucro", "abc=produtos" in caminho() and "medida=lucro" in caminho(), caminho())
if s and len(s["linhas"]) == 5:
    nomes = [l[1].split(" sem ")[0].split(" custo ")[0] for l in s["linhas"]]
    # Lucro: Milho 5000-4x750=2000, Soja 3000-1800=1200, Feijao 1000-2x200=600, Arroz 600 sem custo, Trigo 400-300=100.
    # Empate de 600: Abc Arroz antes de Abc Feijao (por nome). Base 4500.
    confere("ordem por lucro: Milho, Soja, Arroz, Feijao, Trigo (o empate de 600 desempata pelo nome)", nomes == ["Abc Milho", "Abc Soja", "Abc Arroz", "Abc Feijao", "Abc Trigo"], nomes)
    confere("valores = venda menos custo: 2000, 1200, 600, 600, 100", [br(l[3]) for l in s["linhas"]] == [2000, 1200, 600, 600, 100], [l[3] for l in s["linhas"]])
    confere("participacao 44,44 / 26,67 / 13,33 / 13,33 / 2,22", all(perto(br(l[4]), e) for l, e in zip(s["linhas"], [44.44, 26.67, 13.33, 13.33, 2.22])), [l[4] for l in s["linhas"]])
    confere("acumulado 44,44 / 71,11 / 84,44 / 97,78 / 100", all(perto(br(l[5]), e) for l, e in zip(s["linhas"], [44.44, 71.11, 84.44, 97.78, 100])), [l[5] for l in s["linhas"]])
    confere("classes A, A, A (o Arroz cruza em 84%, antes dele 71%), B, C", [l[6] for l in s["linhas"]] == ["A", "A", "A", "B", "C"], [l[6] for l in s["linhas"]])
    confere("o Arroz (sem unit_cost) mostra 'sem custo'", "sem custo" in s["linhas"][2][1] and "custo estimado" not in s["linhas"][2][1], s["linhas"][2][1])
    confere("o Trigo (custo estimado) mostra 'custo estimado'", "custo estimado" in s["linhas"][4][1] and "sem custo" not in s["linhas"][4][1], s["linhas"][4][1])
    confere("Milho e Feijao nao carregam nenhum dos dois avisos", "custo" not in s["linhas"][0][1] and "custo" not in s["linhas"][3][1], [s["linhas"][0][1], s["linhas"][3][1]])
    confere("a coluna se chama Lucro e o seletor Lucro esta ativo", "Lucro" in s["texto"] and ["Lucro (venda menos custo)", True] in s["abas"], s["abas"])
    res = s["resumo"]
    confere("resumo: A 3 produtos R$ 3.800,00; B 1 produto R$ 600,00; C 1 produto R$ 100,00", len(res) == 3 and "3 produtos" in res[0] and "R$ 3.800,00" in res[0] and "1 produto," in res[1] and "R$ 600,00" in res[1] and "1 produto," in res[2] and "R$ 100,00" in res[2], res)
else:
    confere("a curva de lucro tem 5 linhas", False, s)

# --- 3 ------------------------------------------------------------------------------------------------------------------
passo("3. Clientes: o Consumidor final fora da curva")
ir_relatorio("clientes", "faturamento", LOJA1)
s = secao_abc()
if s:
    # Maria 5400 (Milho 4x1250 liquido + Trigo 400), Joao 3600, Ana 500; base 9500. Consumidor final 500 em 1 venda.
    confere("3 clientes: Maria, Joao, Ana (sem o Consumidor final)", [l[1] for l in s["linhas"]] == ["Abc Maria", "Abc Joao", "Abc Ana"], [l[1] for l in s["linhas"]])
    confere("valores 5400 (devolucao descontada), 3600, 500", [br(l[3]) for l in s["linhas"]] == [5400, 3600, 500], [l[3] for l in s["linhas"]])
    confere("participacao 56,84 / 37,89 / 5,26 (a base sao os 3 clientes, 9500)", all(perto(br(l[4]), e) for l, e in zip(s["linhas"], [56.84, 37.89, 5.26])), [l[4] for l in s["linhas"]])
    confere("acumulado 56,84 / 94,74 / 100 e classes A, A, B (94,74 ainda e menor que 95)", all(perto(br(l[5]), e) for l, e in zip(s["linhas"], [56.84, 94.74, 100])) and [l[6] for l in s["linhas"]] == ["A", "A", "B"], [l[5:] for l in s["linhas"]])
    confere("cada cliente tem 1 venda na coluna Vendas (a devolucao nao e venda)", [l[2] for l in s["linhas"]] == ["1", "1", "1"], [l[2] for l in s["linhas"]])
    cabecalho = js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Curva ABC'); return Array.from(h.closest('section').querySelectorAll('thead th')).map(th => th.textContent.trim()); })()")
    confere("o cabecalho tem a coluna 'Vendas' (e nao 'Quantidade')", "Vendas" in cabecalho and "Quantidade" not in cabecalho and cabecalho[1] == "Cliente", cabecalho)
    confere("a linha a parte: 'Consumidor final e vendas sem cliente: R$ 500,00 em 1 venda. Ficam fora da curva.'", "Consumidor final e vendas sem cliente: R$ 500,00 em 1 venda. Ficam fora da curva." in s["texto"], s["texto"][:400])
    confere("o Consumidor final nao esta na tabela", not any("Consumidor" in l[1] for l in s["linhas"]), "")
    res = s["resumo"]
    confere("resumo: A 2 clientes R$ 9.000,00; B 1 cliente R$ 500,00; C 0 clientes", len(res) == 3 and "2 clientes" in res[0] and "R$ 9.000,00" in res[0] and "1 cliente," in res[1] and "R$ 500,00" in res[1] and "0 clientes" in res[2], res)
    confere("a aba Clientes esta ativa", ["Clientes", True] in s["abas"] and ["Produtos", False] in s["abas"], s["abas"])

# --- 4 ------------------------------------------------------------------------------------------------------------------
passo("4. Filtro de loja e 'Ver relatorio' com outro periodo")
ir_relatorio("produtos", "faturamento", LOJA2)
s = secao_abc()
confere("Loja 2: so o Milho (1 x 1250), classe A, 100%; nada da Loja 1", s is not None and len(s["linhas"]) == 1 and s["linhas"][0][1] == "Abc Milho" and br(s["linhas"][0][3]) == 1250 and s["linhas"][0][6] == "A" and perto(br(s["linhas"][0][5]), 100) and "Abc Soja" not in s["texto"], s and s["linhas"])
confere("o 'por produto' da Loja 2 tambem so tem o Milho (1250)", (lambda pp: len(pp) == 1 and br(pp[0][2]) == 1250)(tabela_por_produto() or []), tabela_por_produto())
ir_relatorio("produtos", "faturamento", LOJA1)
s = secao_abc()
confere("Loja 1: o Milho continua em 5000 (a venda da Loja 2 nao entra)", s is not None and br(s["linhas"][0][3]) == 5000, s and s["linhas"][0])
ir_relatorio("produtos", "faturamento", "")
s = secao_abc()
milho = next((l for l in (s or {"linhas": []})["linhas"] if l[1] == "Abc Milho"), None)
confere("sem filtro de loja: o Milho soma as duas lojas (5000 + 1250 = 6250)", milho is not None and br(milho[3]) == 6250, milho)

ir_relatorio("clientes", "lucro", LOJA1)
confere("de partida: aba Clientes, medida Lucro, De = 2026-03-10", "abc=clientes" in caminho() and js("document.getElementById('rel-de').value") == DIA, [caminho(), js("document.getElementById('rel-de').value")])
js("(() => { const el = document.getElementById('rel-de'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2026-03-09'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()")
confere("clica em 'Ver relatorio'", clicar("Ver relatório"))
esperar(lambda: "de=2026-03-09" in caminho(), 60)
esperar(lambda: secao_abc() is not None, 60)
time.sleep(2)
s = secao_abc()
confere("depois de 'Ver relatorio' a URL tem o periodo novo E mantem abc=clientes e medida=lucro", "de=2026-03-09" in caminho() and "abc=clientes" in caminho() and "medida=lucro" in caminho() and "loja=" + LOJA1 in caminho(), caminho())
confere("e a tela segue na aba Clientes com a medida Lucro ativa", s is not None and ["Clientes", True] in s["abas"] and ["Lucro (venda menos custo)", True] in s["abas"], s and s["abas"])

# --- 5 ------------------------------------------------------------------------------------------------------------------
passo("5. Relatorios a 390 px")
tela(390, 844, 1, True)
ir_relatorio("produtos", "lucro", LOJA1)
larg = rolagem_horizontal()
confere("390 px: a pagina nao rola na horizontal", larg is not None and larg[0] <= larg[1] and larg[1] == 390, larg)
cx = js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Curva ABC'); const s = h.closest('section'); const t = s.querySelector('table'); let p = t.parentElement; const sec = s.getBoundingClientRect(); const w = p.getBoundingClientRect(); return { rola: p.scrollWidth > p.clientWidth, scrollW: p.scrollWidth, clientW: p.clientWidth, overflowX: getComputedStyle(p).overflowX, tabelaDentroDoCartao: w.left >= sec.left - 1 && w.right <= sec.right + 1 }; })()")
confere("a tabela rola DENTRO do cartao (o recipiente tem overflow-x e conteudo mais largo)", cx and cx["rola"] and cx["overflowX"] in ("auto", "scroll"), cx)
confere("e o recipiente da tabela nao passa das bordas do cartao", cx and cx["tabelaDentroDoCartao"], cx)
tela(1280, 900)

# --- 6 ------------------------------------------------------------------------------------------------------------------
passo("6. Orcamentos paginados (45 na loja 'Abc Orcamentos')")


def linhas_orc():
    return js("Array.from(document.querySelectorAll('main tbody tr')).map(tr => tr.querySelector('td') ? tr.querySelector('td').innerText.trim() : '')") or []


def mostrando():
    return js("(() => { const p = Array.from(document.querySelectorAll('main p')).find(x => x.innerText.trim().startsWith('Mostrando')); return p ? p.innerText.trim() : ''; })()") or ""


def nav():
    return js("(() => { const n = document.querySelector('nav[aria-label=\"Paginação\"]'); if (!n) return null; return { itens: Array.from(n.children).map(e => ({ t: e.innerText.trim(), tag: e.tagName, atual: e.getAttribute('aria-current'), desab: e.getAttribute('aria-disabled'), href: e.getAttribute('href') })) }; })()")


def ir_orc(extra=""):
    ir("/emporio/orcamentos?loja=" + LOJA_ORC + extra)
    esperar(lambda: len(linhas_orc()) > 0 or "Nenhum orçamento" in texto_do_main(), 60)
    time.sleep(1)


def item(n, rotulo):
    return next((i for i in (n or {"itens": []})["itens"] if i["t"] == rotulo), None)


ir_orc()
nums = [int(x) for x in linhas_orc()]
n = nav()
numeros_pag = [i["t"] for i in n["itens"]] if n else []
confere("padrao: 20 linhas e 'Mostrando 1 a 20 de 45'", len(nums) == 20 and mostrando() == "Mostrando 1 a 20 de 45", [len(nums), mostrando()])
MAIOR = nums[0] if nums else 0
confere("padrao 'mais recentes primeiro': a primeira linha e o maior numero e a lista desce de 1 em 1", len(nums) == 20 and all(nums[k] == MAIOR - k for k in range(20)), nums)
confere("a barra tem Anterior, 1, 2, 3 e Proxima (3 paginas)", numeros_pag == ["Anterior", "1", "2", "3", "Próxima"], numeros_pag)
confere("Anterior esta desabilitado na pagina 1 (aria-disabled, sem link)", item(n, "Anterior") is not None and item(n, "Anterior")["desab"] == "true" and item(n, "Anterior")["href"] is None, item(n, "Anterior"))
confere("Proxima e um link para pagina=2", item(n, "Próxima") is not None and item(n, "Próxima")["tag"] == "A" and "pagina=2" in (item(n, "Próxima")["href"] or ""), item(n, "Próxima"))
confere("aria-current='page' esta so no 1", [i["t"] for i in n["itens"] if i["atual"] == "page"] == ["1"], n)
confere("a busca nao esta preenchida e nao ha erro na tela", "Nenhum orçamento" not in texto_do_main(), texto_do_main()[:120])

confere("clica na pagina 3 (link 'Pagina 3')", bool(js("(() => { const a = document.querySelector('nav[aria-label=\"Paginação\"] a[aria-label=\"Página 3\"]'); if (!a) return false; a.click(); return true; })()")))
esperar(lambda: "pagina=3" in caminho(), 60)
esperar(lambda: mostrando() == "Mostrando 41 a 45 de 45", 30)
nums3 = [int(x) for x in linhas_orc()]
n = nav()
confere("pagina 3: 'Mostrando 41 a 45 de 45' e 5 linhas", mostrando() == "Mostrando 41 a 45 de 45" and len(nums3) == 5, [mostrando(), len(nums3)])
confere("a pagina 3 termina no menor numero (MAIOR - 44)", nums3 and nums3[-1] == MAIOR - 44 and nums3[0] == MAIOR - 40, nums3)
confere("Proxima desabilitada na ultima e Anterior vira link para pagina=2", item(n, "Próxima")["desab"] == "true" and item(n, "Próxima")["href"] is None and "pagina=2" in (item(n, "Anterior")["href"] or ""), n)
confere("aria-current='page' esta so no 3", [i["t"] for i in n["itens"] if i["atual"] == "page"] == ["3"], n)

confere("troca 'Por pagina' para 40 (estando na pagina 3)", aria_escolher("Por página", "40 por página") is True)
esperar(lambda: "por_pagina=40" in caminho(), 60)
esperar(lambda: mostrando() == "Mostrando 1 a 40 de 45", 30)
n = nav()
confere("40 por pagina volta a pagina 1: URL sem 'pagina', 'Mostrando 1 a 40 de 45', 40 linhas", "pagina=" not in caminho().replace("por_pagina=", "") and mostrando() == "Mostrando 1 a 40 de 45" and len(linhas_orc()) == 40, [caminho(), mostrando(), len(linhas_orc())])
confere("agora sao 2 paginas (1 e 2)", [i["t"] for i in n["itens"]] == ["Anterior", "1", "2", "Próxima"], [i["t"] for i in n["itens"]])

# Voltar a pagina 2 e trocar a ordem: tambem volta a pagina 1, e a ordem crescente comeca no menor numero.
ir_orc("&por_pagina=40&pagina=2")
confere("pagina 2 de 40: 'Mostrando 41 a 45 de 45'", mostrando() == "Mostrando 41 a 45 de 45", mostrando())
confere("troca a ordem para 'Mais antigos primeiro'", aria_escolher("Ordem", "Mais antigos primeiro") is True)
esperar(lambda: "ordem=asc" in caminho(), 60)
esperar(lambda: mostrando() == "Mostrando 1 a 40 de 45", 30)
nums = [int(x) for x in linhas_orc()]
MENOR = MAIOR - 44
confere("ordem crescente: volta a pagina 1 (URL sem 'pagina=') e a lista comeca no MENOR numero e sobe", "ordem=asc" in caminho() and "&pagina=" not in caminho() and len(nums) == 40 and nums[0] == MENOR and all(nums[k] == MENOR + k for k in range(40)), [caminho(), nums[:3]])
confere("a ordem e o tamanho continuam na URL", "por_pagina=40" in caminho(), caminho())

# Busca pelo numero do mais antigo (a ordem crescente persiste)
confere("busca pelo numero do mais antigo (" + str(MENOR) + ")", js("(() => { const i = document.querySelector('input[aria-label=\"Buscar orçamento\"]'); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, " + repr(str(MENOR)) + "); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()") is True)
confere("clica em Buscar", clicar("Buscar"))
esperar(lambda: "q=" + str(MENOR) in caminho(), 60)
esperar(lambda: mostrando() == "Mostrando 1 a 1 de 1", 30)
confere("a busca acha o orcamento antigo: 1 linha, o numero certo, 'Mostrando 1 a 1 de 1'", [int(x) for x in linhas_orc()] == [MENOR] and mostrando() == "Mostrando 1 a 1 de 1", [linhas_orc(), mostrando()])
confere("com 1 resultado nao ha barra de paginas", nav() is None, nav())

# Pagina alem da ultima e por_pagina invalido
ir_orc("&pagina=99")
n = nav()
confere("?pagina=99 mostra a ultima ('Mostrando 41 a 45 de 45') e aria-current no 3", mostrando() == "Mostrando 41 a 45 de 45" and [i["t"] for i in n["itens"] if i["atual"] == "page"] == ["3"], [mostrando(), n])
ir_orc("&por_pagina=7")
confere("?por_pagina=7 cai no padrao (20 por pagina, sem erro)", mostrando() == "Mostrando 1 a 20 de 45" and len(linhas_orc()) == 20 and "Escolha 20, 40" not in texto_do_main() and "Nenhum orçamento" not in texto_do_main(), [mostrando(), len(linhas_orc()), texto_do_main()[:150]])
ir_orc("&pagina=abc")
confere("?pagina=abc cai na pagina 1", mostrando() == "Mostrando 1 a 20 de 45", mostrando())

# --- 7 ------------------------------------------------------------------------------------------------------------------
passo("7. Orcamentos a 390 px")
tela(390, 844, 1, True)
ir_orc()
larg = rolagem_horizontal()
confere("390 px: a pagina de Orcamentos nao rola na horizontal", larg is not None and larg[0] <= larg[1] and larg[1] == 390, larg)
nv = js("(() => { const n = document.querySelector('nav[aria-label=\"Paginação\"]'); const b = n.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(n.getBoundingClientRect().height)]; })()")
confere("390 px: a barra de paginas cabe na largura", nv and nv[0] >= 0 and nv[1] <= 390, nv)
ir_orc("&pagina=3")
larg = rolagem_horizontal()
confere("390 px, pagina 3: sem rolagem horizontal", larg[0] <= larg[1], larg)
cdp("Emulation.clearDeviceMetricsOverride")
