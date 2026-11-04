# Validacao viva de "Empório: cadastro do cliente, nome do produto e menu lateral"
# (Modulo 39, spec docs/specs/module-39-meu-emporio.md): cliente cadastrado no
# balcao (PF, CPF valido), venda sempre com cliente (Consumidor final conta),
# contato antigo com cadastro incompleto, nome do produto editavel e o menu
# "Meu Empório" como grupo.
#
# Reaproveita o cenario da F6b: duas lojas, o produto "F6b Ração" (R$ 20,00 o
# quilo, preco nas duas lojas), um Gestor e um Vendedor da Loja 1.
#
# cenario: scripts/_cenario-emporio-f6b.ts
# sessao: owner owner@damata.com.br
# sessao: vendedor1 f6b-vendedor1@teste.local

import random

ITENS_DO_DONO = [
    "/emporio",
    "/emporio/vender",
    "/emporio/vendas",
    "/emporio/fiado",
    "/emporio/caixa",
    "/emporio/produtos",
    "/emporio/estoque",
    "/emporio/compras",
    "/emporio/transferencias",
    "/emporio/despesas",
    "/emporio/resultado",
    "/emporio/equipe",
    "/emporio/estabelecimentos",
    "/emporio/historico",
]
SUFIXO = str(int(time.time()))
NOME_ANTIGO = "Cliente Antigo " + SUFIXO
NOME_NOVO = "Cliente Balcao " + SUFIXO


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def no_painel(texto):
    return texto.lower() in (js("((document.querySelector('[role=dialog]') || {}).innerText || '').replace(/\\u00a0/g, ' ')") or "").lower()


def cpf_valido_novo():
    """Um CPF valido e novo a cada rodada, para a regra de documento duplicado."""
    n = [random.randint(0, 9) for _ in range(9)]
    if len(set(n)) == 1:
        n[0] = (n[0] + 1) % 10
    for pesos in ([10, 9, 8, 7, 6, 5, 4, 3, 2], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]):
        soma = sum(d * p for d, p in zip(n, pesos))
        r = soma % 11
        n.append(0 if r < 2 else 11 - r)
    return "".join(str(d) for d in n)


def cnpj_alfanumerico_novo():
    """CNPJ alfanumerico (IN RFB 2.229/2024) valido e novo a cada rodada: cada posicao vale ord - 48."""
    base = [random.choice("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(12)]
    base[2] = random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")  # garante pelo menos uma letra
    vals = [ord(c) - 48 for c in base]
    for pesos in ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]):
        r = sum(v * p for v, p in zip(vals, pesos)) % 11
        vals.append(0 if r < 2 else 11 - r)
    return "".join(base) + "".join(str(v) for v in vals[12:])


def mascarado(c):
    return c[:2] + "." + c[2:5] + "." + c[5:8] + "/" + c[8:12] + "-" + c[12:]


def valor_do_campo(rotulo):
    return js("(() => { const d = document.querySelector('[role=dialog]'); const l = d && Array.from(d.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.value : 'SEM CAMPO'; })()") or ""


def cliente_escolhido():
    """Texto do campo Cliente da venda (o gatilho do Select)."""
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === 'Cliente'); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText.trim() : 'SEM CAMPO'; })()") or ""


