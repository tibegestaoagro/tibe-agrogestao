# Validacao viva do granel em qualquer peso e do atacado na mesma saca (Modulo 39, Q319 a Q324):
# docs/superpowers/specs/2026-11-13-emporio-granel-e-atacado-design.md
#
#   1. Produto A (saca de 15 kg), dono: "Converter para quilo" abre a previa (1 saca = 15 kg, saldo 10 -> 150,
#      custo / 15, GRANEL 0,068 -> 1,02 kg com "confira", a saca 1 -> 15); converter, o botao some
#   2. Ainda no A: criar "300 g" (0,3 kg) pela tela com preco, vender 1 no balcao; o estoque mostra
#      9 sacas fechadas e 14,7 kg avulsos (a saca abriu)
#   3. Produto C (saca de 15 kg): a apresentacao de 1 kg pelo conteudo e recusada embaixo do campo,
#      e a recusa manda converter o produto (Q322)
#   4. Produto B (quilo, "Saca 40 kg" e "ATACADO" de 40 kg): o estoque mostra UMA linha de 40 kg com os dois
#      nomes; vender 1 em ATACADO passa (9); vender 3 "Quilo" abre uma saca (8 fechadas + 37 kg)
#   5. Contagem do B: um campo so para o tamanho de 40 kg, rotulado com os dois nomes; contar 5
#   6. Cadastro de produto novo: escolher saca mostra a dica "Vai vender fracionado"
#   7. Transferencia do B: um tamanho so (sem escolha de apresentacao), 1 saca sai da origem
#
#   8. Produto D (quilo novo, Saca 40 kg e Quilo, SEM movimento): "Estoque inicial" mostra o campo do lacrado
#      (vem do cadastro), implanta 5 sacas e 10 kg (210 kg), vende 1 Saca 40 kg (4 fechadas), e a contagem
#      abre pre-preenchida com 4
#
# cenario: scripts/_cenario-emporio-granel.ts
# sessao: owner owner@example.com

LOJA = "Gr Loja"
LOJA2 = "Gr Loja 2"
PROD_A = "Gr Ração 15kg"
PROD_B = "Gr Farelo 40kg"
PROD_C = "Gr Milho C 15kg"
PROD_D = "Gr Farelo Novo 40kg"
DOIS_NOMES = "Saca 40 kg / ATACADO"


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def texto_do_painel():
    return js("((document.querySelector('[role=dialog]') || { innerText: '' }).innerText).replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ')") or ""


def texto_do_campo(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document.querySelector('main'); const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? (el.value !== undefined && el.tagName === 'INPUT' ? el.value : el.innerText.replace(/\\u00a0/g, ' ')) : 'SEM CAMPO'; })()") or ""


def linhas_do_painel():
    """As linhas das tabelas do painel aberto, cada uma como 'celula | celula'."""
    return js("Array.from(document.querySelectorAll('[role=dialog] tbody tr')).map(r => Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim()).join(' | '))") or []


def linha_da_tabela(trecho):
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


def linha_por_celulas(primeira, segunda):
    """A linha cujas duas primeiras celulas sao exatamente estas (a tabela de precos: loja e apresentacao)."""
    return "(() => Array.from(document.querySelectorAll('main tbody tr')).find(r => r.children.length > 1 && r.children[0].innerText.trim() === " + repr(primeira) + " && r.children[1].innerText.trim() === " + repr(segunda) + "))()"


def clicar_editar_preco(loja, apresentacao):
    return bool(js("(() => { const r = " + linha_por_celulas(loja, apresentacao) + "; const b = r && Array.from(r.querySelectorAll('button')).find(x => x.innerText.trim() === 'Editar'); if (!b) return false; b.click(); return true; })()"))


