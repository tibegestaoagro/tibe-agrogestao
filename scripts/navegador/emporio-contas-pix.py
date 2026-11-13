# Validacao viva das contas PIX escolhidas no lancamento do Meu Emporio (Modulo 39, Q310 a Q317):
# docs/superpowers/specs/2026-11-13-emporio-contas-pix-design.md
#
#   1. Caixa > Contas bancarias (dono): CNPJ formatado, favorecido e "Vale para PIX em" na tabela;
#      cadastro com "Lojas escolhidas" sem loja (recusa embaixo de Lojas), CNPJ invalido (recusa do
#      servidor embaixo de CNPJ), cadastro certo com mascara, edicao com o valor salvo
#   2. "Trocar conta PIX" da loja B nao lista "PIX LOJA A" (a da loja A nao lista "PIX LOJA B")
#   3. Servidor: a conta que a loja nao pode usar e recusada (padrao da loja, venda), por API
#   4. Balcao como Caixa da loja A: o select "Conta do PIX" lista a da loja A (marcada) e a do site,
#      nunca a da loja B; favorecido e CNPJ embaixo; troca para "PIX SITE"; a venda mostra "PIX (PIX SITE)"
#   5. Impresso (A4 e cupom) so com "PIX": sem nome de conta, CNPJ nem favorecido
#   6. Relatorios (dono): "PIX por conta" com a venda em "PIX SITE", no total e por loja
#   7. Fiado como Caixa da loja A: receber por PIX mostra o select com as contas da loja A
#   8. Editar a venda antiga depois de restringir "PIX LOJA A" a loja B (padrao da A trocada para o site):
#      a linha PIX vem com "PIX LOJA A" marcada e a edicao salva na mesma conta
#
# cenario: scripts/_cenario-emporio-contas-pix.ts
# sessao: owner owner@example.com
# sessao: caixa pix-caixa@teste.local

import re

LOJA_A = "Px Loja A"
LOJA_B = "Px Loja B"
CONTA_A = "PIX LOJA A"
CONTA_B = "PIX LOJA B"
CONTA_SITE = "PIX SITE"
NOVA = "Rot PIX Nova"
CNPJ_A = "11.222.333/0001-81"
CNPJ_SITE = "45.723.174/0001-10"
FAV_A = "Agromax Loja A Ltda"
FAV_SITE = "Agromax Site Ltda"
RACAO = "Px Ração"


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def texto_do_painel():
    return js("((document.querySelector('[role=dialog]') || { innerText: '' }).innerText).replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ')") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def linha_da_tabela(trecho):
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


def href_do_link(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def texto_do_campo(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document.querySelector('main'); const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? (el.value !== undefined && el.tagName === 'INPUT' ? el.value : el.innerText.replace(/\\u00a0/g, ' ')) : 'SEM CAMPO'; })()") or ""


