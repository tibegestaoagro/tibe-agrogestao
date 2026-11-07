# Validacao viva de "Empório, entrega 2: caixa com turno" (Modulo 39, spec
# docs/specs/module-39-meu-emporio.md, Q150 em diante): o papel Caixa, o
# balcao que abre o caixa na hora da venda, sangria, conferencia e encerramento
# com malote, o relatorio do fechamento (A4 e bobina), a confirmacao do gerente
# (com diferenca), a loja sem Caixa e o celular.
#
# cenario: scripts/_cenario-emporio-turno.ts
# sessao: caixa turno-caixa@teste.local
# sessao: gestor1 turno-gestor1@teste.local
# sessao: vendedor1 turno-vendedor1@teste.local
# sessao: vendedor2 turno-vendedor2@teste.local

import base64
import re

LOJA1 = "Turno Loja 1"
LOJA2 = "Turno Loja 2"
PRODUTO = "Turno Ração"
MENU_DO_CAIXA = ["/emporio", "/emporio/vender", "/emporio/vendas", "/emporio/fiado", "/emporio/clientes", "/emporio/caixa"]


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


# O cartao de uma loja na tela do Caixa: o <div> que tem o <h3> com o nome dela.
CARTAO = "(() => { const h = Array.from(document.querySelectorAll('main h3')).find(x => x.innerText.trim() === %s); return h && h.parentElement.parentElement; })()"