def tipo_no_painel(rotulo):
    return bool(js("(() => { const d = document.querySelector('[role=dialog]'); const b = d && Array.from(d.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def enviar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Fechar a venda')); if (b) b.click(); })()")


def clicar_resultado(nome):
    """Toca no resultado da busca de produto que contem `nome`."""
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def produto_f6b():
    lista = api("GET", "/api/v1/emporio/products?q=F6b")["body"]["data"]
    return [p for p in lista if "F6b" in p["name"]][0]


entrar("owner")
ir("/emporio")
time.sleep(3)
esperar(lambda: api("GET", "/api/v1/emporio/products?q=F6b")["status"] == 200, 90)
# O contato antigo: so o nome, como os que existiam antes do cadastro completo.
r = api("POST", "/api/v1/contacts", {"name": NOME_ANTIGO})
confere("o contato antigo (so o nome) foi criado", r["status"] in (200, 201), r["status"])
produto = produto_f6b()
nome_original = produto["name"]

passo("1. Cliente novo no balcão: PF, CPF inválido e depois válido")
ir("/emporio/vender")
confere("o balcão abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
confere("abre Cliente novo", clicar("Cliente novo"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("escolhe Pessoa física", tipo_no_painel("Pessoa física"))
confere("preenche o nome", preencher("Nome", NOME_NOVO) not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o CPF inválido", preencher("CPF", "11144477700") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o telefone", preencher("Telefone", "38999990000") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("CPF"))
confere("o CPF inválido é recusado no campo", "CPF inválido. Confira os 11 números." in (recusa or ""), recusa)
confere("preenche o CPF válido", preencher("CPF", cpf_valido_novo()) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("o cliente cadastrado já está escolhido no campo Cliente", esperar(lambda: NOME_NOVO in cliente_escolhido()), cliente_escolhido())

passo("1b. Cliente PJ com CNPJ alfanumérico (Q143)")
NOME_PJ = "Empresa Nova " + SUFIXO
CNPJ = cnpj_alfanumerico_novo()
CNPJ_ERRADO = CNPJ[:13] + str((int(CNPJ[13]) + 1) % 10)
ir("/emporio/vender")
confere("abre Cliente novo", clicar("Cliente novo"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("escolhe Pessoa jurídica", tipo_no_painel("Pessoa jurídica"))
confere("preenche o nome da empresa", preencher("Nome da empresa", NOME_PJ) not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o CNPJ com dígito errado", preencher("CNPJ", mascarado(CNPJ_ERRADO).lower()) not in ("SEM ROTULO", "SEM CAMPO"))
confere("a máscara mostra o CNPJ em maiúscula", esperar(lambda: valor_do_campo("CNPJ") == mascarado(CNPJ_ERRADO)), valor_do_campo("CNPJ"))
confere("o campo CNPJ abre o teclado com letras", js("(() => { const d = document.querySelector('[role=dialog]'); const l = Array.from(d.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === 'CNPJ'); return document.getElementById(l.htmlFor).inputMode; })()") == "text")
confere("preenche o telefone", preencher("Telefone", "38977770000") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("CNPJ"))
confere("o CNPJ com dígito errado é recusado no campo", "CNPJ inválido. Confira os 14 caracteres." in (recusa or ""), recusa)
confere("preenche o CNPJ alfanumérico válido, em minúscula", preencher("CNPJ", CNPJ.lower()) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a empresa cadastrada já está escolhida no campo Cliente", esperar(lambda: NOME_PJ in cliente_escolhido()), cliente_escolhido())
lista = api("GET", "/api/v1/contacts?q=" + NOME_PJ.replace(" ", "%20"))["body"].get("data", [])
gravado = [c for c in lista if c.get("name") == NOME_PJ]
confere("gravado sem pontuação e em maiúscula", bool(gravado) and gravado[0].get("document") == CNPJ, gravado)

passo("2. A venda exige cliente; Consumidor final vale")
# Página nova: a venda recomeça sem cliente escolhido.
ir("/emporio/vender")
confere("sem cliente escolhido ao abrir", "Escolha o cliente" in cliente_escolhido(), cliente_escolhido())
confere("escolhe a Loja 1", escolher("Loja", "F6b Loja 1") is True)
confere("busca o produto", preencher_aria("Buscar produto", "F6b") != "SEM CAMPO")
confere("adiciona o produto", esperar(lambda: clicar_resultado("F6b Ração"), 15))
confere("a quantidade é 1", preencher_aria("Quantidade do item 1", "1") != "SEM CAMPO")
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("o valor em dinheiro é 20", preencher_aria("Valor em Dinheiro (R$)", "20") != "SEM CAMPO")
enviar_venda()
recusa = esperar(lambda: erro_do_campo("Cliente"))
confere("sem cliente, a recusa fica no campo Cliente", "Escolha o cliente da venda." in (recusa or ""), recusa)
confere("nenhuma venda foi registrada", not tem("Venda registrada"))
confere("escolhe Consumidor final", escolher("Cliente", "Consumidor final") is True)
enviar_venda()
confere("a venda ao Consumidor final é registrada", esperar(lambda: tem("Venda registrada"), 60), texto_principal(200))
confere("o resumo cita o cliente Consumidor final", tem("cliente Consumidor final"))

passo("3. Contato antigo: Cadastro incompleto e Completar cadastro")
ir("/emporio/vender")
confere("escolhe o contato só com o nome", escolher("Cliente", NOME_ANTIGO) is True)
confere("aparece o aviso Cadastro incompleto", esperar(lambda: tem("Cadastro incompleto")))
confere("abre Completar cadastro", clicar("Completar cadastro"))
time.sleep(2)
confere("painel abriu", painel_aberto())
confere("o painel traz o nome já preenchido", esperar(lambda: js("(() => { const d = document.querySelector('[role=dialog]'); return Array.from(d.querySelectorAll('input')).some(i => i.value === " + repr(NOME_ANTIGO) + "); })()")))
confere("escolhe Pessoa física", tipo_no_painel("Pessoa física"))
confere("preenche o CPF", preencher("CPF", cpf_valido_novo()) not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o telefone", preencher("Telefone", "38988880000") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("o aviso some", esperar(lambda: not tem("Cadastro incompleto")))
confere("o contato continua escolhido", NOME_ANTIGO in cliente_escolhido(), cliente_escolhido())

passo("4. Nome do produto editável")
ir("/emporio/produtos/" + produto["id"])
confere("a tela do produto abre", caminho() == "/emporio/produtos/" + produto["id"] and tem(nome_original), caminho())
confere("abre Editar nome", clicar("Editar nome"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
novo_nome = nome_original + " Editada"
confere("preenche o novo nome", preencher("Nome", novo_nome) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("o título mostra o novo nome", esperar(lambda: (js("(document.querySelector('main h1') || { innerText: '' }).innerText") or "").startswith(novo_nome)), js("(document.querySelector('main h1') || { innerText: '' }).innerText"))
r = api("PATCH", "/api/v1/emporio/products/" + produto["id"], {"name": nome_original})
confere("o nome original foi restaurado", r["status"] == 200, r["status"])
ir("/emporio/produtos/" + produto["id"])
confere("o título voltou ao nome original", tem(nome_original) and not tem(novo_nome))

passo("5. Menu: grupo Meu Empório, para o Dono e para o Vendedor")
ir("/emporio")
dono = [h for h in menu() if h.startswith("/emporio")]
confere("o Dono vê os 14 itens do grupo, na ordem", dono == ITENS_DO_DONO, dono)
confere("Meu Empório é um grupo (botão do menu)", bool(js("Array.from(document.querySelectorAll('nav button')).some(b => b.innerText.includes('Meu Empório'))")))
confere("Histórico está dentro do grupo, não no topo", bool(js("(() => { const a = Array.from(document.querySelectorAll('nav a')).filter(x => x.getAttribute('href') === '/emporio/historico'); return a.length === 1 && !!a[0].closest('div.border-l'); })()")))

entrar("vendedor1")
ir("/emporio")
vend = [h for h in menu() if h.startswith("/emporio")]
confere("o Vendedor vê Início, Vender e Vendas", all(h in vend for h in ("/emporio", "/emporio/vender", "/emporio/vendas")), vend)
confere("o Vendedor não vê Despesas, Resultado, Equipe nem Histórico", not any(h in vend for h in ("/emporio/despesas", "/emporio/resultado", "/emporio/equipe", "/emporio/historico")), vend)

fim()

