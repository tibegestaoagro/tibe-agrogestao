# Validacao viva da onda 2 da frente de UX do Meu Empório (o Início novo,
# docs/superpowers/specs/2026-11-24-emporio-ux-design.md 5.5 e o plano
# docs/superpowers/plans/2026-11-25-emporio-ux-onda2-inicio.md): "Precisa de você"
# por papel e por loja, os números do dia, os atalhos, o Caixa que entra em Vender.
#
# O cenario tem tres lojas: A e B cheias de problema, C sem nenhum. O Gestor de A
# so conta A; o Gestor de C nao tem aviso nenhum; o Financeiro so a coluna do dinheiro.
#
# cenario: scripts/_cenario-emporio-ux-onda2.ts
# sessao: dono owner@example.com
# sessao: gestorA ux-gestor-a@teste.local
# sessao: gestorC ux-gestor-c@teste.local
# sessao: financeiro ux-financeiro@teste.local
# sessao: caixa ux-caixa@teste.local
import os
import re
import base64
import datetime as _dt

PASTA_DAS_FOTOS = os.environ.get("TIBE_FOTOS", "")


def foto(nome):
    """Foto da tela, so quando TIBE_FOTOS aponta uma pasta (fora do git)."""
    if not PASTA_DAS_FOTOS:
        return
    os.makedirs(PASTA_DAS_FOTOS, exist_ok=True)
    r = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=True)
    with open(os.path.join(PASTA_DAS_FOTOS, nome + ".png"), "wb") as f:
        f.write(base64.b64decode(r["data"]))


def avisos():
    """Cada item de 'Precisa de você': etiqueta da coluna, texto, link."""
    return js("Array.from(document.querySelectorAll('section[aria-labelledby=\"inicio-precisa\"] li')).map(li => ({ badge: li.children[0].children[0].innerText.trim(), texto: li.children[0].children[1].innerText.trim(), href: li.querySelector('a').getAttribute('href'), acao: li.querySelector('a').innerText.trim() }))") or []


def numeros():
    """Cada cartao dos números do dia: [titulo, valor, apoio...]."""
    return js("Array.from(document.querySelectorAll('section[aria-label=\"Números do dia\"] > div')).map(d => Array.from(d.querySelectorAll('p')).map(p => p.innerText.replace(/\\u00a0/g, ' ').trim()))") or []


def cartao(titulo):
    for c in numeros():
        if c and c[0] == titulo:
            return c
    return None


def brl(txt):
    """'R$ 1.234,56' vira 1234.56."""
    return float(re.sub(r"[^\d,]", "", txt).replace(",", "."))


def atalhos():
    """Os links da secao 'Atalhos' (texto|href), na ordem da tela."""
    return js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Atalhos'); const s = h && h.closest('section'); return s ? Array.from(s.querySelectorAll('a')).map(a => a.innerText.trim() + '|' + a.getAttribute('href')) : []; })()") or []


def rolagem_lateral():
    return js("document.documentElement.scrollWidth - window.innerWidth")


def saudacao_ok():
    return bool(re.match(r"^(Bom dia|Boa tarde|Boa noite), \S+", titulo_da_tela()))


def tem_i():
    return bool(js("!!document.querySelector('button[aria-label=\"Sobre esta tela\"]')"))


def tem_bloco():
    return bool(js("!!document.querySelector('section[aria-labelledby=\"inicio-precisa\"]') || (document.querySelector('main') || document.body).innerText.includes('Precisa de você')"))


def hoje_curto():
    """dd/mm/aa de hoje em Sao Paulo (sem horario de verao desde 2019: UTC-3)."""
    d = _dt.datetime.utcnow() - _dt.timedelta(hours=3)
    return d.strftime("%d/%m/%Y")


def vendas_de_hoje():
    """Soma e quantidade das vendas concluidas de hoje, lidas na tela de Vendas."""
    ir("/emporio/vendas?situacao=concluida&por_pagina=100")
    linhas = js("Array.from(document.querySelectorAll('main tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.split('\\n')[0].replace(/\\u00a0/g, ' ').trim()))") or []
    hoje = hoje_curto()
    do_dia = [l for l in linhas if len(l) > 5 and l[1].startswith(hoje)]
    # A lista vem da mais recente para a mais antiga: se alguma linha NAO e de hoje, as de hoje acabaram.
    completa = any(not l[1].startswith(hoje) for l in linhas if len(l) > 5)
    return round(sum(brl(l[5]) for l in do_dia), 2), len(do_dia), completa


