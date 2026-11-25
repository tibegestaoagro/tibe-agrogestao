# Validacao viva da onda 1 da frente de UX do Meu Empório (navegacao, docs/superpowers/specs/2026-11-24-emporio-ux-design.md):
# menu em subgrupos que lembra o que ficou aberto (5.1), cabecalho sem o "Meu Empório" cinza
# e com o caminho clicavel (5.2), o (i) com balao (5.2), o seletor de propriedades que some no
# Empório (5.3), a tela sem permissao que volta ao Inicio (5.4), "Lojas" no lugar de
# "Estabelecimentos" e "Conferir com o banco" no lugar de "Carimbar" (5.6).
#
# O cenario nao tem usuario Financeiro: as conferencias de dinheiro usam o dono, e o
# "sem permissao" usa o gestor.
#
# cenario: scripts/_cenario-manual-emporio.ts
# sessao: dono owner@example.com
# sessao: gestor gestor.demo.emporio@example.com
# sessao: caixa vendedor.rodovia.demo.emporio@example.com

TELAS = [
    "/emporio", "/emporio/vender", "/emporio/vendas", "/emporio/orcamentos", "/emporio/fiado",
    "/emporio/clientes", "/emporio/caixa", "/emporio/financeiro", "/emporio/financeiro/pagar",
    "/emporio/financeiro/receber", "/emporio/financeiro/cobranca", "/emporio/financeiro/caixa",
    "/emporio/financeiro/aprovacoes", "/emporio/financeiro/projecao", "/emporio/financeiro/relatorios",
    "/emporio/produtos", "/emporio/estoque", "/emporio/compras", "/emporio/fornecedores",
    "/emporio/franqueados", "/emporio/transferencias", "/emporio/despesas", "/emporio/resultado",
    "/emporio/relatorios", "/emporio/equipe", "/emporio/estabelecimentos", "/emporio/historico",
    "/emporio/configuracoes",
]
SUBGRUPOS = ["Vendas", "Estoque", "Dinheiro", "Estatísticas", "Ajustes"]


def caminho():
    return js("location.pathname") or ""


def botoes_do_menu():
    """O texto de cada botao da sidebar (grupos e subgrupos)."""
    return js("Array.from(document.querySelectorAll('nav button')).map(b => b.innerText.trim())") or []


def expandido(rotulo):
    """aria-expanded do botao do menu com esse texto: True, False ou None se nao existe."""
    r = js("(() => { const b = Array.from(document.querySelectorAll('nav button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return b ? b.getAttribute('aria-expanded') : null; })()")
    return None if r is None else r == "true"


def rotulos_dos_links():
    return js("Array.from(document.querySelectorAll('nav a')).filter(a => (a.getAttribute('href') || '').startsWith('/emporio')).map(a => a.innerText.trim())") or []


def texto_da_tela():
    return (js("(document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' ')") or "")


def tecla(key, code, vk):
    # O Enter so ativa o botao quando o keyDown leva o texto (\r): rawKeyDown nao dispara o clique.
    if key == "Enter":
        cdp("Input.dispatchKeyEvent", type="keyDown", key=key, code=code, text="\r", windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk)
        cdp("Input.dispatchKeyEvent", type="keyUp", key=key, code=code, windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk)
    else:
        for tipo in ("rawKeyDown", "keyUp"):
            cdp("Input.dispatchKeyEvent", type=tipo, key=key, code=code, windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk)
    time.sleep(0.5)


def balao_aberto():
    return js("(() => { const b = document.querySelector('button[aria-label=\"Sobre esta tela\"]'); return b ? b.getAttribute('aria-expanded') === 'true' : null; })()")


def foco_no_botao_do_i():
    return bool(js("(() => { const b = document.querySelector('button[aria-label=\"Sobre esta tela\"]'); return !!b && document.activeElement === b; })()"))


