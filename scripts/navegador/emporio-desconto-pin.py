# Validacao viva do preco do cadastro, do desconto liberado por PIN do gestor e do brinde (Modulo 39, Q327 a Q334):
# docs/superpowers/specs/2026-11-16-emporio-preco-travado-desconto-pin-e-brinde-design.md
#
# Tudo como VENDEDOR da "Dp Loja" (limite de desconto de 10%), no balcao:
#   1. A linha do item nao tem campo de preco (o preco e texto) e tem "Desconto (%)"
#   2. "Dp Sem Preco" nao entra: aviso de sem preco
#   3. 20 x Dp Aruana + 1 x Dp Tranca BONUS: a linha do BONUS mostra "Brinde"; a venda sai sem PIN;
#      a tela da venda mostra "Brinde"
#   4. So o BONUS: recusa "Um brinde acompanha uma venda"
#   5. Desconto de 5% na linha: passa sem PIN
#   6. Desconto de 15%: "Pedir autorizacao do gestor"; PIN errado recusa embaixo do PIN; PIN certo mostra
#      "Desconto autorizado por Dp Gestor ate 15%"; a venda sai e a tela mostra quem autorizou
#   7. Desconto no total (R$ 10,00): passa e o papel A4 mostra "Desconto no total"
#   8. O papel A4 da venda do item 3 mostra "Brinde"
#
# cenario: scripts/_cenario-emporio-desconto-pin.ts
# sessao: vendedor dp-vendedor@teste.local
import re

LOJA = "Dp Loja"
ARUANA = "Dp Aruana"
TRANCA = "Dp Tranca"
SEM_PRECO = "Dp Sem Preço"
GESTOR = "Dp Gestor"
PIN_CERTO = "4321"
PIN_ERRADO = "0000"


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def existe_aria(aria):
    return bool(js("!!document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']')"))


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def href_do_link(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def id_da_venda():
    href = href_do_link("Ver a venda")
    return href.split("/emporio/vendas/")[1] if "/emporio/vendas/" in href else ""


def texto_do_painel():
    return js("((document.querySelector('[role=dialog]') || { innerText: '' }).innerText).replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ')") or ""


def linha_do_item(n):
    """O texto do cartao do item `n` (o bloco que tem o campo Quantidade do item n)."""
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'Quantidade do item " + str(n) + "'") + " + ']'); const c = el && el.closest('div.space-y-2'); return c ? c.innerText.replace(/\\u00a0/g, ' ') : 'SEM LINHA'; })()") or ""