def cartao_a_pagar(rotulo):
    """(valor, itens) do cartao do resumo da tela A pagar ('Vencida', 'Vence hoje')."""
    ir("/emporio/financeiro/pagar")
    t = (js("(document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' ')") or "")
    m = re.search(re.escape(rotulo) + r"\s+R\$ ([\d.]+,\d{2})\s+(\d+) iten", t)
    return (brl(m.group(1)), int(m.group(2))) if m else None


def hoje_a_pagar_do_financeiro():
    """(valor, contas) do bloco 'Vence hoje a pagar' da aba Hoje do Financeiro."""
    ir("/emporio/financeiro")
    t = (js("(document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' ')") or "")
    m = re.search(r"Vence hoje a pagar\s+(\d+) conta[^\n]*\s+R\$ ([\d.]+,\d{2})", t)
    return (brl(m.group(2)), int(m.group(1))) if m else None


def chegar(aviso):
    """Segue o link do aviso a partir do Inicio e devolve (caminho, busca, titulo, 404)."""
    destino = ir(aviso["href"])
    busca = js("location.search") or ""
    return destino, busca, titulo_da_tela(), eh_404()


# 1. Dono: as duas colunas, e cada link abre a tela certa.
passo("1. Dono: avisos das duas colunas, e cada link abre a tela certa")
entrar("dono")
destino = ir("/emporio")
confere("o dono fica em /emporio", destino == "/emporio", destino)
confere("o cabeçalho é a saudação com o nome", saudacao_ok(), titulo_da_tela())
confere("o cabeçalho tem o (i)", tem_i())
av = avisos()
for a in av:
    print("   aviso:", a["badge"], "|", a["texto"], "|", a["href"], "|", a["acao"])
etiquetas = {a["badge"] for a in av}
confere("o dono vê a etiqueta Gestor e a Financeiro", etiquetas == {"Gestor", "Financeiro"}, etiquetas)
confere("o bloco 'Precisa de você' aparece", tem_bloco())


def acha(trecho, lista=None):
    return [a for a in (lista if lista is not None else av) if trecho in a["texto"]]


a_estoque_a = acha("para repor em Ux Loja A")
a_estoque_b = acha("para repor em Ux Loja B")
a_orc = acha("perto de vencer")
a_caixa_a = [a for a in av if "segue aberto" in a["texto"] and "Ux Loja A" in a["texto"]]
a_caixa_b = [a for a in av if "segue aberto" in a["texto"] and "Ux Loja B" in a["texto"]]
a_fiado = acha("fiado vencido")
a_pagar = acha("a pagar vencida ou vencendo hoje")
a_aprov = acha("esperando aprovação")
a_bc = acha("vencido sem baixa")
confere("aviso de reposição da Loja A", len(a_estoque_a) == 1, [a["texto"] for a in a_estoque_a])
confere("aviso de reposição da Loja B", len(a_estoque_b) == 1, [a["texto"] for a in a_estoque_b])
confere("aviso de orçamento perto de vencer", len(a_orc) == 1, [a["texto"] for a in a_orc])
confere("aviso de caixa de dia anterior da Loja A e da Loja B", len(a_caixa_a) == 1 and len(a_caixa_b) == 1, [a["texto"] for a in av if "segue aberto" in a["texto"]])
confere("aviso de fiado vencido", len(a_fiado) >= 1, [a["texto"] for a in a_fiado])
confere("aviso de conta a pagar vencida ou vencendo hoje", len(a_pagar) == 1, [a["texto"] for a in a_pagar])
confere("aviso de pedido esperando aprovação", len(a_aprov) == 1, [a["texto"] for a in a_aprov])
confere("aviso de boleto ou cheque vencido", len(a_bc) == 1, [a["texto"] for a in a_bc])
if a_pagar:
    venc_p, hoje_p = cartao_a_pagar("Vencida"), cartao_a_pagar("Vence hoje")
    print("   A pagar: Vencida", venc_p, "| Vence hoje", hoje_p)
    confere("o aviso de a pagar conta a vencida mais a de hoje da tela A pagar", bool(venc_p and hoje_p) and a_pagar[0]["texto"].startswith(str(venc_p[1] + hoje_p[1]) + " conta"), [a_pagar[0]["texto"], venc_p, hoje_p])
    ir("/emporio")