def mouse(x, y):
    cdp("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y, pointerType="mouse")
    time.sleep(0.6)


# 0. Estado limpo: o menu lembra o que ficou aberto (localStorage do Chrome de testes).
entrar("dono")
ir("/emporio")
js("localStorage.removeItem('tibe:menu:subgrupos')")

passo("1. Dono: os cinco subgrupos e o que fica aberto")
ir("/emporio")
botoes = botoes_do_menu()
confere("o menu tem os subgrupos Vendas, Estoque, Dinheiro, Estatísticas e Ajustes", all(s in botoes for s in SUBGRUPOS), botoes)
confere("o menu tem Início e Vender soltos", "Início" in rotulos_dos_links() and "Vender" in rotulos_dos_links(), rotulos_dos_links())
ir("/emporio/vendas")
confere("em /emporio/vendas o subgrupo Vendas está aberto", expandido("Vendas") is True, expandido("Vendas"))
confere("os outros subgrupos estão fechados", all(expandido(s) is False for s in SUBGRUPOS if s != "Vendas"), {s: expandido(s) for s in SUBGRUPOS})
abrir_grupo("Estoque")
confere("abrir Estoque o deixa aberto", expandido("Estoque") is True, expandido("Estoque"))
ir("/emporio/vendas")
confere("recarregar a tela: Estoque continua aberto", expandido("Estoque") is True, expandido("Estoque"))
confere("recarregar a tela: Vendas continua aberto", expandido("Vendas") is True, expandido("Vendas"))
js("localStorage.removeItem('tibe:menu:subgrupos')")

passo("2. Dono: Lojas no menu, sem Estabelecimentos")
ir("/emporio")
abrir_grupo("Ajustes")
rot = rotulos_dos_links()
confere("o menu diz Lojas", "Lojas" in rot, rot)
confere("o menu não diz Estabelecimentos", "Estabelecimentos" not in rot, rot)
ir("/emporio/estabelecimentos")
h1 = js("(document.querySelector('main h1') || { innerText: '' }).innerText") or ""
confere("o título da tela de /emporio/estabelecimentos é Lojas", h1.strip() == "Lojas", h1)
js("localStorage.removeItem('tibe:menu:subgrupos')")

passo("3. Nenhuma tela do Empório tem o link 'Meu Empório' acima do título")
com_link = []
sem_h1 = []
for t in TELAS:
    destino = ir(t)
    if destino != t or eh_404():
        print("  (pulada: " + t + " -> " + str(destino) + ")")
        continue
    r = js("(() => { const m = document.querySelector('main'); const h = m && m.querySelector('h1'); if (!h) return 'SEM H1'; const solto = Array.from(m.querySelectorAll('a, p, span')).filter(e => e.innerText.trim() === 'Meu Empório' && (e.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING)); return solto.length; })()")
    if r == "SEM H1":
        sem_h1.append(t)
    elif r:
        com_link.append(t)
confere("nenhuma tela tem 'Meu Empório' antes do título", not com_link, com_link)
confere("toda tela tem o seu título (h1)", not sem_h1, sem_h1)

passo("4. A pagar: caminho e título")
ir("/emporio/financeiro/pagar")
caminho_txt = js("(() => { const n = document.querySelector('main nav[aria-label=\"Caminho\"]'); return n ? n.innerText.replace(/\\u00a0/g, ' ').trim() : ''; })()") or ""
h1 = js("(document.querySelector('main h1') || { innerText: '' }).innerText") or ""
confere("o caminho mostra 'Dinheiro'", caminho_txt.startswith("Dinheiro"), caminho_txt)
confere("o título é 'A pagar'", h1.strip() == "A pagar", h1)
link_dinheiro = js("(() => { const a = document.querySelector('main nav[aria-label=\"Caminho\"] a'); return a ? a.getAttribute('href') : ''; })()")
confere("o caminho é clicável e leva a /emporio/financeiro", link_dinheiro == "/emporio/financeiro", link_dinheiro)
confere("tela de nível de menu (Vendas) não tem caminho", (ir("/emporio/vendas") == "/emporio/vendas") and not js("!!document.querySelector('main nav[aria-label=\"Caminho\"]')"))

passo("5. O (i): mouse, teclado e Esc")
ir("/emporio/financeiro/pagar")
confere("a tela tem o (i)", balao_aberto() is False, balao_aberto())
mouse(5, 5)
xy = _centro("document.querySelector('button[aria-label=\"Sobre esta tela\"]')")
mouse(xy[0], xy[1])
confere("passar o mouse abre o balão", balao_aberto() is True, balao_aberto())
tecla("Escape", "Escape", 27)
confere("Esc fecha o balão aberto pelo mouse", balao_aberto() is False, balao_aberto())
mouse(5, 5)
# Teclado de verdade: do link do caminho, um Tab chega ao (i) e o foco sozinho abre o balão (desenho 5.2).
js("document.querySelector('main nav[aria-label=\"Caminho\"] a').focus()")
tecla("Tab", "Tab", 9)
time.sleep(0.5)
confere("Tab até o (i) abre o balão (foco pelo teclado)", foco_no_botao_do_i() and balao_aberto() is True, [foco_no_botao_do_i(), balao_aberto()])
tecla("Escape", "Escape", 27)
time.sleep(0.5)
confere("Esc fecha e o balão não reabre com o foco devolvido", balao_aberto() is False and foco_no_botao_do_i(), [balao_aberto(), foco_no_botao_do_i()])
# Enter: abre e fixa; Esc fecha e o foco fica no botao.
tecla("Enter", "Enter", 13)
confere("Enter no (i) abre o balão", balao_aberto() is True, balao_aberto())
tecla("Escape", "Escape", 27)
confere("Esc fecha e o foco volta ao botão (i)", balao_aberto() is False and foco_no_botao_do_i(), [balao_aberto(), foco_no_botao_do_i()])

passo("6. O (i) com o link 'Ver no manual' (extrato da conta): Tab chega ao link")
ir("/emporio/financeiro/caixa")
lugar = js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => (x.getAttribute('href') || '').includes('lugar=conta')); return a ? a.getAttribute('href') : ''; })()")
confere("a posição de caixa lista uma conta com extrato", bool(lugar), lugar)
if lugar:
    ir(lugar)
    sel = "document.querySelector('button[aria-label=\"Sobre a conferência com o banco\"]')"
    confere("o extrato tem o (i) da conferência", bool(js("!!" + sel)))
    if js("!!" + sel):
        js(sel + ".scrollIntoView({ block: 'center' })")
        js(sel + ".focus()")
        tecla("Enter", "Enter", 13)
        aberto = js(sel + ".getAttribute('aria-expanded')")
        confere("Enter abre o balão da conferência", aberto == "true", aberto)
        tecla("Tab", "Tab", 9)
        foco = js("(() => { const a = document.activeElement; return a ? (a.tagName + '|' + a.innerText.trim() + '|' + (a.getAttribute('href') || '')) : ''; })()")
        confere("Tab chega ao link 'Ver no manual'", "ver no manual" in (foco or "").lower() and "/manual/" in (foco or ""), foco)
        tecla("Escape", "Escape", 27)
        confere("Esc fecha e o foco volta ao botão", js(sel + ".getAttribute('aria-expanded')") == "false" and bool(js("document.activeElement === " + sel)))
    passo("6b. 'Conferir com o banco' no lugar de 'Carimbar'")
    txt = texto_da_tela()
    confere("o extrato diz 'Conferir com o banco'", "Conferir com o banco" in txt)
    confere("o extrato não diz Carimbar, Carimbado nem Sem carimbo", not any(p in txt for p in ("Carimbar", "Carimbado", "Sem carimbo")), [p for p in ("Carimbar", "Carimbado", "Sem carimbo") if p in txt])
