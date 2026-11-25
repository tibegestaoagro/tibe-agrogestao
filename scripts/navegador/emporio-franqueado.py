# Validacao viva do credito do franqueado do Meu Emporio (Modulo 39, Q300 a Q309):
# docs/superpowers/specs/2026-11-11-emporio-franqueado-e-repasse-design.md
#
#   1. Franqueados: item no menu, cadastro so com nome e telefone (recusa embaixo do campo), ficha
#   2. Balcao: franqueado e credito, "Total a pagar" e "Falta" com o credito, venda fechada,
#      tela da venda com o credito em linha propria e o faturamento (itens) sem ele
#   3. Recusa no campo certo: credito sem franqueado
#   4. Impresso da venda (A4 e cupom) e do orcamento: sem a palavra "franqueado", itens rateados
#      (60 e 40 com credito 10 saem 66,00 e 44,00), total do papel = o que o cliente pagou
#   5. Orcamento com franqueado e credito: salva, fatura herdando; outro fatura trocando para Nenhum
#   6. Ficha: saldo subiu, Pagar credito parcial pela gaveta, recusa acima do saldo embaixo de Valor
#   7. Cancelar a venda com credito tira o credito do saldo
#   8. Resultado da Loja (bloco de repasse, resultado intacto) e Relatorio de vendas (coluna)
#   9. Celular (360 px): balcao e ficha sem rolagem horizontal
#
# cenario: scripts/_cenario-emporio-franqueado.ts
# sessao: owner owner@example.com
# sessao: caixa fq-caixa@teste.local

import re

LOJA = "Fq Loja"
RACAO = "Fq Ração"
SAL = "Fq Sal"
FRANQUEADO = "Fq Zeca"
RECUSA_TELEFONE = "Informe o telefone do franqueado."
RECUSA_FRANQUEADO = "Escolha o franqueado do crédito."


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def valor_aria(aria):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); return el ? el.value : 'SEM CAMPO'; })()") or ""


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def sem_rolagem_horizontal():
    return js("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def medida():
    return js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth")


def linha_da_tabela(trecho):
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


def href_do_link(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def texto_do_campo(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document.querySelector('main'); const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? (el.value !== undefined && el.tagName === 'INPUT' ? el.value : el.innerText.replace(/\\u00a0/g, ' ')) : 'SEM CAMPO'; })()") or ""


def foco_no_campo(rotulo):
    """O campo de `rotulo` e o elemento com o foco (a recusa leva o foco para ele)."""
    return bool(js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return !!el && document.activeElement === el; })()"))