if a_estoque_a:
    confere("o aviso da Loja A diz '1 produto'", a_estoque_a[0]["texto"].startswith("1 produto "), a_estoque_a[0]["texto"])

# Destino exato de cada tipo de aviso.
DESTINOS = [
    ("reposição A", a_estoque_a, "/emporio/estoque", "loja=", "Estoque"),
    ("reposição B", a_estoque_b, "/emporio/estoque", "loja=", "Estoque"),
    ("orçamento", a_orc, "/emporio/orcamentos", "situacao=aberto", "Orçamentos"),
    ("caixa A", a_caixa_a, "/emporio/caixa", "", None),
    ("fiado", a_fiado, "/emporio/financeiro/receber", "ver=vencido", None),
    ("a pagar", a_pagar, "/emporio/financeiro/pagar", "", "A pagar"),
    ("aprovação", a_aprov, "/emporio/financeiro/aprovacoes", "", None),
    ("boleto ou cheque", a_bc, "/emporio/financeiro/receber", "ver=vencido", None),
]
for nome, lista, caminho_esperado, busca_esperada, titulo_esperado in DESTINOS:
    if not lista:
        confere("o link de " + nome + " existe", False)
        continue
    d, b, t, nf = chegar(lista[0])
    print("   destino de", nome, ":", d, b, "| h1:", t)
    confere("o link de " + nome + " abre " + caminho_esperado + (("?" + busca_esperada) if busca_esperada else ""), d == caminho_esperado and busca_esperada in b and not nf, [d, b])
    confere("a tela de " + nome + " tem título", bool(t), t)
    if titulo_esperado:
        confere("o título de " + nome + " é '" + titulo_esperado + "'", t == titulo_esperado, t)
# O link do conferir banco (so existe se a conta tem linha sem conferir).
a_conf = acha("sem conferir com o banco")
if a_conf:
    d, b, t, nf = chegar(a_conf[0])
    confere("o link de conferir abre a posição de caixa com o filtro sem conferir", d == "/emporio/financeiro/caixa" and "carimbo=sem" in b and not nf, [d, b])
# Cada destino de loja leva a loja certa: a reposição de A mostra a Ração Ux e a de B tambem.
d, b, t, nf = chegar(a_estoque_a[0])
confere("a reposição da Loja A abre o Estoque com a Ração Ux", tem_com_ajuda("Ux Ração"), texto_principal(160))
d, b, t, nf = chegar(a_orc[0])
confere("o link de orçamento mostra um orçamento da Loja A", tem_com_ajuda("Ux Loja A"), texto_principal(160))

passo("2. Dono: os números batem com as telas de origem")
soma_vendas, qtd_vendas, completa = vendas_de_hoje()
print("   Vendas de hoje na tela de Vendas:", soma_vendas, "em", qtd_vendas, "vendas")
confere("as vendas de hoje cabem na primeira página da tela de Vendas (soma confiável)", completa and qtd_vendas > 0, [qtd_vendas, completa])
ir("/emporio")
c_hoje = cartao("Vendas hoje")
confere("o cartão Vendas hoje existe", c_hoje is not None, numeros())
if c_hoje:
    confere("Vendas hoje do Início == soma da tela de Vendas (R$ %.2f)" % soma_vendas, abs(brl(c_hoje[1]) - soma_vendas) < 0.005, c_hoje)
    confere("a quantidade de vendas bate", c_hoje[2].startswith(str(qtd_vendas) + " venda"), [c_hoje[2], qtd_vendas])
c_mes = cartao("Vendas no mês")
confere("o cartão Vendas no mês existe", c_mes is not None)
if c_mes:
    print("   Vendas no mês:", c_mes)
    confere("a comparação do mês é uma frase com 'de outubro' (ou some)", len(c_mes) == 2 or "outubro" in c_mes[2], c_mes)
    confere("sem 'NaN' nem 'Infinity' no cartão do mês", not any("NaN" in x or "Infinity" in x for x in c_mes), c_mes)