ir("/emporio/financeiro")
txt = texto_da_tela()
confere("o Hoje do Dinheiro não diz Carimbar nem Carimbado", not any(p in txt for p in ("Carimbar", "Carimbado", "Sem carimbo")))
ir("/emporio/financeiro/caixa")
txt = texto_da_tela()
confere("a Posição de caixa não diz Carimbar nem Carimbado", not any(p in txt for p in ("Carimbar", "Carimbado", "Sem carimbo")))

passo("7. Seletor de propriedades: some no Empório, fica no resto")
ir("/emporio")
confere("em /emporio não há o seletor de propriedades", not js("document.body.innerText.includes('Todas as propriedades') || !!document.querySelector('header [aria-haspopup=listbox]')"))
ir("/meu-dia")
confere("em /meu-dia o seletor aparece para o dono", bool(js("document.body.innerText.includes('Todas as propriedades') || Array.from(document.querySelectorAll('header button')).some(b => b.innerText.includes('propriedade') || b.innerText.includes('Fazenda'))")), texto_principal(120))

passo("8. Caixa: menu plano, sem subgrupos")
entrar("caixa")
ir("/emporio")
rot = rotulos_dos_links()
confere("o menu do caixa tem Início, Vender, Vendas, Clientes, Fiado e Caixa", rot == ["Início", "Vender", "Vendas", "Clientes", "Fiado", "Caixa"], rot)
btn = botoes_do_menu()
confere("nenhum botão de subgrupo no menu do caixa", not any(s in btn for s in SUBGRUPOS), btn)

passo("9. Gestor: tela do Dinheiro volta ao Início, sem 404")
entrar("gestor")
destino = ir("/emporio/financeiro/pagar")
confere("termina em /emporio", destino == "/emporio", destino)
confere("sem 'could not be found'", not eh_404())
destino = ir("/emporio/historico")
confere("o gestor vê o Histórico (papel dele alcança)", destino in ("/emporio/historico", "/emporio"), destino)

passo("10. Celular (390 px): o subgrupo abre sem fechar a gaveta")
entrar("dono")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=True)
ir("/emporio")
js("localStorage.removeItem('tibe:menu:subgrupos')")
ir("/emporio")
xy = _centro("document.querySelector('button[aria-label=\"Abrir menu\"]')")
confere("o botão Abrir menu existe no celular", bool(xy), xy)
if xy:
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    aside = "(() => { const a = document.querySelector('aside'); const r = a.getBoundingClientRect(); return r.left >= 0 && r.right > 100; })()"
    confere("a gaveta abriu", bool(js(aside)))
    antes = expandido("Vendas")
    xy2 = _centro("Array.from(document.querySelectorAll('nav button')).find(x => x.innerText.trim() === 'Vendas')")
    click_at_xy(xy2[0], xy2[1])
    time.sleep(1)
    confere("o subgrupo Vendas abriu", antes is False and expandido("Vendas") is True, [antes, expandido("Vendas")])
    confere("a gaveta continua aberta", bool(js(aside)))
cdp("Emulation.clearDeviceMetricsOverride")
js("localStorage.removeItem('tibe:menu:subgrupos')")

fim()
