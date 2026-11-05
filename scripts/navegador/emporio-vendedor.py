# Validacao viva de "Empório, entrega 3: vendedor na venda e relatorios" (Modulo
# 39, spec docs/specs/module-39-meu-emporio.md, Q168 em diante): o Caixa
# escolhe o vendedor a cada venda, o Vendedor vende em nome proprio, a venda e
# a bobina mostram quem vendeu e quem registrou, e a tela de Relatorios (so do
# Gestor para cima) soma as vendas por vendedor, produto e loja.
#
# cenario: scripts/_cenario-emporio-vendedor.ts
# sessao: caixa vend-caixa@teste.local
# sessao: gestor1 vend-gestor1@teste.local
# sessao: vendedor1 vend-vendedor1@teste.local

LOJA1 = "Vend Loja 1"
LOJA2 = "Vend Loja 2"
PRODUTO = "Vend Ração"
PARADO = "Vend Parado"
VENDEDOR = "Vend Vendedor Lojas 1 e 2"
CAIXA = "Vend Caixa"
RECUSA = "Escolha o vendedor que atendeu."


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Fechar a venda')); if (b) b.click(); })()")


def sem_rolagem_horizontal():
    return js("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def medida():
    return js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth")


def texto_do_campo(rotulo):
    """O que o campo `rotulo` mostra (o Select do Radix mostra o valor escolhido
    ou o texto de orientacao)."""
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText.replace(/\\u00a0/g, ' ') : 'SEM CAMPO'; })()") or ""


def href_do_link(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def bloco(titulo):
    """O texto do bloco do relatorio cujo <h2> e `titulo`."""
    return js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === " + repr(titulo) + "); return h ? h.parentElement.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""


def linha(texto_do_bloco, trecho):
    for l in texto_do_bloco.split("\n"):
        if trecho in l:
            return l
    return ""


def preenchido(rotulo, valor):
    return preencher(rotulo, valor) not in ("SEM ROTULO", "SEM CAMPO")


def montar_venda(loja, quantidade, valor):
    """Escolhe a loja (quando ha seletor), o produto, o pagamento e o cliente."""
    ir("/emporio/vender")
    confere("o balcão abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
    confere("escolhe " + loja, escolher("Loja", loja) is True)
    confere("busca o produto", preencher_aria("Buscar produto", "Vend") != "SEM CAMPO")
    confere("adiciona o produto", esperar(lambda: clicar_resultado(PRODUTO), 15))
    confere("a quantidade é " + quantidade, preencher_aria("Quantidade do item 1", quantidade) != "SEM CAMPO")
    confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
    time.sleep(1)
    confere("o valor em dinheiro é " + valor, preencher_aria("Valor em Dinheiro (R$)", valor) != "SEM CAMPO")
    confere("escolhe Consumidor final", escolher("Cliente", "Consumidor final") is True)


# --- 1. O Caixa no balcao --------------------------------------------------------
entrar("caixa")
passo("1. O Caixa no balcão: o vendedor é obrigatório, trocar de loja limpa a escolha")
ir("/emporio/vender")
confere("o balcão abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
confere("escolhe a Loja 1", escolher("Loja", LOJA1) is True)
confere("o campo Vendedor aparece vazio", "Escolha o vendedor" in texto_do_campo("Vendedor"), texto_do_campo("Vendedor"))
confere("a lista não tem o Caixa", True if escolher("Vendedor", CAIXA) == "SEM OPCAO" else False)
js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
time.sleep(1)
confere("escolhe o Vendedor", escolher("Vendedor", VENDEDOR) is True)
confere("o campo mostra o Vendedor escolhido", VENDEDOR in texto_do_campo("Vendedor"), texto_do_campo("Vendedor"))
confere("troca para a Loja 2", escolher("Loja", LOJA2) is True)
confere("na Loja 2 o campo volta vazio", "Escolha o vendedor" in texto_do_campo("Vendedor"), texto_do_campo("Vendedor"))
confere("escolhe de novo o Vendedor na Loja 2", escolher("Vendedor", VENDEDOR) is True)
confere("volta para a Loja 1", escolher("Loja", LOJA1) is True)
confere("loja 1, 2, 1: o campo do Caixa volta vazio", "Escolha o vendedor" in texto_do_campo("Vendedor"), texto_do_campo("Vendedor"))

montar_venda(LOJA1, "1", "20")
confere("o campo Vendedor continua vazio", "Escolha o vendedor" in texto_do_campo("Vendedor"), texto_do_campo("Vendedor"))
confere("com o caixa fechado, o balcão oferece abrir o caixa", esperar(lambda: tem("Abrir o Caixa 1"), 20), texto_principal(300))
enviar_venda()
recusa = esperar(lambda: erro_do_campo("Vendedor"), 20)
confere("finalizar sem vendedor mostra a recusa no campo Vendedor", RECUSA in (recusa or ""), recusa)
confere("a venda não saiu", not tem("Venda registrada"), texto_principal(200))
confere("escolhe o Vendedor", escolher("Vendedor", VENDEDOR) is True)
confere("a recusa some ao escolher", esperar(lambda: not erro_do_campo("Vendedor"), 10))
enviar_venda()
time.sleep(2)
confere("o caixa fechado ainda pede para abrir", not tem("Venda registrada"), texto_principal(200))
clicar("Abrir o Caixa 1")
time.sleep(1.5)
confere("abre o painel do caixa", esperar(painel_aberto, 15))
confere("preenche o troco contado", preenchido("Troco contado (R$)", "100"))
enviar_painel()
confere("a venda sai sozinha depois de abrir o caixa", esperar(lambda: tem("Venda registrada"), 60), texto_principal(300))
confere("o resumo mostra o vendedor", tem("vendedor " + VENDEDOR), texto_principal(400))
confere("a segunda venda do Caixa começa com o vendedor vazio", "Escolha o vendedor" in texto_do_campo("Vendedor"), texto_do_campo("Vendedor"))
href_venda1 = href_do_link("Ver a venda")
href_cupom1 = href_do_link("Imprimir cupom")
if not href_cupom1:
    href_cupom1 = js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === 'Imprimir cupom'); return a ? a.getAttribute('href') : ''; })()") or ""
