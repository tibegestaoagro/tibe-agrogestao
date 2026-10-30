# Validacao viva da F1 do Meu Empório (Modulo 39): estabelecimentos e catalogo.
# docs/specs/module-39-meu-emporio.md, "F1: contrato (Q50 a Q59)".
#
# Os painéis do formulario sao exercidos pela tela (abrir, preencher, enviar,
# ver a recusa no campo); o resto dos dados entra pela API do proprio
# navegador, com a sessao, e o roteiro confere o que as telas mostram.
#
# cenario: scripts/_cenario-emporio-f1.ts
# sessao: owner owner@damata.com.br
# sessao: oper operador-emporio@teste.local


def tem(texto, n=6000):
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "")


def linhas_da_tabela_de_preco():
    return js("(() => { const t = Array.from(document.querySelectorAll('table')).find(x => x.innerText.toLowerCase().includes('sugerido')); return t ? Array.from(t.querySelectorAll('tbody tr')).map(r => r.innerText.replace(/\\s+/g, ' ').trim()) : []; })()") or []


passo("0. Início do Empório com os dois cartões (Q59)")
entrar("owner")
ir("/emporio")
confere("cartão Estabelecimentos", tem("Estabelecimentos"))
confere("cartão Produtos", tem("Produtos"))

passo("1. Cadastrar loja pela tela")
ir("/emporio/estabelecimentos")
confere("botão Novo estabelecimento para o Owner", clicar("Novo estabelecimento"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("preenche nome", preencher("Nome", "F1 Loja 1") not in ("SEM ROTULO", "SEM CAMPO"))
preencher("Despesas padrão (%)", "15")
preencher("Lucro padrão (%)", "20")
enviar_painel()
confere("painel fechou depois de salvar", esperar(lambda: not painel_aberto()))
confere("lista mostra F1 Loja 1", esperar(lambda: tem("F1 Loja 1")))

passo("2. Nome repetido: recusa embaixo do campo")
clicar("Novo estabelecimento")
time.sleep(1.5)
preencher("Nome", "F1 Loja 1")
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Nome")) or ""
confere("recusa no campo Nome", "existe" in recusa.lower() or "já" in recusa.lower(), recusa)
press_key("Escape")
time.sleep(1.5)
confere("painel fechou com Escape", not painel_aberto())

passo("3. Montar o resto pela API")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
loja1 = [l for l in lojas if l["name"] == "F1 Loja 1"][0]
confere("loja 1 gravou os percentuais", loja1["default_expense_pct"] == 15 and loja1["default_profit_pct"] == 20, loja1)
r = api("POST", "/api/v1/emporio/establishments", {"name": "F1 Loja 2"})
confere("loja 2 criada", r["status"] == 201, r["status"])
loja2 = r["body"]["data"]
cats = api("GET", "/api/v1/product-categories")["body"]["data"]
r = api("POST", "/api/v1/emporio/products", {"name": "F1 Ração Pet", "category_id": cats[0]["id"], "base_unit": "quilograma", "reference_cost": 10})
confere("produto criado", r["status"] == 201, r["status"])
prod = r["body"]["data"]
api("POST", "/api/v1/emporio/products/" + prod["id"] + "/presentations", {"name": "Saca 10 kg", "base_qty": 10, "is_sealed_package": True})
api("POST", "/api/v1/emporio/products/" + prod["id"] + "/presentations", {"name": "Quilo", "base_qty": 1, "is_sealed_package": False})
apres = {a["name"]: a for a in api("GET", "/api/v1/emporio/products/" + prod["id"])["body"]["data"]["presentations"]}
saca = apres.get("Saca 10 kg")
quilo = apres.get("Quilo")
confere("apresentações criadas", bool(saca and quilo), list(apres))

passo("4. Tabela de preço por loja (§8, §10, Q54)")
ir("/emporio/produtos/" + prod["id"])
linhas = linhas_da_tabela_de_preco()
confere("4 linhas das lojas F1 (2 lojas x 2 apresentações)", len([x for x in linhas if "F1 Loja" in x]) == 4, len(linhas))
saca_l1 = [x for x in linhas if "F1 Loja 1" in x and "Saca" in x]
saca_l2 = [x for x in linhas if "F1 Loja 2" in x and "Saca" in x]
confere("saca na Loja 1: sugerido R$ 138,00 (100 x 1,15 x 1,20)", bool(saca_l1) and "138,00" in saca_l1[0], saca_l1)
confere("saca na Loja 2: sugerido R$ 100,00 (sem percentual)", bool(saca_l2) and "100,00" in saca_l2[0], saca_l2)
confere("sem preço cadastrado ainda", bool(saca_l1) and "sem preço" in saca_l1[0])
confere("lacrado automático e ligado (saca fechada + quilo)", tem("Automático"))
aplicou = js("(() => { const t = Array.from(document.querySelectorAll('table')).find(x => x.innerText.toLowerCase().includes('sugerido')); const r = Array.from(t.querySelectorAll('tbody tr')).find(x => x.innerText.includes('F1 Loja 1') && x.innerText.includes('Saca')); const b = r && Array.from(r.querySelectorAll('button')).find(x => x.innerText.includes('Aplicar sugerido')); if (!b) return false; b.click(); return true; })()")
confere("clicou Aplicar sugerido", aplicou)
esperar(lambda: any("F1 Loja 1" in x and "Saca" in x and "sem preço" not in x and "..." not in x for x in linhas_da_tabela_de_preco()), 60)
linhas = linhas_da_tabela_de_preco()
saca_l1 = [x for x in linhas if "F1 Loja 1" in x and "Saca" in x]
confere("preço da Loja 1 virou R$ 138,00", bool(saca_l1) and "sem preço" not in saca_l1[0] and saca_l1[0].count("138,00") >= 2, saca_l1)
saca_l2 = [x for x in linhas if "F1 Loja 2" in x and "Saca" in x]
confere("Loja 2 continua sem preço", bool(saca_l2) and "sem preço" in saca_l2[0], saca_l2)

passo("5. Exceção da apresentação aparece marcada")
r = api("PUT", "/api/v1/emporio/prices", {"establishment_id": loja2["id"], "presentation_id": saca["id"], "price": None, "expense_pct": 50, "profit_pct": None})
confere("exceção gravada", r["status"] == 200, r["status"])
ir("/emporio/produtos/" + prod["id"])
saca_l2 = [x for x in linhas_da_tabela_de_preco() if "F1 Loja 2" in x and "Saca" in x]
confere("Loja 2: sugerido R$ 150,00 e selo exceção", bool(saca_l2) and "150,00" in saca_l2[0] and "exceção" in saca_l2[0], saca_l2)

passo("6. Estoque da fazenda não mostra o produto do Empório (Q51)")
ir("/estoque")
confere("estoque abre", tem("Estoque"))
confere("F1 Ração Pet fora do estoque da fazenda", not tem("F1 Ração Pet", 20000))

passo("7. Operador: produto sim, loja e preço não (Q55)")
# F6b: o operador do cenário é Vendedor com todas as chaves, e Vendedor só vê as
# lojas a que está ligado. Aqui ele é ligado às duas; o passo 8 deixa só a Loja 1.
entrar("owner")
ops = [u for u in api("GET", "/api/v1/users")["body"]["data"] if u.get("email") == "operador-emporio@teste.local"]
for loja in (loja1, loja2):
    r = api("PUT", "/api/v1/emporio/establishments/" + loja["id"] + "/users", {"user_ids": [ops[0]["id"]]})
    confere("operador ligado a " + loja["name"], r["status"] == 200, r)
entrar("oper")
ir("/emporio/estabelecimentos")
confere("operador vê as lojas", tem("F1 Loja 1"))
confere("operador sem Novo estabelecimento", not clicar("Novo estabelecimento"))
ir("/emporio/produtos/" + prod["id"])
confere("operador vê Nova apresentação", tem("Nova apresentação"))
confere("operador sem Aplicar sugerido", not tem("Aplicar sugerido"))
r = api("PUT", "/api/v1/emporio/prices", {"establishment_id": loja1["id"], "presentation_id": quilo["id"], "price": 1, "expense_pct": None, "profit_pct": None})
confere("API recusa preço do operador com 403", r["status"] == 403, r["status"])

passo("8. Vínculo: operador ligado só à Loja 1 (Q56)")
entrar("owner")
r = api("PUT", "/api/v1/emporio/establishments/" + loja2["id"] + "/users", {"user_ids": []})
confere("vínculo da Loja 2 desfeito", r["status"] == 200, r)
r = api("PUT", "/api/v1/emporio/establishments/" + loja1["id"] + "/users", {"user_ids": [ops[0]["id"]]})
confere("vínculo gravado", r["status"] == 200, r["status"])
entrar("oper")
ir("/emporio/produtos/" + prod["id"])
linhas = linhas_da_tabela_de_preco()
confere("operador vê só a Loja 1 na tabela", len(linhas) == 2 and all("F1 Loja 1" in x for x in linhas), linhas)
confere("API: Loja 2 é 404 para o vinculado", api("GET", "/api/v1/emporio/establishments/" + loja2["id"])["status"] == 404)