def escolher_apresentacao(n, nome):
    """Escolhe a apresentacao do item `n` no Select (Radix) pelo aria-label do gatilho."""
    gatilho = "document.querySelector('button[aria-label=' + " + repr("'Apresentação do item " + str(n) + "'") + " + ']')"
    xy = _centro(gatilho)
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim().startsWith(" + repr(nome) + "))")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def abrir_balcao():
    ir("/emporio/vender")
    confere("o balcao abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho() + " " + texto_principal(200))


def adicionar(termo, nome, n, qtd):
    confere("busca " + nome, preencher_aria("Buscar produto", termo) != "SEM CAMPO")
    confere("adiciona " + nome, bool(esperar(lambda: clicar_resultado(nome), 15)))
    confere("quantidade do item " + str(n) + " = " + qtd, esperar(lambda: preencher_aria("Quantidade do item " + str(n), qtd) != "SEM CAMPO", 10) is True)


def pagar_dinheiro(valor):
    confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
    time.sleep(1)
    confere("valor em dinheiro " + valor, preencher_aria("Valor em Dinheiro (R$)", valor) != "SEM CAMPO")


entrar("vendedor")

# --- 1. O preco e texto, o desconto e por % -----------------------------------------------------------------
passo("1. A linha do item: preco como texto, sem campo de preco, com Desconto (%)")
abrir_balcao()
adicionar("Dp Aru", ARUANA, 1, "1")
linha = linha_do_item(1)
print("   linha 1: " + linha.replace("\n", " | "))
confere("o preco aparece como texto: Preco R$ 230,00", bool(re.search(r"Preço R\$\s*230,00", linha)), linha)
confere("nao existe campo de preco do item (aria-label Preco do item)", not js("!!document.querySelector('input[aria-label^=\"Preço do item\"]')"))
confere("o item tem o campo Desconto (%) (aria-label e placeholder)", existe_aria("Desconto do item 1 (%)") and bool(js("!!document.querySelector('input[placeholder=\"Desconto (%)\"]')")))

# --- 2. Sem preco -------------------------------------------------------------------------------------------
passo("2. Produto sem preco na loja nao entra")
confere("busca " + SEM_PRECO, preencher_aria("Buscar produto", "Dp Sem") != "SEM CAMPO")
time.sleep(1)
achou = esperar(lambda: clicar_resultado(SEM_PRECO), 6)
print("   o produto sem preco apareceu na busca: " + str(bool(achou)))
confere("a busca oferece o produto (o aviso vem ao toca-lo)", bool(achou))
confere("o aviso diz sem preco nesta loja", bool(esperar(lambda: tem("sem preço nesta loja"), 8)), texto_principal(600))
confere("o aviso manda cadastrar o preco", tem("Cadastre o preço"), texto_principal(600))
confere("nenhuma linha de " + SEM_PRECO + " entrou: so existe o item 1 (Aruana)", existe_aria("Quantidade do item 1") and not existe_aria("Quantidade do item 2"), texto_do_main()[:400])

# --- 3. O brinde que acompanha venda ---------------------------------------------------------------------------
passo("3. 20 x Aruana + 1 x BONUS: a linha mostra Brinde e a venda sai sem PIN")
abrir_balcao()
adicionar("Dp Aru", ARUANA, 1, "20")
adicionar("Dp Tra", TRANCA, 2, "1")
confere("escolhe a apresentacao BONUS no item 2", escolher_apresentacao(2, "BONUS") is True)
time.sleep(1)
l2 = linha_do_item(2)
print("   linha 2: " + l2.replace("\n", " | "))
confere("a linha do BONUS mostra Brinde", "Brinde" in l2, l2)
confere("o BONUS nao mostra R$ 0,00", "R$ 0,00" not in l2, l2)
confere("nenhum pedido de autorizacao (sem desconto)", "Pedir autorização do gestor" not in texto_do_main(), texto_principal(300))
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
pagar_dinheiro("4600,00")
confere("fecha a venda", enviar_botao("Fechar a venda"))
confere("a venda sai", bool(esperar(lambda: tem("Venda registrada"), 60)), texto_principal(400))
VENDA_BRINDE = id_da_venda()
confere("o resumo tem o link da venda", VENDA_BRINDE != "", VENDA_BRINDE)
ir("/emporio/vendas/" + VENDA_BRINDE)
pagina = texto_do_main()
print("   venda: " + pagina.replace("\n", " | ")[:700])
confere("a tela da venda mostra Brinde", "Brinde" in pagina, pagina[:700])
confere("a tela da venda nao tem autorizador (sem desconto)", "Desconto autorizado por" not in pagina, pagina[:700])

# --- 4. So o brinde ---------------------------------------------------------------------------------------------
passo("4. So o BONUS: a tela recusa")
abrir_balcao()
adicionar("Dp Tra", TRANCA, 1, "1")
confere("escolhe a apresentacao BONUS no item 1", escolher_apresentacao(1, "BONUS") is True)
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
confere("fecha a venda", enviar_botao("Fechar a venda"))
recusa = esperar(lambda: "Um brinde acompanha uma venda" in texto_do_main(), 20)
confere("a recusa: Um brinde acompanha uma venda", bool(recusa), texto_do_main()[-600:])
confere("a venda nao saiu", not tem("Venda registrada"), texto_principal(200))

# --- 5. Desconto dentro do limite ---------------------------------------------------------------------------------
passo("5. Desconto de 5% na linha: passa sem PIN")
abrir_balcao()
adicionar("Dp Aru", ARUANA, 1, "1")
confere("digita 5 em Desconto (%)", preencher_aria("Desconto do item 1 (%)", "5") != "SEM CAMPO")
time.sleep(1)
l1 = linha_do_item(1)
print("   linha 1: " + l1.replace("\n", " | "))
confere("a linha mostra o preco com desconto R$ 218,50", "218,50" in l1, l1)
confere("sem pedido de autorizacao (dentro dos 10%)", "Pedir autorização do gestor" not in texto_do_main(), texto_principal(300))
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
pagar_dinheiro("218,50")
confere("fecha a venda", enviar_botao("Fechar a venda"))
confere("a venda sai sem PIN", bool(esperar(lambda: tem("Venda registrada"), 60)), texto_principal(400))

# --- 6. Desconto acima do limite: PIN do gestor -----------------------------------------------------------------------
passo("6. Desconto de 15%: pede autorizacao, PIN errado recusa, PIN certo libera")
abrir_balcao()
adicionar("Dp Aru", ARUANA, 1, "1")
confere("digita 15 em Desconto (%)", preencher_aria("Desconto do item 1 (%)", "15") != "SEM CAMPO")
confere("aparece o botao Pedir autorizacao do gestor", bool(esperar(lambda: tem("Pedir autorização do gestor"), 10)), texto_principal(600))
confere("o aviso cita o limite da loja (10%)", bool(re.search(r"passa do limite desta loja \(10", texto_do_main())), texto_do_main()[-700:])
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
pagar_dinheiro("195,50")
confere("fechar sem autorizacao: a venda nao sai", enviar_botao("Fechar a venda") and not esperar(lambda: tem("Venda registrada"), 6), texto_principal(300))
# Fechar sem autorizacao ja abre o painel do PIN sozinho (balcao.tsx): clicar de novo no gatilho o fecharia.
confere("o painel do PIN abre sozinho ao tentar fechar a venda", bool(esperar(painel_aberto, 10)), texto_principal(300))
time.sleep(1.5)
confere("o painel cita o desconto de 15%", bool(re.search(r"desconto desta venda é de 15", texto_do_painel())), texto_do_painel()[:300])
confere("digita o PIN errado", preencher("PIN do gestor", PIN_ERRADO) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("PIN do gestor"), 30)
print("   recusa do PIN: " + str(recusa))
confere("PIN errado: a recusa aparece embaixo do PIN", bool(recusa), texto_do_painel()[:400])
confere("o painel continua aberto", painel_aberto())
confere("o campo do PIN foi esvaziado (nao guarda o PIN)", js("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.includes('PIN do gestor')); const el = l && document.getElementById(l.htmlFor); return el ? el.value : 'SEM CAMPO'; })()") == "")
confere("digita o PIN certo", preencher("PIN do gestor", PIN_CERTO) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fecha", bool(esperar(lambda: not painel_aberto(), 30)))
frase = esperar(lambda: re.search(r"Desconto autorizado por " + GESTOR + r" até 15(,\d+)?\s*%", texto_do_main()), 15)
confere("mostra: Desconto autorizado por Dp Gestor ate 15%", bool(frase), texto_do_main()[-700:])
confere("fecha a venda", enviar_botao("Fechar a venda"))
confere("a venda sai com a autorizacao", bool(esperar(lambda: tem("Venda registrada"), 60)), texto_principal(500))
VENDA_PIN = id_da_venda()
ir("/emporio/vendas/" + VENDA_PIN)
pagina = texto_do_main()
print("   venda: " + pagina.replace("\n", " | ")[:700])
confere("a tela da venda mostra: Desconto autorizado por Dp Gestor", ("Desconto autorizado por " + GESTOR) in pagina, pagina[:700])

# --- 7. Desconto no total -----------------------------------------------------------------------------------------------
passo("7. Desconto no total (R$ 10,00): passa e o papel mostra Desconto no total")
abrir_balcao()
adicionar("Dp Aru", ARUANA, 1, "1")
confere("abre Mais opções (o desconto no total mora nela desde a onda 3)", abrir_mais_opcoes() is True)
time.sleep(0.5)
confere("digita o desconto no total", preencher("Desconto no total (R$, opcional)", "10,00") not in ("SEM ROTULO", "SEM CAMPO"))
time.sleep(1)
confere("o resumo mostra itens R$ 230,00, desconto R$ 10,00, total R$ 220,00", bool(re.search(r"Itens R\$\s*230,00, desconto R\$\s*10,00, total\s*R\$\s*220,00", texto_do_main())), texto_do_main()[-600:])
confere("sem pedido de autorizacao (4,3% dentro dos 10%)", "Pedir autorização do gestor" not in texto_do_main(), texto_principal(300))
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
pagar_dinheiro("220,00")
confere("fecha a venda", enviar_botao("Fechar a venda"))
confere("a venda sai", bool(esperar(lambda: tem("Venda registrada"), 60)), texto_principal(500))
VENDA_TOTAL = id_da_venda()
ir("/emporio/vendas/" + VENDA_TOTAL)
pagina = texto_do_main()
print("   venda: " + pagina.replace("\n", " | ")[:700])
confere("a tela da venda mostra Desconto no total R$ 10,00", bool(re.search(r"Desconto no total:\s*R\$\s*10,00", pagina)), pagina[:700])
ir("/emporio/imprimir/venda/" + VENDA_TOTAL + "?formato=a4")
papel = texto_da_pagina()
print("   A4 do desconto no total: " + papel.replace("\n", " | ").replace("\t", " ")[:600])
confere("o A4 mostra Desconto no total", "Desconto no total" in papel, papel[:600])
confere("o A4 mostra o valor R$ 10,00 e o total R$ 220,00", bool(re.search(r"R\$\s*10,00", papel)) and bool(re.search(r"R\$\s*220,00", papel)), papel[:600])

# --- 8. A4 do brinde ----------------------------------------------------------------------------------------------------
passo("8. O papel A4 da venda do brinde")
ir("/emporio/imprimir/venda/" + VENDA_BRINDE + "?formato=a4")
papel = texto_da_pagina()
print("   A4 do brinde: " + papel.replace("\n", " | ").replace("\t", " ")[:700])
confere("o A4 abre", caminho() == "/emporio/imprimir/venda/" + VENDA_BRINDE and "sem valor fiscal" in papel.lower(), caminho())
confere("o A4 mostra Brinde", "Brinde" in papel, papel[:700])
confere("o A4 nao tem a linha de preco R$ 0,00 do brinde", not re.search(r"BONUS[^\n]*R\$\s*0,00", papel), papel[:700])

fim()
