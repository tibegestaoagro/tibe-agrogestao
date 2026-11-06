# Validacao viva da Frente 1 do Meu Empório (Modulo 39, plano 2026-11-06,
# clientes e fornecedores; spec docs/specs/module-39-meu-emporio.md, Q191 a
# Q198): o cliente e o fornecedor saem de Contatos e ganham tela propria.
#
#   1. O Vendedor cadastra em Clientes uma PF so com nome e telefone e vende para
#      ela no balcao; a venda aparece na ficha.
#   2. A PJ sem endereco e recusada embaixo do CEP (na tela e na API).
#   3. O orcamento com o Consumidor final salva.
#   4. O Caixa nao ve "Arquivar"; o Gestor arquiva, o cliente some do seletor do
#      balcao e a ficha esconde "Editar" ate desarquivar.
#   5. Contatos (a fazenda) nao mostra o cliente nem o Consumidor final.
#   6. O fornecedor de propriedade: a compra dele nao pede forma de pagamento,
#      sai como "Só custo (propriedade)" e nao cria lancamento no Financeiro.
#   7. A venda fiada para o cliente: a tela de Fiado mostra o nome.
#   8. A 390 px: Clientes, a ficha e Fornecedores sem rolagem horizontal.
#   9. O telefone gravado so com digitos aparece com mascara nas listas e fichas.
#
# cenario: scripts/_cenario-emporio-clientes.ts
# sessao: owner owner@damata.com.br
# sessao: gestor cli-gestor@teste.local
# sessao: vendedor cli-vendedor@teste.local
# sessao: caixa cli-caixa@teste.local

import urllib.parse

LOJA = "Cli Loja"
RACAO = "Cli Ração"
FAZENDA = "Cli Fazenda"
SUFIXO = str(int(time.time()))
NOME_PF = "Cli Maria " + SUFIXO
NOME_PJ = "Cli Empresa " + SUFIXO
TELEFONE_MASCARADO = "(38) 99123-4567"


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def no_painel(texto):
    return texto.lower() in (js("((document.querySelector('[role=dialog]') || {}).innerText || '').replace(/\\u00a0/g, ' ')") or "").lower()


def preencher_aria(aria, valor):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const el = raiz.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def campo_existe(rotulo):
    return bool(js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return !!(l && document.getElementById(l.htmlFor)); })()"))


def campo_no_painel(rotulo):
    return bool(js("(() => { const d = document.querySelector('[role=dialog]'); return !!d && Array.from(d.querySelectorAll('label')).some(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); })()"))


def texto_do_campo(rotulo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText.replace(/\\u00a0/g, ' ') : 'SEM CAMPO'; })()") or ""


def botao_existe(rotulo):
    return bool(js("Array.from(document.querySelectorAll('main button')).some(b => b.innerText.trim() === " + repr(rotulo) + ")"))


def linha_da_tabela(trecho):
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


def esc():
    js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(1)