confere("o resumo tem o link da venda", href_venda1.startswith("/emporio/vendas/"), href_venda1)

# --- 2. A venda registrada e a bobina -------------------------------------------------
passo("2. A venda registrada: Vendedor, Registrada por, e a bobina")
ir(href_venda1)
pagina = texto_da_pagina()
confere("a venda mostra o Vendedor", "Vendedor: " + VENDEDOR in pagina, pagina[:300])
confere("a venda mostra Registrada por o Caixa", "Registrada por " + CAIXA in pagina, pagina[:300])
venda1_id = href_venda1.split("/emporio/vendas/")[1] if "/emporio/vendas/" in href_venda1 else ""
ir("/emporio/imprimir/venda/" + venda1_id + "?formato=cupom")
pagina = texto_da_pagina()
confere("a bobina abre", caminho() == "/emporio/imprimir/venda/" + venda1_id, caminho())
confere("a bobina mostra Vendedor:", "Vendedor: " + VENDEDOR in pagina, pagina[:400])
confere("a bobina mostra Caixa: Caixa 1 (Vend Caixa)", "Caixa: Caixa 1 (" + CAIXA + ")" in pagina, pagina[:600])

# --- 3. O Vendedor no balcao -------------------------------------------------------------
entrar("vendedor1")
passo("3. O Vendedor no balcão: o campo vem com ele mesmo")
montar_venda(LOJA1, "2", "40")
confere("o campo Vendedor vem com o próprio Vendedor", VENDEDOR in texto_do_campo("Vendedor"), texto_do_campo("Vendedor"))
enviar_venda()
confere("a venda sai", esperar(lambda: tem("Venda registrada"), 60), texto_principal(300))
confere("o resumo mostra o próprio Vendedor", tem("vendedor " + VENDEDOR), texto_principal(400))
href_venda2 = href_do_link("Ver a venda")
ir(href_venda2)
pagina = texto_da_pagina()
confere("a venda dele mostra o Vendedor", "Vendedor: " + VENDEDOR in pagina, pagina[:300])
confere("sem Registrada por quando é a mesma pessoa", "Registrada por" not in pagina, pagina[:300])

# --- 4. O Gestor em Relatorios -----------------------------------------------------------------
entrar("gestor1")
passo("4. O Gestor em Relatórios: as duas vendas nas linhas certas, o produto parado")
ir("/emporio")
vistos = [h for h in menu() if h.startswith("/emporio")]
confere("o menu do Gestor tem Relatórios depois de Resultado", "/emporio/relatorios" in vistos and vistos.index("/emporio/relatorios") == vistos.index("/emporio/resultado") + 1, vistos)
ir("/emporio/relatorios")
confere("a página abre", caminho() == "/emporio/relatorios" and tem("Vendas por vendedor"), caminho())
por_vendedor = bloco("Vendas por vendedor")
linha_v = linha(por_vendedor, VENDEDOR)
confere("o Vendedor tem 2 vendas e R$ 60,00", "2" in linha_v and "60,00" in linha_v, por_vendedor)
por_produto = bloco("Vendas por produto")
confere("o produto vendido soma R$ 60,00", PRODUTO in por_produto and "60,00" in linha(por_produto, PRODUTO), por_produto)
por_loja = bloco("Vendas por loja")
confere("a Loja 1 tem 2 vendas e R$ 60,00", "60,00" in linha(por_loja, LOJA1) and "2" in linha(por_loja, LOJA1), por_loja)
parados = bloco("Produtos parados")
confere("o produto sem venda aparece em Produtos parados", PARADO in parados, parados)
confere("o produto vendido não aparece em Produtos parados", PRODUTO not in parados, parados)

# --- 5. O Vendedor nao ve Relatorios --------------------------------------------------------------
entrar("vendedor1")
passo("5. O Vendedor abre a URL de Relatórios: volta ao início, e o menu não oferece")
ir("/emporio/relatorios")
confere("volta ao /emporio", caminho() == "/emporio", caminho())
confere("o menu do Vendedor não tem Relatórios", "/emporio/relatorios" not in menu(), menu())

# --- 6. Celular -----------------------------------------------------------------------------------------
passo("6. Celular (390 px): Relatórios e o balcão do Caixa sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
entrar("gestor1")
ir("/emporio/relatorios")
confere("Relatórios abre no celular", caminho() == "/emporio/relatorios" and tem("Vendas por vendedor"), caminho())
confere("Relatórios sem rolagem horizontal", sem_rolagem_horizontal(), medida())
entrar("caixa")
ir("/emporio/vender")
confere("o balcão do Caixa abre no celular", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
confere("escolhe a Loja 1", escolher("Loja", LOJA1) is True)
confere("o balcão do Caixa sem rolagem horizontal", sem_rolagem_horizontal(), medida())
cdp("Emulation.clearDeviceMetricsOverride")

fim()