c_sai = cartao("Sai hoje")
c_entra = cartao("Entra hoje")
confere("o dono vê os quatro cartões", len(numeros()) == 4, [c[0] for c in numeros()])
foto("dono-computador")
venc, hoje_p = cartao_a_pagar("Vencida"), cartao_a_pagar("Vence hoje")
print("   A pagar: Vencida", venc, "| Vence hoje", hoje_p)
if c_sai:
    print("   Sai hoje:", c_sai)
    confere("Sai hoje do Início == Vencida + Vence hoje do A pagar", bool(venc and hoje_p) and abs(brl(c_sai[1]) - (venc[0] + hoje_p[0])) < 0.005, [c_sai, venc, hoje_p])
    confere("a quantidade de contas de Sai hoje == itens de Vencida + Vence hoje", bool(venc and hoje_p) and c_sai[2].startswith(str(venc[1] + hoje_p[1]) + " conta"), [c_sai[2], venc, hoje_p])
fin = hoje_a_pagar_do_financeiro()
print("   Financeiro, Hoje, 'Vence hoje a pagar':", fin)
confere("Sai hoje do Início == 'Vence hoje a pagar' da aba Hoje do Financeiro", bool(c_sai and fin) and abs(brl(c_sai[1]) - fin[0]) < 0.005 and c_sai[2].startswith(str(fin[1]) + " conta"), [c_sai, fin])
confere("Entra hoje tem valor em reais", bool(c_entra) and c_entra[1].startswith("R$"), c_entra)
ir("/emporio/financeiro")
t_fin = js("(document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' ')") or ""
m = re.search(r"Vence hoje a receber\s+Total\s+R\$ ([\d.]+,\d{2})", t_fin)
print("   Financeiro, Hoje, 'Vence hoje a receber':", m.group(1) if m else None)
confere("Entra hoje do Início == 'Vence hoje a receber' da aba Hoje do Financeiro", bool(m and c_entra) and abs(brl(c_entra[1]) - brl(m.group(1))) < 0.005, [c_entra, m.group(1) if m else None])

passo("3. Dono: atalhos e Nova compra")
ir("/emporio")
at = atalhos()
print("   atalhos do dono:", at)
confere("os atalhos do dono, na ordem do desenho", [x.split("|")[0] for x in at][:5] == ["Estatísticas", "Produtos", "Estoque", "Nova compra", "A receber"], at)
confere("Nova compra aponta para /emporio/compras?nova=1", "Nova compra|/emporio/compras?nova=1" in at, at)
confere("A receber aponta para /emporio/financeiro/receber", "A receber|/emporio/financeiro/receber" in at, at)
confere("o painel de compra NÃO está aberto antes do clique", not painel_aberto())
js("document.querySelector('a[href=\"/emporio/compras?nova=1\"]').click()")
confere("clicar em Nova compra abre o painel de compra", bool(esperar(painel_aberto, 60)), texto_principal(120))
confere("o endereço é /emporio/compras?nova=1", (js("location.pathname + location.search") or "") == "/emporio/compras?nova=1", js("location.pathname + location.search"))
ir("/emporio/compras")
confere("sem o ?nova=1 o painel não abre sozinho", not painel_aberto())

passo("4. Gestor de A: só a coluna Gestor, só da Loja A")
entrar("gestorA")
destino = ir("/emporio")
confere("o gestor fica em /emporio", destino == "/emporio", destino)
confere("o cabeçalho é a saudação com o nome", saudacao_ok(), titulo_da_tela())
av_g = avisos()
for a in av_g:
    print("   aviso:", a["badge"], "|", a["texto"], "|", a["href"])
confere("o gestor só vê a etiqueta Gestor", {a["badge"] for a in av_g} == {"Gestor"}, [a["badge"] for a in av_g])
confere("três avisos: reposição, orçamento e caixa de A", len(av_g) == 3, [a["texto"] for a in av_g])
confere("nenhum aviso cita a Loja B", not any("Ux Loja B" in a["texto"] for a in av_g), [a["texto"] for a in av_g])
confere("o orçamento é só o de A (1 orçamento)", any(a["texto"].startswith("1 orçamento") for a in av_g), [a["texto"] for a in av_g])
confere("nenhum aviso de dinheiro (fiado, a pagar, aprovação, boleto, conferir)", not any(x in a["texto"] for a in av_g for x in ("fiado", "a pagar", "aprovação", "boleto", "conferir")), [a["texto"] for a in av_g])
confere("o gestor vê dois cartões, sem Entra nem Sai", [c[0] for c in numeros()] == ["Vendas hoje", "Vendas no mês"], [c[0] for c in numeros()])
c_g = cartao("Vendas hoje")
print("   Vendas hoje do gestor de A:", c_g)
# A: R$ 40 + R$ 50 do cheque; B: R$ 25 nao entra. O dono viu a soma das duas (mais a da demonstracao, se houver venda hoje).
confere("Vendas hoje do gestor é só a da Loja A: R$ 90,00 (40 + 50), sem os R$ 25 da B", bool(c_g) and abs(brl(c_g[1]) - 90.0) < 0.005, c_g)
confere("a quantidade são 2 vendas", bool(c_g) and c_g[2].startswith("2 venda"), c_g)
foto("gestor-computador")