def cartao_texto(loja):
    return (js("(() => { const c = " + (CARTAO % repr(loja)) + "; return c ? c.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or "")


def clicar_no_cartao(loja, rotulo):
    return bool(js("(() => { const c = " + (CARTAO % repr(loja)) + "; const b = c && Array.from(c.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def botoes_do_cartao(loja):
    return js("(() => { const c = " + (CARTAO % repr(loja)) + "; return c ? Array.from(c.querySelectorAll('button')).map(b => b.innerText.trim()) : null; })()") or []


def clicar_na_linha(trecho, rotulo):
    """Clica no botao `rotulo` da linha da tabela que contem `trecho`."""
    return bool(js("(() => { const r = Array.from(document.querySelectorAll('main tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); const b = r && Array.from(r.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def preenchido(rotulo, valor):
    return preencher(rotulo, valor) not in ("SEM ROTULO", "SEM CAMPO")


def abrir_painel(clique, nome):
    ok = clique()
    time.sleep(1.5)
    confere("abre o painel: " + nome, ok and esperar(painel_aberto, 15))


def hrefs_do_painel():
    return js("Array.from(document.querySelectorAll('[role=dialog] a')).map(a => [a.innerText.trim(), a.getAttribute('href'), a.getAttribute('target')])") or []


# --- 1. O Caixa entra --------------------------------------------------------
entrar("caixa")
ir("/emporio")
passo("1. O Caixa: menu enxuto, Estoque pela URL volta ao Meu Empório")
vistos = [h for h in menu() if h.startswith("/emporio")]
confere("o menu do Caixa tem só Início, Vender, Vendas, Fiado, Clientes e Caixa", vistos == MENU_DO_CAIXA, vistos)
ir("/emporio/estoque")
confere("Estoque pela URL volta ao /emporio", caminho() == "/emporio", caminho())

# --- 2. Balcao com o caixa fechado --------------------------------------------
passo("2. Balcão com o caixa fechado: finalizar pede o troco, abre o caixa e vende")
ir("/emporio/vender")
confere("o balcão abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
if js("!!Array.from(document.querySelectorAll('main label')).find(l => l.innerText.replace('*','').trim() === 'Loja')"):
    confere("escolhe a Loja 1", escolher("Loja", LOJA1) is True)
confere("busca o produto", preencher_aria("Buscar produto", "Turno") != "SEM CAMPO")
confere("adiciona o produto", esperar(lambda: clicar_resultado(PRODUTO), 15))
confere("a quantidade é 1", preencher_aria("Quantidade do item 1", "1") != "SEM CAMPO")
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("o valor em dinheiro é 20", preencher_aria("Valor em Dinheiro (R$)", "20") != "SEM CAMPO")
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
confere("o Caixa escolhe o vendedor que atendeu", escolher("Vendedor", "Turno Vendedor Lojas 1 e 2") is True)
confere("com o caixa fechado, o balcão oferece abrir o caixa", esperar(lambda: tem("Abrir o Caixa 1"), 20), texto_principal(300))
enviar_venda()
time.sleep(2)
confere("finalizar não registra a venda: o caixa está fechado", not tem("Venda registrada"), texto_principal(200))
abrir_painel(lambda: clicar("Abrir o Caixa 1"), "abrir o Caixa 1")
confere("o painel espera o troco esperado de R$ 100,00", "100,00" in (js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""))
confere("preenche o troco contado", preenchido("Troco contado (R$)", "100"))
enviar_painel()
confere("a venda continua sozinha depois de abrir o caixa", esperar(lambda: tem("Venda registrada"), 60), texto_principal(300))

# --- 3. Sangria, conferencia e encerramento ----------------------------------
passo("3. Tela do Caixa: sangria, conferência sem diferença e encerramento com malote")
ir("/emporio/caixa")
confere("a tela do Caixa abre", caminho() == "/emporio/caixa" and tem("Caixas de cada loja"), caminho())
confere("o caixa da Loja 1 mostra Aberto", "Aberto" in cartao_texto(LOJA1), cartao_texto(LOJA1)[:200])
confere("o saldo do caixa é R$ 120,00", "120,00" in cartao_texto(LOJA1), cartao_texto(LOJA1)[:200])
abrir_painel(lambda: clicar_no_cartao(LOJA1, "Sangria"), "sangria")
confere("preenche o valor da sangria", preenchido("Valor retirado (R$)", "30"))
confere("preenche a observação", preenchido("Observação", "notas de 10"))
enviar_painel()
confere("a sangria fecha o painel", esperar(lambda: not painel_aberto(), 60))
confere("o saldo do caixa passa a R$ 90,00", esperar(lambda: "90,00" in cartao_texto(LOJA1), 30), cartao_texto(LOJA1)[:200])
abrir_painel(lambda: clicar_no_cartao(LOJA1, "Conferir"), "conferir")
confere("preenche o valor contado da conferência", preenchido("Valor contado (R$)", "90"))
enviar_painel()
confere("a conferência fecha o painel", esperar(lambda: not painel_aberto(), 60))
confere("a conferência sem diferença bate", esperar(lambda: "bateu" in cartao_texto(LOJA1), 30), cartao_texto(LOJA1)[-200:])
abrir_painel(lambda: clicar_no_cartao(LOJA1, "Encerrar"), "encerrar")
confere("preenche o valor contado do encerramento", preenchido("Valor contado (R$)", "90"))
confere("preenche o malote de R$ 60,00", preenchido("Malote (R$)", "60"))
confere("a tela diz que ficam R$ 30,00 de troco", esperar(lambda: "30,00" in (js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""), 10))
enviar_painel()
links = esperar(lambda: hrefs_do_painel() if len(hrefs_do_painel()) == 2 else None, 60) or []
confere("o encerramento mostra os links do relatório A4 e da bobina", [l[0] for l in links] == ["Relatório A4", "Relatório na bobina"] and all(l[2] == "_blank" for l in links), links)
href_a4 = links[0][1] if links else ""
href_cupom = links[1][1] if len(links) > 1 else ""
turno_id = href_a4.split("/turno/")[1].split("?")[0] if "/turno/" in href_a4 else ""
confere("o link do relatório traz o id do turno", bool(turno_id), href_a4)
clicar("Concluir")
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60))
confere("o caixa volta a Fechado", esperar(lambda: "Fechado" in cartao_texto(LOJA1) and "Aberto" not in cartao_texto(LOJA1).replace("Aberto por", ""), 30), cartao_texto(LOJA1)[:200])
confere("fechado, o caixa oferece Abrir e não Encerrar", "Abrir" in botoes_do_cartao(LOJA1) and "Encerrar" not in botoes_do_cartao(LOJA1), botoes_do_cartao(LOJA1))

# --- 4. Relatorio do encerramento ---------------------------------------------
passo("4. Relatório do encerramento: A4 e bobina")
ir(href_a4)
pagina = texto_da_pagina()
confere("o relatório A4 abre", caminho() == "/emporio/imprimir/turno/" + turno_id, caminho())
confere("tem o título FECHAMENTO DE CAIXA", "FECHAMENTO DE CAIXA" in pagina, pagina[:200])
confere("tem o caixa e o operador", "Caixa 1" in pagina and "Turno Caixa Loja 1" in pagina, pagina[:300])
confere("tem a venda em dinheiro de R$ 20,00", "20,00" in pagina, pagina[:600])
confere("tem a sangria de R$ 30,00 e o malote de R$ 60,00", "30,00" in pagina and "60,00" in pagina, pagina[:900])
confere("não está marcado como turno aberto", "TURNO ABERTO" not in pagina)
cdp("Emulation.setEmulatedMedia", media="print")
sobra = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === 'Imprimir'); return { botao_visivel: !!b && b.getBoundingClientRect().height > 0, topo_do_papel_px: Math.round(document.querySelector('.a4').getBoundingClientRect().top) }; })()") or {}
cdp("Emulation.setEmulatedMedia", media="")
confere("no A4, na impressão, o botão some e nada sobra acima do papel", sobra.get("botao_visivel") is False and sobra.get("topo_do_papel_px") == 0, sobra)

ir(href_cupom)
pagina = texto_da_pagina()
confere("o relatório da bobina abre", caminho() == "/emporio/imprimir/turno/" + turno_id and "FECHAMENTO DE CAIXA" in pagina, pagina[:200])
REGRAS_PAGE = "(() => { const out = []; for (const s of document.styleSheets) { let rs; try { rs = s.cssRules; } catch (e) { continue; } for (const r of rs) { if (r.cssText.includes('@page')) out.push(r.cssText); } } return out.join(' ; '); })()"
esperar(lambda: re.search(r"size:\s*\d+mm\s+\d+(\.\d+)?mm", js(REGRAS_PAGE) or ""), 10)
regra = js(REGRAS_PAGE) or ""
tamanho = re.search(r"size:\s*(\d+)mm\s+(\d+(?:\.\d+)?)mm", regra)
confere("a regra @page tem size com largura e altura em mm", bool(tamanho), regra)
largura_mm = float(tamanho.group(1)) if tamanho else 0
try:
    pdf = base64.b64decode(cdp("Page.printToPDF", preferCSSPageSize=True, printBackground=True)["data"])
    paginas = len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", pdf))
    caixa_pdf = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", pdf)
    largura_pt = float(caixa_pdf.group(1)) if caixa_pdf else 0
    cdp("Emulation.setEmulatedMedia", media="print")
    topo_mm = js("Math.round(document.querySelector('.cupom').getBoundingClientRect().top * 25.4 / 96 * 10) / 10")
    cdp("Emulation.setEmulatedMedia", media="")
    confere("o PDF da bobina sai numa página só", paginas == 1, [paginas, regra, "topo do cupom na impressão: " + str(topo_mm) + " mm"])
    confere("a página do PDF tem a largura configurada da bobina", largura_mm > 0 and abs(largura_pt - largura_mm * 72 / 25.4) < 3, [largura_mm, largura_pt])
    confere("na impressão, nada sobra acima do cupom", topo_mm == 0, topo_mm)
except Exception as e:
    confere("o PDF da bobina sai numa página só", False, repr(e))
confere("a bobina tem a largura configurada", largura_mm > 0 and js("(() => { const a = document.querySelector('.cupom'); return Math.abs(a.getBoundingClientRect().width - " + str(largura_mm) + " * 96 / 25.4) < 2; })()"))

# --- 5. O Gestor confirma ------------------------------------------------------
passo("5. O Gestor: Meu Dia avisa, confirma a sangria certa e o malote com diferença")
entrar("gestor1")
ir("/meu-dia")
confere("o Meu Dia mostra o dinheiro aguardando o gerente", esperar(lambda: tem("aguardando o gerente na " + LOJA1), 30), texto_principal(400))
confere("o aviso soma R$ 90,00", tem("90,00"), texto_principal(400))
ir("/emporio/caixa")
confere("a lista Aguardando o gerente mostra a sangria e o malote", tem("Sangria do Caixa 1, " + LOJA1) and tem("Malote do Caixa 1, " + LOJA1), texto_principal(300))
confere("Com a gerência está zerada antes de confirmar", "Com a gerência: R$ 0,00" in cartao_texto(LOJA1), cartao_texto(LOJA1)[:300])
abrir_painel(lambda: clicar_na_linha("Sangria do Caixa 1", "Confirmar"), "confirmar a sangria")
confere("preenche o valor recebido da sangria", preenchido("Valor recebido (R$)", "30"))
enviar_painel()
confere("a sangria confirmada fecha o painel", esperar(lambda: not painel_aberto(), 60))
confere("a sangria sai da lista", esperar(lambda: not tem("Sangria do Caixa 1, " + LOJA1), 30), texto_principal(300))
abrir_painel(lambda: clicar_na_linha("Malote do Caixa 1", "Confirmar"), "confirmar o malote")
confere("preenche o valor recebido do malote: 55", preenchido("Valor recebido (R$)", "55"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Observação"))
confere("a diferença sem observação é recusada no campo", "motivo" in (recusa or ""), recusa)
confere("o painel continua aberto", painel_aberto())
confere("preenche a observação", preenchido("Observação", "faltou uma nota de 5"))
enviar_painel()
confere("o malote confirmado fecha o painel", esperar(lambda: not painel_aberto(), 60))
confere("a lista fica vazia", esperar(lambda: tem("Nenhuma entrega aguardando"), 30), texto_principal(300))
confere("Com a gerência soma R$ 85,00 (30 da sangria e 55 do malote)", esperar(lambda: "Com a gerência: R$ 85,00" in cartao_texto(LOJA1), 30), cartao_texto(LOJA1)[:300])
ir("/meu-dia")
confere("o Meu Dia deixa de avisar", esperar(lambda: not tem("aguardando o gerente"), 30), texto_principal(300))

# --- 6. Loja sem Caixa -----------------------------------------------------------
passo("6. Loja sem Caixa: um Vendedor abre e outro Vendedor encerra")
entrar("vendedor2")
ir("/emporio/caixa")
confere("o Vendedor da Loja 2 vê o cartão da loja", LOJA2 in texto_principal(2000) or bool(cartao_texto(LOJA2)), texto_principal(300))
abrir_painel(lambda: clicar_no_cartao(LOJA2, "Abrir"), "abrir o caixa da Loja 2")
confere("preenche o troco contado", preenchido("Troco contado (R$)", "100"))
enviar_painel()
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60))
confere("o caixa da Loja 2 mostra Aberto por Turno Vendedor Loja 2", esperar(lambda: "Aberto por Turno Vendedor Loja 2" in cartao_texto(LOJA2), 30), cartao_texto(LOJA2)[:200])
entrar("vendedor1")
ir("/emporio/caixa")
confere("o outro Vendedor vê o caixa aberto por quem abriu", esperar(lambda: "Aberto por Turno Vendedor Loja 2" in cartao_texto(LOJA2), 30), cartao_texto(LOJA2)[:200])
abrir_painel(lambda: clicar_no_cartao(LOJA2, "Encerrar"), "encerrar o turno de outro Vendedor")
confere("preenche o valor contado", preenchido("Valor contado (R$)", "100"))
confere("preenche o malote de R$ 0", preenchido("Malote (R$)", "0"))
enviar_painel()
confere("a Loja 2 não tem Caixa: o encerramento é aceito", esperar(lambda: len(hrefs_do_painel()) == 2, 60), texto_principal(300))
clicar("Concluir")
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60))
confere("o caixa da Loja 2 volta a Fechado", esperar(lambda: "Fechado" in cartao_texto(LOJA2), 30), cartao_texto(LOJA2)[:200])
ir("/emporio/caixa")
confere("na Loja 1 (com Caixa) o Vendedor abre o caixa, mas não vê a conta do gerente", "Aguardando o gerente" not in texto_principal(20000))

# --- 7. Celular ------------------------------------------------------------------
passo("7. Celular (390 px): a tela do Caixa sem rolagem horizontal")
entrar("caixa")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
ir("/emporio/caixa")
confere("a tela abre no celular", caminho() == "/emporio/caixa" and tem("Caixas de cada loja"), caminho())
confere("sem rolagem horizontal", sem_rolagem_horizontal(), js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth"))
abrir_painel(lambda: clicar_no_cartao(LOJA1, "Abrir"), "abrir o caixa no celular")
confere("com o painel aberto, sem rolagem horizontal", sem_rolagem_horizontal(), js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth"))
cdp("Emulation.clearDeviceMetricsOverride")

fim()
