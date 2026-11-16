# Validacao viva das vendas do turno no cartao do caixa (Modulo 39, Q325):
# docs/superpowers/specs/2026-11-16-emporio-caixa-vendas-do-turno-design.md
#
#   1. Caixa (dono): o total da loja diz "Dinheiro nas gavetas (so especie)", e nao "Soma dos caixas"
#   2. O caixa aberto da Px Loja A mostra "na gaveta: R$ 100,00" (o troco da abertura) e "Vendas do turno:
#      R$ 60,00" com "PIX R$ 20,00, Fiado R$ 40,00": as vendas do cenario nao entraram na gaveta
#   3. Uma venda nova de R$ 20,00 em dinheiro pelo balcao entra nas duas coisas: gaveta R$ 120,00 e vendas
#      R$ 80,00 com "Dinheiro R$ 20,00, PIX R$ 20,00, Fiado R$ 40,00"
#   4. A Px Loja B, com turno aberto e sem venda, diz "Nenhuma venda neste turno ainda."
#
# O cenario e o das contas PIX (lojas Px, turno aberto nas duas com R$ 100,00 de troco, venda antiga de
# R$ 20,00 em PIX e venda de R$ 40,00 em fiado na loja A).
#
# cenario: scripts/_cenario-emporio-contas-pix.ts
# sessao: owner owner@example.com

LOJA_A = "Px Loja A"
LOJA_B = "Px Loja B"
RACAO = "Px Ração"


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def cartao_da_loja(nome):
    return js(
        "(() => { const h = Array.from(document.querySelectorAll('main h3')).find(x => x.innerText.trim() === "
        + repr(nome)
        + "); const c = h && h.closest('div.space-y-3'); return c ? c.innerText.replace(/\\u00a0/g, ' ') : ''; })()"
    ) or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def texto_do_campo(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document.querySelector('main'); const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? (el.value !== undefined && el.tagName === 'INPUT' ? el.value : el.innerText.replace(/\\u00a0/g, ' ')) : 'SEM CAMPO'; })()") or ""


entrar("owner")
passo("1. O total da loja e so o dinheiro em especie")
ir("/emporio/caixa")
confere("a pagina do Caixa abre", tem("Caixas de cada loja"), texto_principal(200))
a = cartao_da_loja(LOJA_A)
print("   cartao A: " + a.replace("\n", " | ")[:500])
confere("o total da loja diz Dinheiro nas gavetas", "Dinheiro nas gavetas" in a and "Soma dos caixas" not in a, a[:300])

passo("2. Vendas do turno com a venda em PIX do cenario")
confere("o caixa mostra na gaveta R$ 100,00 (só o troco)", "na gaveta: R$ 100,00" in a, a[:500])
confere("Vendas do turno R$ 60,00", "Vendas do turno: R$ 60,00" in a, a[:500])
confere("a linha das formas mostra PIX R$ 20,00, Fiado R$ 40,00", "PIX R$ 20,00, Fiado R$ 40,00" in a, a[:500])

passo("3. Venda nova em dinheiro pelo balcao")
ir("/emporio/vender")
if LOJA_A not in texto_do_campo("Loja"):
    confere("escolhe " + LOJA_A, escolher("Loja", LOJA_A) is True)
confere("busca " + RACAO, preencher_aria("Buscar produto", "Px Ra") != "SEM CAMPO")
confere("adiciona " + RACAO, esperar(lambda: clicar_resultado(RACAO), 15))
confere("quantidade 1 (R$ 20,00)", preencher_aria("Quantidade do item 1", "1") != "SEM CAMPO")
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
confere("adiciona dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("fecha a venda", enviar_botao("Fechar a venda"))
confere("a venda sai", bool(esperar(lambda: tem("Venda registrada"), 60)), texto_principal(400))
ir("/emporio/caixa")
a = cartao_da_loja(LOJA_A)
print("   cartao A depois: " + a.replace("\n", " | ")[:500])
confere("na gaveta agora R$ 120,00", "na gaveta: R$ 120,00" in a, a[:500])
confere("Vendas do turno R$ 80,00", "Vendas do turno: R$ 80,00" in a, a[:500])
confere("formas: Dinheiro R$ 20,00, PIX R$ 20,00, Fiado R$ 40,00", "Dinheiro R$ 20,00, PIX R$ 20,00, Fiado R$ 40,00" in a, a[:500])

passo("4. Turno sem venda")
b = cartao_da_loja(LOJA_B)
print("   cartao B: " + b.replace("\n", " | ")[:300])
confere("a loja B diz Nenhuma venda neste turno ainda.", "Nenhuma venda neste turno ainda." in b, b[:400])

fim()