def clicar_no_cartao_da_loja(rotulo):
    """Clica no botao `rotulo` do cartao de estoque da Gr Loja (nao da Gr Loja 2) na tela do produto."""
    return bool(js("(() => { const h = Array.from(document.querySelectorAll('main h3')).find(x => x.innerText.trim().startsWith('Gr Loja') && !x.innerText.trim().startsWith('Gr Loja 2')); const c = h && h.closest('div.space-y-3'); const b = c && Array.from(c.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def texto_do_cartao_da_loja():
    return js("(() => { const h = Array.from(document.querySelectorAll('main h3')).find(x => x.innerText.trim().startsWith('Gr Loja') && !x.innerText.trim().startsWith('Gr Loja 2')); const c = h && h.closest('div.space-y-3'); return c ? c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' | ') : ''; })()") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = Array.from(document.querySelectorAll('input')).find(x => x.getAttribute('aria-label') === " + repr(aria) + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def campos_de_embalagem():
    """Os aria-label dos campos 'Embalagens de ...' do painel aberto."""
    return js("Array.from(document.querySelectorAll('[role=dialog] input')).map(x => x.getAttribute('aria-label') || '').filter(x => x.startsWith('Embalagens de'))") or []


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def abrir_select_aria(aria):
    """Abre o Select (Radix) cujo gatilho tem o aria-label e devolve o texto das opcoes. A lista fica aberta."""
    xy = _centro("Array.from(document.querySelectorAll('button[role=combobox]')).find(x => x.getAttribute('aria-label') === " + repr(aria) + ")")
    if not xy:
        return None
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    return js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.replace(/\\u00a0/g, ' ').trim())") or []


def escolher_aria(aria, opcao):
    ops = abrir_select_aria(aria)
    if ops is None:
        return "SEM CAMPO"
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(opcao) + ")")
    if not xy:
        return "SEM OPCAO " + str(ops)
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def tem_gatilho_aria(aria):
    return bool(js("Array.from(document.querySelectorAll('button[role=combobox]')).some(x => x.getAttribute('aria-label') === " + repr(aria) + ")"))


def id_de(nome):
    for p in api("GET", "/api/v1/emporio/products?q=Gr")["body"]["data"]:
        if p["name"] == nome:
            return p["id"]
    return ""


def lojas_do_cenario():
    return {l["name"]: l["id"] for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"].startswith("Gr ")}


def vender_no_balcao(produto, busca, apresentacao, qtd, total):
    """Vende `qtd` do produto na apresentacao, em dinheiro, no balcao da Gr Loja. Devolve se a venda saiu."""
    ir("/emporio/vender")
    confere("o balcão abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
    from_loja = js("(() => { const l = Array.from(document.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === 'Loja'); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText : ''; })()") or ""
    if from_loja.strip() != LOJA:
        confere("escolhe " + LOJA, escolher("Loja", LOJA) is True, from_loja)
    confere("busca " + produto, preencher_aria("Buscar produto", busca) != "SEM CAMPO")
    confere("adiciona " + produto, bool(esperar(lambda: clicar_resultado(produto), 15)))
    ops = abrir_select_aria("Apresentação do item 1")
    print("   apresentações do item: " + str(ops))
    if ops is not None:
        # a lista ficou aberta: escolhe sem reabrir
        xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(apresentacao) + ")")
        confere("a apresentação " + apresentacao + " está na lista do balcão", xy is not None, ops)
        if xy:
            click_at_xy(xy[0], xy[1])
            time.sleep(0.8)
    confere("a quantidade do item 1 é " + qtd, preencher_aria("Quantidade do item 1", qtd) != "SEM CAMPO")
    confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
    confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
    time.sleep(1)
    confere("o valor em dinheiro é " + total, preencher_aria("Valor em Dinheiro (R$)", total) != "SEM CAMPO")
    confere("fecha a venda", enviar_botao("Fechar a venda"))
    saiu = esperar(lambda: tem("Venda registrada") or tem("não há fechado") or tem("Estoque insuficiente") or tem("recusad"), 60)
    ok_ = tem("Venda registrada")
    if not ok_:
        print("   tela depois de Fechar: " + texto_principal(700))
    return bool(ok_)


def linha_do_estoque(loja_id, produto):
    ir("/emporio/estoque?loja=" + loja_id)
    return esperar(lambda: linha_da_tabela(produto), 20) or ""


# --- Dono -----------------------------------------------------------------------------------------------------------
entrar("owner")
ir("/emporio/produtos")
time.sleep(2)
LOJAS = lojas_do_cenario()
confere("o cenário existe (as duas lojas Gr)", LOJA in LOJAS and LOJA2 in LOJAS, list(LOJAS.keys()))
ID_LOJA = LOJAS.get(LOJA, "")
A = id_de(PROD_A)
B = id_de(PROD_B)
C = id_de(PROD_C)
confere("os três produtos do cenário existem", bool(A and B and C), [A, B, C])

# --- 1. Converter o A ------------------------------------------------------------------------------------------------
passo("1. Produto A em saca de 15 kg: Converter para quilo, com prévia")
ir("/emporio/produtos/" + A)
confere("a tela do produto A abre", caminho() == "/emporio/produtos/" + A and tem(PROD_A), texto_principal(200))
confere("o produto está em saca: 'vendido por saca' e o conteúdo de 15 kg", tem("vendido por saca") and tem("15 kg"), texto_principal(300))
confere("abre 'Converter para quilo'", bool(esperar(lambda: clicar("Converter para quilo"), 30)))
time.sleep(1)
confere("o painel abriu", painel_aberto())
confere("a prévia chega", bool(esperar(lambda: "1 saca = 15 kg" in texto_do_painel(), 30)), texto_do_painel()[:400])
painel = texto_do_painel()
print("   painel: " + painel[:900])
confere("a prévia diz '1 saca = 15 kg'", "1 saca = 15 kg" in painel, painel[:300])
linhas = linhas_do_painel()
print("   linhas: " + str(linhas))
loja_l = [x for x in linhas if x.startswith(LOJA + " |")]
confere("estoque da Gr Loja: saldo 10 sc -> 150 kg, custo R$ 90,00 -> R$ 6,00", bool(loja_l) and "10 sc | 150 kg | R$ 90,00 | R$ 6,00" in loja_l[0], loja_l)
confere("custo de referência R$ 90,00 por saca passa a R$ 6,00 por quilo", "R$ 90,00 por saca passa a R$ 6,00 por quilo" in painel, painel[:600])
gr = [x for x in linhas if x.startswith("GRANEL")]
confere("GRANEL: 0,068 sc -> 1,02 kg com a marca confira", bool(gr) and "0,068 sc | 1,02 kg" in gr[0] and "confira" in gr[0].lower(), gr)
sc = [x for x in linhas if x.startswith("Saca 15 kg")]
confere("Saca 15 kg: 1 sc -> 15 kg, sem confira", bool(sc) and "1 sc | 15 kg" in sc[0] and "confira" not in sc[0].lower(), sc)
enviar_painel()
confere("converte: o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("o botão Converter some", bool(esperar(lambda: not tem("Converter para quilo") and not tem("Converter para"), 30)), texto_principal(300))
pagina = texto_do_main()
confere("o produto passa a quilo (vendido por quilo) e perde o conteúdo", ("vendido por quilo" in pagina.lower() or "vendido por quilograma" in pagina.lower()) and "vendido por saca" not in pagina.lower(), pagina[:300])
la = linha_da_tabela("Saca 15 kg")
confere("a Saca 15 kg agora vale 15 kg e segue fechada", "15 kg | Fechada" in la, la)

# --- 2. 300 g no A -----------------------------------------------------------------------------------------------------
passo("2. A: apresentação de 300 g pela tela, com preço, e venda de 1")
confere("abre Nova apresentação", bool(esperar(lambda: clicar("Nova apresentação"), 20)))
time.sleep(1.5)
confere("o painel abriu", painel_aberto())
confere("o campo agora é 'Vale quanto (kg)'", texto_do_campo("Vale quanto (kg)") != "SEM CAMPO", texto_do_painel()[:200])
confere("nome 300 g", preencher("Nome", "300 g") not in ("SEM ROTULO", "SEM CAMPO"))
confere("vale 0,3", preencher("Vale quanto (kg)", "0,3") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:200])
l300 = esperar(lambda: linha_da_tabela("300 g"), 30)
confere("a apresentação aparece como 0,3 kg Avulsa", bool(l300) and "0,3 kg" in l300 and "Avulsa" in l300, l300)
confere("abre o preço de 300 g na Gr Loja", bool(esperar(lambda: clicar_editar_preco(LOJA, "300 g"), 30)))
time.sleep(1.5)
confere("o painel de preço abriu", painel_aberto())
confere("preço 5", preencher("Preço (R$)", "5") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o preço salvou", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:200])
res_a = vender_no_balcao(PROD_A, "Gr Ra", "300 g", "1", "5")
confere("a venda de 1 x 300 g sai (a saca abre sozinha)", res_a, texto_principal(300))
la_ = linha_do_estoque(ID_LOJA, PROD_A)
print("   estoque A: " + la_)
cel = la_.split(" | ")
confere("A na Gr Loja: 149,7 kg no total, 9 sacas fechadas e 14,7 kg avulsos", len(cel) > 3 and cel[1] == "149,7 kg" and cel[2] == "9 × Saca 15 kg" and cel[3] == "14,7 kg", la_)

# --- 3. Recusa da Q322 no C ----------------------------------------------------------------------------------------------
passo("3. C em saca de 15 kg: 1 kg pelo conteúdo é recusado e manda converter")
ir("/emporio/produtos/" + C)
confere("a tela do C abre", caminho() == "/emporio/produtos/" + C and tem(PROD_C), texto_principal(200))
confere("abre Nova apresentação", bool(esperar(lambda: clicar("Nova apresentação"), 20)))
time.sleep(1.5)
confere("o painel abriu", painel_aberto())
confere("o campo é 'Quanto (em kg)' (produto em saca com conteúdo)", texto_do_campo("Quanto (em kg)") != "SEM CAMPO", texto_do_painel()[:200])
confere("nome Gr Quilo C", preencher("Nome", "Gr Quilo C") not in ("SEM ROTULO", "SEM CAMPO"))
confere("quanto 1", preencher("Quanto (em kg)", "1") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Quanto (em kg)"), 30)
print("   recusa: " + str(recusa))
confere("a recusa aparece embaixo do campo e fala em converter o produto", bool(recusa) and "converta o produto" in recusa.lower(), recusa)
confere("o painel continua aberto", painel_aberto())

# --- 4. Atacado no B -----------------------------------------------------------------------------------------------------------
passo("4. B: Saca 40 kg e ATACADO dividem o estoque")
lb = linha_do_estoque(ID_LOJA, PROD_B)
print("   estoque B: " + lb)
cel = lb.split(" | ")
confere("UMA linha de 40 kg com os dois nomes e 10 sacas (400 kg)", len(cel) > 3 and cel[1] == "400 kg" and cel[2] == "10 × " + DOIS_NOMES, lb)
confere("só uma embalagem na linha (nada de duas contagens)", lb.count(" × ") == 1, lb)
res_at = vender_no_balcao(PROD_B, "Gr Fa", "ATACADO", "1", "110")
confere("vender 1 em ATACADO (implantado em Saca 40 kg) passa", res_at, texto_principal(300))
lb = linha_do_estoque(ID_LOJA, PROD_B)
print("   estoque B depois do ATACADO: " + lb)
cel = lb.split(" | ")
confere("o estoque vai a 9 sacas (360 kg)", len(cel) > 3 and cel[1] == "360 kg" and cel[2] == "9 × " + DOIS_NOMES, lb)
res_q = vender_no_balcao(PROD_B, "Gr Fa", "Quilo", "3", "12")
confere("vender 3 Quilo passa", res_q, texto_principal(300))
lb = linha_do_estoque(ID_LOJA, PROD_B)
print("   estoque B depois dos 3 Quilo: " + lb)
cel = lb.split(" | ")
confere("abre uma saca: 8 fechadas e 37 kg avulsos (357 kg)", len(cel) > 3 and cel[1] == "357 kg" and cel[2] == "8 × " + DOIS_NOMES and cel[3] == "37 kg", lb)

# --- 5. Contagem do B --------------------------------------------------------------------------------------------------------------
passo("5. Contagem do B: um campo por tamanho")
ir("/emporio/produtos/" + B)
confere("a tela do B abre", caminho() == "/emporio/produtos/" + B and tem(PROD_B), texto_principal(200))
cartao = texto_do_cartao_da_loja()
print("   cartão da Gr Loja: " + cartao[:300])
confere("o cartão da Gr Loja mostra Lacrado: 8 × Saca 40 kg / ATACADO", ("8 × " + DOIS_NOMES) in cartao, cartao[:300])
confere("abre Contar estoque da Gr Loja", bool(esperar(lambda: clicar_no_cartao_da_loja("Contar estoque"), 20)))
time.sleep(1.5)
confere("o painel abriu", painel_aberto())
campos = campos_de_embalagem()
print("   campos de embalagem: " + str(campos))
confere("um campo só para o tamanho de 40 kg, rotulado com os dois nomes", campos == ["Embalagens de " + DOIS_NOMES], campos)
confere("conta 5 embalagens", preencher_aria("Embalagens de " + DOIS_NOMES, "5") != "SEM CAMPO")
confere("motivo", preencher("Motivo", "Conferência do roteiro") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("a contagem fecha o painel", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:300])
lb = linha_do_estoque(ID_LOJA, PROD_B)
print("   estoque B depois da contagem: " + lb)
cel = lb.split(" | ")
confere("o saldo do tamanho está em 5 (e o avulso segue 37 kg)", len(cel) > 3 and cel[2] == "5 × " + DOIS_NOMES and cel[3] == "37 kg", lb)

# --- 6. Cadastro novo --------------------------------------------------------------------------------------------------------------
passo("6. Novo produto em saca: a dica do fracionado")
ir("/emporio/produtos")
confere("abre Novo produto", bool(esperar(lambda: clicar("Novo produto"), 30)))
time.sleep(1.5)
confere("o painel abriu", painel_aberto())
confere("sem unidade escolhida, a dica não aparece", "Vai vender fracionado" not in texto_do_painel(), texto_do_painel()[:200])
confere("escolhe a unidade Saca", escolher("Unidade-base", "Saca") is True)
dica = texto_do_painel()
confere("a dica 'Vai vender fracionado' aparece", "Vai vender fracionado" in dica, dica[:500])
confere("a dica manda cadastrar em quilo e a saca como embalagem fechada", "Cadastre em quilo" in dica and "embalagem fechada" in dica, dica[:600])

# --- 7. Transferência do B ---------------------------------------------------------------------------------------------------------
passo("7. Transferência do B: um tamanho, uma escolha")
ir("/emporio/transferencias")
confere("abre Nova transferência", bool(esperar(lambda: clicar("Nova transferência"), 30)))
time.sleep(1.5)
confere("o painel abriu", painel_aberto())
confere("loja de origem " + LOJA, escolher("Loja de origem", LOJA) is True)
confere("loja de destino " + LOJA2, escolher("Loja de destino", LOJA2) is True)
confere("escolhe o produto " + PROD_B, escolher_aria("Produto do item 1", PROD_B) is True)
time.sleep(1)
confere("o estado do item é Lacrado", "Lacrado" in texto_do_painel(), texto_do_painel()[:400])
confere("com um tamanho só (40 kg) não há escolha de apresentação (antes eram duas opções iguais)", not tem_gatilho_aria("Apresentação do item 1"), texto_do_painel()[:400])
confere("quantidade 1 embalagem", preencher_aria("Quantidade do item 1", "1") != "SEM CAMPO")
confere("envia a transferência", enviar_botao("Enviar transferência"))
confere("a transferência fecha o painel (sem recusa)", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:300])
lb = linha_do_estoque(ID_LOJA, PROD_B)
print("   estoque B depois da transferência: " + lb)
cel = lb.split(" | ")
confere("a Gr Loja ficou com 4 sacas (5 contadas menos 1 enviada)", len(cel) > 3 and cel[2] == "4 × " + DOIS_NOMES, lb)

# --- 8. Produto novo sem nenhum movimento (D) -----------------------------------------------------------------------------------
passo("8. D (quilo novo, Saca 40 kg e Quilo, sem movimento): o campo do lacrado vem do cadastro")
D = id_de(PROD_D)
confere("o produto D existe", bool(D), D)
ir("/emporio/produtos/" + D)
confere("a tela do D abre", caminho() == "/emporio/produtos/" + D and tem(PROD_D), texto_principal(200))
cartao = texto_do_cartao_da_loja()
print("   cartão da Gr Loja (D): " + cartao[:300])
confere("o cartão da Gr Loja do D existe e o estoque ainda é zero", bool(cartao), cartao[:300])
confere("abre 'Estoque inicial' da Gr Loja", bool(esperar(lambda: clicar_no_cartao_da_loja("Estoque inicial"), 20)))
time.sleep(1.5)
confere("o painel abriu", painel_aberto())
campos = campos_de_embalagem()
print("   campos de embalagem do D: " + str(campos))
confere("existe o campo do lacrado de 40 kg (vem do cadastro, sem saldo)", campos == ["Embalagens de Saca 40 kg"], campos)
confere("implanta 5 sacas", preencher_aria("Embalagens de Saca 40 kg", "5") != "SEM CAMPO")
confere("e 10 kg avulsos", preencher("Avulso (kg)", "10") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("a implantação fecha o painel (sem recusa)", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:300])
ld = linha_do_estoque(ID_LOJA, PROD_D)
print("   estoque D depois de implantar: " + ld)
confere("o estoque mostra 210 kg | 5 × Saca 40 kg | 10 kg", ld.startswith("Gr Farelo Novo 40kg | 210 kg | 5 × Saca 40 kg | 10 kg"), ld)
res_d = vender_no_balcao(PROD_D, "Gr Farelo N", "Saca 40 kg", "1", "120")
confere("vender 1 Saca 40 kg do D passa", res_d, texto_principal(300))
ld = linha_do_estoque(ID_LOJA, PROD_D)
print("   estoque D depois da venda: " + ld)
cel = ld.split(" | ")
confere("o D fica com 4 sacas fechadas (170 kg)", len(cel) > 3 and cel[1] == "170 kg" and cel[2] == "4 × Saca 40 kg" and cel[3] == "10 kg", ld)
ir("/emporio/produtos/" + D)
confere("a tela do D reabre", caminho() == "/emporio/produtos/" + D and tem(PROD_D), texto_principal(200))
confere("abre Contar estoque da Gr Loja (D)", bool(esperar(lambda: clicar_no_cartao_da_loja("Contar estoque"), 20)))
time.sleep(1.5)
confere("o painel de contagem abriu", painel_aberto())
pre = js("(() => { const el = Array.from(document.querySelectorAll('[role=dialog] input')).find(x => x.getAttribute('aria-label') === 'Embalagens de Saca 40 kg'); return el ? el.value : 'SEM CAMPO'; })()")
print("   campo do lacrado na contagem do D: " + str(pre))
confere("a contagem do D vem pré-preenchida com 4 no lacrado", str(pre).strip() == "4", pre)

fim()
