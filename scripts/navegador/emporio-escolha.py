# Validacao viva do plano 2 da Frente 2 do Meu Empório (Modulo 39, plano
# 2026-11-06, a escolha do cliente e do fornecedor; spec
# docs/specs/module-39-meu-emporio.md, Q199 a Q204): a janela "Escolher
# cliente" busca no servidor, e a Compra escolhe o fornecedor do mesmo jeito.
#
#   1. Vender sem cliente: os dois botões; a janela traz o Consumidor final no
#      topo, com "Cliente padrão" e o aviso.
#   2. `8761` (o meio do telefone, atravessando o hífen) acha só a Maria Souza.
#   3. `1234` e `9987` acham a Maria Souza.
#   4. `12`: a frase dos poucos dígitos, nenhuma linha além do Consumidor final.
#   5. Review Focus 4, a corrida: `m`, `ma`, ... `maria` sem pausa e logo
#      `3333`; e, com a resposta de `maria` presa e solta DURANTE a espera do
#      termo novo, a lista velha não aparece e o Enter não escolhe ninguém.
#   6. Escolher a Maria Souza e vender: a venda sai com o nome dela.
#   7. Trocar para o Consumidor final e marcar Fiado: a recusa fica no campo.
#   8. "Não achou? Cadastrar novo": o cadastro abre com o nome digitado.
#   9. O Gestor na Compra: sem Consumidor final, a propriedade com o selo, e a
#      recusa velha de Vencimento não volta ao trocar de fornecedor.
#  10. Clientes: o filtro `1234` acha a Maria Souza.
#  11. A 390 px: Vender com a janela aberta, sem rolagem horizontal.
#
# cenario: scripts/_cenario-emporio-escolha.ts
# sessao: vendedor escolha-vendedor@teste.local
# sessao: gestor escolha-gestor@teste.local

import urllib.parse

LOJA = "Escolha Loja"
RACAO = "Escolha Ração"
MARIA_SOUZA = "Escolha Maria Souza"
MARIA_SOUSA = "Escolha Maria Sousa"
AGRO = "Escolha Agropecuária Central"
FAZENDA = "Escolha Fazenda Boa Vista"
PEDRO = "Pedro Escolha"
POUCOS = "Digite pelo menos 3 números para buscar por CPF/CNPJ ou telefone."
TELEFONE_DA_MARIA = "(34) 99876-1234"
SET = "(el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }"
JANELA = "document.querySelector('[data-escolha=cliente]')"


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def no_painel(texto):
    return texto.lower() in (js("((document.querySelector('[role=dialog]') || {}).innerText || '').replace(/\\u00a0/g, ' ')") or "").lower()


def preencher_aria(aria, valor):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const el = raiz.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; (" + SET + ")(el, " + repr(valor) + "); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Fechar a venda')); if (b) b.click(); })()")


def campo_existe(rotulo):
    return bool(js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return !!(l && document.getElementById(l.htmlFor)); })()"))


def campo_no_painel(rotulo):
    return bool(js("(() => { const d = document.querySelector('[role=dialog]'); return !!d && Array.from(d.querySelectorAll('label')).some(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); })()"))


def texto_do_campo(rotulo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText.replace(/\\u00a0/g, ' ') : 'SEM CAMPO'; })()") or ""


def valor_do_campo(rotulo):
    return js("(() => { const d = document.querySelector('[role=dialog]'); const l = d && Array.from(d.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.value : 'SEM CAMPO'; })()") or ""


def linha_da_tabela(trecho):
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


def esc():
    js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(1)


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


def abrir_painel(rotulo):
    """O clique antes da hidratacao nao abre nada: repete ate o painel aparecer."""
    fim_em = time.time() + 60
    while time.time() < fim_em:
        if clicar(rotulo) and esperar(painel_aberto, 6):
            time.sleep(1)
            return True
        time.sleep(2)
    return False


def abrir_janela():
    """Abre a janela Escolher cliente e espera a primeira lista (o termo vazio)."""
    aberta = False
    for _ in range(15):
        if clicar("Escolher cliente") and esperar(lambda: js("!!" + JANELA), 5):
            aberta = True
            break
        time.sleep(2)
    if aberta:
        esperar(lambda: not js(JANELA + ".innerText.includes('Buscando...')"), 30)
    return aberta