def clicar_na_linha(trecho, rotulo):
    """Clica no botao `rotulo` da linha da tabela que contem `trecho`."""
    return bool(js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); const b = r && Array.from(r.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def clicar_no_cartao(titulo, rotulo):
    """Clica no botao `rotulo` do cartao cujo h3 e `titulo` (a pagina do Caixa)."""
    return bool(js("(() => { const h = Array.from(document.querySelectorAll('main h3')).find(x => x.innerText.trim() === " + repr(titulo) + "); const c = h && h.closest('div.space-y-3'); const b = c && Array.from(c.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def abrir_lista(rotulo):
    """Abre o Select (Radix) do campo `rotulo` e devolve o texto das opcoes. A lista fica aberta."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    xy = _centro(gatilho)
    if not xy:
        return None
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    return js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.replace(/\\u00a0/g, ' ').trim())") or []


def tocar_opcao_aberta(texto):
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(texto) + ")")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def escolher_primeira(rotulo):
    """Escolhe a primeira opcao do Select `rotulo` (o vendedor da venda do Caixa: o Dono)."""
    ops = abrir_lista(rotulo)
    if not ops:
        return "SEM OPCAO"
    return tocar_opcao_aberta(ops[0])


def escolher_prefixo(rotulo, prefixo):
    ops = abrir_lista(rotulo)
    if not ops:
        return "SEM OPCAO"
    alvo = [o for o in ops if o.startswith(prefixo)]
    return tocar_opcao_aberta(alvo[0]) if alvo else "SEM OPCAO"


def adicionar_racao():
    confere("busca " + RACAO, preencher_aria("Buscar produto", "Px Ra") != "SEM CAMPO")
    confere("adiciona " + RACAO, esperar(lambda: clicar_resultado(RACAO), 15))
    confere("a quantidade do item 1 é 1", preencher_aria("Quantidade do item 1", "1") != "SEM CAMPO")


def id_da_venda():
    href = href_do_link("Ver a venda")
    return href.split("/emporio/vendas/")[1] if "/emporio/vendas/" in href else ""


def lojas_por_nome():
    return {l["name"]: l["id"] for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"].startswith("Px ")}


def contas_por_nome():
    return {c["name"]: c for c in api("GET", "/api/v1/emporio/bank-accounts")["body"]["data"]}


def recusa_de(res):
    corpo = res.get("body") or {}
    erro = corpo.get("error") or {}
    return str(res.get("status")) + " " + str(erro.get("code")) + " " + str(erro.get("field")) + " " + str(erro.get("message"))


# --- Dono: Contas ----------------------------------------------------------------------------------------
entrar("owner")
ir("/emporio/caixa")
time.sleep(2)
confere("a página do Caixa abre", caminho() == "/emporio/caixa" and tem("Contas bancárias"), texto_principal(200))
LOJAS = lojas_por_nome()
confere("o cenário existe (duas lojas Px)", LOJA_A in LOJAS and LOJA_B in LOJAS, list(LOJAS.keys()))

passo("1. Caixa > Contas: tabela, cadastro com recusas, edição")
cab = js("Array.from(document.querySelectorAll('main thead th')).map(x => x.innerText.trim())") or []
cab = [x.lower() for x in cab]
confere("o cabeçalho da tabela tem CNPJ, Favorecido e Vale para PIX em (maiúsculas pelo CSS)", "cnpj" in cab and "favorecido" in cab and "vale para pix em" in cab, cab[:8])
la = linha_da_tabela(CONTA_A)
print("   linha " + CONTA_A + ": " + la)
confere(CONTA_A + ": CNPJ formatado, favorecido e só a loja A", CNPJ_A in la and FAV_A in la and la.split(" | ")[5] == LOJA_A, la)
lb = linha_da_tabela(CONTA_B)
confere(CONTA_B + ": sem CNPJ (traço), só a loja B", lb.split(" | ")[3] == "-" and lb.split(" | ")[5] == LOJA_B, lb)
ls = linha_da_tabela(CONTA_SITE)
confere(CONTA_SITE + ": CNPJ, favorecido e Todas as lojas", CNPJ_SITE in ls and FAV_SITE in ls and ls.split(" | ")[5] == "Todas as lojas", ls)
confere(CONTA_A + ": a coluna PIX de mostra a loja A (a padrão)", la.split(" | ")[6] == LOJA_A, la)

confere("abre Nova conta", bool(esperar(lambda: clicar("Nova conta"), 30)))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("preenche o identificador", preencher("Identificador", NOVA) not in ("SEM ROTULO", "SEM CAMPO"))
confere("escolhe Lojas escolhidas", escolher("Disponível para PIX em", "Lojas escolhidas") is True)
confere("aparece o campo Lojas", esperar(lambda: "Loja" in texto_do_painel() and ("Lojas" in texto_do_painel()), 5))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Lojas"), 20)
confere("sem loja marcada: a recusa aparece embaixo de Lojas", bool(recusa) and "loja" in recusa.lower(), recusa)
confere("o painel continua aberto", painel_aberto())
confere("marca " + LOJA_A, marcar(LOJA_A) is True)
confere("a recusa de Lojas some ao marcar", esperar(lambda: erro_do_campo("Lojas") == "", 10))
confere("digita CNPJ inválido (dígito verificador errado), sem máscara", preencher("CNPJ", "11222333000182") not in ("SEM ROTULO", "SEM CAMPO"))
confere("o CNPJ ganhou a máscara enquanto digita", texto_do_campo("CNPJ") == "11.222.333/0001-82", texto_do_campo("CNPJ"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("CNPJ"), 30)
print("   recusa do CNPJ: " + str(recusa))
confere("CNPJ inválido: a recusa do servidor aparece embaixo de CNPJ", bool(recusa) and "cnpj" in recusa.lower(), recusa)
confere("o painel continua aberto", painel_aberto())
confere("corrige o CNPJ mascarado", preencher("CNPJ", "11.222.333/0001-81") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o favorecido", preencher("Favorecido", "Rot Favorecido") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
ln = esperar(lambda: linha_da_tabela(NOVA), 30)
print("   linha " + NOVA + ": " + str(ln))
confere("a conta nova aparece com CNPJ formatado, favorecido e só a loja A", bool(ln) and CNPJ_A in ln and "Rot Favorecido" in ln and ln.split(" | ")[5] == LOJA_A, ln)

confere("abre Editar da conta nova", bool(esperar(lambda: clicar_na_linha(NOVA, "Editar"), 20)))
time.sleep(1.5)
confere("o painel de edição abriu", painel_aberto() and ("Editar " + NOVA) in texto_do_painel(), texto_do_painel()[:120])
confere("a edição vem com o CNPJ salvo, mascarado", texto_do_campo("CNPJ") == CNPJ_A, texto_do_campo("CNPJ"))
confere("a edição vem com o favorecido salvo", texto_do_campo("Favorecido") == "Rot Favorecido", texto_do_campo("Favorecido"))
confere("a edição vem com Lojas escolhidas", "Lojas escolhidas" in texto_do_campo("Disponível para PIX em"), texto_do_campo("Disponível para PIX em"))
caixa_marcada = js("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.includes(" + repr(LOJA_A) + ")); return !!l && l.querySelector('input').checked; })()")
confere("a loja A vem marcada", bool(caixa_marcada))
confere("troca o favorecido", preencher("Favorecido", "Rot Favorecido 2") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
ln = esperar(lambda: "Rot Favorecido 2" in linha_da_tabela(NOVA) and linha_da_tabela(NOVA), 30)
confere("a edição salvou o favorecido novo e manteve o CNPJ", bool(ln) and CNPJ_A in ln and "Rot Favorecido 2" in ln, ln)

# --- 2. Definir conta PIX da loja ---------------------------------------------------------------------------
passo("2. Conta PIX da loja: só lista as liberadas para ela")
ir("/emporio/caixa")
confere("abre o painel da conta PIX da " + LOJA_B, bool(esperar(lambda: clicar_no_cartao(LOJA_B, "Trocar conta PIX"), 20)))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
ops = abrir_lista("Conta")
print("   opções da " + LOJA_B + ": " + str(ops))
confere("a lista da loja B tem " + CONTA_B + " e " + CONTA_SITE, ops is not None and CONTA_B in ops and CONTA_SITE in ops, ops)
confere("a lista da loja B NÃO tem " + CONTA_A, ops is not None and CONTA_A not in ops, ops)
confere("a lista da loja B não tem a conta restrita à loja A (" + NOVA + ")", ops is not None and NOVA not in ops, ops)
tocar_opcao_aberta(CONTA_B)
ir("/emporio/caixa")
confere("abre o painel da conta PIX da " + LOJA_A, bool(esperar(lambda: clicar_no_cartao(LOJA_A, "Trocar conta PIX"), 20)))
time.sleep(1.5)
ops = abrir_lista("Conta")
print("   opções da " + LOJA_A + ": " + str(ops))
confere("a lista da loja A tem " + CONTA_A + ", " + CONTA_SITE + " e " + NOVA, ops is not None and CONTA_A in ops and CONTA_SITE in ops and NOVA in ops, ops)
confere("a lista da loja A NÃO tem " + CONTA_B, ops is not None and CONTA_B not in ops, ops)
tocar_opcao_aberta(CONTA_A)

# --- 3. O servidor confere ---------------------------------------------------------------------------------------------
passo("3. O servidor recusa a conta que a loja não pode usar (Q313, Q315)")
CONTAS = contas_por_nome()
res = api("PUT", "/api/v1/emporio/establishments/" + LOJAS[LOJA_B] + "/pix-account", {"bank_account_id": CONTAS[CONTA_A]["id"]})
confere("padrão da loja B = conta só da loja A: 422 em bank_account_id", res["status"] == 422 and "bank_account_id" in recusa_de(res), recusa_de(res))
res = api("PATCH", "/api/v1/emporio/bank-accounts/" + CONTAS[CONTA_A]["id"], {"pix_all_establishments": False, "establishment_ids": [LOJAS[LOJA_B]]})
confere("restringir a padrão da loja A fora da loja A: 422 citando a loja", res["status"] == 422 and LOJA_A in recusa_de(res), recusa_de(res))
antiga = [v for v in api("GET", "/api/v1/emporio/sales?establishment_id=" + LOJAS[LOJA_A] + "&limit=50")["body"]["data"] if any(p.get("bank_account_name") == CONTA_A for p in v["payments"])]
confere("a venda antiga em PIX LOJA A existe", len(antiga) == 1, len(antiga))
VENDA_ANTIGA = antiga[0]["id"] if antiga else ""
item = api("GET", "/api/v1/emporio/sales/" + VENDA_ANTIGA)["body"]["data"]["items"][0]
CONSUMIDOR = [c["id"] for c in api("GET", "/api/v1/emporio/customers?q=Consumidor")["body"]["data"] if c["name"] == "Consumidor final"][0]
res = api("POST", "/api/v1/emporio/sales", {
    "operation_key": "rot-pix-recusa-" + str(int(time.time())),
    "establishment_id": LOJAS[LOJA_A],
    "customer_id": CONSUMIDOR,
    "items": [{"emporio_product_id": item["emporio_product_id"], "presentation_id": item["presentation_id"], "quantity": 1, "unit_price": 20}],
    "payments": [{"kind": "pix", "amount": 20, "bank_account_id": CONTAS[CONTA_B]["id"]}],
})
confere("venda na loja A com a conta só da loja B: 422 em payments", res["status"] == 422 and "payments" in recusa_de(res), recusa_de(res))

# --- 4. Balcao como Caixa -----------------------------------------------------------------------------------------------
passo("4. Balcão como Caixa da loja A: Conta do PIX")
entrar("caixa")
ir("/emporio/vender")
confere("o balcão abre para o Caixa", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho() + " " + texto_principal(200))
if LOJA_A not in texto_do_campo("Loja"):
    confere("escolhe " + LOJA_A, escolher("Loja", LOJA_A) is True)
confere("a loja é " + LOJA_A, LOJA_A in texto_do_campo("Loja") or tem(LOJA_A), texto_do_campo("Loja"))
adicionar_racao()
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
confere("escolhe o vendedor (o Caixa é obrigado a informar)", escolher_primeira("Vendedor") is True)
confere("adiciona o pagamento PIX", clicar("+ PIX"))
time.sleep(1)
confere("o valor em PIX é 20", preencher_aria("Valor em PIX (R$)", "20") != "SEM CAMPO")
confere("o campo Conta do PIX aparece", bool(esperar(lambda: texto_do_campo("Conta do PIX") not in ("SEM CAMPO", ""), 20)), texto_do_campo("Conta do PIX"))
confere("a conta da loja (" + CONTA_A + ") vem marcada", texto_do_campo("Conta do PIX") == CONTA_A, texto_do_campo("Conta do PIX"))
principal = texto_do_main()
confere("embaixo: favorecido e CNPJ da " + CONTA_A, (FAV_A + ", CNPJ " + CNPJ_A) in principal, principal[-600:])
ops = abrir_lista("Conta do PIX")
print("   opções do balcão: " + str(ops))
confere("a lista tem " + CONTA_A + " e " + CONTA_SITE, ops is not None and CONTA_A in ops and CONTA_SITE in ops, ops)
confere("a lista NÃO tem " + CONTA_B, ops is not None and CONTA_B not in ops, ops)
confere("troca para " + CONTA_SITE, tocar_opcao_aberta(CONTA_SITE) is True)
principal = texto_do_main()
confere("embaixo: favorecido e CNPJ do " + CONTA_SITE, (FAV_SITE + ", CNPJ " + CNPJ_SITE) in principal and (FAV_A + ", CNPJ") not in principal, principal[-600:])
confere("o select mostra " + CONTA_SITE, texto_do_campo("Conta do PIX") == CONTA_SITE, texto_do_campo("Conta do PIX"))
confere("fecha a venda", enviar_botao("Fechar a venda"))
ok_ = esperar(lambda: tem("Venda registrada"), 60)
confere("a venda sai", bool(ok_), texto_principal(400))
VENDA = id_da_venda()
confere("o resumo tem o link da venda", VENDA != "", VENDA)
ir("/emporio/vendas/" + VENDA)
pagina = texto_do_main()
print("   venda: " + pagina.replace("\n", " | ")[:700])
confere("a tela da venda mostra PIX (PIX SITE)", "PIX (" + CONTA_SITE + ")" in pagina, pagina[:700])
vd = api("GET", "/api/v1/emporio/sales/" + VENDA)["body"]["data"]
confere("a API: o pagamento PIX gravou a conta " + CONTA_SITE, [p.get("bank_account_name") for p in vd["payments"]] == [CONTA_SITE], [p.get("bank_account_name") for p in vd["payments"]])

# --- 5. Impresso ------------------------------------------------------------------------------------------------------------
passo("5. Impresso (A4 e cupom): só PIX")
for formato, nome in (("a4", "A4"), ("cupom", "cupom")):
    ir("/emporio/imprimir/venda/" + VENDA + "?formato=" + formato)
    papel = texto_da_pagina()
    print("   " + nome + ": " + papel.replace("\n", " | ").replace("\t", " ")[:500])
    confere(nome + ": abre o papel da venda", caminho() == "/emporio/imprimir/venda/" + VENDA and "sem valor fiscal" in papel.lower(), caminho())
    confere(nome + ": mostra a forma PIX", bool(re.search(r"\bPIX\b", papel)), papel[:500])
    confere(nome + ": sem o nome da conta", CONTA_SITE not in papel and "PIX LOJA" not in papel and NOVA not in papel, papel[:500])
    confere(nome + ": sem CNPJ", "cnpj" not in papel.lower() and "45.723" not in papel and "11.222" not in papel, papel[:500])
    confere(nome + ": sem favorecido", "agromax" not in papel.lower() and "favorecido" not in papel.lower(), papel[:500])

# --- 7. Fiado ---------------------------------------------------------------------------------------------------------------------
passo("7. Fiado como Caixa da loja A: receber por PIX")
ir("/emporio/fiado")
confere("a tela do fiado abre para o Caixa", caminho() == "/emporio/fiado" and tem("Px Cliente"), caminho() + " " + texto_principal(200))
confere("abre Receber do Px Cliente", bool(esperar(lambda: clicar_na_linha("Px Cliente", "Receber"), 20)))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("escolhe PIX como forma", escolher_prefixo("Como o cliente pagou", "PIX") is True)
loja_txt = texto_do_campo("Loja que recebe")
if LOJA_A not in loja_txt:
    confere("escolhe a loja " + LOJA_A, escolher("Loja que recebe", LOJA_A) is True)
confere("aparece Conta do PIX", bool(esperar(lambda: texto_do_campo("Conta do PIX") not in ("SEM CAMPO", ""), 20)), texto_do_campo("Conta do PIX"))
confere("a conta da loja vem marcada no fiado", texto_do_campo("Conta do PIX") == CONTA_A, texto_do_campo("Conta do PIX"))
ops = abrir_lista("Conta do PIX")
print("   opções do fiado: " + str(ops))
confere("a lista do fiado tem " + CONTA_A + " e " + CONTA_SITE, ops is not None and CONTA_A in ops and CONTA_SITE in ops, ops)
confere("a lista do fiado NÃO tem " + CONTA_B, ops is not None and CONTA_B not in ops, ops)
confere("escolhe " + CONTA_SITE + " no fiado", tocar_opcao_aberta(CONTA_SITE) is True)
confere("embaixo: o CNPJ da escolhida", ("CNPJ " + CNPJ_SITE) in texto_do_painel(), texto_do_painel()[-300:])
enviar_painel()
confere("o recebimento fecha o painel", esperar(lambda: not painel_aberto(), 60))
entrar("owner")
CLIENTE_ID = [c["id"] for c in api("GET", "/api/v1/emporio/customers?q=Px")["body"]["data"] if c["name"] == "Px Cliente"][0]
res = api("POST", "/api/v1/emporio/receivables/receive", {
    "operation_key": "rot-pix-fiado-recusa-" + str(int(time.time())),
    "customer_id": CLIENTE_ID,
    "establishment_id": LOJAS[LOJA_A], "amount": 1, "kind": "pix", "bank_account_id": CONTAS[CONTA_B]["id"],
})
print("   fiado com conta da loja B: " + recusa_de(res))
confere("o servidor recusa o fiado em conta só da loja B: 422 em bank_account_id (e não por outro motivo)", res["status"] == 422 and "bank_account_id" in recusa_de(res), recusa_de(res))

CONTAS_DEPOIS = contas_por_nome()
confere("o saldo da " + CONTA_SITE + " é 60 (a venda de 20 do balcão mais o fiado de 40 recebido por ela)", CONTAS_DEPOIS[CONTA_SITE]["balance"] == 60, CONTAS_DEPOIS[CONTA_SITE]["balance"])
confere("o saldo da " + CONTA_A + " segue 20 (só a venda antiga)", CONTAS_DEPOIS[CONTA_A]["balance"] == 20, CONTAS_DEPOIS[CONTA_A]["balance"])

# --- 6. Relatorios ------------------------------------------------------------------------------------------------------------
passo("6. Relatórios: PIX por conta")
ir("/emporio/relatorios")
confere("o relatório abre", caminho() == "/emporio/relatorios" and tem("PIX por conta"), texto_principal(200))
pagina = texto_do_main()
trecho = pagina.split("PIX por conta")[1] if "PIX por conta" in pagina else ""
trecho = trecho.split("Vendas por vendedor")[0]
print("   bloco PIX: " + trecho.replace("\n", " | ")[:500])
linha_site = linha_da_tabela(CONTA_SITE)
linha_antiga = linha_da_tabela(CONTA_A)
confere("PIX SITE: 1 pagamento de R$ 20,00 (a venda do balcão)", linha_site.startswith(CONTA_SITE + " | 1 | R$ 20,00"), linha_site)
confere("PIX LOJA A: 1 pagamento de R$ 20,00 (a venda antiga)", linha_antiga.startswith(CONTA_A + " | 1 | R$ 20,00"), linha_antiga)
confere("o bloco aponta a regra (não desconta devoluções)", "Não desconta o que foi devolvido" in trecho, trecho[:200])
confere("o bloco tem 'Em cada loja'", "Em cada loja" in trecho and LOJA_A in trecho, trecho[:400])
ir("/emporio/relatorios?loja=" + LOJAS[LOJA_B])
pagina = texto_do_main()
trecho = (pagina.split("PIX por conta")[1] if "PIX por conta" in pagina else "").split("Vendas por vendedor")[0]
confere("filtrando a loja B: nenhum PIX no período, sem PIX SITE", "Nenhum PIX no período" in trecho and CONTA_SITE not in trecho, trecho[:300])

# --- 8. Editar venda antiga -------------------------------------------------------------------------------------------------------
passo("8. Editar a venda antiga com a conta que deixou de valer")
res = api("PUT", "/api/v1/emporio/establishments/" + LOJAS[LOJA_A] + "/pix-account", {"bank_account_id": CONTAS[CONTA_SITE]["id"]})
confere("a padrão da loja A passa para " + CONTA_SITE, res["status"] == 200, recusa_de(res))
res = api("PATCH", "/api/v1/emporio/bank-accounts/" + CONTAS[CONTA_A]["id"], {"pix_all_establishments": False, "establishment_ids": [LOJAS[LOJA_B]]})
confere("restringe " + CONTA_A + " à loja B (agora o servidor deixa)", res["status"] == 200, recusa_de(res))
ir("/emporio/vender?editar=" + VENDA_ANTIGA)
confere("o balcão abre editando a venda", bool(esperar(lambda: tem("Editando a venda nº"), 30)), texto_principal(300))
confere("a linha PIX vem com a conta da venda marcada (" + CONTA_A + ", fora da lista da loja)", bool(esperar(lambda: texto_do_campo("Conta do PIX") == CONTA_A, 20)), texto_do_campo("Conta do PIX"))
ops = abrir_lista("Conta do PIX")
print("   opções na edição: " + str(ops))
confere("a lista da edição tem " + CONTA_A + " (a da venda), " + CONTA_SITE, ops is not None and CONTA_A in ops and CONTA_SITE in ops, ops)
confere("a lista da edição NÃO tem " + CONTA_B, ops is not None and CONTA_B not in ops, ops)
tocar_opcao_aberta(CONTA_A)
confere("salva a venda nova", enviar_botao("Salvar a venda nova"))
ok_ = esperar(lambda: caminho().startswith("/emporio/vendas/") and tem("Substitui a venda nº"), 60)
confere("a edição salva (sem recusa) e abre a venda nova que substitui a antiga", bool(ok_), texto_principal(300))
nova = caminho().split("/emporio/vendas/")[1] if caminho().startswith("/emporio/vendas/") else ""
vn = api("GET", "/api/v1/emporio/sales/" + nova)["body"]["data"] if nova else {}
confere("a venda nova guardou o PIX em " + CONTA_A, [p.get("bank_account_name") for p in vn.get("payments", [])] == [CONTA_A], [p.get("bank_account_name") for p in vn.get("payments", [])])
res = api("POST", "/api/v1/emporio/sales", {
    "operation_key": "rot-pix-recusa2-" + str(int(time.time())),
    "establishment_id": LOJAS[LOJA_A],
    "customer_id": CONSUMIDOR,
    "items": [{"emporio_product_id": item["emporio_product_id"], "presentation_id": item["presentation_id"], "quantity": 1, "unit_price": 20}],
    "payments": [{"kind": "pix", "amount": 20, "bank_account_id": CONTAS[CONTA_A]["id"]}],
})
confere("já uma venda NOVA com " + CONTA_A + " na loja A é recusada (422 em payments)", res["status"] == 422 and "payments" in recusa_de(res), recusa_de(res))

# --- 9. Loja sem conta padrao (achado do juiz) ------------------------------------------------------------------------------------
passo("9. Loja sem conta padrão e várias contas liberadas: nada vem marcado, o caixa escolhe")
res = api("PUT", "/api/v1/emporio/establishments/" + LOJAS[LOJA_B] + "/pix-account", {"bank_account_id": None})
confere("tira a conta PIX padrão da loja B", res["status"] == 200, recusa_de(res))
ir("/emporio/vender")
confere("o balcão abre para o dono", caminho() == "/emporio/vender" and tem("Fechar a venda"), texto_principal(200))
if LOJA_B not in texto_do_campo("Loja"):
    confere("escolhe " + LOJA_B, escolher("Loja", LOJA_B) is True)
adicionar_racao()
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
confere("adiciona o pagamento PIX", clicar("+ PIX"))
time.sleep(1)
confere("o valor em PIX é 20", preencher_aria("Valor em PIX (R$)", "20") != "SEM CAMPO")
time.sleep(3)
conta_b = texto_do_campo("Conta do PIX")
confere("a Conta do PIX vem sem conta marcada (nenhuma é a padrão): mostra Escolha a conta", conta_b == "Escolha a conta", conta_b)
confere("tenta fechar a venda", enviar_botao("Fechar a venda"))
recusou = esperar(lambda: "Escolha a conta do PIX" in texto_do_main(), 15)
confere("a tela pede para escolher a conta do PIX, e a venda não sai", bool(recusou) and not tem("Venda registrada"), texto_do_main()[-500:])

fim()
