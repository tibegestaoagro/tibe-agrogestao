# Validacao viva do frete no orcamento (Modulo 39, Q326):
# docs/superpowers/specs/2026-11-16-emporio-frete-no-orcamento-design.md
#
#   1. Balcao, aba Orcamento: o campo "Frete cobrado do cliente (opcional)" aparece (e a "Origem da venda" nao)
#   2. Salvar o orcamento de 1 Px Racao (R$ 20,00) com frete de R$ 15,00: o resumo mostra "+ frete R$ 15,00"
#   3. O impresso A4 do orcamento tem a linha Frete R$ 15,00 e o total R$ 35,00
#   4. Na aba Venda, carregar o orcamento pelo numero: o frete vem preenchido com 15,00 e o total da venda
#      com frete e R$ 35,00
#
# O cenario e o das contas PIX (lojas Px, turno aberto, Px Racao a R$ 20,00).
#
# cenario: scripts/_cenario-emporio-contas-pix.ts
# sessao: owner owner@example.com
import re

LOJA_A = "Px Loja A"
RACAO = "Px Ração"


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


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def texto_do_campo(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document.querySelector('main'); const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? (el.value !== undefined && el.tagName === 'INPUT' ? el.value : el.innerText.replace(/\\u00a0/g, ' ')) : 'SEM CAMPO'; })()") or ""


def tem_rotulo(rotulo):
    return bool(js("Array.from(document.querySelectorAll('main label')).some(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + ")"))


def href_do_link(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def preencher_rotulo(rotulo, valor):
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


FRETE = "Frete cobrado do cliente (opcional)"

entrar("owner")
passo("1. A aba Orcamento tem o campo de frete")
ir("/emporio/vender")
confere("o balcao abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), texto_principal(200))
confere("troca para a aba Orcamento", clicar("Orçamento"))
time.sleep(1)
if LOJA_A not in texto_do_campo("Loja"):
    confere("escolhe " + LOJA_A, escolher("Loja", LOJA_A) is True)
confere("o campo de frete aparece no orcamento", tem_rotulo(FRETE))
confere("a Origem da venda nao aparece no orcamento", not tem_rotulo("Origem da venda"))

passo("2. Salvar o orcamento com frete")
confere("busca " + RACAO, preencher_aria("Buscar produto", "Px Ra") != "SEM CAMPO")
confere("adiciona " + RACAO, esperar(lambda: clicar_resultado(RACAO), 15))
confere("quantidade 1", preencher_aria("Quantidade do item 1", "1") != "SEM CAMPO")
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
confere("digita o frete 15", preencher(FRETE, "15,00") == "freight_amount")
confere("salva o orcamento", enviar_botao("Salvar orçamento"))
confere("o orcamento e salvo", bool(esperar(lambda: tem("salvo, válido até"), 60)), texto_principal(400))
resumo = texto_principal(1500)
print("   resumo: " + resumo.replace("\n", " | ")[:400])
confere("o resumo mostra + frete R$ 15,00", bool(re.search(r"\+ frete R\$\s*15,00", resumo)), resumo[:400])
m = re.search(r"Orçamento nº (\d+) salvo", resumo)
NUMERO = m.group(1) if m else ""
confere("o resumo traz o numero do orcamento", NUMERO != "", resumo[:200])
IMPRIMIR = href_do_link("Imprimir A4")
confere("o resumo tem o link Imprimir A4", "/imprimir/orcamento/" in IMPRIMIR, IMPRIMIR)

passo("3. O impresso A4 do orcamento")
ir(IMPRIMIR)
papel = texto_da_pagina()
print("   papel: " + papel.replace("\n", " | ").replace("\t", " ")[:600])
confere("o papel tem a linha Frete R$ 15,00", bool(re.search(r"Frete\s*R\$\s*15,00", papel)), papel[:600])
confere("o total do papel e R$ 35,00", "R$ 35,00" in papel, papel[:600])

passo("4. Faturar: o frete vem preenchido")
ir("/emporio/vender")
if LOJA_A not in texto_do_campo("Loja"):
    confere("escolhe " + LOJA_A, escolher("Loja", LOJA_A) is True)
confere("digita o numero do orcamento", preencher_rotulo("Orçamento nº", NUMERO) != "SEM CAMPO")
confere("carrega o orcamento", clicar("Carregar"))
confere("o frete vem preenchido com 15,00", bool(esperar(lambda: texto_do_campo(FRETE) == "15,00", 20)), texto_do_campo(FRETE))
confere("o total da venda com frete e R$ 35,00", bool(esperar(lambda: tem("Total com frete: R$ 35,00"), 10)), texto_principal(2000)[-600:])

fim()
