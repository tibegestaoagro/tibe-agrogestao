# Validacao viva da casa do Financeiro do Meu Emporio (entrega 1 do financeiro
# das lojas, plano 2026-11-07; spec docs/superpowers/specs/2026-11-07-emporio-financeiro-design.md):
# o papel Financeiro cuida do dinheiro de todas as lojas, sem vender e sem
# gerir equipe, e o Financeiro do Tibe fica so da fazenda.
#
#   1. O Financeiro entra e cai em /emporio/financeiro, com os quatro blocos.
#   2. O menu dele nao tem Vender nem Equipe, e /dashboard volta para a casa.
#   3. Ele paga a conta da compra a prazo pela conta bancaria e o saldo da
#      conta cai no extrato.
#   4. No formulario de pagar, nao ha gaveta entre as origens.
#   5. Ele recebe um fiado por Pix e a linha aparece no extrato da conta.
#   6. O Gestor lanca uma compra a vista da gaveta, com o turno aberto, e o
#      movimento aparece em Caixa.
#   7. O Dono ve o /financeiro do Tibe sem a conta do Emporio e sem o seletor
#      de area, e o Tibe recusa pagar a conta do Emporio.
#   8. A 390 px: as quatro abas sem rolagem horizontal.
#
# cenario: scripts/_cenario-emporio-financeiro-casa.ts
# sessao: owner owner@example.com
# sessao: financeiro fin-casa@teste.local
# sessao: gestor fin-gestor@teste.local

import datetime
import urllib.parse

LOJA1 = "Fin Loja 1"
FORNECEDOR = "Fin Fornecedor"
CLIENTE = "Fin Cliente"
SUFIXO = str(int(time.time()))
HOJE = datetime.date.today()


_api_da_lib = api


def api(metodo, caminho_api, corpo=None):
    """A primeira chamada de uma rota compila no next dev, e o HMR pode trocar o
    documento no meio do fetch ('Inspected target navigated'): espera a pagina
    assentar e repete. As escritas aqui tem chave de operacao fixa, entao repetir e seguro."""
    for tentativa in range(5):
        try:
            return _api_da_lib(metodo, caminho_api, corpo)
        except RuntimeError as e:
            if "navigated" not in str(e) or tentativa == 4:
                raise
            time.sleep(8)


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def sem_rolagem(rotulo):
    largura = js("document.documentElement.scrollWidth")
    confere(rotulo + " sem rolagem horizontal", largura is not None and largura <= 390, largura)


def lista_da_api(caminho_api):
    d = (api("GET", caminho_api)["body"] or {}).get("data")
    if isinstance(d, dict):
        return d.get("items") or []
    return d or []


def achar_por_nome(caminho_api, nome):
    return next((x for x in lista_da_api(caminho_api) if x.get("name") == nome), None)


def extrato(conta_id):
    de = (HOJE - datetime.timedelta(days=30)).isoformat()
    r = api("GET", "/api/v1/emporio/finance/statement?bank_account_id=" + conta_id + "&de=" + de + "&ate=" + HOJE.isoformat())
    return (r["body"] or {}).get("data") or {}


def aba(href):
    return bool(js("Array.from(document.querySelectorAll('nav[aria-label=\"Telas do Financeiro\"] a')).some(a => a.getAttribute('href').split('?')[0] === " + repr(href) + ")"))


