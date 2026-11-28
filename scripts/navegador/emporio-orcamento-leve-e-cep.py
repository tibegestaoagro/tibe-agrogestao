# Validacao viva do total do orcamento na tela, do orcamento so com nome e telefone e do endereco pelo CEP
# (Modulo 39, Q335 a Q340):
# docs/superpowers/specs/2026-11-16-emporio-orcamento-total-e-cadastro-leve-design.md
# docs/superpowers/specs/2026-11-16-endereco-pelo-cep-design.md
#
#   1. Q335: balcao em modo orcamento, 2 kg a R$ 20,00 e frete de R$ 15,00: o resumo na tela mostra
#      Itens, Frete e "Total do orcamento" R$ 55,00, e a barra de baixo mostra o mesmo total com frete
#   2. Q336: orcamento para entrega, cliente PF so com nome e telefone, sem escolher o endereco de entrega:
#      salva, e o quadro "Orcamento n salvo" mostra o alerta com "CPF do cliente" e "Endereco de entrega"
#   3. A pagina do orcamento mostra o mesmo alerta; Faturar e fechar a venda: recusa legivel, nenhuma venda
#   4. Orcamento de balcao (sem entrega), cliente PJ sem CNPJ: salva, com o titulo de cadastro
#   5. Modo venda para entrega com o mesmo cliente PF sem CPF: continua recusando (aviso e asterisco)
#   6. CEP no formulario de cliente: "Buscando o CEP...", Municipio e UF preenchidos, foco no Numero
#   7. Rua digitada a mao nao e sobrescrita pelo CEP
#   8. CEP inexistente: aviso junto ao campo, e o cadastro ainda salva
#   9. Balcao, pedido para entrega, "Outro endereco": o CEP preenche
#  10. Formulario da loja: o CEP preenche cidade e UF
#  11. GET /api/v1/cep/:cep sem sessao devolve 401
#
# Os itens de CEP consultam o ViaCEP de verdade (so os 8 numeros saem do servidor).
#
# cenario: scripts/_cenario-emporio-orcamento-leve.ts
# sessao: owner owner@example.com
import re

LOJA = "Ol Loja"
RACAO = "Ol Ração"
PF = "Ol Pessoa"
PJ = "Ol Empresa"
SUFIXO = str(int(time.time()))
MSG_CPF = "Para entrega, informe o CPF do cliente."
TITULO_ENTREGA = "Finalize os dados de entrega antes de fechar a venda"
TITULO_CADASTRO = "Antes de fechar a venda, complete o cadastro"
CEP = "38701044"
CEP_MASCARADO = "38701-044"
CEP_INEXISTENTE = "99999999"
RUA_MANUAL = "Rua Digitada a Mao"


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def texto_do_painel():
    return js("((document.querySelector('[role=dialog]') || {}).innerText || '').replace(/\\u00a0/g, ' ')") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def href_do_link(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def campo_el(rotulo):
    """Expressao JS do elemento ligado ao <label> `rotulo`, no painel aberto ou na pagina."""
    return "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"


def valor_do_campo(rotulo):
    """O value do input ou o texto do gatilho do Select (a UF), ou 'SEM CAMPO'."""
    return js("(() => { const el = " + campo_el(rotulo) + "; if (!el) return 'SEM CAMPO'; return el.tagName === 'INPUT' ? el.value : el.innerText.replace(/\\u00a0/g, ' ').trim(); })()") or ""


def rotulo_com_asterisco(rotulo):
    return bool(js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return !!l && l.innerText.includes('*'); })()"))


def foco_no_campo(rotulo):
    return bool(js("(() => { const el = " + campo_el(rotulo) + "; return !!el && document.activeElement === el; })()"))


def focar(rotulo):
    return js("(() => { const el = " + campo_el(rotulo) + "; if (!el) return 'SEM CAMPO'; el.focus(); return document.activeElement === el; })()")


