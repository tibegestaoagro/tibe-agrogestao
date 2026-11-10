# Validacao viva de "Empório: editar, cancelar e refazer orçamento" (Modulo 39,
# docs/superpowers/specs/2026-11-10-emporio-editar-e-cancelar-orcamento-design.md,
# Q285 a Q290): o filtro Cancelados, os botões do detalhe por situação, editar o
# vencido (mesmo número, validade nova, preço de hoje), cancelar com motivo, o
# cancelado que não se fatura, o novo orçamento a partir do faturado e o celular.
#
# cenario: scripts/_cenario-emporio-orcamento-editar.ts
# sessao: gestor ore-gestor@teste.local
# sessao: vendedor ore-vendedor@teste.local

import re
from datetime import datetime, timedelta

LOJA = "OrE Loja"
ABERTO = "OrE Aberto"
VENCIDO = "OrE Vencido"
FATURADO = "OrE Faturado"
VENDEDOR = "OrE Vendedor"
MOTIVO = "teste do roteiro"
RECUSA_MOTIVO = "Diga o motivo do cancelamento."
CANCELADO_NAO_FATURA = "Orçamento cancelado: não pode ser faturado."

# Brasília não tem horário de verão: UTC menos 3 horas.
HOJE = datetime.utcnow() - timedelta(hours=3)


def data_br(d):
    return d.strftime("%d/%m/%Y")


def caminho():
    return js("location.pathname") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def tem(texto):
    return texto.lower() in texto_do_main().lower()


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def valor_aria(aria):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); return el ? el.value : 'SEM CAMPO'; })()") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def sem_rolagem_horizontal():
    return js("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def medida():
    return js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth")


def linha_da_tabela(trecho):
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


def href_da_linha(trecho):
    """O href do botão Ver da linha da lista que contém `trecho`."""
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); const a = r && r.querySelector('a[href^=\"/emporio/orcamentos/\"]'); return a ? a.getAttribute('href') : ''; })()") or ""


def acoes():
    """Os rótulos dos links e botões do cabeçalho do detalhe (o que a tela oferece)."""
    return js("Array.from(document.querySelectorAll('main header a, main header button')).map(x => x.innerText.trim()).filter(Boolean)") or []


def href_da_acao(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main header a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def numero_do_detalhe():
    achou = re.search(r"Orçamento nº (\d+)", texto_do_main())
    return achou.group(1) if achou else ""


def opcoes_do_filtro():
    """Abre o Select 'Filtrar por situação' (clique por coordenada, como o Radix pede) e lê as opções."""
    xy = _centro("document.querySelector('[aria-label=\"Filtrar por situação\"]')")
    if not xy:
        return None
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    r = js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.trim())")
    js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(0.8)
    return r


def campo_existe(rotulo):
    return bool(js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return !!(l && document.getElementById(l.htmlFor)); })()"))


def texto_do_campo(rotulo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText.replace(/\\u00a0/g, ' ') : 'SEM CAMPO'; })()") or ""


def linhas(texto):
    """As linhas do texto, aparadas: o selo de situação é uma linha só, e o nome do cliente (OrE Vencido) não conta."""
    return [x.strip() for x in texto.split("\n")]


def colunas(trecho):
    return linha_da_tabela(trecho).split(" | ")


def abrir_detalhe(href):
    ir(href)
    return esperar(lambda: tem("Itens"), 30)


# --- 1. A lista e o filtro Cancelados --------------------------------------------------------
entrar("vendedor")
passo("1. Lista de Orçamentos: o filtro Cancelados existe e as linhas do cenário aparecem")
ir("/emporio/orcamentos?situacao=todos")
confere("a lista abre", caminho() == "/emporio/orcamentos" and tem("Orçamentos"), caminho())
opcoes = opcoes_do_filtro()
confere("o filtro de situação oferece Cancelados", opcoes is not None and "Cancelados" in opcoes, opcoes)
href_aberto = href_da_linha(ABERTO)
href_vencido = href_da_linha(VENCIDO)
href_faturado = href_da_linha(FATURADO)
confere("as três linhas do cenário têm o botão Ver", bool(href_aberto and href_vencido and href_faturado), [href_aberto, href_vencido, href_faturado])
confere("a lista mostra Aberto, Vencido e Faturado (a coluna Situação, não o nome do cliente)", "Aberto" in colunas(ABERTO) and "Vencido" in colunas(VENCIDO) and any(c.startswith("Faturado") for c in colunas(FATURADO)),[linha_da_tabela(ABERTO), linha_da_tabela(VENCIDO), linha_da_tabela(FATURADO)])
id_aberto = href_aberto.split("/")[-1]