def opcoes_de(rotulo):
    """Abre o Select (Radix) do campo `rotulo` no painel e devolve os textos das opcoes, deixando-o aberto."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    xy = _centro(gatilho)
    if not xy:
        return None
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    return js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.replace(/\\u00a0/g, ' ').trim())") or []


def escolher_opcao_que_comeca_com(prefixo):
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.replace(/\\u00a0/g, ' ').trim().startsWith(" + repr(prefixo) + "))")
    if not xy:
        return False
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def abrir_pagar():
    """Marca a conta do fornecedor e abre o painel Pagar contas. No next dev o
    clique antes da hidratacao nao abre nada, entao repete."""
    fim_em = time.time() + 60
    while time.time() < fim_em:
        js("(() => { const i = document.querySelector('input[aria-label=" + repr('Marcar ' + FORNECEDOR).replace("'", '"') + "]'); if (i && !i.checked) i.click(); })()")
        if clicar("Pagar selecionadas (1)") and esperar(painel_aberto, 6):
            time.sleep(1)
            return True
        time.sleep(2)
    return False


# --- 1 ---------------------------------------------------------------------------------
passo("1. O Financeiro entra e cai na casa, com os quatro blocos")
entrar("financeiro")
ir("/emporio/financeiro")
confere("a casa abre", caminho() == "/emporio/financeiro" and tem("O dinheiro das lojas hoje"), caminho())
for bloco in ["Posição de caixa", "Vence hoje a pagar", "Vence hoje a receber", "Fiado vencido"]:
    confere("o bloco " + bloco + " aparece", tem(bloco), texto_principal(300))
confere("as quatro abas existem", all(aba(h) for h in ["/emporio/financeiro", "/emporio/financeiro/pagar", "/emporio/financeiro/receber", "/emporio/financeiro/caixa"]))
hoje_api = api("GET", "/api/v1/emporio/finance/today")
posicoes = ((hoje_api["body"] or {}).get("data") or {}).get("positions") or []
confere("a rota today devolve posicoes (a conta entre elas)", hoje_api["status"] == 200 and any(p.get("kind") == "conta" for p in posicoes), [hoje_api["status"], len(posicoes)])
confere("a tela lista a conta Fin Conta", tem("Fin Conta"), texto_principal(600))
lojas_fin = lista_da_api("/api/v1/emporio/establishments")
loja_fin = next((l for l in lojas_fin if l.get("name") == LOJA1), None)
ir("/emporio/financeiro?loja=" + (loja_fin or {}).get("id", ""))
confere("filtrada pela Loja 1, a casa mostra a conta a pagar vencida (Fin Fornecedor, R$ 100,00)", esperar(lambda: tem("Fin Fornecedor") and tem("R$ 100,00"), 30), texto_principal(1500))
confere("e o fiado vencido de R$ 30,00, de 1 cliente atrasado", tem("1 cliente atrasado") and tem("R$ 30,00"), texto_principal(1500))
confere("e o cheque de R$ 50,00 e o cartão de R$ 98,00 (2% de R$ 100,00) a receber hoje", tem("Cheques (1 cheque)") and tem("R$ 50,00") and tem("R$ 98,00"), texto_principal(1500))

# --- 2 ---------------------------------------------------------------------------------
passo("2. Sem Vender nem Equipe no menu; /dashboard volta para a casa")
links = menu()
confere("o menu tem o Financeiro", any(h and h.startswith("/emporio/financeiro") for h in links), links)
confere("o menu nao tem Vender", "/emporio/vender" not in links, links)
confere("o menu nao tem Equipe", "/emporio/equipe" not in links, links)
# O redirect do servidor e absoluto e pode apontar para outra porta (a do AUTH_URL):
# por isso o destino se le com fetch, sem levar a aba para la.
import http.client
_c = CTX["cookies"]["financeiro"]
_h = urllib.parse.urlparse(BASE)
_con = http.client.HTTPConnection(_h.hostname, _h.port, timeout=120)
_con.request("GET", "/dashboard", headers={"Cookie": _c["nome"] + "=" + _c["valor"]})
_r = _con.getresponse()
destino = urllib.parse.urlparse(_r.getheader("Location") or "").path
confere("/dashboard volta para a casa do Financeiro (cabecalho Location do redirect)", _r.status in (302, 303, 307, 308) and destino == "/emporio/financeiro", [_r.status, destino])
_con.close()
ir("/emporio/vender")
confere("/emporio/vender nao vende para o Financeiro (volta para a casa ou diz que o perfil so consulta)", not tem("Total da venda") and (caminho() == "/emporio/financeiro" or tem("Seu perfil só consulta o Empório")), caminho())

# --- 3 e 4 -----------------------------------------------------------------------------
passo("3 e 4. Paga a conta da compra pela conta bancaria; a gaveta nao e opcao")
conta = achar_por_nome("/api/v1/emporio/bank-accounts", "Fin Conta")
confere("a Fin Conta existe pela API", bool(conta), conta)
conta_id = (conta or {}).get("id", "")
antes = extrato(conta_id).get("closing_balance")
confere("o extrato da conta responde", isinstance(antes, (int, float)), antes)

ir("/emporio/financeiro/pagar")
confere("a aba A pagar mostra a conta da compra", esperar(lambda: tem(FORNECEDOR), 30), texto_principal(600))
confere("a conta e marcada e o painel Pagar contas abre", abrir_pagar())
opcoes = opcoes_de("De onde sai o dinheiro")
confere("o seletor abre com opcoes", bool(opcoes), opcoes)
confere("ha a conta bancaria entre as origens", any(o.startswith("Conta: Fin Conta") for o in (opcoes or [])), opcoes)
confere("nao ha gaveta entre as origens (passo 4)", not any(o.startswith("Gaveta") for o in (opcoes or [])), opcoes)
confere("escolhe a Fin Conta", escolher_opcao_que_comeca_com("Conta: Fin Conta"))
enviar_painel()
confere("o painel fechou (pagou)", esperar(lambda: not painel_aberto(), 60), erro_do_campo("De onde sai o dinheiro"))
depois = esperar(lambda: (extrato(conta_id).get("closing_balance") or 0) < (antes or 0) - 99, 30) and extrato(conta_id).get("closing_balance")
confere("o saldo da conta caiu R$ 100,00", isinstance(depois, (int, float)) and abs((antes - depois) - 100) < 0.005, [antes, depois])
linhas = extrato(conta_id).get("lines") or []
confere("o extrato tem a saida 'Conta paga' de 100", any(l.get("description") == "Conta paga" and l.get("direction") == "saida" and abs(l.get("amount", 0) - 100) < 0.005 for l in linhas), [l.get("description") for l in linhas])
ir("/emporio/financeiro/caixa?conta=" + conta_id)
confere("a tela mostra o extrato da Fin Conta", esperar(lambda: tem("Extrato: Fin Conta"), 30), texto_principal(300))
confere("a tela mostra a linha Conta paga", tem("Conta paga"), texto_principal(1500))

# --- 5 ---------------------------------------------------------------------------------
passo("5. Recebe um fiado por Pix e a linha aparece no extrato")
cliente = achar_por_nome("/api/v1/emporio/customers?q=" + urllib.parse.quote(CLIENTE), CLIENTE)
lojas = lista_da_api("/api/v1/emporio/establishments")
loja1 = next((l for l in lojas if l.get("name") == LOJA1), None)
confere("o Financeiro enxerga o cliente e a loja pela API", bool(cliente) and bool(loja1), [bool(cliente), bool(loja1)])
r = api("POST", "/api/v1/emporio/receivables/receive", {
    "operation_key": "viva-fin-casa-pix-" + SUFIXO,
    "customer_id": (cliente or {}).get("id"),
    "establishment_id": (loja1 or {}).get("id"),
    "amount": 30,
    "kind": "pix",
    "bank_account_id": conta_id,
})
confere("o Pix de R$ 30,00 e recebido (201)", r["status"] in (200, 201), r)
r2 = api("POST", "/api/v1/emporio/receivables/receive", {
    "operation_key": "viva-fin-casa-din-" + SUFIXO,
    "customer_id": (cliente or {}).get("id"),
    "establishment_id": (loja1 or {}).get("id"),
    "amount": 1,
    "kind": "dinheiro",
})
confere("em dinheiro o Financeiro e recusado (422 no campo kind)", r2["status"] == 422 and ((r2["body"] or {}).get("error") or {}).get("field") == "kind", r2)
linhas = extrato(conta_id).get("lines") or []
confere("o extrato tem a entrada 'Fiado recebido' de 30", any(l.get("description") == "Fiado recebido" and l.get("direction") == "entrada" and abs(l.get("amount", 0) - 30) < 0.005 for l in linhas), [l.get("description") for l in linhas])
ir("/emporio/financeiro/caixa?conta=" + conta_id)
confere("a tela do extrato mostra Fiado recebido", esperar(lambda: tem("Fiado recebido"), 30), texto_principal(1500))
ir("/emporio/financeiro/receber")
confere("A receber abre com o fiado, os cheques e os cartoes", tem("Fin Cliente") or tem("Nenhum fiado") or tem("fiado"), texto_principal(800))
confere("o cheque bom para hoje esta listado (R$ 50,00)", tem("9001") or tem("R$ 50,00"), texto_principal(1500))

# --- 6 ---------------------------------------------------------------------------------
passo("6. O Gestor lanca compra a vista da gaveta e o movimento aparece em Caixa")
entrar("gestor")
ir("/emporio/compras")
confere("Compras abre para o Gestor", caminho() == "/emporio/compras", caminho())
fornecedores = lista_da_api("/api/v1/emporio/suppliers?q=Fin")
fornecedor = next((f for f in fornecedores if f.get("name") == FORNECEDOR), None)
produto = next((p for p in lista_da_api("/api/v1/emporio/products?q=Fin") if p.get("name") == "Fin Ração"), None)
apresentacao = ((api("GET", "/api/v1/emporio/products/" + (produto or {}).get("id", ""))["body"] or {}).get("data") or {}).get("presentations", [{}])[0].get("id")
confere("o Gestor acha fornecedor e produto", bool(fornecedor) and bool(produto) and bool(apresentacao), [bool(fornecedor), bool(produto), apresentacao])
r = api("POST", "/api/v1/emporio/purchases", {
    "operation_key": "viva-fin-casa-vista-" + SUFIXO,
    "establishment_id": (loja1 or {}).get("id"),
    "supplier_id": (fornecedor or {}).get("id"),
    "purchased_at": datetime.datetime.utcnow().isoformat() + "Z",
    "received": True,
    "items": [{"emporio_product_id": (produto or {}).get("id"), "presentation_id": apresentacao, "quantity": 5, "item_total": 50}],
    "payment": {"kind": "a_vista", "paid_from": {"establishment_id": (loja1 or {}).get("id")}},
})
confere("a compra a vista da gaveta e gravada (201)", r["status"] in (200, 201), r)
sem_origem = api("POST", "/api/v1/emporio/purchases", {
    "operation_key": "viva-fin-casa-sem-origem-" + SUFIXO,
    "establishment_id": (loja1 or {}).get("id"),
    "supplier_id": (fornecedor or {}).get("id"),
    "purchased_at": datetime.datetime.utcnow().isoformat() + "Z",
    "received": True,
    "items": [{"emporio_product_id": (produto or {}).get("id"), "presentation_id": apresentacao, "quantity": 1, "item_total": 10}],
    "payment": {"kind": "a_vista"},
})
confere("a vista sem de onde saiu o dinheiro e recusada (422 paid_from)", sem_origem["status"] == 422 and ((sem_origem["body"] or {}).get("error") or {}).get("field") == "paid_from", sem_origem)
ir("/emporio/caixa")
confere("Caixa abre para o Gestor", caminho() == "/emporio/caixa", caminho())
confere("o movimento da compra aparece em Caixa, saindo R$ 50,00", esperar(lambda: tem("- R$ 50,00"), 30), texto_principal(400))
# O rotulo da origem: hoje a tela mostra o texto cru se ORIGEM_CAIXA_ROTULO nao o conhece.
confere("a origem do movimento tem rotulo em portugues (nao 'pagamento_compra' cru)", not tem("pagamento_compra") and tem("Pagamento de compra"))
ir("/emporio/compras")


def preencher_aria(aria, valor):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const el = raiz.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def escolher_por_aria(aria, opcao):
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


def esc():
    js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(1)


confere("abre Nova compra", esperar(lambda: clicar("Nova compra") and esperar(painel_aberto, 5), 60))
time.sleep(1.5)
confere("escolhe o produto", escolher_por_aria("Produto do item 1", "Fin Ração") is True)
confere("o valor total do item e 10", preencher_aria("Valor total do item 1", "10") != "SEM CAMPO")
time.sleep(1)
confere("a vista com valor pede De onde saiu o dinheiro", js("((document.querySelector('[role=dialog]') || {}).innerText || '').includes('De onde saiu o dinheiro')"))
opcoes_compra = opcoes_de("De onde saiu o dinheiro") or []
confere("o Gestor tem a gaveta da loja entre as origens", "Gaveta da loja" in opcoes_compra, opcoes_compra)
esc()
esc()

# --- 7 ---------------------------------------------------------------------------------
passo("7. O Financeiro do Tibe e so da fazenda")
entrar("owner")
# Uma conta a prazo do Emporio, pendente, para o Dono tentar pagar pelo Tibe.
r = api("POST", "/api/v1/emporio/purchases", {
    "operation_key": "viva-fin-casa-prazo-" + SUFIXO,
    "establishment_id": (loja1 or {}).get("id"),
    "supplier_id": (fornecedor or {}).get("id"),
    "purchased_at": datetime.datetime.utcnow().isoformat() + "Z",
    "received": False,
    "items": [{"emporio_product_id": (produto or {}).get("id"), "presentation_id": apresentacao, "quantity": 1, "item_total": 77}],
    "payment": {"kind": "a_prazo", "due_date": (HOJE + datetime.timedelta(days=5)).isoformat() + "T12:00:00Z"},
})
compra_id = ((r["body"] or {}).get("data") or {}).get("id")
confere("a compra a prazo de R$ 77,00 e gravada", r["status"] in (200, 201) and bool(compra_id), r)
pendentes = lista_da_api("/api/v1/emporio/payables?status=pending&limit=500")
conta_do_emporio = next((c for c in pendentes if c.get("purchase_id") == compra_id), None)
confere("o Empório lista essa conta a pagar", bool(conta_do_emporio), len(pendentes))
entrada_id = (conta_do_emporio or {}).get("entry_id", "")

ir("/financeiro")
confere("o Financeiro do Tibe abre", caminho() == "/financeiro", caminho())
confere("a conta do Empório (Fin Fornecedor) nao esta no Financeiro do Tibe", not tem(FORNECEDOR) and not tem("R$ 77,00"), texto_principal(300))
seletor_de_area = js("Array.from(document.querySelectorAll('main button, main a, main [role=tab], main [role=option], main select option')).some(e => ['Empório', 'Fazenda', 'Tudo'].includes(e.innerText.trim()))")
confere("nao ha seletor de area (Fazenda, Empório, Tudo)", not seletor_de_area)
tibe = api("GET", "/api/v1/financial-entries?per_page=200")["body"] or {}
ids = [e.get("id") for e in (tibe.get("data") or [])]
confere("a API do Tibe nao lista a conta do Empório", bool(entrada_id) and entrada_id not in ids, [entrada_id, len(ids)])
pg = api("PATCH", "/api/v1/financial-entries/" + entrada_id + "/pay", {})
erro = (pg["body"] or {}).get("error") or {}
confere("pagar a conta do Empório pelo Tibe e recusado (422 ENTRY_DO_EMPORIO)", pg["status"] == 422 and erro.get("code") == "ENTRY_DO_EMPORIO", pg)
pendente = [c for c in lista_da_api("/api/v1/emporio/payables?status=pending&limit=500") if c.get("entry_id") == entrada_id]
confere("a conta segue pendente no Empório", len(pendente) == 1, pendente)

# --- 8 ---------------------------------------------------------------------------------
passo("8. A 390 px: as quatro abas sem rolagem horizontal")
entrar("financeiro")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
ir("/emporio/financeiro")
sem_rolagem("Hoje")
ir("/emporio/financeiro/pagar")
sem_rolagem("A pagar")
ir("/emporio/financeiro/receber")
sem_rolagem("A receber")
ir("/emporio/financeiro/caixa?conta=" + conta_id)
sem_rolagem("Posição de caixa com o extrato")
cdp("Emulation.clearDeviceMetricsOverride")

# --- 9 ---------------------------------------------------------------------------------
passo("9. Adiar e cancelar conta pedem dinheiro; conta nova, extrato por lugar, orcamento e Historico")


def botoes_com_texto(rotulo):
    return js("Array.from(document.querySelectorAll('main button')).filter(b => b.innerText.trim() === " + repr(rotulo) + ").length") or 0


def valor_apos(texto, rotulo):
    """O primeiro 'R$ ...' que vem depois de `rotulo` no texto."""
    import re
    achado = re.search(re.escape(rotulo) + r"\s*(-?R\$\s*[\d.]+,\d{2})", texto)
    return achado.group(1) if achado else None


def clicar_ver_extrato_de(nome, tipo):
    """Clica o link 'Ver extrato' da linha da tabela cujo texto tem `nome` e `tipo` (Gaveta, Com a gerência)."""
    return js("(() => { const l = Array.from(document.querySelectorAll('main tbody tr')).find(r => { const t = r.innerText.replace(/\\u00a0/g, ' '); return t.includes(" + repr(nome) + ") && t.includes(" + repr(tipo) + "); }); const a = l && l.querySelector('a'); if (!a) return false; a.click(); return true; })()")


def saldo_da_linha(nome, tipo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main tbody tr')).find(r => { const t = r.innerText.replace(/\\u00a0/g, ' '); return t.includes(" + repr(nome) + ") && t.includes(" + repr(tipo) + "); }); const c = l && l.querySelectorAll('td')[1]; return c ? c.innerText.replace(/\\u00a0/g, ' ').trim() : null; })()")


entrar("gestor")
ir("/emporio/despesas")
confere("o Gestor ve a lista de contas a pagar (Fin Fornecedor)", esperar(lambda: tem(FORNECEDOR), 30), texto_principal(400))
confere("o Gestor NAO tem o botao Adiar", botoes_com_texto("Adiar") == 0, botoes_com_texto("Adiar"))
confere("o Gestor NAO tem o botao Cancelar", botoes_com_texto("Cancelar") == 0, botoes_com_texto("Cancelar"))

entrar("financeiro")
ir("/emporio/financeiro/pagar")
confere("o Financeiro ve a conta em A pagar", esperar(lambda: tem(FORNECEDOR), 30), texto_principal(400))
confere("o Financeiro tem o botao Adiar", esperar(lambda: botoes_com_texto("Adiar") > 0, 20), botoes_com_texto("Adiar"))
confere("o Financeiro tem o botao Cancelar", botoes_com_texto("Cancelar") > 0, botoes_com_texto("Cancelar"))

ir("/emporio/caixa")
confere("o Financeiro tem o botao de nova conta bancaria em Caixa", esperar(lambda: botoes_com_texto("Nova conta") > 0, 30), caminho() + " " + texto_principal(300))

ir("/emporio/financeiro/caixa")
confere("a Posicao de caixa lista a gaveta da Fin Loja 1", esperar(lambda: saldo_da_linha(LOJA1, "Gaveta") is not None, 30), texto_principal(600))
saldo_gaveta = saldo_da_linha(LOJA1, "Gaveta")
confere("clica Ver extrato na gaveta", clicar_ver_extrato_de(LOJA1, "Gaveta") is True)
confere("o extrato abre com o cabecalho 'Gaveta: Fin Loja 1'", esperar(lambda: tem("Gaveta: " + LOJA1), 40), texto_principal(500))
fechamento = valor_apos(texto_do_main(), "Saldo de fechamento:")
confere("o fechamento do extrato da gaveta e igual ao saldo da tabela", fechamento is not None and fechamento == saldo_gaveta, [fechamento, saldo_gaveta])
saldo_gerencia = saldo_da_linha(LOJA1, "Com a gerência")
confere("clica Ver extrato na linha Com a gerencia", clicar_ver_extrato_de(LOJA1, "Com a gerência") is True)
confere("o extrato abre com 'Com a gerência: Fin Loja 1'", esperar(lambda: tem("Com a gerência: " + LOJA1), 40), texto_principal(500))
fechamento_g = valor_apos(texto_do_main(), "Saldo de fechamento:")
confere("o fechamento do extrato da gerencia e igual ao saldo da tabela", fechamento_g is not None and fechamento_g == saldo_gerencia, [fechamento_g, saldo_gerencia])

orcamentos = lista_da_api("/api/v1/emporio/quotes?situacao=todos&limit=200")
orcamento = next((o for o in orcamentos if o.get("loja") == LOJA1), None)
confere("o Financeiro lista um orcamento pela API", bool(orcamento), len(orcamentos))
ir("/emporio/orcamentos/" + (orcamento or {}).get("id", "sem-id"))
confere("o orcamento abre para o Financeiro (nao e 404)", caminho().startswith("/emporio/orcamentos/") and not eh_404() and tem("Orçamento") and tem(LOJA1), caminho() + " " + texto_principal(300))

ir("/emporio/historico")
confere("o Historico abre para o Financeiro", caminho() == "/emporio/historico", caminho())
confere("o Historico tem 'Pagou a compra' citando Fin Fornecedor", esperar(lambda: tem("Pagou a compra de " + FORNECEDOR), 30), texto_principal(1500))

fim()