def observar_buscando():
    """Registra se 'Buscando o CEP' chegou a aparecer: a busca pode ser rapida demais para a leitura."""
    js("window.__viuBuscando = false; new MutationObserver(() => { if ((document.body.innerText || '').includes('Buscando o CEP')) window.__viuBuscando = true; }).observe(document.body, { subtree: true, childList: true, characterData: true }); 0")


def viu_buscando():
    return bool(js("!!window.__viuBuscando"))


def entrega_marcada():
    return js("(() => { const l = Array.from(document.querySelectorAll('label')).find(x => x.innerText.includes('Pedido para entrega')); const i = l && l.querySelector('input'); return i ? i.checked : null; })()")


def abrir_painel(rotulo):
    """Clica no botao e espera o painel; repete porque, antes da hidratacao, o clique nao abre nada."""
    fim_em = time.time() + 60
    while time.time() < fim_em:
        if clicar(rotulo) and esperar(lambda: bool(js("!!document.querySelector('[role=dialog]')")), 6):
            time.sleep(1)
            return True
        time.sleep(2)
    return False


def esc():
    js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(1)


def barra():
    """O texto do rodape fixo do balcao (o total de baixo)."""
    return (js("(() => { const b = document.querySelector('form div.sticky'); return b ? b.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or "").replace("\n", " | ")


def resumo_do_total():
    """O quadro Itens / Frete / Total do orcamento (o <dl> do corpo do balcao)."""
    return (js("(() => { const d = document.querySelector('main form dl[aria-live]'); return d ? d.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or "").replace("\n", " | ")


def vendas_da_loja():
    r = api("GET", "/api/v1/emporio/sales?establishment_id=" + LOJA_ID)
    return len((r["body"] or {}).get("data") or [])


def abrir_balcao(modo_orcamento):
    chegou = ir("/emporio/vender")
    confere("o balcao abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), str(chegou) + " " + caminho())
    atual = valor_do_campo("Loja")
    if atual != "SEM CAMPO" and LOJA not in atual:
        r = escolher("Loja", LOJA)
        confere("escolhe " + LOJA, r is True, str(r) + " (antes: " + atual + ", agora: " + valor_do_campo("Loja") + ")")
    if modo_orcamento:
        confere("troca para o modo Orcamento", clicar("Orçamento"))
        time.sleep(1)
        confere("o balcao mostra Salvar orcamento", bool(esperar(lambda: tem("Total do orçamento"), 10)))
    # Onda 3 da UX (5.7): o frete e o Pedido para entrega moram em "Mais opções", recolhida: abre-se aqui, uma vez por balcão.
    confere("abre Mais opções (o frete e o pedido para entrega moram nela desde a onda 3 da UX)", abrir_mais_opcoes() is True)


def adicionar_racao(quantidade):
    confere("busca " + RACAO, preencher_aria("Buscar produto", "Ol Ra") != "SEM CAMPO")
    confere("adiciona " + RACAO, bool(esperar(lambda: clicar_resultado(RACAO), 15)))
    confere("quantidade " + quantidade, preencher_aria("Quantidade do item 1", quantidade) != "SEM CAMPO")


def salvar_e_ler_resumo():
    confere("salva o orcamento", enviar_botao("Salvar orçamento"))
    confere("o orcamento e salvo", bool(esperar(lambda: tem("salvo, válido até"), 60)), texto_principal(400))
    return texto_do_main()


FRETE = "Frete cobrado do cliente (opcional)"

entrar("owner")
ir("/emporio")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
loja = next((l for l in lojas if l["name"] == LOJA), None)
confere("acha a loja pela API", loja is not None, len(lojas))
LOJA_ID = loja["id"] if loja else ""
confere("a loja nasce sem vendas", vendas_da_loja() == 0, vendas_da_loja())

# --- 1 ---------------------------------------------------------------------------------
passo("1. Q335: o total do orcamento com frete aparece na tela")
abrir_balcao(True)
adicionar_racao("2")
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
confere("digita o frete 15", preencher(FRETE, "15,00") == "freight_amount")
time.sleep(1)
quadro = resumo_do_total()
print("   quadro: " + quadro)
print("   barra: " + barra())
confere("o quadro mostra Itens R$ 40,00", bool(re.search(r"Itens\s*\|\s*R\$\s*40,00", quadro)), quadro)
confere("o quadro mostra Frete R$ 15,00", bool(re.search(r"Frete\s*\|\s*R\$\s*15,00", quadro)), quadro)
confere("o quadro mostra Total do orcamento R$ 55,00 (itens + frete)", bool(re.search(r"Total do orçamento\s*\|\s*R\$\s*55,00", quadro)), quadro)
conta_barra = barra()
confere("a barra de baixo mostra Total do orcamento R$ 55,00", "Total do orçamento" in conta_barra and "R$ 55,00" in conta_barra, conta_barra)
confere("a barra de baixo mostra Itens R$ 40,00 + frete R$ 15,00", bool(re.search(r"Itens R\$\s*40,00 \+ frete R\$\s*15,00", conta_barra)), conta_barra)

# --- 2 ---------------------------------------------------------------------------------
passo("2. Q336: orcamento para entrega, PF so com nome e telefone, sem endereco de entrega")
confere("escolhe o cliente " + PF, escolher_cliente(PF) is True)
confere("marca Pedido para entrega", marcar("Pedido para entrega") is True)
time.sleep(1)
confere("no orcamento o Endereco de entrega e opcional (sem asterisco)", not rotulo_com_asterisco("Endereço de entrega"))
confere("no orcamento nao aparece o aviso de CPF por cima do cliente", MSG_CPF not in texto_do_main(), texto_principal(600))
resumo = salvar_e_ler_resumo()
print("   resumo: " + resumo.replace("\n", " | ")[:600])
m = re.search(r"Orçamento nº (\d+) salvo", resumo)
NUMERO = m.group(1) if m else ""
confere("o resumo traz o numero do orcamento", NUMERO != "", resumo[:200])
confere("o quadro tem o titulo '" + TITULO_ENTREGA + "'", TITULO_ENTREGA in resumo, resumo[:600])
confere("o quadro lista 'CPF do cliente'", "CPF do cliente" in resumo)
confere("o quadro lista 'Endereço de entrega'", "Endereço de entrega" in resumo.replace(TITULO_ENTREGA, ""))
A4 = href_do_link("Imprimir A4")
ORCAMENTO_ID = A4.split("/emporio/imprimir/orcamento/")[1].split("?")[0] if "/emporio/imprimir/orcamento/" in A4 else ""
confere("o resumo tem o link do papel", ORCAMENTO_ID != "", A4)

# --- 3 ---------------------------------------------------------------------------------
passo("3. A pagina do orcamento mostra o alerta; Faturar e fechar a venda e recusado")
ir("/emporio/orcamentos/" + ORCAMENTO_ID)
pagina = texto_do_main()
confere("a pagina do orcamento abre", caminho() == "/emporio/orcamentos/" + ORCAMENTO_ID and ("nº " + NUMERO) in pagina, pagina[:200])
confere("a pagina mostra o titulo '" + TITULO_ENTREGA + "'", TITULO_ENTREGA in pagina, pagina[:600])
confere("a pagina lista 'CPF do cliente'", "CPF do cliente" in pagina)
FATURAR = href_do_link("Faturar")
confere("a pagina tem o link Faturar", "orcamento=" + ORCAMENTO_ID in FATURAR, FATURAR)
ir(FATURAR)
confere("o orcamento carrega no balcao", bool(esperar(lambda: tem("Faturando o orçamento nº"), 30)), texto_principal(300))
js("window.__log = []; const f = window.fetch; window.fetch = function(u, o) { return f.apply(this, arguments).then(r => { window.__log.push([String((o && o.method) || 'GET'), String(u), r.status]); return r; }); }; 0")
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("o valor em dinheiro e 55", preencher_aria("Valor em Dinheiro (R$)", "55") != "SEM CAMPO")
confere("fecha a venda", enviar_botao("Fechar a venda"))
time.sleep(5)
log = js("window.__log") or []
print("   chamadas: " + str([x for x in log if "sales" in x[1] or "quotes" in x[1]]))
principal = texto_do_main()
confere("nenhuma venda registrada na tela", "Venda registrada" not in principal, principal[:300])
confere("a recusa legivel esta na tela (cita o CPF)", "CPF" in principal and "informe" in principal.lower(), principal[:800])
confere("nenhuma venda criada no banco (API)", vendas_da_loja() == 0, vendas_da_loja())
print("   linhas da tela com CPF: " + str([l for l in principal.split("\n") if "CPF" in l]))

# A mesma venda pela rota, sem o filtro da tela: o SERVIDOR recusa o PF sem CPF numa venda para entrega.
produtos = (api("GET", "/api/v1/emporio/products?q=Ol%20Ra")["body"] or {}).get("data") or []
produto = next((p for p in produtos if p["name"] == RACAO), None)
detalhe = api("GET", "/api/v1/emporio/products/" + produto["id"])["body"]["data"] if produto else None
clientes_ol = (api("GET", "/api/v1/emporio/customers?q=Ol%20Pessoa")["body"] or {}).get("data") or []
cliente_pf = next((c for c in clientes_ol if c["name"] == PF), None)
confere("acha o produto e o cliente pela API", bool(detalhe) and cliente_pf is not None)
if detalhe and cliente_pf:
    corpo = {
        "operation_key": "ol-recusa-" + SUFIXO,
        "establishment_id": LOJA_ID,
        "customer_id": cliente_pf["id"],
        "quote_id": ORCAMENTO_ID,
        "items": [{"emporio_product_id": produto["id"], "presentation_id": detalhe["presentations"][0]["id"], "quantity": 2}],
        "payments": [{"kind": "dinheiro", "amount": 40}],
        "for_delivery": True,
        "delivery_address_kind": "outro",
        "delivery_zip": "38701-044", "delivery_street": "Avenida Paracatu", "delivery_number": "10",
        "delivery_district": "Rosário", "delivery_city": "Patos de Minas", "delivery_state": "MG",
    }
    r = api("POST", "/api/v1/emporio/sales", corpo)
    erro = (r["body"] or {}).get("error") or {}
    print("   POST /sales: " + str(r["status"]) + " " + str(erro))
    confere("o servidor recusa a venda (4xx) citando o CPF, mesmo com endereco de entrega completo", 400 <= r["status"] < 500 and "CPF" in str(erro.get("message")), r)
    confere("a recusa do servidor nao criou venda", vendas_da_loja() == 0, vendas_da_loja())

# --- 4 ---------------------------------------------------------------------------------
passo("4. Orcamento de balcao com cliente PJ sem CNPJ")
abrir_balcao(True)
adicionar_racao("1")
confere("escolhe o cliente " + PJ, escolher_cliente(PJ) is True)
resumo = salvar_e_ler_resumo()
print("   resumo: " + resumo.replace("\n", " | ")[:500])
confere("o titulo e '" + TITULO_CADASTRO + "'", TITULO_CADASTRO in resumo, resumo[:500])
confere("o quadro lista CNPJ", "CNPJ" in resumo)
confere("nao aparece o titulo de entrega", TITULO_ENTREGA not in resumo)

# --- 5 e 9 -----------------------------------------------------------------------------
passo("5. Modo VENDA para entrega com PF sem CPF continua recusando")
abrir_balcao(False)
adicionar_racao("1")
confere("escolhe o cliente " + PF, escolher_cliente(PF) is True)
confere("marca Pedido para entrega", marcar("Pedido para entrega") is True)
confere("aparece '" + MSG_CPF + "'", bool(esperar(lambda: MSG_CPF in texto_do_main(), 30)), texto_principal(500))
confere("na venda o Endereco de entrega e obrigatorio (asterisco)", rotulo_com_asterisco("Endereço de entrega"))
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("o valor em dinheiro e 20", preencher_aria("Valor em Dinheiro (R$)", "20") != "SEM CAMPO")
confere("fecha a venda", enviar_botao("Fechar a venda"))
time.sleep(4)
confere("a venda nao e registrada", "Venda registrada" not in texto_do_main(), texto_principal(300))
confere("nenhuma venda criada no banco (API)", vendas_da_loja() == 0, vendas_da_loja())

passo("9. Balcao, pedido para entrega, Outro endereco: o CEP preenche")
confere("escolhe 'Outro endereço'", bool(esperar(lambda: marcar("Outro endereço") is True, 20)))
time.sleep(1)
observar_buscando()
focar("CEP")
confere("digita o CEP " + CEP_MASCARADO, preencher("CEP", CEP) == js("(() => { const el = " + campo_el("CEP") + "; return el ? el.id : ''; })()"))
confere("a Cidade e preenchida", bool(esperar(lambda: valor_do_campo("Cidade") == "Patos de Minas", 20)), valor_do_campo("Cidade"))
confere("a UF e MG", valor_do_campo("UF") == "MG", valor_do_campo("UF"))
confere("o CEP digitado segue no campo (este campo nao tem mascara)", valor_do_campo("CEP").replace("-", "") == CEP, valor_do_campo("CEP"))
print("   Rua=" + repr(valor_do_campo("Rua")) + " Bairro=" + repr(valor_do_campo("Bairro")) + " viuBuscando=" + str(viu_buscando()))
confere("a Rua e o Bairro vieram preenchidos (ou o CEP nao os traz)", valor_do_campo("Rua") != "" or valor_do_campo("Bairro") != "", [valor_do_campo("Rua"), valor_do_campo("Bairro")])
confere("o foco foi para o Numero", foco_no_campo("Número"))

# --- 6 ---------------------------------------------------------------------------------
passo("6. CEP no formulario de cliente")
ir("/emporio/clientes")
confere("abre Cadastrar novo cliente", abrir_painel("Cadastrar novo cliente"))
confere("escolhe Pessoa fisica", clicar("Pessoa física"))
time.sleep(1)
observar_buscando()
focar("CEP")
confere("digita o CEP", preencher("CEP", CEP) not in ("SEM ROTULO", "SEM CAMPO"))
confere("o Municipio e preenchido: Patos de Minas", bool(esperar(lambda: valor_do_campo("Município") == "Patos de Minas", 20)), valor_do_campo("Município"))
confere("a UF e MG", valor_do_campo("UF") == "MG", valor_do_campo("UF"))
confere("o CEP aparece com mascara", valor_do_campo("CEP") == CEP_MASCARADO, valor_do_campo("CEP"))
confere("'Buscando o CEP...' chegou a aparecer", viu_buscando())
confere("o foco foi para o Numero", foco_no_campo("Número"), js("document.activeElement && document.activeElement.id"))
via = api("GET", "/api/v1/cep/" + CEP)
dado = (via["body"] or {}).get("data") or {}
print("   API do CEP: " + str(via["status"]) + " " + str(dado))
confere("a rota do CEP devolve 200 com Patos de Minas / MG", via["status"] == 200 and dado.get("city") == "Patos de Minas" and dado.get("state") == "MG", via)
confere("a Rua do formulario e a que a rota devolveu", valor_do_campo("Rua") == (dado.get("street") or ""), [valor_do_campo("Rua"), dado.get("street")])
confere("o Bairro do formulario e o que a rota devolveu", valor_do_campo("Bairro") == (dado.get("district") or ""), [valor_do_campo("Bairro"), dado.get("district")])
esc()

# --- 7 ---------------------------------------------------------------------------------
passo("7. Rua digitada a mao nao e sobrescrita")
confere("abre Cadastrar novo cliente", abrir_painel("Cadastrar novo cliente"))
confere("escolhe Pessoa fisica", clicar("Pessoa física"))
time.sleep(1)
confere("digita a Rua", preencher("Rua", RUA_MANUAL) not in ("SEM ROTULO", "SEM CAMPO"))
focar("CEP")
confere("digita o CEP", preencher("CEP", CEP) not in ("SEM ROTULO", "SEM CAMPO"))
confere("o Municipio e preenchido", bool(esperar(lambda: valor_do_campo("Município") == "Patos de Minas", 20)), valor_do_campo("Município"))
confere("a Rua digitada continua", valor_do_campo("Rua") == RUA_MANUAL, valor_do_campo("Rua"))
esc()

# --- 8 ---------------------------------------------------------------------------------
passo("8. CEP inexistente: aviso junto ao campo e o cadastro ainda salva")
NOME_CEP = "Ol Cep " + SUFIXO
for ruim in ("00000000", CEP_INEXISTENTE):
    r = api("GET", "/api/v1/cep/" + ruim)
    print("   API do CEP " + ruim + ": " + str(r["status"]) + " " + str(r["body"]))
confere("abre Cadastrar novo cliente", abrir_painel("Cadastrar novo cliente"))
confere("escolhe Pessoa fisica", clicar("Pessoa física"))
time.sleep(1)
confere("preenche o nome", preencher("Nome", NOME_CEP) not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o telefone", preencher("Telefone", "38991234567") not in ("SEM ROTULO", "SEM CAMPO"))
focar("CEP")
confere("digita o CEP inexistente", preencher("CEP", CEP_INEXISTENTE) not in ("SEM ROTULO", "SEM CAMPO"))
confere("o aviso aparece junto ao campo", bool(esperar(lambda: "CEP não encontrado" in texto_do_painel(), 20)), texto_do_painel()[:600])
confere("o aviso nao e um erro de validacao (o campo nao fica invalido)", js("(() => { const el = " + campo_el("CEP") + "; return !!el && el.getAttribute('aria-invalid') !== 'true'; })()"))
enviar_botao("Cadastrar")
confere("o painel fecha: o cadastro salva com o CEP inexistente", bool(esperar(lambda: not js("!!document.querySelector('[role=dialog]')"), 60)), texto_do_painel()[:300])
achados = (api("GET", "/api/v1/emporio/customers?q=" + NOME_CEP.replace(" ", "%20"))["body"] or {}).get("data") or []
confere("o cliente existe na API", any(c.get("name") == NOME_CEP for c in achados), len(achados))

# --- 10 --------------------------------------------------------------------------------
passo("10. Formulario da loja: o CEP preenche cidade e UF")
ir("/emporio/estabelecimentos")
confere("abre Nova loja", abrir_painel("Nova loja"))
focar("CEP")
confere("digita o CEP", preencher("CEP", CEP) not in ("SEM ROTULO", "SEM CAMPO"))
confere("a Cidade e preenchida", bool(esperar(lambda: valor_do_campo("Cidade") == "Patos de Minas", 20)), valor_do_campo("Cidade"))
confere("a UF e MG", valor_do_campo("UF") == "MG", valor_do_campo("UF"))
print("   Endereco=" + repr(valor_do_campo("Endereço")))
confere("o Endereco recebeu a rua (ou o CEP nao a traz)", valor_do_campo("Endereço") == (dado.get("street") or ""), [valor_do_campo("Endereço"), dado.get("street")])
esc()

# --- 11 --------------------------------------------------------------------------------
passo("11. Sem sessao, a rota do CEP devolve 401")
cdp("Network.enable")
cdp("Network.clearBrowserCookies")
r = api("GET", "/api/v1/cep/" + CEP)
confere("GET /api/v1/cep/" + CEP + " sem sessao devolve 401", r["status"] == 401, r)