# --- 2. Os botões do detalhe -----------------------------------------------------------------
passo("2. Detalhe: o aberto tem Editar, Cancelar e Novo a partir deste; o faturado só tem Novo")
confere("abre o detalhe do aberto", abrir_detalhe(href_aberto), texto_principal(200))
numero_aberto = numero_do_detalhe()
a = acoes()
confere("o aberto tem Editar", "Editar" in a, a)
confere("o aberto tem Cancelar orçamento", "Cancelar orçamento" in a, a)
confere("o aberto tem Novo orçamento a partir deste", "Novo orçamento a partir deste" in a, a)
confere("abre o detalhe do faturado", abrir_detalhe(href_faturado), texto_principal(200))
numero_faturado = numero_do_detalhe()
a = acoes()
confere("o faturado tem Novo orçamento a partir deste", "Novo orçamento a partir deste" in a, a)
confere("o faturado não tem Editar", "Editar" not in a, a)
confere("o faturado não tem Cancelar orçamento", "Cancelar orçamento" not in a, a)
confere("o faturado não tem Faturar", "Faturar" not in a, a)
confere("o faturado mostra o selo Faturado", "Faturado" in texto_do_main(), texto_principal(300))

# --- 3. Editar o vencido ---------------------------------------------------------------------
passo("3. Editar o vencido: mesmo número, validade nova, quantidade nova e preço de hoje")
confere("abre o detalhe do vencido", abrir_detalhe(href_vencido), texto_principal(200))
numero_vencido = numero_do_detalhe()
antes = texto_do_main()
confere("o vencido está Vencido, com o preço orçado R$ 15,00 e total R$ 15,00", "Vencido" in linhas(antes) and "R$ 15,00" in antes, antes[:600])
confere("o vencido tem Editar", "Editar" in acoes(), acoes())
href_editar = href_da_acao("Editar")
confere("Editar leva ao balcão com editar_orcamento", href_editar.startswith("/emporio/vender?editar_orcamento="), href_editar)
ir(href_editar)
confere("o balcão abre", caminho() == "/emporio/vender", caminho())
confere("o balcão avisa: Editando o orçamento nº " + numero_vencido, esperar(lambda: ("Editando o orçamento nº " + numero_vencido) in texto_do_main(), 20), texto_principal(300))
confere("o aviso diz que validade e preços serão renovados", "a validade e os preços serão renovados" in texto_do_main(), texto_principal(300))
confere("o botão é Salvar alterações", esperar(lambda: "Salvar alterações" in texto_do_main(), 10), texto_principal(300))
preco = valor_aria("Preço do item 1 (R$)")
confere("o item abre com o preço de hoje (18,00), não o orçado (15,00)", preco.startswith("18"), preco)
confere("a quantidade do item é 1", valor_aria("Quantidade do item 1").startswith("1"), valor_aria("Quantidade do item 1"))
confere("muda a quantidade para 3", preencher_aria("Quantidade do item 1", "3") != "SEM CAMPO")
confere("clica em Salvar alterações", enviar_botao("Salvar alterações"))
confere("volta ao detalhe do mesmo orçamento", esperar(lambda: caminho() == href_vencido, 60), caminho())
esperar(lambda: tem("Itens"), 30)
depois = texto_do_main()
confere("o detalhe mantém o número " + numero_vencido, numero_do_detalhe() == numero_vencido, depois[:200])
confere("a situação agora é Aberto (não Vencido)", "Aberto" in linhas(depois) and "Vencido" not in linhas(depois), depois[:600])
validade_nova = data_br(HOJE + timedelta(days=7))
confere("a validade nova é hoje mais 7 dias: " + validade_nova, "Válido até " + validade_nova in depois, depois[:600])
confere("o item sai a R$ 18,00 (preço de hoje), 3 kg, total R$ 54,00", "R$ 18,00" in depois and "R$ 54,00" in depois and "R$ 15,00" not in depois, depois[:800])

# --- 4. Cancelar o aberto --------------------------------------------------------------------
passo("4. Cancelar o aberto: recusa sem motivo, selo, motivo e quem; botões somem; filtro e impresso")
confere("abre o detalhe do aberto", abrir_detalhe(href_aberto), texto_principal(200))
confere("abre o painel de cancelar", clicar("Cancelar orçamento") and esperar(painel_aberto, 15))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Motivo"), 20)
confere("motivo vazio: a recusa aparece no campo Motivo", recusa == RECUSA_MOTIVO, recusa)
confere("o painel continua aberto", painel_aberto())
confere("preenche o motivo", preencher("Motivo", MOTIVO) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60))
confere("o detalhe mostra o motivo", esperar(lambda: ("Motivo: " + MOTIVO) in texto_do_main(), 30), texto_principal(500))
t = texto_do_main()
confere("o detalhe mostra o selo Cancelado", "Cancelado" in linhas(t) and "Aberto" not in linhas(t), t[:500])
confere("o detalhe diz quem cancelou: por " + VENDEDOR, "por " + VENDEDOR in t, t[:500])
a = acoes()
confere("Editar sumiu", "Editar" not in a, a)
confere("Cancelar orçamento sumiu", "Cancelar orçamento" not in a, a)
confere("Faturar sumiu", "Faturar" not in a, a)
confere("Novo orçamento a partir deste continua", "Novo orçamento a partir deste" in a, a)
ir("/emporio/orcamentos?situacao=cancelado")
linha_c = linha_da_tabela(ABERTO)
confere("o filtro Cancelados lista o orçamento", "Cancelado" in linha_c, linha_c)
confere("o filtro Cancelados não traz o faturado", linha_da_tabela(FATURADO) == "", linha_da_tabela(FATURADO))
ir("/emporio/orcamentos")
confere("o acompanhamento padrão não traz o cancelado", linha_da_tabela(ABERTO) == "", linha_da_tabela(ABERTO))
ir("/emporio/imprimir/orcamento/" + id_aberto + "?formato=a4")
papel = texto_da_pagina()
confere("o A4 mostra ORÇAMENTO CANCELADO", "ORÇAMENTO CANCELADO" in papel, papel[:300])