def digitar(termo):
    js("(() => { const el = " + JANELA + ".querySelector('input[type=search]'); (" + SET + ")(el, " + repr(termo) + "); })()")


def esperar_lista():
    """Espera a busca terminar (a espera de 300 ms, o pedido e a resposta)."""
    time.sleep(0.8)
    esperar(lambda: not js(JANELA + ".innerText.includes('Buscando...')"), 30)
    time.sleep(0.3)


def nomes_da_lista():
    """Os nomes das linhas da busca, sem a linha fixa do Consumidor final."""
    return js("Array.from(" + JANELA + ".querySelectorAll('[data-opcao]:not([data-fixo])')).map(b => b.dataset.nome)") or []


def nomes_do_cenario():
    """Os nomes da lista que sao deste cenario (prefixo Escolha): a conta do seed
    tem clientes de outros cenarios, que tambem tem 3333 no telefone."""
    return [n for n in nomes_da_lista() if n.startswith("Escolha ")]


def texto_da_janela():
    return js("(" + JANELA + " || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def adicionar_racao(quantidade):
    confere("busca " + RACAO, preencher_aria("Buscar produto", "Escolha Ra") != "SEM CAMPO")
    confere("adiciona " + RACAO, esperar(lambda: clicar_resultado(RACAO), 15))
    confere("a quantidade é " + quantidade, preencher_aria("Quantidade do item 1", quantidade) != "SEM CAMPO")


def abrir_balcao():
    ir("/emporio/vender")
    confere("o balcão abre", caminho() == "/emporio/vender" and tem("Total da venda"), caminho())
    if campo_existe("Loja") and LOJA not in texto_do_campo("Loja"):
        confere("escolhe " + LOJA, escolher("Loja", LOJA) is True)


# --- 1 ---------------------------------------------------------------------------------
passo("1. Vender sem cliente: os dois botões e a janela com o Consumidor final no topo")
entrar("vendedor")
abrir_balcao()
confere("o quadro diz Nenhum cliente escolhido", tem("Nenhum cliente escolhido."))
confere("o botão Cadastrar novo cliente existe", bool(js("Array.from(document.querySelectorAll('main button')).some(b => b.innerText.trim() === 'Cadastrar novo cliente')")))
confere("abre a janela Escolher cliente", abrir_janela())
fixo = js("(() => { const b = " + JANELA + ".querySelector('[data-fixo]'); return b ? b.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""
confere("o Consumidor final está no topo, com Cliente padrão", "Consumidor final" in fixo and "Cliente padrão" in fixo, fixo)
confere("o aviso do Consumidor final", "Não vale para fiado, cheque nem entrega." in fixo, fixo)
confere("a linha fixa é a primeira da janela", bool(js("(() => { const o = " + JANELA + ".querySelector('[data-opcao]'); return !!o && o.hasAttribute('data-fixo'); })()")))

# --- 2 ---------------------------------------------------------------------------------
passo("2. 8761, o meio do telefone, atravessando o hífen")
digitar("8761")
esperar_lista()
confere("só a Maria Souza", nomes_da_lista() == [MARIA_SOUZA], nomes_da_lista())
t = texto_da_janela()
confere("mostra o telefone mascarado", TELEFONE_DA_MARIA in t, t[:300])
confere("mostra o CPF mascarado", "556.315.002-05" in t, t[:300])
confere("mostra a última compra", "Última compra" in t and "R$ 50,00" in t, t[:300])

# --- 3 ---------------------------------------------------------------------------------
passo("3. 1234 e depois 9987: a Maria Souza nas duas")
digitar("1234")
esperar_lista()
confere("1234 acha a Maria Souza", MARIA_SOUZA in nomes_da_lista(), nomes_da_lista())
digitar("9987")
esperar_lista()
confere("9987 acha a Maria Souza", MARIA_SOUZA in nomes_da_lista(), nomes_da_lista())

# --- 4 ---------------------------------------------------------------------------------
passo("4. 12: a frase dos poucos dígitos, nenhuma linha além do Consumidor final")
digitar("12")
esperar_lista()
confere("a frase dos poucos dígitos", POUCOS in texto_da_janela(), texto_da_janela()[:300])
confere("nenhuma linha além do Consumidor final", nomes_da_lista() == [], nomes_da_lista())
confere("o Consumidor final continua no topo", bool(js("!!" + JANELA + ".querySelector('[data-fixo]')")))

# --- 5 ---------------------------------------------------------------------------------
passo("5. Review Focus 4: a corrida da digitação")
digitar("")
esperar_lista()
# 5a. Sem pausa: m, ma, mar, mari, maria, e logo 3333. Só a Maria Sousa (sem CPF) fica.
js("(() => { const el = " + JANELA + ".querySelector('input[type=search]'); for (const t of ['m', 'ma', 'mar', 'mari', 'maria', '3333']) (" + SET + ")(el, t); })()")
esperar_lista()
confere("5a: a lista final é só a Maria Sousa (do cenário)", nomes_do_cenario() == [MARIA_SOUSA], nomes_da_lista())
confere("5a: a Maria Sousa sai com sem CPF/CNPJ", "sem CPF/CNPJ" in texto_da_janela(), texto_da_janela()[:300])
# 5b. A resposta de `maria` fica presa no fetch e é solta DURANTE a espera de 300 ms
# do `3333` (cuja resposta também demora 3 s). Lida aos 700 ms: a lista velha não pode
# aparecer como atual, o Buscando... continua, e o Enter não escolhe ninguém.
digitar("")
esperar_lista()
js("(() => { const orig = window.fetch.bind(window); window.__presas = []; window.fetch = (u, o) => { const p = orig(u, o); const url = String(u); if (url.includes('customers/search') && url.includes('q=maria')) { return p.then(r => new Promise(res => { window.__presas.push(() => res(r)); })); } if (url.includes('customers/search') && url.includes('q=3333')) { return p.then(r => new Promise(res => setTimeout(() => res(r), 3000))); } return p; }; })()")
js("(() => { const el = " + JANELA + ".querySelector('input[type=search]'); for (const t of ['m', 'ma', 'mar', 'mari', 'maria']) (" + SET + ")(el, t); })()")
time.sleep(1.2)
confere("5b: o pedido de maria saiu e está preso", js("window.__presas.length") == 1, js("window.__presas.length"))
leitura = js("new Promise(done => { const j = " + JANELA + "; const el = j.querySelector('input[type=search]'); (" + SET + ")(el, '3333'); setTimeout(() => window.__presas.forEach(f => f()), 100); setTimeout(() => { const velha = Array.from(j.querySelectorAll('[data-opcao]:not([data-fixo])')).some(b => (b.dataset.nome || '').includes('Souza')); const buscando = j.innerText.includes('Buscando...'); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); done({ termo: el.value, velha, buscando }); }, 700); })")
print("   na hora do Enter:", leitura)
time.sleep(1)
aberta = bool(js("!!" + JANELA))
confere("5b: a lista de maria não aparece como atual", not leitura["velha"], leitura)
confere("5b: o Buscando... continua durante a busca do termo novo", leitura["buscando"], leitura)
confere("5b: o Enter não escolheu ninguém", aberta and escolhido() == "", escolhido())
esperar(lambda: nomes_do_cenario() == [MARIA_SOUSA], 30)
confere("5b: depois da resposta do termo novo, só a Maria Sousa (do cenário)", nomes_do_cenario() == [MARIA_SOUSA], nomes_da_lista())
# Controle: com a lista do termo digitado pronta e um resultado só, o Enter escolhe.
digitar("33335678")
esperar_lista()
confere("5b: o controle tem um resultado só", nomes_da_lista() == [MARIA_SOUSA], nomes_da_lista())
js("document.querySelector('[data-escolha=cliente] input[type=search]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))")
confere("5b: Enter com um resultado do termo digitado escolhe", esperar(lambda: MARIA_SOUSA in escolhido(), 10), escolhido())

# O piscar da lista (so observado, sem confere): digita devagar, uma tecla por vez,
# depois de uma lista pronta, e anota quantas linhas a lista tem a cada 40 ms.
ir("/emporio/vender")
abrir_janela()
digitar("maria")
esperar_lista()
amostra = js("new Promise(done => { const j = " + JANELA + "; const el = j.querySelector('input[type=search]'); const quadros = []; const t0 = Date.now(); const id = setInterval(() => { quadros.push(j.querySelectorAll('[data-opcao]:not([data-fixo])').length + (j.innerText.includes('Buscando...') ? 'B' : '')); }, 40); const teclas = ['maria ', 'maria s', 'maria so']; teclas.forEach((t, i) => setTimeout(() => (" + SET + ")(el, t), 300 + i * 450)); setTimeout(() => { clearInterval(id); done(quadros); }, 2400); })")
print("   linhas por quadro de 40 ms (B = Buscando...):", " ".join(amostra or []))

# --- 6 ---------------------------------------------------------------------------------
passo("6. Escolher a Maria Souza e vender: a venda sai com o nome dela")
abrir_balcao()
adicionar_racao("2")
confere("escolhe a Maria Souza pela busca do telefone", escolher_cliente(MARIA_SOUZA, "8761") is True)
q = escolhido()
confere("o quadro mostra o nome", MARIA_SOUZA in q, q)
confere("o quadro mostra o telefone", TELEFONE_DA_MARIA in q, q)
confere("o quadro mostra o documento", "556.315.002-05" in q, q)
confere("o quadro tem Trocar", "Trocar" in q, q)
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("o valor em dinheiro é 40", preencher_aria("Valor em Dinheiro (R$)", "40") != "SEM CAMPO")
enviar_venda()
confere("a venda é registrada", esperar(lambda: tem("Venda registrada"), 60), texto_principal(200))
confere("o resumo cita o cliente", tem("cliente " + MARIA_SOUZA))

# --- 7 ---------------------------------------------------------------------------------
passo("7. Trocar para o Consumidor final e marcar Fiado: a recusa fica no campo Cliente")
abrir_balcao()
adicionar_racao("1")
confere("escolhe a Maria Souza", escolher_cliente(MARIA_SOUZA, "8761") is True)
confere("troca para o Consumidor final", escolher_cliente("Consumidor final") is True)
confere("o quadro mostra o Consumidor final", "Consumidor final" in escolhido(), escolhido())
confere("adiciona o fiado", clicar("+ Fiado"))
time.sleep(1)
confere("o valor do fiado é 20", preencher_aria("Valor em Fiado (R$)", "20") != "SEM CAMPO")
enviar_venda()
recusa = esperar(lambda: erro_do_campo("Cliente"))
confere("a recusa do Fiado fica embaixo do campo Cliente", "Fiado precisa do cliente de verdade" in (recusa or ""), recusa)
confere("nenhuma venda foi registrada", not tem("Venda registrada"))

# --- 8 ---------------------------------------------------------------------------------
passo("8. Não achou? Cadastrar novo: o cadastro abre com o nome digitado")
abrir_balcao()
confere("abre a janela", abrir_janela())
digitar(PEDRO)
esperar_lista()
confere("Pedro Escolha ainda não existe", nomes_da_lista() == [], nomes_da_lista())
confere("clica em Não achou? Cadastrar novo", clicar("Não achou? Cadastrar novo"))
confere("o cadastro abre com o nome preenchido", esperar(lambda: valor_do_campo("Nome") == PEDRO, 20), valor_do_campo("Nome"))
confere("a janela de busca fechou", not js("!!" + JANELA))
confere("escolhe Pessoa física", clicar("Pessoa física"))
confere("preenche o telefone", preencher("Telefone", "34991112222") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Telefone"))
confere("o quadro mostra o Pedro", esperar(lambda: PEDRO in escolhido(), 20), escolhido())
confere("o quadro mostra o telefone dele", "(34) 99111-2222" in escolhido(), escolhido())

# --- 9 ---------------------------------------------------------------------------------
passo("9. O Gestor na Compra: o fornecedor por busca, sem Consumidor final")
entrar("gestor")
ir("/emporio/compras")
confere("abre Nova compra", abrir_painel("Nova compra"))
confere("sem fornecedor, o quadro está vazio", no_painel("Nenhum fornecedor escolhido."), escolhido("fornecedor"))
confere("escolhe o produto", escolher_por_aria("Produto do item 1", RACAO) is True)
confere("a quantidade é 3", preencher_aria("Quantidade do item 1", "3") != "SEM CAMPO")
confere("o valor total é 15", preencher_aria("Valor total do item 1", "15") != "SEM CAMPO")

# Prova do item 3: a recusa de Vencimento de um fornecedor de fora não volta velha
# depois de passar pelo fornecedor de propriedade.
confere("escolhe o fornecedor de fora pela busca", escolher_fornecedor(AGRO, "agropecuaria") is True)
confere("o quadro mostra o fornecedor de fora", AGRO in escolhido("fornecedor"), escolhido("fornecedor"))
confere("escolhe a forma A prazo", escolher("Forma de pagamento", "A prazo") is True)
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Vencimento"))
confere("sem vencimento, a recusa fica embaixo do Vencimento", "Informe quando a conta vence." in (recusa or ""), recusa)
confere("troca para a propriedade", escolher_fornecedor(FAZENDA, "boa vista") is True)
confere("a forma de pagamento some com a propriedade", not campo_no_painel("Forma de pagamento"))
confere("troca de volta para o de fora", escolher_fornecedor(AGRO, "agropecuaria") is True)
confere("a forma de pagamento volta, ainda A prazo", campo_no_painel("Forma de pagamento") and campo_no_painel("Vencimento"))
confere("a recusa velha do Vencimento NÃO volta", erro_do_campo("Vencimento") == "", erro_do_campo("Vencimento"))

# A janela do fornecedor: sem Consumidor final, com o selo da propriedade.
confere("abre a janela Trocar fornecedor", clicar("Trocar") and esperar(lambda: js("!!document.querySelector('[data-escolha=fornecedor]')"), 15))
esperar(lambda: not js("document.querySelector('[data-escolha=fornecedor]').innerText.includes('Buscando...')"), 30)
confere("sem linha fixa de Consumidor final", not js("!!document.querySelector('[data-escolha=fornecedor] [data-fixo]')") and "Consumidor final" not in (js("document.querySelector('[data-escolha=fornecedor]').innerText") or ""))
js("(() => { const el = document.querySelector('[data-escolha=fornecedor] input[type=search]'); (" + SET + ")(el, 'boa vista'); })()")
esperar(lambda: js("Array.from(document.querySelectorAll('[data-escolha=fornecedor] [data-opcao]')).some(b => b.dataset.nome === " + repr(FAZENDA) + ")"), 30)
linha = js("(() => { const b = Array.from(document.querySelectorAll('[data-escolha=fornecedor] [data-opcao]')).find(x => x.dataset.nome === " + repr(FAZENDA) + "); return b ? b.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""
confere("boa vista acha a propriedade, com o selo", "Propriedade" in linha, linha)
js("Array.from(document.querySelectorAll('[data-escolha=fornecedor] [data-opcao]')).find(x => x.dataset.nome === " + repr(FAZENDA) + ").click()")
confere("escolhida a propriedade, o quadro a mostra", esperar(lambda: FAZENDA in escolhido("fornecedor"), 10), escolhido("fornecedor"))
confere("sem forma de pagamento", not campo_no_painel("Forma de pagamento"))
esc()

# --- 10 --------------------------------------------------------------------------------
passo("10. Clientes: o filtro 1234 acha a Maria Souza")
ir("/emporio/clientes")
confere("a tela Clientes abre", caminho() == "/emporio/clientes" and tem("Quem compra no Empório"), caminho())
confere("o filtro tem o rótulo Buscar cliente", preencher_aria("Buscar cliente", "1234") == "1234")
confere("clica em Buscar", clicar("Buscar"))
confere("a lista acha a Maria Souza", esperar(lambda: MARIA_SOUZA in linha_da_tabela(MARIA_SOUZA), 30), linha_da_tabela(MARIA_SOUZA))
confere("a URL leva o 1234", esperar(lambda: "q=1234" in (js("location.search") or ""), 10), js("location.search"))

# --- 11 --------------------------------------------------------------------------------
passo("11. A 390 px: Vender com a janela aberta, sem rolagem horizontal")
entrar("vendedor")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
abrir_balcao()
confere("abre a janela a 390 px", abrir_janela())
digitar("maria")
esperar_lista()
time.sleep(1)
largura = js("[document.documentElement.scrollWidth, innerWidth]")
confere("Vender com a janela aberta: sem rolagem horizontal", largura is not None and largura[0] <= largura[1], largura)
confere("a janela não passa da largura da tela", (js(JANELA + ".scrollWidth") or 999) <= 390)
esc()
cdp("Emulation.clearDeviceMetricsOverride")

fim()