passo("5. Gestor de C: nenhum aviso, o bloco some inteiro")
entrar("gestorC")
destino = ir("/emporio")
confere("o gestor de C fica em /emporio", destino == "/emporio", destino)
confere("o cabeçalho é a saudação com o nome", saudacao_ok(), titulo_da_tela())
confere("não há seção nem título 'Precisa de você'", not tem_bloco(), texto_principal(300))
confere("os números do dia continuam (dois cartões)", len(numeros()) == 2, numeros())
confere("a tela segue com atalhos", len(atalhos()) > 0, atalhos())
foto("gestor-limpo-computador")

passo("6. Financeiro: só a coluna do dinheiro")
entrar("financeiro")
destino = ir("/emporio")
confere("o financeiro fica em /emporio", destino == "/emporio", destino)
confere("o cabeçalho é a saudação com o nome", saudacao_ok(), titulo_da_tela())
av_f = avisos()
for a in av_f:
    print("   aviso:", a["badge"], "|", a["texto"], "|", a["href"])
confere("o financeiro só vê a etiqueta Financeiro", {a["badge"] for a in av_f} == {"Financeiro"}, [a["badge"] for a in av_f])
confere("nenhum aviso de reposição, orçamento ou caixa", not any(x in a["texto"] for a in av_f for x in ("repor", "orçamento", "segue aberto")), [a["texto"] for a in av_f])
confere("tem fiado, a pagar, aprovação e boleto ou cheque", all(any(x in a["texto"] for a in av_f) for x in ("fiado vencido", "a pagar vencida", "esperando aprovação", "vencido sem baixa")), [a["texto"] for a in av_f])
confere("o financeiro vê os quatro cartões", len(numeros()) == 4, [c[0] for c in numeros()])
at_f = atalhos()
print("   atalhos do financeiro:", at_f)
confere("o financeiro tem o atalho A receber", "A receber|/emporio/financeiro/receber" in at_f, at_f)
foto("financeiro-computador")

passo("7. Caixa: entra em /emporio e termina em Vender, sem Início no menu")
entrar("caixa")
destino = ir("/emporio")
confere("o caixa termina em /emporio/vender", destino == "/emporio/vender", destino)
confere("sem 404", not eh_404())
rot = js("Array.from(document.querySelectorAll('nav a')).filter(a => (a.getAttribute('href') || '').startsWith('/emporio')).map(a => a.innerText.trim())")
confere("o menu do caixa não tem Início", "Início" not in rot, rot)
confere("o menu do caixa é Vender, Vendas, Clientes, Fiado e Caixa", rot == ["Vender", "Vendas", "Clientes", "Fiado", "Caixa"], rot)
foto("caixa-computador")
# Telas que mandam o Caixa ao Início terminam em Vender, sem laço.
destino = ir("/emporio/fornecedores")
confere("o caixa em /emporio/fornecedores termina em /emporio/vender (redirecionamento encadeado)", destino == "/emporio/vender" and not eh_404(), destino)

passo("8. Celular (390 px): sem rolagem lateral, por papel")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=True)
for chave, esperado in (("dono", "/emporio"), ("gestorA", "/emporio"), ("gestorC", "/emporio"), ("financeiro", "/emporio"), ("caixa", "/emporio/vender")):
    entrar(chave)
    destino = ir("/emporio")
    confere("390 px, " + chave + ": termina em " + esperado, destino == esperado, destino)
    sobra = rolagem_lateral()
    confere("390 px, " + chave + ": sem rolagem lateral", sobra <= 0, sobra)
    foto(chave + "-celular")
cdp("Emulation.clearDeviceMetricsOverride")