def opcoes_do_campo(rotulo):
    """Abre o Select do campo, le as opcoes e fecha com Escape."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    xy = _centro(gatilho)
    if not xy:
        return None
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    lista = js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.trim())") or []
    esc()
    return lista


def escolher_por_aria(aria, opcao):
    """Select (Radix) sem <label>, pelo aria-label do gatilho, dentro do painel."""
    xy = _centro("(document.querySelector('[role=dialog]') || document).querySelector('[aria-label=' + " + repr("'" + aria + "'") + " + ']')")
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(opcao) + ")")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def abrir_balcao(modo_orcamento=False):
    ir("/emporio/vender")
    confere("o balcão abre", caminho() == "/emporio/vender" and tem("Total da venda"), caminho())
    if campo_existe("Loja") and LOJA not in texto_do_campo("Loja"):
        confere("escolhe " + LOJA, escolher("Loja", LOJA) is True)
    if modo_orcamento:
        confere("troca para o modo Orçamento", clicar("Orçamento"))
        time.sleep(1)
        confere("o balcão mostra Salvar orçamento", esperar(lambda: tem("Total do orçamento"), 10))


def adicionar_racao(quantidade):
    confere("busca " + RACAO, preencher_aria("Buscar produto", "Cli Ra") != "SEM CAMPO")
    confere("adiciona " + RACAO, esperar(lambda: clicar_resultado(RACAO), 15))
    confere("a quantidade é " + quantidade, preencher_aria("Quantidade do item 1", quantidade) != "SEM CAMPO")


def cliente_pela_api(nome):
    lista = api("GET", "/api/v1/emporio/customers?q=" + urllib.parse.quote(nome) + "&archived=1")["body"].get("data") or []
    achado = [c for c in lista if c.get("name") == nome]
    return achado[0] if achado else None


def lancamentos_do_financeiro():
    return api("GET", "/api/v1/financial-entries?per_page=1")["body"]["meta"].get("total")


def abrir_painel(rotulo):
    """Clica no botao e espera o painel. No next dev, a primeira visita compila e
    hidrata devagar: o clique antes da hidratacao nao abre nada, entao repete."""
    fim_em = time.time() + 60
    while time.time() < fim_em:
        if clicar(rotulo) and esperar(painel_aberto, 6):
            time.sleep(1)
            return True
        time.sleep(2)
    return False


def sem_rolagem(rotulo):
    largura = js("document.documentElement.scrollWidth")
    confere(rotulo + " sem rolagem horizontal", largura is not None and largura <= 390, largura)


# --- 1 ---------------------------------------------------------------------------------
passo("1. O Vendedor cadastra uma PF só com nome e telefone em Clientes e vende para ela")
entrar("vendedor")
ir("/emporio/clientes")
confere("a tela Clientes abre para o Vendedor", caminho() == "/emporio/clientes" and tem("Quem compra no Empório"), caminho())
confere("o Vendedor vê Clientes no menu", "/emporio/clientes" in menu(), menu())
confere("o Vendedor vê Fornecedores no menu (fora do caixa)", "/emporio/fornecedores" in menu(), menu())
confere("abre Cliente novo", abrir_painel("Cliente novo"))
confere("escolhe Pessoa física", clicar("Pessoa física"))
confere("preenche o nome", preencher("Nome", NOME_PF) not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o telefone", preencher("Telefone", "38991234567") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou (sem CPF e sem endereço)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("CPF") or erro_do_campo("Telefone"))
confere("o cliente aparece na lista, com o telefone mascarado", esperar(lambda: NOME_PF in linha_da_tabela(NOME_PF) and TELEFONE_MASCARADO in linha_da_tabela(NOME_PF), 30), linha_da_tabela(NOME_PF))
cliente = esperar(lambda: cliente_pela_api(NOME_PF), 30)
confere("gravado como PF, sem documento", bool(cliente) and cliente.get("person_kind") == "pf" and cliente.get("document") is None and not cliente.get("incomplete"), cliente)
cliente_id = (cliente or {}).get("id", "")

abrir_balcao()
adicionar_racao("2")
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("o valor em dinheiro é 40", preencher_aria("Valor em Dinheiro (R$)", "40") != "SEM CAMPO")
confere("escolhe o cliente na lista do campo Cliente", escolher("Cliente", NOME_PF) is True)
enviar_botao("Fechar a venda")
confere("a venda é registrada", esperar(lambda: tem("Venda registrada"), 60), texto_principal(200))
confere("o resumo cita o cliente", tem("cliente " + NOME_PF))

ir("/emporio/clientes/" + cliente_id)
confere("a ficha abre", caminho() == "/emporio/clientes/" + cliente_id and tem(NOME_PF), caminho())
confere("a ficha mostra a venda de R$ 40,00, ativa, na Cli Loja", esperar(lambda: tem("R$ 40,00") and tem("Ativa") and tem(LOJA), 20), texto_principal(1200))
confere("a ficha mostra o telefone mascarado", tem(TELEFONE_MASCARADO))
confere("o Vendedor não vê Arquivar", not botao_existe("Arquivar"))

# --- 2 ---------------------------------------------------------------------------------
passo("2. PJ sem endereço: a recusa fica embaixo do CEP")
ir("/emporio/clientes")
confere("abre Cliente novo", abrir_painel("Cliente novo"))
confere("escolhe Pessoa jurídica", clicar("Pessoa jurídica"))
confere("preenche o nome da empresa", preencher("Nome da empresa", NOME_PJ) not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o CNPJ", preencher("CNPJ", "11222333000181") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o telefone", preencher("Telefone", "3832210000") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("CEP"), 20)
confere("a recusa aparece embaixo do CEP", recusa == "Informe o CEP do endereço principal.", recusa)
confere("o painel continua aberto", painel_aberto())
esc()
r = api("POST", "/api/v1/emporio/customers", {"person_kind": "pj", "name": NOME_PJ, "document": "11222333000181", "phone": "3832210000"})
erro = (r["body"] or {}).get("error") or {}
confere("a API recusa no campo address_zip, com a mesma frase", r["status"] == 422 and erro.get("field") == "address_zip" and erro.get("message") == "Informe o CEP do endereço principal.", r)
confere("a PJ não foi gravada", cliente_pela_api(NOME_PJ) is None)

# --- 3 ---------------------------------------------------------------------------------
passo("3. O orçamento com o Consumidor final salva")
abrir_balcao(modo_orcamento=True)
adicionar_racao("3")
confere("escolhe Consumidor final", escolher("Cliente", "Consumidor final") is True)
confere("clica em Salvar orçamento", enviar_botao("Salvar orçamento"))
confere("o orçamento é salvo", esperar(lambda: tem("salvo, válido até"), 60), texto_principal(300))
confere("o resumo cita o Consumidor final", tem("cliente Consumidor final"), texto_principal(400))

# --- 4 ---------------------------------------------------------------------------------
passo("4. O Caixa não arquiva; o Gestor arquiva e o cliente some do balcão")
entrar("caixa")
ir("/emporio/clientes/" + cliente_id)
confere("a ficha abre para o Caixa", tem(NOME_PF), caminho())
confere("o Caixa não vê Arquivar", not botao_existe("Arquivar"))

entrar("gestor")
ir("/emporio/clientes/" + cliente_id)
confere("o Gestor vê Editar e Arquivar", botao_existe("Editar") and botao_existe("Arquivar"))
confere("o Gestor arquiva", clicar("Arquivar"))
confere("a ficha mostra Arquivado e oferece Desarquivar", esperar(lambda: botao_existe("Desarquivar") and tem("Arquivado"), 30), texto_principal(300))
confere("arquivado: a ficha não oferece Editar", not botao_existe("Editar"))
abrir_balcao()
opcoes = opcoes_do_campo("Cliente") or []
confere("o seletor do balcão abre com o Consumidor final", "Consumidor final" in opcoes, opcoes)
confere("o cliente arquivado não está no seletor", NOME_PF not in opcoes, opcoes)
ir("/emporio/clientes/" + cliente_id)
confere("o Gestor desarquiva", clicar("Desarquivar"))
confere("desarquivado: Editar volta", esperar(lambda: botao_existe("Editar") and botao_existe("Arquivar"), 30))

# --- 5 ---------------------------------------------------------------------------------
passo("5. Contatos não mostra o cliente nem o Consumidor final")
entrar("owner")
ir("/contatos")
confere("a tela Contatos abre", caminho() == "/contatos", caminho())
confere("o cliente do Empório não está em Contatos", not tem(NOME_PF))
confere("o Consumidor final não está em Contatos", not tem("Consumidor final"))
ir("/contatos?q=" + urllib.parse.quote(NOME_PF))
confere("nem buscando pelo nome", not tem(NOME_PF))
ir("/contatos?q=Consumidor")
confere("nem buscando Consumidor", not tem("Consumidor final"))
financeiro_antes = lancamentos_do_financeiro()

# --- 6 ---------------------------------------------------------------------------------
passo("6. O fornecedor de propriedade: compra só com o custo, sem lançamento")
entrar("gestor")
ir("/emporio/fornecedores")
confere("a tela Fornecedores abre para o Gestor", caminho() == "/emporio/fornecedores" and tem("De quem o Empório compra"), caminho())
confere("abre Novo fornecedor", abrir_painel("Novo fornecedor"))
confere("escolhe Propriedade do dono", clicar("Propriedade do dono"))
time.sleep(1)
confere("escolhe a " + FAZENDA, escolher("Propriedade", FAZENDA) is True)
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a propriedade aparece na lista", esperar(lambda: FAZENDA in linha_da_tabela(FAZENDA), 30), linha_da_tabela(FAZENDA))

ir("/emporio/compras")
confere("abre Nova compra", abrir_painel("Nova compra"))
confere("com fornecedor nenhum, pede a forma de pagamento", campo_no_painel("Forma de pagamento"))
confere("escolhe o fornecedor da propriedade", escolher("Fornecedor", FAZENDA + " (propriedade)") is True)
confere("a forma de pagamento some", not campo_no_painel("Forma de pagamento"))
confere("o aviso diz que entra só o custo", no_painel("entra só o custo, sem conta a pagar"))
confere("escolhe o produto", escolher_por_aria("Produto do item 1", RACAO) is True)
confere("a quantidade é 10", preencher_aria("Quantidade do item 1", "10") != "SEM CAMPO")
confere("o valor total é 50", preencher_aria("Valor total do item 1", "50") != "SEM CAMPO")
enviar_painel()
confere("a compra foi registrada (painel fechou)", esperar(lambda: not painel_aberto(), 60), js("((document.querySelector('[role=dialog]') || {}).innerText || '').slice(0, 400)"))
confere("a compra aparece em Compras com Só custo (propriedade)", esperar(lambda: "Só custo (propriedade)" in linha_da_tabela(FAZENDA), 30), linha_da_tabela(FAZENDA))

# A API ignora a forma de pagamento que vier no corpo de uma compra de propriedade.
fornecedores = api("GET", "/api/v1/emporio/suppliers?q=" + urllib.parse.quote(FAZENDA))["body"].get("data") or []
fornecedor = next((f for f in fornecedores if f.get("name") == FAZENDA), None)
confere("o fornecedor é do tipo propriedade", bool(fornecedor) and fornecedor.get("kind") == "propriedade", fornecedor)
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
loja = next((l for l in lojas if l["name"] == LOJA), None)
produto = next((p for p in api("GET", "/api/v1/emporio/products?q=Cli")["body"]["data"] if p["name"] == RACAO), None)
apresentacao = api("GET", "/api/v1/emporio/products/" + produto["id"])["body"]["data"]["presentations"][0]["id"]
r = api("POST", "/api/v1/emporio/purchases", {
    "operation_key": "roteiro-clientes-" + SUFIXO,
    "establishment_id": loja["id"],
    "supplier_id": fornecedor["id"],
    "purchased_at": "2026-11-06T12:00:00.000Z",
    "received": True,
    "items": [{"emporio_product_id": produto["id"], "presentation_id": apresentacao, "quantity": 5, "item_total": 25}],
    "payment": {"kind": "a_prazo", "due_date": "2026-12-06T12:00:00.000Z"},
})
compra = (r["body"] or {}).get("data") or {}
confere("a compra com 'a prazo' no corpo é gravada sem forma de pagamento", r["status"] in (200, 201) and compra.get("payment_kind") is None, [r["status"], compra.get("payment_kind")])

entrar("owner")
ir("/emporio")
financeiro_depois = lancamentos_do_financeiro()
confere("o Financeiro não ganhou lançamento com as duas compras", financeiro_depois == financeiro_antes, [financeiro_antes, financeiro_depois])

# --- 7 ---------------------------------------------------------------------------------
passo("7. Venda fiada para o cliente: a tela de Fiado mostra o nome")
abrir_balcao()
adicionar_racao("1")
confere("adiciona o fiado", clicar("+ Fiado"))
time.sleep(1)
confere("escolhe o cliente", escolher("Cliente", NOME_PF) is True)
enviar_botao("Fechar a venda")
confere("a venda fiada é registrada", esperar(lambda: tem("Venda registrada"), 60), texto_principal(300))
ir("/emporio/fiado")
confere("o Fiado mostra o nome do cliente devendo R$ 20,00", esperar(lambda: NOME_PF in linha_da_tabela(NOME_PF) and "R$ 20,00" in linha_da_tabela(NOME_PF), 30), linha_da_tabela(NOME_PF))

# --- 8 ---------------------------------------------------------------------------------
passo("8. A 390 px: Clientes, a ficha e Fornecedores")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/clientes")
sem_rolagem("Clientes")
ir("/emporio/clientes/" + cliente_id)
sem_rolagem("a ficha do cliente")
ir("/emporio/fornecedores")
sem_rolagem("Fornecedores")
cdp("Emulation.clearDeviceMetricsOverride")

# --- 9 ---------------------------------------------------------------------------------
passo("9. O telefone gravado só com dígitos sai com máscara")
nome_externo = "Cli Distribuidora " + SUFIXO
r = api("POST", "/api/v1/emporio/suppliers", {"kind": "externo", "name": nome_externo, "phone": "38988887777"})
externo = (r["body"] or {}).get("data") or {}
confere("o fornecedor de fora é cadastrado só com o telefone em dígitos", r["status"] in (200, 201) and externo.get("phone") == "38988887777", r)
ir("/emporio/fornecedores")
confere("a lista de Fornecedores mostra (38) 98888-7777", "(38) 98888-7777" in linha_da_tabela(nome_externo), linha_da_tabela(nome_externo))
ir("/emporio/fornecedores/" + externo.get("id", ""))
confere("a ficha do fornecedor mostra (38) 98888-7777", tem("(38) 98888-7777"), texto_principal(600))
nome_digitos = "Cli Joao " + SUFIXO
r = api("POST", "/api/v1/emporio/customers", {"person_kind": "pf", "name": nome_digitos, "phone": "3833334444"})
confere("o cliente é cadastrado só com o telefone em dígitos", r["status"] in (200, 201), r)
ir("/emporio/clientes?q=" + urllib.parse.quote(nome_digitos))
confere("a lista de Clientes mostra (38) 3333-4444", "(38) 3333-4444" in linha_da_tabela(nome_digitos), linha_da_tabela(nome_digitos))

fim()