# --- 5. Faturar o cancelado ------------------------------------------------------------------
entrar("gestor")
passo("5. O cancelado não se fatura: o campo Orçamento nº recusa e não carrega itens")
ir("/emporio/vender")
confere("o balcão abre", caminho() == "/emporio/vender" and tem("Total da venda"), caminho())
if campo_existe("Loja") and LOJA not in texto_do_campo("Loja"):
    confere("escolhe " + LOJA, escolher("Loja", LOJA) is True)
confere("o campo Orçamento nº existe", preencher("Orçamento nº", numero_aberto) not in ("SEM ROTULO", "SEM CAMPO"))
confere("clica em Carregar", clicar("Carregar"))
recusa = esperar(lambda: erro_do_campo("Orçamento nº"), 30)
confere("a recusa é: " + CANCELADO_NAO_FATURA, recusa == CANCELADO_NAO_FATURA, recusa)
confere("nenhum item foi carregado", not tem("Faturando o orçamento nº") and valor_aria("Quantidade do item 1") == "SEM CAMPO", texto_principal(300))
ir("/emporio/vender?orcamento=" + id_aberto)
confere("pelo link ?orcamento=, o balcão avisa que está cancelado", esperar(lambda: CANCELADO_NAO_FATURA in texto_do_main(), 20), texto_principal(300))
confere("e não carrega itens", not tem("Faturando o orçamento nº") and valor_aria("Quantidade do item 1") == "SEM CAMPO", texto_principal(300))

# --- 6. Novo a partir do faturado ------------------------------------------------------------
entrar("vendedor")
passo("6. Novo orçamento a partir do faturado: itens preenchidos, outro número, vínculo nas duas telas")
confere("abre o detalhe do faturado", abrir_detalhe(href_faturado), texto_principal(200))
href_base = href_da_acao("Novo orçamento a partir deste")
confere("o link leva ao balcão com orcamento_base", href_base.startswith("/emporio/vender?orcamento_base="), href_base)
ir(href_base)
confere("o balcão avisa: Novo orçamento a partir do nº " + numero_faturado, esperar(lambda: ("Novo orçamento a partir do nº " + numero_faturado) in texto_do_main(), 20), texto_principal(300))
confere("o item do original veio, com 2 kg", esperar(lambda: valor_aria("Quantidade do item 1").startswith("2"), 15), valor_aria("Quantidade do item 1"))
confere("o item vem a R$ 20,00 (preço de hoje)", valor_aria("Preço do item 1 (R$)").startswith("20"), valor_aria("Preço do item 1 (R$)"))
confere("clica em Salvar orçamento", enviar_botao("Salvar orçamento"))
confere("vai ao detalhe de outro orçamento", esperar(lambda: caminho().startswith("/emporio/orcamentos/") and caminho() != href_faturado, 60), caminho())
esperar(lambda: tem("Itens"), 30)
href_novo = caminho()
numero_novo = numero_do_detalhe()
t = texto_do_main()
confere("o novo tem outro número", numero_novo != "" and numero_novo != numero_faturado, [numero_novo, numero_faturado])
confere("o novo mostra: Feito a partir do orçamento nº " + numero_faturado, ("Feito a partir do orçamento nº " + numero_faturado) in t, t[:500])
confere("o novo está Aberto", "Aberto" in linhas(t), t[:300])
confere("abre o original", abrir_detalhe(href_faturado), texto_principal(200))
t = texto_do_main()
confere("o original lista o novo: Orçamentos feitos a partir deste: nº " + numero_novo, "Orçamentos feitos a partir deste" in t and ("nº " + numero_novo) in t, t[:600])
confere("o original continua Faturado e sem Editar", "Faturado" in t and "Editar" not in acoes(), acoes())

# --- 7. Celular ------------------------------------------------------------------------------
passo("7. Celular (360 px): o detalhe de um orçamento aberto, com todos os botões, sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=360, height=800, deviceScaleFactor=2, mobile=True)
confere("abre o detalhe do orçamento editado (aberto)", abrir_detalhe(href_vencido), texto_principal(200))
a = acoes()
confere("no celular o detalhe tem Editar, Cancelar e Novo a partir deste", "Editar" in a and "Cancelar orçamento" in a and "Novo orçamento a partir deste" in a, a)
confere("o detalhe sem rolagem horizontal", sem_rolagem_horizontal(), medida())
cdp("Emulation.clearDeviceMetricsOverride")

fim()