def escolher_prefixo(rotulo, prefixo):
    """Como `escolher`, mas a opcao e achada pelo comeco do texto (a gaveta traz o saldo no fim)."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    aberto = _abrir_select(gatilho)
    if aberto != "ABERTO":
        return aberto
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim().startsWith(" + repr(prefixo) + "))")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def texto_do_painel():
    return js("((document.querySelector('[role=dialog]') || { innerText: '' }).innerText).replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ')") or ""


def esc():
    js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(1)


def abrir_balcao(modo_orcamento=False):
    ir("/emporio/vender")
    confere("o balcão abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
    confere("escolhe " + LOJA, escolher("Loja", LOJA) is True)
    if modo_orcamento:
        confere("troca para o modo Orçamento", clicar("Orçamento"))
        time.sleep(1)
        confere("o balcão mostra Salvar orçamento", esperar(lambda: tem("Total do orçamento"), 10) and "Salvar orçamento" in texto_do_main())


def adicionar(produto, busca, quantidade, n):
    confere("busca " + produto, preencher_aria("Buscar produto", busca) != "SEM CAMPO")
    confere("adiciona " + produto, esperar(lambda: clicar_resultado(produto), 15))
    confere("a quantidade do item " + str(n) + " é " + quantidade, preencher_aria("Quantidade do item " + str(n), quantidade) != "SEM CAMPO")


def montar_carrinho():
    adicionar(RACAO, "Fq Ra", "1", 1)
    adicionar(SAL, "Fq Sal", "1", 2)
    confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)


def franqueado_e_credito(credito="10"):
    confere("escolhe o franqueado " + FRANQUEADO, escolher("Franqueado (opcional)", FRANQUEADO) is True)
    confere("digita o crédito " + credito, preencher("Crédito do franqueado (R$)", credito) not in ("SEM ROTULO", "SEM CAMPO"))
    time.sleep(0.5)


def pagar_dinheiro(valor):
    confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
    time.sleep(1)
    confere("o valor em dinheiro é " + valor, preencher_aria("Valor em Dinheiro (R$)", valor) != "SEM CAMPO")
    time.sleep(0.5)


def fechar_venda():
    confere("fecha a venda", enviar_botao("Fechar a venda"))
    ok = esperar(lambda: tem("Venda registrada"), 60)
    confere("a venda sai", bool(ok), texto_principal(400))
    return texto_do_main()


def id_da_venda():
    href = href_do_link("Ver a venda")
    return href.split("/emporio/vendas/")[1] if "/emporio/vendas/" in href else ""


def lojas_e_franqueado():
    f = [x for x in api("GET", "/api/v1/emporio/franchisees")["body"]["data"] if x.get("name") == FRANQUEADO]
    return f[0]["id"] if f else ""


def saldo_pela_api(fid):
    return api("GET", "/api/v1/emporio/franchisees/" + fid)["body"]["data"].get("balance")


entrar("owner")
ir("/emporio")
time.sleep(3)
esperar(lambda: api("GET", "/api/v1/emporio/products?q=Fq")["status"] == 200, 90)
confere("o cenário existe (Fq Ração e Fq Sal)", len([p for p in api("GET", "/api/v1/emporio/products?q=Fq")["body"]["data"] if p.get("name") in (RACAO, SAL)]) == 2)

# --- 1. Franqueados -----------------------------------------------------------------------
passo("1. Franqueados: menu, cadastro curto, recusa do telefone, ficha")
abrir_subgrupos()
confere("o menu do Empório tem Franqueados", "/emporio/franqueados" in menu(), [h for h in menu() if h.startswith("/emporio")])
ir("/emporio/franqueados")
confere("a tela abre", caminho() == "/emporio/franqueados" and tem("Franqueados"), texto_principal(200))
# Em dev, a pagina pode seguir "loading" por muito tempo: clicar antes da hidratacao nao abre nada.
hidratou = esperar(lambda: js("document.readyState === 'complete' && Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Novo franqueado' && Object.keys(b).some(k => k.startsWith('__reactProps')))"), 90)
confere("a tela hidratou", bool(hidratou))
confere("abre Novo franqueado", bool(esperar(lambda: clicar("Novo franqueado"), 30)))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("preenche só o nome", preencher("Nome", FRANQUEADO) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Telefone"), 20)
confere("sem telefone: a recusa aparece embaixo de Telefone", recusa == RECUSA_TELEFONE, recusa)
confere("o foco foi para o Telefone", foco_no_campo("Telefone"))
confere("o painel continua aberto", painel_aberto())
confere("preenche o telefone", preencher("Telefone", "(38) 99999-0000") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
linha = esperar(lambda: linha_da_tabela(FRANQUEADO), 30)
confere("a lista tem o franqueado com o telefone e R$ 0,00", bool(linha) and "(38) 99999-0000" in linha and "R$ 0,00" in linha, linha)
FID = lojas_e_franqueado()
confere("o franqueado está na API", FID != "", FID)
ir("/emporio/franqueados/" + FID)
confere("a ficha abre com o nome", tem(FRANQUEADO), texto_principal(200))
confere("a ficha mostra o saldo R$ 0,00", tem("Crédito a pagar ao franqueado") and tem("R$ 0,00"), texto_principal(300))
confere("a ficha mostra o extrato vazio", tem("Nenhum movimento ainda"), texto_principal(500))
confere("a ficha mostra Pagar crédito (desabilitado, sem saldo)", bool(js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === 'Pagar crédito'); return !!b && b.disabled; })()")))

# --- 3 (antes). Recusa: credito sem franqueado ------------------------------------------------
passo("3. Recusa no campo certo: crédito sem franqueado")
abrir_balcao()
montar_carrinho()
confere("digita o crédito 10 SEM escolher o franqueado", preencher("Crédito do franqueado (R$)", "10") not in ("SEM ROTULO", "SEM CAMPO"))
pagar_dinheiro("100")
confere("clica em Fechar a venda", enviar_botao("Fechar a venda"))
recusa = esperar(lambda: erro_do_campo("Franqueado (opcional)"), 20)
confere("a recusa aparece embaixo de Franqueado", recusa == RECUSA_FRANQUEADO, recusa)
confere("o foco foi para o campo Franqueado", esperar(lambda: foco_no_campo("Franqueado (opcional)"), 5))
confere("a venda não foi registrada", not tem("Venda registrada"), texto_principal(200))
confere("o crédito não ficou com recusa", erro_do_campo("Crédito do franqueado (R$)") == "", erro_do_campo("Crédito do franqueado (R$)"))

# --- 2. Balcao ------------------------------------------------------------------------------
passo("2. Balcão: franqueado e crédito, Total a pagar, Falta, venda fechada")
r_escolha = escolher("Franqueado (opcional)", FRANQUEADO)
confere("escolhe o franqueado " + FRANQUEADO, r_escolha is True, r_escolha)
confere("a recusa some ao escolher", esperar(lambda: erro_do_campo("Franqueado (opcional)") == "", 10))
principal = texto_do_main()
confere("o total a pagar passa a R$ 110,00", "Total a pagar: R$ 110,00" in principal.replace("\n", " ") or "Total a pagar R$ 110,00" in principal.replace("\n", " "), principal[-700:])
confere("mostra o Crédito do franqueado R$ 10,00 (fora do faturamento)", "Crédito do franqueado R$ 10,00" in principal, principal[-700:])
confere("com R$ 100,00 pagos, mostra Falta R$ 10,00.", "Falta R$ 10,00." in principal, principal[-700:])
confere("o pagamento ainda não está fechado", "Pagamento fechado." not in principal)
confere("o pagamento vira R$ 110,00", preencher_aria("Valor em Dinheiro (R$)", "110") != "SEM CAMPO")
time.sleep(0.5)
principal = texto_do_main()
confere("mostra Pagamento fechado.", "Pagamento fechado." in principal and "Falta" not in principal.split("Pagamento")[-1], principal[-500:])
resumo = fechar_venda()
confere("o resumo mostra a venda de R$ 100,00 mais o crédito de R$ 10,00", "Venda registrada: R$ 100,00 + crédito do franqueado R$ 10,00" in resumo, resumo[:300])
VENDA1 = id_da_venda()
confere("o resumo tem o link da venda", VENDA1 != "", VENDA1)
ir("/emporio/vendas/" + VENDA1)
pagina = texto_do_main()
print("   venda: " + pagina.replace("\n", " | ")[:900])
confere("a venda mostra Itens: R$ 100,00 (o faturamento, sem o crédito)", "Itens: R$ 100,00" in pagina, pagina[:900])
confere("a venda mostra Franqueado: " + FRANQUEADO, "Franqueado: " + FRANQUEADO in pagina, pagina[:900])
confere("a venda mostra o crédito em linha própria, fora do faturamento", "Crédito do franqueado: R$ 10,00 (fora do faturamento)" in pagina, pagina[:900])
confere("a venda mostra Total a pagar: R$ 110,00", "Total a pagar: R$ 110,00" in pagina, pagina[:900])
vd = api("GET", "/api/v1/emporio/sales/" + VENDA1)["body"]["data"]
confere("a API: net 100, crédito 10, total 110", vd.get("net_amount") == 100 and vd.get("franchisee_credit") == 10 and vd.get("total_amount") == 110, [vd.get("net_amount"), vd.get("franchisee_credit"), vd.get("total_amount")])

# --- 4. Impresso da venda -------------------------------------------------------------------
passo("4. Impresso da venda: A4 e cupom, sem franqueado, itens rateados")
for formato, nome in (("a4", "A4"), ("cupom", "cupom")):
    ir("/emporio/imprimir/venda/" + VENDA1 + "?formato=" + formato)
    papel = texto_da_pagina()
    print("   " + nome + ": " + papel.replace("\n", " | ").replace("\t", " ")[:700])
    confere(nome + ": abre o papel da venda", caminho() == "/emporio/imprimir/venda/" + VENDA1 and "sem valor fiscal" in papel.lower(), caminho())
    confere(nome + ": a palavra franqueado NÃO aparece", "franqueado" not in papel.lower() and "zeca" not in papel.lower(), papel[:400])
    confere(nome + ": a palavra crédito NÃO aparece (a venda foi em dinheiro)", "crédito" not in papel.lower(), papel[:400])
    confere(nome + ": a ração sai a 66,00", "66,00" in papel, papel[:500])
    confere(nome + ": o sal sai a 44,00", "44,00" in papel, papel[:500])
    confere(nome + ": nenhum item sai a 60,00 nem a 40,00 (sem o crédito)", "60,00" not in papel and "40,00" not in papel, papel[:500])
    confere(nome + ": o total do papel é 110,00, o que o cliente pagou", "110,00" in papel, papel[:700])
    confere(nome + ": o valor em dinheiro é 110,00", bool(re.search(r"Dinheiro\s+R\$ 110,00", papel)), papel[:900])

# --- 5. Orcamento ---------------------------------------------------------------------------
passo("5. Orçamento com franqueado e crédito: salva, imprime rateado, fatura herdando")
abrir_balcao(modo_orcamento=True)
montar_carrinho()
franqueado_e_credito("10")
principal = texto_do_main()
confere("o orçamento mostra Total do orçamento R$ 110,00", "Total do orçamento" in principal and "R$ 110,00" in principal, principal[-500:])
confere("clica em Salvar orçamento", enviar_botao("Salvar orçamento"))
confere("o orçamento é salvo", esperar(lambda: tem("salvo, válido até"), 60), texto_principal(300))
resumo = texto_do_main()
confere("o resumo do orçamento mostra R$ 100,00 + crédito do franqueado R$ 10,00 (a tela interna discrimina)", "R$ 100,00 + crédito do franqueado R$ 10,00" in resumo, resumo[:400])
href_a4 = href_do_link("Imprimir A4")
href_cupom = href_do_link("Imprimir cupom")
confere("o resumo tem os links de impressão", href_a4.startswith("/emporio/imprimir/orcamento/") and href_cupom.endswith("formato=cupom"), href_a4 + " " + href_cupom)
achou = re.search(r"Orçamento nº (\d+) salvo", resumo)
NUMERO_ORC = achou.group(1) if achou else ""
ORC_ID = href_a4.split("/emporio/imprimir/orcamento/")[1].split("?")[0] if "/emporio/imprimir/orcamento/" in href_a4 else ""
oa = api("GET", "/api/v1/emporio/quotes/" + ORC_ID)["body"]["data"] if ORC_ID else {}
confere("a API do orçamento guarda o franqueado e o crédito 10", oa.get("franchisee_credit") == 10 and bool(oa.get("franchisee_id")), [oa.get("franchisee_id"), oa.get("franchisee_credit")])
# Faturar agora: o balcão recebe o orçamento com os dois campos preenchidos.
confere("clica em Faturar agora", bool(esperar(lambda: clicar("Faturar agora"), 20)))
time.sleep(1.5)
confere("o balcão está na venda do orçamento nº " + NUMERO_ORC, esperar(lambda: tem("Faturando o orçamento nº"), 20), texto_principal(300))
confere("o campo Franqueado vem com " + FRANQUEADO, FRANQUEADO in texto_do_campo("Franqueado (opcional)"), texto_do_campo("Franqueado (opcional)"))
confere("o crédito vem com 10,00", "10,00" in texto_do_campo("Crédito do franqueado (R$)"), texto_do_campo("Crédito do franqueado (R$)"))
principal = texto_do_main()
confere("o total a pagar é R$ 110,00", "Total a pagar" in principal and "R$ 110,00" in principal, principal[-500:])
pagar_dinheiro("110")
resumo = fechar_venda()
confere("a venda herdou: R$ 100,00 + crédito do franqueado R$ 10,00", "Venda registrada: R$ 100,00 + crédito do franqueado R$ 10,00" in resumo, resumo[:300])
VENDA2 = id_da_venda()
v2 = api("GET", "/api/v1/emporio/sales/" + VENDA2)["body"]["data"] if VENDA2 else {}
confere("a API da venda faturada: crédito 10 e o franqueado do orçamento", v2.get("franchisee_credit") == 10 and v2.get("franchisee_id") == oa.get("franchisee_id"), [v2.get("franchisee_credit"), v2.get("franchisee_id")])

passo("4b. Impresso do orçamento: A4 e cupom, sem franqueado, rateado")
for href, nome in ((href_a4, "A4"), (href_cupom, "cupom")):
    ir(href)
    papel = texto_da_pagina()
    print("   orçamento " + nome + ": " + papel.replace("\n", " | ").replace("\t", " ")[:700])
    confere("orçamento " + nome + ": abre o papel", caminho() == "/emporio/imprimir/orcamento/" + ORC_ID and "ORÇAMENTO" in papel, caminho())
    confere("orçamento " + nome + ": a palavra franqueado NÃO aparece", "franqueado" not in papel.lower() and "zeca" not in papel.lower(), papel[:400])
    confere("orçamento " + nome + ": a ração sai a 66,00", "66,00" in papel, papel[:500])
    confere("orçamento " + nome + ": o sal sai a 44,00", "44,00" in papel, papel[:500])
    confere("orçamento " + nome + ": nenhum item a 60,00 nem 40,00", "60,00" not in papel and "40,00" not in papel, papel[:500])
    confere("orçamento " + nome + ": o total é 110,00", "110,00" in papel, papel[:700])

passo("5b. Orçamento faturado trocando para Nenhum: grava SEM crédito")
abrir_balcao(modo_orcamento=True)
montar_carrinho()
franqueado_e_credito("10")
confere("clica em Salvar orçamento", enviar_botao("Salvar orçamento"))
confere("o orçamento é salvo", esperar(lambda: tem("salvo, válido até"), 60), texto_principal(300))
confere("clica em Faturar agora", bool(esperar(lambda: clicar("Faturar agora"), 20)))
time.sleep(1.5)
confere("o balcão está faturando o orçamento", esperar(lambda: tem("Faturando o orçamento nº"), 20), texto_principal(300))
confere("o franqueado vem preenchido", FRANQUEADO in texto_do_campo("Franqueado (opcional)"), texto_do_campo("Franqueado (opcional)"))
confere("troca o franqueado para Nenhum", escolher("Franqueado (opcional)", "Nenhum") is True)
time.sleep(0.5)
confere("o crédito zerou na tela", texto_do_campo("Crédito do franqueado (R$)") in ("", "0,00", "0"), texto_do_campo("Crédito do franqueado (R$)"))
principal = texto_do_main()
confere("o total a pagar volta a R$ 100,00 (sem linha de crédito)", "Crédito do franqueado R$" not in principal and "Total da venda" in principal, principal[-500:])
pagar_dinheiro("100")
resumo = fechar_venda()
confere("a venda sai de R$ 100,00, sem crédito do franqueado", "Venda registrada: R$ 100,00" in resumo and "crédito do franqueado" not in resumo.split("Venda nº")[0], resumo[:300])
VENDA3 = id_da_venda()
v3 = api("GET", "/api/v1/emporio/sales/" + VENDA3)["body"]["data"] if VENDA3 else {}
confere("a API: a venda gravou SEM crédito e sem franqueado (não herdou do orçamento)", v3.get("franchisee_credit") == 0 and not v3.get("franchisee_id") and v3.get("total_amount") == 100, [v3.get("franchisee_credit"), v3.get("franchisee_id"), v3.get("total_amount")])
ir("/emporio/vendas/" + VENDA3)
pagina = texto_do_main()
confere("a tela da venda não tem Crédito do franqueado", "Crédito do franqueado" not in pagina and "Franqueado:" not in pagina, pagina[:600])
ir("/emporio/imprimir/venda/" + VENDA3 + "?formato=a4")
papel = texto_da_pagina()
confere("o papel dessa venda sai a 60,00 e 40,00 (sem rateio)", "60,00" in papel and "40,00" in papel and "66,00" not in papel, papel[:500])

# --- 6. Ficha: saldo, pagar credito ---------------------------------------------------------------
passo("6. Ficha: o saldo subiu, Pagar crédito parcial pela gaveta, recusa acima do saldo")
confere("o saldo pela API é 20", saldo_pela_api(FID) == 20, saldo_pela_api(FID))
ir("/emporio/franqueados/" + FID)
pagina = texto_do_main()
print("   ficha: " + pagina.replace("\n", " | ")[:700])
confere("a ficha mostra o saldo R$ 20,00", "Crédito a pagar ao franqueado" in pagina and "R$ 20,00" in pagina, pagina[:400])
confere("o extrato tem dois créditos", pagina.count("Crédito\n") + pagina.count("Crédito\t") >= 2 or len([l for l in pagina.split("\n") if l.strip() == "Crédito"]) == 2, pagina[:900])
confere("o extrato aponta as vendas", bool(re.search(r"Venda \d+", pagina)), pagina[:900])
confere("abre Pagar crédito", bool(esperar(lambda: clicar("Pagar crédito"), 30)))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("o painel diz o crédito a pagar agora: R$ 20,00", "Crédito a pagar agora: R$ 20,00" in texto_do_painel(), texto_do_painel()[:300])
confere("preenche o valor 100 (acima do saldo)", preencher("Valor", "100") not in ("SEM ROTULO", "SEM CAMPO"))
confere("escolhe a gaveta da " + LOJA, escolher_prefixo("De onde sai o dinheiro", "Gaveta: " + LOJA) is True)
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Valor"), 30)
print("   recusa: " + str(recusa))
confere("acima do saldo: a recusa aparece embaixo de Valor", bool(recusa) and "saldo" in recusa.lower() and "20,00" in recusa, recusa)
confere("o painel continua aberto", painel_aberto())
confere("o valor parcial é 5", preencher("Valor", "5") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a ficha passa a mostrar R$ 15,00", esperar(lambda: tem("R$ 15,00"), 30), texto_principal(300))
pagina = texto_do_main()
print("   ficha: " + pagina.replace("\n", " | ")[:900])
confere("o extrato mostra o pagamento pela gaveta da loja", "Pagamento" in pagina and ("Gaveta: " + LOJA) in pagina, pagina[:900])
confere("o extrato mostra - R$ 5,00", "- R$ 5,00" in pagina, pagina[:900])
confere("o saldo pela API é 15", saldo_pela_api(FID) == 15, saldo_pela_api(FID))

# --- 8. Resultado e relatorio ---------------------------------------------------------------------
passo("8. Resultado da Loja e relatório de vendas")
loja_id = [l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l.get("name") == LOJA][0]["id"]
ir("/emporio/resultado?loja=" + loja_id)
js("document.querySelectorAll('main details').forEach(d => { d.open = true; })")
time.sleep(0.5)
pagina = texto_do_main()
print("   resultado: " + pagina.replace("\n", " | ")[:1500])
confere("o Resultado tem o bloco Créditos de franqueado (repasse)", "Créditos de franqueado (repasse)" in pagina, pagina[:600])
confere("o bloco mostra Recebido nas vendas R$ 20,00", bool(re.search(r"Recebido nas vendas\s*\n?\s*R\$ 20,00", pagina)), pagina[:1500])
confere("o bloco mostra Pago aos franqueados R$ 5,00", bool(re.search(r"Pago aos franqueados\s*\n?\s*R\$ 5,00", pagina)), pagina[:1500])
confere("o bloco mostra o repasse líquido R$ 15,00", bool(re.search(r"Créditos de franqueado \(repasse\)[\s\S]{0,200}R\$ 15,00", pagina)), pagina[:1500])
confere("as Vendas são R$ 300,00 (faturamento sem o crédito; com ele seria R$ 320,00)", bool(re.search(r"Vendas[\s\S]{0,60}R\$ 300,00", pagina)) and "R$ 320,00" not in pagina, pagina[:600])
margem = re.search(r"= Margem[^\n]*\n?[^\n]*?R\$ ([\d.,]+)", pagina)
resultado = re.search(r"= Resultado\s*\n?\s*R\$ ([\d.,-]+)", pagina)
confere("o Resultado é igual à Margem (o crédito não mexe nele)", bool(margem) and bool(resultado) and margem.group(1) == resultado.group(1), [margem.group(1) if margem else None, resultado.group(1) if resultado else None])

ir("/emporio/relatorios?loja=" + loja_id)
pagina = texto_do_main()
confere("o relatório tem a coluna Crédito de franqueado (o cabeçalho sai em maiúsculas pelo CSS)", "crédito de franqueado" in pagina.lower(), pagina[:500])
linha_balcao = linha_da_tabela("Balcão")
print("   linha Balcão: " + linha_balcao)
confere("a linha do Balcão da loja: 3 vendas, R$ 300,00 de faturamento, sem frete, crédito R$ 20,00", linha_balcao.startswith("Balcão | 3 | R$ 300,00 | R$ 0,00 | R$ 20,00"), linha_balcao)

# --- 7. Cancelar a venda com credito -----------------------------------------------------------------
passo("7. Cancelar uma venda com crédito tira o crédito do saldo")
ir("/emporio/vendas/" + VENDA1)
confere("abre o painel de cancelar", clicar("Cancelar venda") and esperar(painel_aberto, 15))
confere("preenche o motivo", preencher("Motivo", "teste do roteiro do franqueado") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60))
confere("a venda fica cancelada", esperar(lambda: tem("cancelada"), 30), texto_principal(300))
confere("o saldo pela API cai para 5 (20 menos 10 do cancelamento, menos 5 pagos)", saldo_pela_api(FID) == 5, saldo_pela_api(FID))
ir("/emporio/franqueados/" + FID)
pagina = texto_do_main()
print("   ficha: " + pagina.replace("\n", " | ")[:900])
confere("a ficha mostra o saldo R$ 5,00", "Crédito a pagar ao franqueado" in pagina and "R$ 5,00" in pagina, pagina[:400])
confere("o extrato não lista mais o crédito da venda cancelada", pagina.count("Venda ") <= 1, pagina[:900])
ir("/emporio/resultado?loja=" + loja_id)
js("document.querySelectorAll('main details').forEach(d => { d.open = true; })")
pagina = texto_do_main()
confere("o Resultado passa a Recebido nas vendas R$ 10,00", bool(re.search(r"Recebido nas vendas\s*\n?\s*R\$ 10,00", pagina)), pagina[:1500])

# --- 10. Caixa escolhe o franqueado (Q378) ---------------------------------------------------------------
def tem_rotulo(rotulo):
    return bool(js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return !!(l && document.getElementById(l.htmlFor)); })()"))


def linha_da_tabela_com(cabecalho, trecho):
    """O texto da <tr> da tabela cujo cabecalho tem `cabecalho` e cuja linha tem `trecho` (colunas separadas por ' | ')."""
    return js("(() => { const t = Array.from(document.querySelectorAll('main table')).find(t => t.querySelector('thead').innerText.toLowerCase().includes(" + repr(cabecalho) + ")); const r = t && Array.from(t.querySelectorAll('tbody tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


passo("10. Q378: com sessão de Caixa, o campo do franqueado aparece na venda e o crédito vale")
entrar("caixa")
ir("/emporio/vender")
confere("o balcão abre para o Caixa", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
if tem_rotulo("Loja"):
    confere("escolhe " + LOJA, escolher("Loja", LOJA) is True)
adicionar(RACAO, "Fq Ra", "1", 1)
adicionar(SAL, "Fq Sal", "1", 2)
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
confere("Q378: o Caixa VÊ o campo Franqueado (opcional)", esperar(lambda: tem_rotulo("Franqueado (opcional)"), 20), texto_principal(400))
confere("Q378: o Caixa VÊ o campo Crédito do franqueado (R$)", tem_rotulo("Crédito do franqueado (R$)"), texto_principal(400))
confere("o Caixa escolhe o franqueado " + FRANQUEADO + " (a lista não vem vazia)", escolher("Franqueado (opcional)", FRANQUEADO) is True)
confere("o Caixa digita o crédito 10", preencher("Crédito do franqueado (R$)", "10") not in ("SEM ROTULO", "SEM CAMPO"))
time.sleep(0.5)
principal = texto_do_main()
confere("o total a pagar do Caixa passa a R$ 110,00 com o crédito R$ 10,00", "Crédito do franqueado R$ 10,00" in principal and "R$ 110,00" in principal, principal[-600:])
confere("o Caixa escolhe o vendedor (o campo é obrigatório para ele)", escolher("Vendedor", "Owner Da Mata") is True)
pagar_dinheiro("110")
resumo = fechar_venda()
confere("a venda do Caixa sai: R$ 100,00 + crédito do franqueado R$ 10,00", "Venda registrada: R$ 100,00 + crédito do franqueado R$ 10,00" in resumo, resumo[:300])
VENDA4 = id_da_venda()
confere("o resumo tem o link da venda", VENDA4 != "", VENDA4)

passo("11. Q379: devolver o item de R$ 60,00 da venda com crédito: o cliente recebe R$ 66,00")
entrar("owner")
ir("/emporio/vendas/" + VENDA4)
v4 = api("GET", "/api/v1/emporio/sales/" + VENDA4)["body"]["data"]
NUMERO4 = str(v4.get("number"))
confere("a API da venda do Caixa guardou o franqueado e o crédito 10", v4.get("franchisee_credit") == 10 and bool(v4.get("franchisee_id")), [v4.get("franchisee_id"), v4.get("franchisee_credit")])
saldo_antes = saldo_pela_api(FID)
confere("abre Devolver", bool(esperar(lambda: clicar("Devolver"), 30)))
time.sleep(1.5)
confere("o painel de devolução abriu", painel_aberto())
confere("devolve 1 da ração (o item de R$ 60,00)", preencher_aria("Quantidade devolvida de " + RACAO, "1") != "SEM CAMPO")
time.sleep(0.8)
painel_txt = texto_do_painel()
confere("Q379: a prévia mostra R$ 66,00 (o valor do papel)", "R$ 66,00" in painel_txt, painel_txt[:500])
confere("Q379: a prévia explica: Itens R$ 60,00 mais R$ 6,00 do crédito do franqueado", "Itens R$ 60,00 mais R$ 6,00 do crédito do franqueado" in painel_txt, painel_txt[:500])
enviar_painel()
confere("o painel de devolução fecha", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Como devolver o valor") or erro_do_campo("Valor a devolver"))
linha_dev = esperar(lambda: linha_da_tabela_com("itens", "1 × " + RACAO), 40)
confere("Q379: a tabela de devoluções mostra R$ 66,00 com 'inclui R$ 6,00 do crédito do franqueado'", bool(linha_dev) and "R$ 66,00" in linha_dev and "inclui R$ 6,00 do crédito do franqueado" in linha_dev, linha_dev)
confere("Q379: o saldo do franqueado caiu R$ 6,00 (o crédito na proporção)", abs((saldo_antes or 0) - (saldo_pela_api(FID) or 0) - 6) < 0.005, [saldo_antes, saldo_pela_api(FID)])
ir("/emporio/franqueados/" + FID)
linha_ext = esperar(lambda: linha_da_tabela_com("valor", "Devolução da venda nº " + NUMERO4), 40)
confere("Q379: o extrato do franqueado mostra 'Devolução da venda nº " + NUMERO4 + "' negativa de R$ 6,00", bool(linha_ext) and "Devolução" in linha_ext and "- R$ 6,00" in linha_ext, linha_ext)

passo("11b. Resultado da loja depois da devolução: recebido sem abater, devolvido em linha própria, líquido")
ir("/emporio/resultado?loja=" + loja_id)
js("document.querySelectorAll('main details').forEach(d => { d.open = true; })")
time.sleep(0.5)
bloco = js("(() => { const t = (document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' '); const i = t.indexOf('Créditos de franqueado (repasse)'); return i < 0 ? '' : t.slice(i, i + 700); })()") or ""
print("   bloco: " + bloco.replace("\n", " | "))
confere("Q379: o bloco de repasse existe", bloco != "", texto_do_main()[:600])
confere("Q379: Recebido nas vendas R$ 20,00 (as vendas, sem abater a devolução de R$ 6,00)", bool(re.search(r"Recebido nas vendas\s*\n?\s*R\$ 20,00", bloco)), bloco)
confere("Q379: Devolvido nas devoluções R$ 6,00 em linha própria", bool(re.search(r"Devolvido nas devoluções\s*\n?\s*R\$ 6,00", bloco)), bloco)
confere("Q379: Pago aos franqueados R$ 5,00", bool(re.search(r"Pago aos franqueados\s*\n?\s*R\$ 5,00", bloco)), bloco)
confere("Q379: o líquido do bloco é R$ 9,00 (20 menos 6 menos 5)", bool(re.search(r"^Créditos de franqueado \(repasse\)[\s\S]{0,200}?R\$ 9,00", bloco)), bloco)

# --- 12. Ficha do cliente: o recebido inclui o credito do franqueado (Q386) ------------------------------
def linha_do_credito_na_ficha():
    """A <p> 'O recebido inclui ...' (so ela, nao o primeiro texto da pagina), com o que vem logo antes dela."""
    return js("(() => { const p = Array.from(document.querySelectorAll('main p')).find(x => x.innerText.trim().startsWith('O recebido inclui')); if (!p) return null; const antes = p.previousElementSibling; return { texto: p.innerText.replace(/\\u00a0/g, ' ').trim(), logo_apos_os_cartoes: !!antes && antes.tagName === 'SECTION' && antes.innerText.includes('Recebido') }; })()")


def criar_cliente(nome, telefone):
    r = api("POST", "/api/v1/emporio/customers", {"person_kind": "pf", "name": nome, "phone": telefone})
    return ((r["body"] or {}).get("data") or {}).get("id") or ""


def vender_para_cliente(nome, com_credito):
    abrir_balcao()
    adicionar(RACAO, "Fq Ra", "1", 1)
    adicionar(SAL, "Fq Sal", "1", 2)
    confere("escolhe o cliente " + nome, escolher_cliente(nome) is True)
    if com_credito:
        franqueado_e_credito("10")
        pagar_dinheiro("110")
    else:
        pagar_dinheiro("100")
    resumo = fechar_venda()
    esperado = "Venda registrada: R$ 100,00 + crédito do franqueado R$ 10,00" if com_credito else "Venda registrada: R$ 100,00"
    confere("a venda para " + nome + " sai", esperado in resumo, resumo[:300])
    return id_da_venda()


passo("12. Q386: ficha do cliente diz quanto do recebido é crédito do franqueado (líquido da devolução)")
entrar("owner")
# O cenário não apaga clientes: nome único por rodada, senão o seletor acha o da rodada anterior.
SUFIXO = str(int(time.time()))
CLIENTE_COM = "Fq Cliente Com Credito " + SUFIXO
CLIENTE_SEM = "Fq Cliente Sem Credito " + SUFIXO
ID_COM = criar_cliente(CLIENTE_COM, "3833331111")
ID_SEM = criar_cliente(CLIENTE_SEM, "3833332222")
confere("Q386: os dois clientes foram criados pela API", ID_COM != "" and ID_SEM != "", [ID_COM, ID_SEM])
VENDA_COM = vender_para_cliente(CLIENTE_COM, True)
VENDA_SEM = vender_para_cliente(CLIENTE_SEM, False)
confere("Q386: as duas vendas têm link", VENDA_COM != "" and VENDA_SEM != "", [VENDA_COM, VENDA_SEM])

ir("/emporio/clientes/" + ID_COM)
confere("Q386: a ficha do cliente com crédito abre", esperar(lambda: tem(CLIENTE_COM), 60), texto_principal(200))
linha_fq = linha_do_credito_na_ficha()
print("   ficha com crédito: " + str(linha_fq))
confere("Q386: a ficha mostra 'O recebido inclui R$ 10,00 de crédito do franqueado.' (antes da devolução)", bool(linha_fq) and linha_fq["texto"] == "O recebido inclui R$ 10,00 de crédito do franqueado.", linha_fq)
confere("Q386: a linha vem logo abaixo dos cartões de resumo", bool(linha_fq) and linha_fq["logo_apos_os_cartoes"], linha_fq)

# Devolve o item de R$ 60,00: o crédito devolvido (R$ 6,00) sai do líquido (10 menos 6 = 4).
ir("/emporio/vendas/" + VENDA_COM)
confere("Q386: abre Devolver na venda do cliente", bool(esperar(lambda: clicar("Devolver"), 30)))
time.sleep(1.5)
confere("Q386: o painel de devolução abriu", painel_aberto())
confere("Q386: devolve 1 da ração", preencher_aria("Quantidade devolvida de " + RACAO, "1") != "SEM CAMPO")
time.sleep(0.8)
enviar_painel()
confere("Q386: o painel de devolução fecha", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:300])
linha_dev = esperar(lambda: linha_da_tabela_com("itens", "1 × " + RACAO), 40)
confere("Q386: a devolução de R$ 66,00 consta na venda", bool(linha_dev) and "inclui R$ 6,00 do crédito do franqueado" in linha_dev, linha_dev)

ir("/emporio/clientes/" + ID_COM)
confere("Q386: a ficha reabre", esperar(lambda: tem(CLIENTE_COM), 60), texto_principal(200))
linha_fq = linha_do_credito_na_ficha()
print("   ficha depois da devolução: " + str(linha_fq))
confere("Q386: depois da devolução a linha diz R$ 4,00 (crédito das vendas concluídas menos o devolvido)", bool(linha_fq) and linha_fq["texto"] == "O recebido inclui R$ 4,00 de crédito do franqueado.", linha_fq)

ir("/emporio/clientes/" + ID_SEM)
confere("Q386: a ficha do cliente sem crédito abre", esperar(lambda: tem(CLIENTE_SEM), 60), texto_principal(200))
confere("Q386: a ficha mostra a venda dele (a página carregou os cartões)", esperar(lambda: tem("Recebido"), 30), texto_principal(300))
confere("Q386: sem crédito, a linha 'O recebido inclui' NÃO aparece", linha_do_credito_na_ficha() is None and "crédito do franqueado" not in texto_do_main(), texto_do_main()[:500])

# --- 9. Celular --------------------------------------------------------------------------------------
passo("9. Celular (360 px): balcão e ficha sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=360, height=800, deviceScaleFactor=2, mobile=True)
abrir_balcao()
montar_carrinho()
franqueado_e_credito("10")
pagar_dinheiro("50")
confere("o balcão com franqueado, crédito e pagamento sem rolagem horizontal", sem_rolagem_horizontal(), medida())
ir("/emporio/franqueados/" + FID)
confere("a ficha abre no celular", tem(FRANQUEADO), texto_principal(200))
confere("a ficha sem rolagem horizontal", sem_rolagem_horizontal(), medida())
ir("/emporio/franqueados")
confere("a lista sem rolagem horizontal", sem_rolagem_horizontal(), medida())
cdp("Emulation.clearDeviceMetricsOverride")

fim()
