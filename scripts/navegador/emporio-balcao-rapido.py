# Validacao viva do balcao rapido do Meu Emporio (Modulo 39, frente D, Q357 a Q361):
# docs/superpowers/specs/2026-11-18-emporio-balcao-rapido-design.md
#
# Teclas REAIS pelo CDP (Input.dispatchKeyEvent), nunca dispatchEvent de JS. As barras sao conferidas contra uma
# codificacao EAN escrita aqui, independente da do app (tabelas L, G e R e a paridade do primeiro digito).
#
#   1. Cadastro: codigo oficial digitado e salvo; "Gerar codigo" preenche "20..." (13 digitos, verificador certo);
#      o Enter no campo nao envia o painel; codigo repetido recusa embaixo do campo nomeando o dono; digito errado recusa
#   2. Balcao com leitor: o codigo da SEGUNDA apresentacao entra na segunda; de novo soma 1; com itens e pagamento
#      completo o Enter nao fecha a venda; 12 digitos (UPC-A) casa; desconhecido avisa; sem preco avisa; a busca fica
#      limpa e com o foco
#   3. Atalhos: F2, F4 (Escolher e Trocar), F8, F9 e Ctrl+Enter com o foco num campo de texto; Ctrl+Enter recusa
#      incompleto e fecha completo; painel aberto: nada age; legenda a 1280 px
#   4. Configuracoes: a secao e do Dono (o Gestor nao a ve); tecla repetida recusa no campo da segunda; grade que nao cabe
#      recusa no campo; "Voltar ao padrao"; Alt+1 no lugar do F2 passa a valer SEM escrever "1" e o F2 deixa de agir;
#      legenda desligada some
#   5. Etiquetas: lista com preco da loja, "sem preco" desabilitado, "sem codigo"; Selecionar todas
#   6. Impressao: A4 medido em mm (margens, passo das colunas e das linhas, "comecar na etiqueta nº 5"), rolo 40 x 25 mm,
#      barras decodificadas do SVG contra o EAN independente; capturas em alta resolucao
#      Aviso de barras que nao cabem: no painel (rolo 40 x 15 avisa, 40 x 25 nao) e na escolha das etiquetas
#   7. Celular (390 px): sem rolagem horizontal nas Etiquetas e nas Configuracoes; sem legenda no balcao
#   8. Sobras da 5.25: desarquivar com o codigo tomado (recusa na tela), editar o codigo pelo botao Editar, F8 como
#      Caixa, o Gestor abre as Etiquetas, mais de 2000 etiquetas avisa o teto
#
# cenario: scripts/_cenario-emporio-balcao-rapido.ts
# sessao: owner owner@example.com
# sessao: gestor br-gestor@teste.local
# sessao: caixa br-caixa@teste.local
import json
import re
import base64

LOJA = "Br Loja 1"
SCRATCH = r"C:\Users\dilto\AppData\Local\Temp\claude\78673c3e58596bf8\0853c334-cdbe-4cc2-88f9-860a06ec0b1b\scratchpad"
ROTULO_CODIGO = "Código de barras (opcional)"

# --- o EAN, escrito de novo aqui (nao importa nada do app) --------------------------------------------------------------
_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
_R = ["".join("1" if b == "0" else "0" for b in c) for c in _L]
_PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]


def digito_ean(sem_digito):
    soma = sum(int(c) * (3 if (len(sem_digito) - 1 - i) % 2 == 0 else 1) for i, c in enumerate(sem_digito))
    return (10 - soma % 10) % 10


def ean_valido(codigo):
    return codigo.isdigit() and len(codigo) in (8, 13) and digito_ean(codigo[:-1]) == int(codigo[-1])


def ean_modulos(codigo):
    d = [int(c) for c in codigo]
    if len(codigo) == 13:
        esq = "".join((_L if _PARIDADE[d[0]][i] == "L" else _G)[d[i + 1]] for i in range(6))
        return "101" + esq + "01010" + "".join(_R[n] for n in d[7:]) + "101"
    esq = "".join(_L[n] for n in d[:4])
    return "101" + esq + "01010" + "".join(_R[n] for n in d[4:]) + "101"


def com_digito(prefixo):
    return prefixo + str(digito_ean(prefixo))


CODIGO_NOVO = com_digito("789100010099")  # EAN-13 oficial valido, livre no cenario
CODIGO_ERRADO = CODIGO_NOVO[:-1] + str((int(CODIGO_NOVO[-1]) + 1) % 10)
MILHO_PACOTE = "7891000100103"  # Br Milho, Pacote 1 kg (R$ 10), a padrao
MILHO_SACO = "5901234123457"  # Br Milho, Saco 25 kg (R$ 200)
UPC12 = "036000291452"  # Br Americano, gravado como 0036000291452
SEM_PRECO = "9780201379624"  # Br Caro, sem preco na loja
DESCONHECIDO = "1234567890128"

# --- helpers ----------------------------------------------------------------------------------------------------------
_api_da_lib = api


def api(metodo, caminho_, corpo=None):
    """A `api` da lib, repetida quando o next dev recarrega a pagina no meio do fetch."""
    for tentativa in range(6):
        try:
            return _api_da_lib(metodo, caminho_, corpo)
        except RuntimeError as e:
            if "navigated or closed" not in str(e) or tentativa == 5:
                raise
            time.sleep(6)


def caminho():
    return js("location.pathname + location.search") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText") or ""


def tem(texto):
    return texto.lower() in texto_do_main().lower()


def tecla(key, code, vk, mods=0, texto=None):
    """Uma tecla de verdade: keyDown (com `texto` quando a tecla escreve algo) e keyUp. mods: 1 Alt, 2 Ctrl."""
    base = dict(key=key, code=code, windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk, modifiers=mods)
    if texto is not None:
        cdp("Input.dispatchKeyEvent", type="keyDown", text=texto, unmodifiedText=texto, **base)
    else:
        cdp("Input.dispatchKeyEvent", type="rawKeyDown", **base)
    cdp("Input.dispatchKeyEvent", type="keyUp", **base)
    time.sleep(0.15)


def f(n):
    tecla("F" + str(n), "F" + str(n), 111 + n)


def enter():
    tecla("Enter", "Enter", 13, 0, "\r")


def ctrl_enter():
    tecla("Enter", "Enter", 13, 2, "\r")


def alt(digito):
    tecla(digito, "Digit" + digito, ord(digito), 1, digito)


def escape():
    tecla("Escape", "Escape", 27)


def digitar(texto):
    for c in texto:
        tecla(c, "Digit" + c if c.isdigit() else "Key" + c.upper(), ord(c.upper()), 0, c)


def em_foco():
    """O que tem o foco: data-atalho, id, aria-label ou o texto do botao."""
    return js("(() => { const a = document.activeElement; if (!a || a === document.body) return 'body'; return [a.getAttribute('data-atalho') || '', a.id || '', a.getAttribute('aria-label') || '', (a.tagName === 'BUTTON' ? a.innerText.trim() : '')].join('|'); })()") or ""


def focar_busca():
    js("document.querySelector('input[data-atalho=busca]').focus()")
    time.sleep(0.3)


def busca_valor():
    return js("(document.querySelector('input[data-atalho=busca]') || { value: 'SEM CAMPO' }).value")


def focar_seletor(seletor):
    return js("(() => { const el = document.querySelector(" + repr(seletor) + "); if (!el) return false; el.focus(); return true; })()")


def valor_de(seletor):
    return js("(document.querySelector(" + repr(seletor) + ") || { value: 'SEM CAMPO' }).value")


def definir(seletor, valor):
    """Atribui pelo setter nativo (para campo que o roteiro NAO esta testando por teclado)."""
    return js("(() => { const el = document.querySelector(" + repr(seletor) + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def itens_do_balcao():
    """[produto, apresentacao, quantidade] de cada linha."""
    return js("Array.from(document.querySelectorAll('input[aria-label^=\"Quantidade do item\"]')).map(el => { const card = el.closest('.space-y-2'); const nome = card.querySelector('p.font-medium'); const ap = card.querySelector('button[aria-label^=\"Apresentação do item\"]'); const p1 = card.querySelector('p.text-xs'); return [nome ? nome.innerText : '', ap ? ap.innerText.trim() : (p1 ? p1.innerText.trim() : ''), el.value]; })") or []


def vendas_da_loja(loja_id):
    r = api("GET", "/api/v1/emporio/sales?limit=500&establishment_id=" + loja_id)
    return len((r["body"] or {}).get("data") or [])


def avisos():
    return js("Array.from(document.querySelectorAll('[role=status]')).map(s => s.innerText.replace(/\\s+/g, ' ')).join(' || ')") or ""


def tela(largura, altura, escala=1, movel=False):
    cdp("Emulation.setDeviceMetricsOverride", width=largura, height=altura, deviceScaleFactor=escala, mobile=movel)


def rolagem_horizontal():
    return js("[document.documentElement.scrollWidth, window.innerWidth]")


def legenda():
    """As teclas dos atalhos, hoje junto do campo que cada uma aciona (onda 3 da UX, §5.7: a legenda do rodape saiu).
    None se nao ha tecla nenhuma no DOM; senao [texto, ok]: o texto e 'acao tecla' de cada uma, e ok e verdadeiro so
    quando TODAS estao visiveis E vizinhas do proprio campo (busca, grupo Cliente, rotulo Vendedor, primeira forma de
    pagamento, botao de fechar)."""
    return js("(() => { const ks = Array.from(document.querySelectorAll('kbd[data-tecla-de]')); if (!ks.length) return null; const junto = { produto: '[data-atalho=\"busca\"]', cliente: '[role=\"group\"][aria-label=\"Cliente\"]', vendedor: 'label[for=\"seller_user_id\"]', pagamento: '[data-atalho=\"forma-de-pagamento\"]', fechar: '[data-atalho=\"fechar\"]' }; const ok = ks.every(k => getComputedStyle(k).display !== 'none' && k.getBoundingClientRect().width > 0 && !!k.parentElement.querySelector(junto[k.dataset.teclaDe])); return [ks.map(k => k.dataset.teclaDe + ' ' + k.textContent.trim()).join(' | '), ok]; })()")


def rotulo_comeca(prefixo):
    """O id do campo cujo <label> comeca com `prefixo` (no painel aberto, se houver)."""
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim().startsWith(" + repr(prefixo) + ")); return l ? l.htmlFor : ''; })()") or ""


def clicar_no_painel(rotulo):
    return bool(js("(() => { const d = document.querySelector('[role=dialog]'); const b = d && Array.from(d.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def abrir_painel_por(clicar_fn, segundos=60):
    fim_em = time.time() + segundos
    while time.time() < fim_em:
        if painel_aberto():
            time.sleep(1)
            return True
        clicar_fn()
        if esperar(painel_aberto, 6):
            time.sleep(1)
            return True
    return False


def fechar_painel_por_botao():
    js("(() => { const d = document.querySelector('[role=dialog]'); if (!d) return; const b = Array.from(d.querySelectorAll('button')).find(x => x.getAttribute('aria-label') === 'Close' || x.innerText.trim() === 'Fechar' || x.innerText.trim() === 'Cancelar'); if (b) b.click(); })()")
    esperar(lambda: not painel_aberto(), 10)
    time.sleep(0.5)


def campo_em_foco_rotulo():
    return js("(() => { const a = document.activeElement; if (!a || !a.id) return ''; const l = document.querySelector('label[for=\"' + a.id + '\"]'); return l ? l.innerText.replace('*','').trim() : ''; })()") or ""


def na_pagina_do_balcao(loja_nome=LOJA):
    """Abre o balcao, escolhe a loja e espera o campo de busca."""
    ir("/emporio/vender")
    escolher("Loja", loja_nome)
    return bool(esperar(lambda: js("!!document.querySelector('input[data-atalho=busca]')"), 30))


def ler_codigo(codigo):
    """Simula o leitor: foca a busca, digita o codigo com teclas reais e manda Enter."""
    focar_busca()
    digitar(codigo)
    enter()
    time.sleep(0.8)


# --- decodificacao das barras do SVG, independente do app --------------------------------------------------------------
def barras_do_svg(seletor_svg):
    """Para cada SVG: [codigo (do aria-label), modulos decodificados dos retangulos, n de modulos]."""
    bruto = js("Array.from(document.querySelectorAll(" + repr(seletor_svg) + ")).map(s => ({ aria: s.getAttribute('aria-label'), vb: s.getAttribute('viewBox'), rects: Array.from(s.querySelectorAll('rect')).filter(r => r.getAttribute('fill') === '#000').map(r => [parseFloat(r.getAttribute('x')), parseFloat(r.getAttribute('width'))]) }))") or []
    saida = []
    for s in bruto:
        codigo = s["aria"].replace("Código de barras ", "")
        rects = s["rects"]
        m = min(w for _, w in rects)
        quieta_esq = 11 if len(codigo) == 13 else 7
        fim = max(round((x + w) / m) for x, w in rects)
        n = fim - quieta_esq
        mods = ["0"] * n
        for x, w in rects:
            i = round(x / m) - quieta_esq
            for k in range(round(w / m)):
                mods[i + k] = "1"
        saida.append([codigo, "".join(mods), n])
    return saida


def mm(px):
    return px * 25.4 / 96


def retangulos_a4():
    """Para cada folha, as etiquetas posicionadas, em mm relativos a folha: [left, top, w, h, coluna, linha]."""
    bruto = js("Array.from(document.querySelectorAll('.etq-a4')).map(folha => { const f = folha.getBoundingClientRect(); return Array.from(folha.querySelectorAll('.pos')).map(p => { const r = p.getBoundingClientRect(); const e = p.querySelector('.etq').getBoundingClientRect(); return [r.left - f.left, r.top - f.top, e.width, e.height, f.width, f.height]; }); })") or []
    return [[[round(mm(v), 2) for v in e] for e in folha] for folha in bruto]


def captura(arquivo, largura, altura, alvo):
    """Captura PNG em alta resolucao (deviceScaleFactor 3) do elemento `alvo` (seletor)."""
    tela(largura, altura, 3, False)
    # O indicador do next dev (portal fixo no canto) entraria na imagem: so existe em desenvolvimento.
    js("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())")
    time.sleep(1.5)
    caixa = js("(() => { const el = document.querySelector(" + repr(alvo) + "); el.scrollIntoView({ block: 'start' }); const r = el.getBoundingClientRect(); return [r.left + window.scrollX, r.top + window.scrollY, r.width, r.height]; })()")
    r = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=True, clip={"x": caixa[0], "y": caixa[1], "width": caixa[2], "height": caixa[3], "scale": 1})
    with open(SCRATCH + "\\" + arquivo, "wb") as fh:
        fh.write(base64.b64decode(r["data"]))
    tela(1280, 900, 1, False)
    return caixa


# --- montagem ----------------------------------------------------------------------------------------------------------
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
cdp("Page.enable")
entrar("owner")
tela(1280, 900)
ir("/emporio")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
l1 = next((x for x in lojas if x["name"] == LOJA), None)
confere("acha a loja do cenario pela API", l1 is not None, len(lojas))
LOJA_ID = l1["id"] if l1 else ""
produtos = api("GET", "/api/v1/emporio/products?limit=500")["body"]["data"]
lista = produtos if isinstance(produtos, list) else (produtos.get("items") or produtos.get("products") or [])
CADASTRO = next((p for p in lista if p["name"] == "Br Cadastro"), None)
confere("acha o produto Br Cadastro pela API", CADASTRO is not None, len(lista))
CADASTRO_ID = CADASTRO["id"] if CADASTRO else ""


def apresentacoes_do_cadastro():
    d = api("GET", "/api/v1/emporio/products/" + CADASTRO_ID)["body"]["data"]
    return {a["name"]: a.get("barcode") for a in d["presentations"]}


# --- 1 ------------------------------------------------------------------------------------------------------------------
passo("1. Cadastro: codigo oficial, Gerar codigo, Enter nao envia, repetido e digito errado")
ir("/emporio/produtos/" + CADASTRO_ID)
confere("a pagina do produto abre", tem("Br Cadastro"), caminho())
antes = apresentacoes_do_cadastro()
confere("o produto parte com so a apresentacao sem codigo", antes == {"Pacote 1 kg": None}, antes)

confere("abre o painel 'Nova apresentacao'", abrir_painel_por(lambda: clicar("Nova apresentação")))
confere("preenche o nome", preencher("Nome", "Br Saco 5 kg") not in ("SEM ROTULO", "SEM CAMPO"))
id_qtd = rotulo_comeca("Vale quanto")
confere("acha o campo 'Vale quanto'", id_qtd != "", id_qtd)
definir("#" + id_qtd, "5")
focar_seletor("#" + rotulo_comeca(ROTULO_CODIGO))
digitar(CODIGO_NOVO)
confere("o codigo digitado com teclas reais esta no campo", valor_de("#" + rotulo_comeca(ROTULO_CODIGO)) == CODIGO_NOVO, valor_de("#" + rotulo_comeca(ROTULO_CODIGO)))
enter()
time.sleep(2)
confere("o Enter no campo do codigo NAO envia o painel (segue aberto)", painel_aberto(), "")
confere("e nada foi criado ainda", "Br Saco 5 kg" not in apresentacoes_do_cadastro(), apresentacoes_do_cadastro())
enviar_painel()
confere("salvar pelo botao fecha o painel", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(1.5)
depois = apresentacoes_do_cadastro()
confere("o servidor gravou o codigo oficial na Br Saco 5 kg", depois.get("Br Saco 5 kg") == CODIGO_NOVO, depois)

confere("abre o painel de novo (Gerar)", abrir_painel_por(lambda: clicar("Nova apresentação")))
preencher("Nome", "Br Saco 10 kg")
definir("#" + rotulo_comeca("Vale quanto"), "10")
confere("'Gerar codigo' existe no painel", clicar_no_painel("Gerar código"))
gerado = esperar(lambda: re.fullmatch(r"20\d{11}", valor_de("#" + rotulo_comeca(ROTULO_CODIGO)) or "") and valor_de("#" + rotulo_comeca(ROTULO_CODIGO)), 30) or ""
confere("o campo recebe um codigo '20...' de 13 digitos", bool(gerado), valor_de("#" + rotulo_comeca(ROTULO_CODIGO)))
confere("o gerado tem o digito verificador certo (conferido em Python, independente)", bool(gerado) and ean_valido(gerado), gerado)
time.sleep(0.5)
confere("gerar so preenche: ainda nao gravou", "Br Saco 10 kg" not in apresentacoes_do_cadastro(), apresentacoes_do_cadastro())
focar_seletor("#" + rotulo_comeca(ROTULO_CODIGO))
enter()
time.sleep(1.5)
confere("o Enter com o codigo gerado tambem NAO envia o painel", painel_aberto(), "")
enviar_painel()
confere("salvar fecha o painel", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(1.5)
depois = apresentacoes_do_cadastro()
confere("o servidor gravou o gerado na Br Saco 10 kg", depois.get("Br Saco 10 kg") == gerado and gerado != "", [depois, gerado])

confere("abre o painel (repetido)", abrir_painel_por(lambda: clicar("Nova apresentação")))
preencher("Nome", "Br Saco 20 kg")
definir("#" + rotulo_comeca("Vale quanto"), "20")
definir("#" + rotulo_comeca(ROTULO_CODIGO), CODIGO_NOVO)
enviar_painel()
recusa = esperar(lambda: erro_do_campo(ROTULO_CODIGO), 30) or ""
confere("codigo repetido: a recusa vem EMBAIXO do campo, com o produto e a apresentacao donos", "Br Cadastro" in recusa and "Br Saco 5 kg" in recusa, recusa)
confere("o foco foi para o campo do codigo", bool(esperar(lambda: campo_em_foco_rotulo() == ROTULO_CODIGO, 10)), campo_em_foco_rotulo())
confere("o painel segue aberto e nada foi criado", painel_aberto() and "Br Saco 20 kg" not in apresentacoes_do_cadastro(), "")
definir("#" + rotulo_comeca(ROTULO_CODIGO), CODIGO_ERRADO)
enviar_painel()
recusa = esperar(lambda: erro_do_campo(ROTULO_CODIGO), 30) or ""
confere("digito errado: recusa no campo ('nao confere')", "não confere" in recusa, recusa)
definir("#" + rotulo_comeca(ROTULO_CODIGO), "12345")
enviar_painel()
time.sleep(1.5)
recusa = esperar(lambda: erro_do_campo(ROTULO_CODIGO), 30) or ""
confere("tamanho errado: recusa no campo ('8 ou 13 numeros')", "8 ou 13" in recusa, recusa)
fechar_painel_por_botao()
confere("fechou o painel; nada foi criado", not painel_aberto() and "Br Saco 20 kg" not in apresentacoes_do_cadastro(), apresentacoes_do_cadastro())

# --- 2 ------------------------------------------------------------------------------------------------------------------
passo("2. Balcao com leitor: a apresentacao lida, soma, Enter nao fecha, 12 digitos, desconhecido")
confere("o balcao abre e a busca existe", na_pagina_do_balcao())
foco = em_foco()
ler_codigo(MILHO_SACO)
it = itens_do_balcao()
confere("o codigo da SEGUNDA apresentacao entra na segunda (Saco 25 kg), nao na padrao", it == [["Br Milho", "Saco 25 kg", "1"]], it)
confere("a busca fica limpa e com o foco depois da leitura", busca_valor() == "" and em_foco().startswith("busca"), [busca_valor(), em_foco()])
ler_codigo(MILHO_SACO)
it = itens_do_balcao()
confere("ler de novo soma 1 na MESMA linha", it == [["Br Milho", "Saco 25 kg", "2"]], it)
ler_codigo(MILHO_PACOTE)
it = itens_do_balcao()
confere("o codigo da padrao entra como linha propria (Pacote 1 kg)", it == [["Br Milho", "Saco 25 kg", "2"], ["Br Milho", "Pacote 1 kg", "1"]], it)

# Venda completa na tela (dinheiro cobrindo tudo): so o Enter do leitor NAO pode fechar.
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(0.8)
definir('input[aria-label="Valor em Dinheiro (R$)"]', "5000")
time.sleep(0.5)
n_antes = vendas_da_loja(LOJA_ID)
ler_codigo(UPC12)
it = itens_do_balcao()
confere("12 digitos (UPC-A) casa com o gravado 0 + 12: entra Br Americano", ["Br Americano", "Unidade", "1"] in it, it)
confere("com itens E pagamento completo, o Enter do leitor nao fecha a venda (a tela segue no balcao)", "Venda registrada" not in texto_do_main() and tem("Fechar a venda"), texto_do_main()[:200])
time.sleep(2.5)
confere("nenhuma venda nova na API depois do Enter do leitor", vendas_da_loja(LOJA_ID) == n_antes, [n_antes, vendas_da_loja(LOJA_ID)])
ler_codigo(DESCONHECIDO)
confere("codigo desconhecido: 'Nenhum produto com o codigo ...'", ("Nenhum produto com o código " + DESCONHECIDO) in texto_do_main(), texto_do_main()[:300])
confere("e nada entrou na venda", len(itens_do_balcao()) == 3, itens_do_balcao())
definir("input[data-atalho=busca]", "")
ler_codigo(SEM_PRECO)
confere("codigo de apresentacao sem preco na loja avisa 'sem preco nesta loja' e nao entra", "sem preço nesta loja" in avisos().lower() and len(itens_do_balcao()) == 3, [avisos(), itens_do_balcao()])
time.sleep(1)
confere("nenhuma venda nova depois de tudo isso", vendas_da_loja(LOJA_ID) == n_antes, [n_antes, vendas_da_loja(LOJA_ID)])

# --- 3 ------------------------------------------------------------------------------------------------------------------
passo("3. Atalhos com o foco num campo de texto (padroes F2, F4, F8, F9, Ctrl+Enter)")
confere("balcao novo", na_pagina_do_balcao())
ler_codigo(MILHO_PACOTE)
confere("uma linha no balcao (Pacote 1 kg)", itens_do_balcao() == [["Br Milho", "Pacote 1 kg", "1"]], itens_do_balcao())
QTD = 'input[aria-label="Quantidade do item 1"]'
confere("foco no campo de quantidade", focar_seletor(QTD) is True and em_foco().startswith("|") and "Quantidade do item 1" in em_foco(), em_foco())
f(2)
confere("F2 com o foco na quantidade: foca a busca e nao escreve nada", em_foco().startswith("busca") and valor_de(QTD) == "1" and busca_valor() == "", [em_foco(), valor_de(QTD), busca_valor()])
focar_seletor(QTD)
f(8)
confere("F8 foca o campo Vendedor", em_foco().split("|")[1] == "seller_user_id", em_foco())
focar_seletor(QTD)
f(9)
confere("F9 foca o primeiro '+ forma' (+ Dinheiro)", em_foco().startswith("forma-de-pagamento") and "+ Dinheiro" in em_foco(), em_foco())
focar_seletor(QTD)
f(4)
confere("F4 abre o 'Escolher cliente'", bool(esperar(lambda: js("!!document.querySelector('[data-escolha=cliente]')"), 10)), "")
confere("com a janela aberta (role=dialog), F2 nao age (o foco nao vai para a busca)", painel_aberto(), "")
f(2)
f(8)
f(9)
confere("com a janela aberta, F2, F8 e F9 nao movem o foco para o balcao", not em_foco().startswith("busca") and em_foco().split("|")[1] != "seller_user_id" and not em_foco().startswith("forma-de-pagamento"), em_foco())
escape()
confere("o Esc fecha a janela (continua como hoje)", bool(esperar(lambda: not painel_aberto(), 10)), "")
confere("escolhe o cliente Br Maria", escolher_cliente("Br Maria") is True)
focar_seletor(QTD)
f(4)
confere("com cliente, F4 abre a janela do 'Trocar'", bool(esperar(lambda: js("!!document.querySelector('[data-escolha=cliente]')"), 10)), "")
escape()
esperar(lambda: not painel_aberto(), 10)

confere("as teclas padrao aparecem a 1280 px, cada uma junto do campo que aciona", (legenda() or [""])[0].find("F2") >= 0 and legenda()[1] is True and "Ctrl+Enter" in legenda()[0], legenda())

# Ctrl+Enter incompleto: recusa como o botao (sem forma de pagamento) e nenhuma venda.
n_antes = vendas_da_loja(LOJA_ID)
focar_busca()
ctrl_enter()
time.sleep(2)
recusa = esperar(lambda: erro_do_campo("Pagamento"), 20) or ""
confere("Ctrl+Enter com a venda incompleta recusa como o botao (embaixo do Pagamento)", recusa != "", recusa)
confere("Ctrl+Enter na busca nao escreveu nada e nao vendeu", busca_valor() == "" and vendas_da_loja(LOJA_ID) == n_antes, [busca_valor(), vendas_da_loja(LOJA_ID)])
focar_seletor(QTD)
f(9)
enter()  # Enter de verdade no botao focado: aciona o '+ Dinheiro'
time.sleep(0.8)
confere("Enter no botao focado adiciona o pagamento em dinheiro", js("!!document.querySelector('input[aria-label=\"Valor em Dinheiro (R$)\"]')") is True, em_foco())
definir('input[aria-label="Valor em Dinheiro (R$)"]', "10")
focar_seletor(QTD)
ctrl_enter()
ok_ = esperar(lambda: "Venda registrada" in texto_do_main(), 60)
confere("Ctrl+Enter com a venda completa fecha a venda (a tela mostra 'Venda registrada')", bool(ok_), texto_do_main()[:200])
time.sleep(1)
confere("e a API tem UMA venda nova", vendas_da_loja(LOJA_ID) == n_antes + 1, [n_antes, vendas_da_loja(LOJA_ID)])

# --- 4 ------------------------------------------------------------------------------------------------------------------
passo("4. Configuracoes: Balcao e etiquetas")
entrar("gestor")
ir("/emporio/configuracoes")
confere("o Gestor abre as Configuracoes", caminho() == "/emporio/configuracoes", caminho())
confere("o Gestor (sem a chave conta) NAO ve a secao 'Balcao e etiquetas'", "Balcão e etiquetas" not in texto_do_main(), texto_do_main()[:200])
entrar("owner")
ir("/emporio/configuracoes")
confere("o Dono ve a secao 'Balcao e etiquetas'", "Balcão e etiquetas" in texto_do_main(), texto_do_main()[:200])
MUDAR = "(() => { const h = Array.from(document.querySelectorAll('h2')).find(x => x.innerText.trim() === 'Balcão e etiquetas'); const s = h && h.closest('section'); const b = s && Array.from(s.querySelectorAll('button')).find(x => x.innerText.trim() === 'Mudar'); if (!b) return false; b.click(); return true; })()"
confere("abre o painel 'Balcao e etiquetas'", abrir_painel_por(lambda: js(MUDAR)))
confere("o painel traz as teclas padrao (Buscar produto = F2)", js("(document.querySelector('[role=dialog]') || document.body).innerText.includes('F2')") is True, "")

confere("coloca 'Escolher cliente' em F2 (a mesma do Produto)", escolher("Escolher cliente", "F2") is True)
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Escolher cliente"), 30) or ""
confere("tecla repetida: a recusa vem no campo da SEGUNDA ('Escolher cliente'), nao no do Produto", recusa != "" and erro_do_campo("Buscar produto") == "", [recusa, erro_do_campo("Buscar produto")])
confere("o painel segue aberto", painel_aberto(), "")
confere("'Voltar ao padrao' existe", clicar_no_painel("Voltar ao padrão"))
time.sleep(0.5)
confere("e devolve F4 ao cliente (so preenche)", js("(document.querySelector('[role=dialog]')).innerText.includes('F4')") is True, "")

definir("#balcao-label_a4_columns", "4")
enviar_painel()
time.sleep(2)
campos_com_erro = js("Array.from(document.querySelectorAll('[role=dialog] [aria-invalid=true]')).map(e => e.id)") or []
confere("grade A4 que nao cabe (4 colunas): a recusa cai num campo da folha A4", len(campos_com_erro) >= 1 and all(c.startswith("balcao-label_a4_") for c in campos_com_erro), campos_com_erro)
confere("o painel segue aberto", painel_aberto(), "")
definir("#balcao-label_a4_width", "99")
definir("#balcao-label_roll_columns", "9")
confere("'Voltar ao padrao' preenche os padroes (3 colunas, 7 linhas, 63,5, 38,1, 15,15, 7,2, 2,5, 0 e o rolo 40 x 25)", clicar_no_painel("Voltar ao padrão") and [valor_de("#balcao-" + c) for c in ["label_a4_columns", "label_a4_rows", "label_a4_width", "label_a4_height", "label_a4_margin_top", "label_a4_margin_left", "label_a4_gap_x", "label_a4_gap_y", "label_roll_width", "label_roll_height", "label_roll_columns", "label_roll_gap_x"]] == ["3", "7", "63,5", "38,1", "15,15", "7,2", "2,5", "0", "40", "25", "1", "2"], [valor_de("#balcao-" + c) for c in ["label_a4_columns", "label_a4_rows", "label_a4_width", "label_a4_height", "label_a4_margin_top", "label_a4_margin_left", "label_a4_gap_x", "label_a4_gap_y", "label_roll_width", "label_roll_height", "label_roll_columns", "label_roll_gap_x"]])

AVISO_BARRAS = "o código de barras não cabe"
confere("rolo 40 x 25 (o padrao): o painel NAO avisa de barras", AVISO_BARRAS not in (js("(document.querySelector('[role=dialog]')).innerText") or ""), "")
definir("#balcao-label_roll_height", "15")
time.sleep(0.5)
aviso_painel = js("(document.querySelector('[role=dialog]')).innerText") or ""
confere("rolo 40 x 15: o painel avisa que o codigo de barras nao cabe, com a altura minima", AVISO_BARRAS in aviso_painel and "use pelo menos" in aviso_painel, aviso_painel[-400:])
definir("#balcao-label_roll_height", "25")
time.sleep(0.5)
confere("de volta a 40 x 25 o aviso some (nada foi gravado: so o painel)", AVISO_BARRAS not in (js("(document.querySelector('[role=dialog]')).innerText") or ""), "")

confere("troca a tecla do Produto para Alt+1", escolher("Buscar produto", "Alt+1") is True)
enviar_painel()
confere("salvar fecha o painel", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(2)
confere("a pagina mostra Produto Alt+1 nas configuracoes", "Produto Alt+1" in texto_do_main(), texto_do_main()[:600])

passo("4b. Alt+1 no balcao: age sem escrever; o F2 deixou de agir")
confere("balcao novo", na_pagina_do_balcao())
ler_codigo(MILHO_PACOTE)
confere("a tecla do produto mostra Alt+1", "Alt+1" in ((legenda() or [""])[0]) and "F2" not in ((legenda() or [""])[0]), legenda())
focar_seletor(QTD)
alt("1")
confere("Alt+1 com o foco na quantidade: foca a busca", em_foco().startswith("busca"), em_foco())
confere("e NAO deixou '1' em campo nenhum (quantidade segue 1, busca vazia)", valor_de(QTD) == "1" and busca_valor() == "", [valor_de(QTD), busca_valor()])
focar_busca()
alt("1")
confere("Alt+1 com o foco na propria busca: a busca segue vazia", busca_valor() == "", busca_valor())
focar_seletor(QTD)
f(2)
confere("F2 deixou de agir (o foco segue na quantidade)", "Quantidade do item 1" in em_foco(), em_foco())

passo("4c. Legenda desligada some")
ir("/emporio/configuracoes")
confere("reabre o painel", abrir_painel_por(lambda: js(MUDAR)))
js("(() => { const i = document.getElementById('balcao-show_shortcut_legend'); if (i && i.checked) i.click(); })()")
time.sleep(0.5)
confere("desmarcou a legenda", js("document.getElementById('balcao-show_shortcut_legend').checked") is False, "")
enviar_painel()
confere("salvar fecha o painel", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(1.5)
confere("balcao novo", na_pagina_do_balcao())
confere("com a legenda desligada, nenhuma tecla existe no balcao", legenda() is None, legenda())

# --- 5 ------------------------------------------------------------------------------------------------------------------
passo("5. Etiquetas: a tela de escolha")
ir("/emporio/produtos/etiquetas")
confere("a tela abre", caminho() == "/emporio/produtos/etiquetas" and tem("Etiquetas"), caminho())
js("(() => { const s = document.getElementById('etq-loja'); const alvo = Array.from(s.options).find(o => o.text === " + repr(LOJA) + "); if (!alvo) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, alvo.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()")
time.sleep(1)
LINHA = "(nome) => Array.from(document.querySelectorAll('main li')).find(li => li.innerText.replace(/\\s+/g, ' ').includes(nome + ' ·'))"


def linha(nome):
    return js("(() => { const f = " + LINHA + "; const li = f(" + repr(nome) + "); return li ? li.innerText.replace(/\\s+/g, ' ') : ''; })()") or ""


def caixa_da_linha(nome):
    return js("(() => { const f = " + LINHA + "; const li = f(" + repr(nome) + "); const c = li && li.querySelector('input[type=checkbox]'); return c ? [c.disabled, c.checked] : null; })()")


confere("Br Etq Oficial: preco da loja R$ 12,90 e sem selo 'sem codigo'", "R$ 12,90" in linha("Br Etq Oficial") and "sem código" not in linha("Br Etq Oficial"), linha("Br Etq Oficial"))
confere("Br Etq Gerada: R$ 89,90", "R$ 89,90" in linha("Br Etq Gerada"), linha("Br Etq Gerada"))
confere("Br Etq Curto: R$ 5,50", "R$ 5,50" in linha("Br Etq Curto"), linha("Br Etq Curto"))
confere("Br Etq Sem Preco: selo 'sem preco' e caixa DESABILITADA", "sem preço" in linha("Br Etq Sem Preco") and (caixa_da_linha("Br Etq Sem Preco") or [False])[0] is True, [linha("Br Etq Sem Preco"), caixa_da_linha("Br Etq Sem Preco")])
confere("Br Etq Sem Codigo: marcada 'sem codigo' e habilitada, com o preco R$ 3,00", "sem código" in linha("Br Etq Sem Codigo") and "R$ 3,00" in linha("Br Etq Sem Codigo") and (caixa_da_linha("Br Etq Sem Codigo") or [True])[0] is False, [linha("Br Etq Sem Codigo"), caixa_da_linha("Br Etq Sem Codigo")])
BOTAO_IMPRIMIR = "Array.from(document.querySelectorAll('main button, main a')).filter(x => x.innerText.trim() === 'Imprimir etiquetas')"
confere("sem nada marcado, 'Imprimir etiquetas' e um botao desabilitado", js("(() => { const b = " + BOTAO_IMPRIMIR + "; return b.length === 1 && b[0].tagName === 'BUTTON' && b[0].disabled; })()") is True, "")
confere("clica em 'Selecionar todas' (marca so as que tem preco)", clicar("Selecionar todas"))
time.sleep(0.5)
marcadas = js("Array.from(document.querySelectorAll('main li input[type=checkbox]')).filter(c => c.checked).length")
com_preco = js("Array.from(document.querySelectorAll('main li input[type=checkbox]')).filter(c => !c.disabled).length")
confere("marcou exatamente as que tem preco (e a sem preco ficou desmarcada)", marcadas == com_preco and com_preco >= 6 and (caixa_da_linha("Br Etq Sem Preco") or [0, True])[1] is False, [marcadas, com_preco])
confere("o botao vira 'Desmarcar todas'", clicar("Desmarcar todas"))
time.sleep(0.5)
confere("e desmarca tudo", js("Array.from(document.querySelectorAll('main li input[type=checkbox]')).filter(c => c.checked).length") == 0, "")


def marcar_linha(nome):
    xy = js("(() => { const f = " + LINHA + "; const li = f(" + repr(nome) + "); const c = li && li.querySelector('input[type=checkbox]'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    if not xy:
        return False
    click_at_xy(xy[0], xy[1])
    time.sleep(0.4)
    return (caixa_da_linha(nome) or [True, False])[1]


ESCOLHIDAS = ["Br Etq Oficial", "Br Etq Gerada", "Br Etq Curto", "Br Etq Sem Codigo"]
for n in ESCOLHIDAS:
    confere("marca (clique real) " + n, marcar_linha(n) is True)
confere("a contagem mostra 4 etiquetas", "4 etiquetas" in texto_do_main(), texto_do_main()[-200:])
href_a4 = js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === 'Imprimir etiquetas'); return a ? a.getAttribute('href') : ''; })()") or ""
confere("o link de imprimir sai com a loja, o formato a4 e as 4 apresentacoes", "formato=a4" in href_a4 and "loja=" + LOJA_ID in href_a4 and href_a4.count("%3A1") == 4, href_a4)
definir("#etq-inicio", "5")
time.sleep(0.5)
href_a4_5 = js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === 'Imprimir etiquetas'); return a ? a.getAttribute('href') : ''; })()") or ""
confere("'Comecar na etiqueta nº 5' vai para a URL (inicio=5)", "inicio=5" in href_a4_5, href_a4_5)
js("(() => { const s = document.getElementById('etq-formato'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'rolo'); s.dispatchEvent(new Event('change', { bubbles: true })); })()")
time.sleep(0.5)
href_rolo = js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === 'Imprimir etiquetas'); return a ? a.getAttribute('href') : ''; })()") or ""
confere("no rolo o link sai com formato=rolo e sem inicio", "formato=rolo" in href_rolo and "inicio=" not in href_rolo and "Começar" not in texto_do_main(), href_rolo)

# Aviso na escolha: com o rolo gravado em 40 x 15 as barras nao cabem; so avisa se algo marcado tem codigo.
r = api("PATCH", "/api/v1/emporio/settings/balcao", {"label_roll_height": 15})
confere("grava o rolo em 40 x 15 pela API (restaurado logo depois)", r["status"] == 200, [r["status"], r["body"]])
try:
    ir("/emporio/produtos/etiquetas")
    js("(() => { const s = document.getElementById('etq-loja'); const alvo = Array.from(s.options).find(o => o.text === " + repr(LOJA) + "); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, alvo.value); s.dispatchEvent(new Event('change', { bubbles: true })); })()")
    time.sleep(1)
    js("(() => { const s = document.getElementById('etq-formato'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'rolo'); s.dispatchEvent(new Event('change', { bubbles: true })); })()")
    time.sleep(0.5)
    confere("rolo 40 x 15, nada marcado: sem aviso de barras", AVISO_BARRAS not in texto_do_main(), "")
    confere("marca so a Br Etq Sem Codigo: ainda sem aviso (nao ha barras a perder)", marcar_linha("Br Etq Sem Codigo") is True and AVISO_BARRAS not in texto_do_main(), "")
    confere("marca a Br Etq Oficial (tem codigo): o aviso aparece, com a altura minima", marcar_linha("Br Etq Oficial") is True and AVISO_BARRAS in texto_do_main() and "use pelo menos" in texto_do_main(), texto_do_main()[-300:])
    js("(() => { const s = document.getElementById('etq-formato'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'a4'); s.dispatchEvent(new Event('change', { bubbles: true })); })()")
    time.sleep(0.5)
    confere("no formato A4 (63,5 x 38,1) o aviso some", AVISO_BARRAS not in texto_do_main(), "")
finally:
    r = api("PATCH", "/api/v1/emporio/settings/balcao", {"label_roll_height": 25})
    confere("devolve o rolo a 40 x 25", r["status"] == 200, [r["status"], r["body"]])

# --- 6 ------------------------------------------------------------------------------------------------------------------
passo("6. Impressao: A4 medido em mm, rolo, barras decodificadas")
SCRIPT_SEM_DIALOGO = "window.print = function () { window.__imprimiu = (window.__imprimiu || 0) + 1; };"
ident = cdp("Page.addScriptToEvaluateOnNewDocument", source=SCRIPT_SEM_DIALOGO)
ir(href_a4)
confere("a pagina de impressao A4 abre", caminho().startswith("/emporio/imprimir/etiquetas"), caminho())
esperar(lambda: js("document.querySelectorAll('.etq-a4 .pos').length") == 4, 30)
time.sleep(1.5)
confere("o window.print foi interceptado e chamado uma vez (o dialogo abre sozinho)", bool(esperar(lambda: js("window.__imprimiu") == 1, 10)), js("window.__imprimiu"))
folhas = retangulos_a4()
confere("uma folha com 4 etiquetas", len(folhas) == 1 and len(folhas[0]) == 4, folhas)


def perto(a, b, tol=0.06):
    return abs(a - b) <= tol


if folhas and len(folhas[0]) == 4:
    f0 = folhas[0]
    confere("a folha mede 210 x 297 mm", perto(f0[0][4], 210, 0.1) and perto(f0[0][5], 297, 0.1), [f0[0][4], f0[0][5]])
    confere("a 1a etiqueta fica a 7,2 mm da esquerda e 15,15 mm de cima", perto(f0[0][0], 7.2) and perto(f0[0][1], 15.15), f0[0][:2])
    confere("cada etiqueta mede 63,5 x 38,1 mm", all(perto(e[2], 63.5) and perto(e[3], 38.1) for e in f0), [e[2:4] for e in f0])
    confere("o passo entre colunas e 66,0 mm (63,5 + 2,5)", perto(f0[1][0] - f0[0][0], 66.0) and perto(f0[2][0] - f0[1][0], 66.0), [f0[1][0] - f0[0][0], f0[2][0] - f0[1][0]])
    confere("a 4a etiqueta volta a coluna 1 na linha de baixo: mesmo left da 1a e 38,1 mm mais embaixo", perto(f0[3][0], f0[0][0]) and perto(f0[3][1] - f0[0][1], 38.1), [f0[3][0], f0[3][1] - f0[0][1]])
    confere("as 3 primeiras estao na mesma linha (mesmo top)", perto(f0[1][1], f0[0][1]) and perto(f0[2][1], f0[0][1]), [e[1] for e in f0])

barras = barras_do_svg(".etq-a4 svg[role=img]")
confere("tres etiquetas tem barras (a sem codigo nao tem)", sorted(b[0] for b in barras) == sorted(["4006381333931", "96385074"] + [js("document.querySelector('.etq-a4 svg[aria-label^=\"Código de barras 20\"]').getAttribute('aria-label')").replace("Código de barras ", "")]), [b[0] for b in barras])
for codigo, mods, n in barras:
    esperado = 95 if len(codigo) == 13 else 67
    confere("barras de " + codigo + ": " + str(esperado) + " modulos", n == esperado, n)
    confere("barras de " + codigo + ": decodificadas do SVG, batem com o EAN independente (Python)", mods == ean_modulos(codigo), [mods, ean_modulos(codigo)])
TEXTOS_ETQ = js("Array.from(document.querySelectorAll('.etq')).map(e => ({ t: e.textContent.replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' '), barras: !!e.querySelector('svg') }))") or []
confere("a Br Etq Sem Codigo sai sem barras e com o preco R$ 3,00", len([e for e in TEXTOS_ETQ if "Br Etq Sem Codigo" in e["t"] and not e["barras"] and "R$ 3,00" in e["t"]]) == 1, TEXTOS_ETQ)
confere("cada etiqueta traz o nome, a apresentacao e o preco (R$ 12,90, R$ 89,90 e R$ 5,50)", all(any(n in e["t"] and p in e["t"] and "Unidade" in e["t"] for e in TEXTOS_ETQ) for n, p in [("Br Etq Oficial", "R$ 12,90"), ("Br Etq Gerada", "R$ 89,90"), ("Br Etq Curto", "R$ 5,50")]), TEXTOS_ETQ)
captura("etiquetas-a4.png", 900, 1250, ".etq-a4")

ir(href_a4_5)
esperar(lambda: js("document.querySelectorAll('.etq-a4 .pos').length") == 4, 30)
time.sleep(1.5)
folhas = retangulos_a4()
if folhas and len(folhas[0]) == 4:
    ocupadas = sorted((round((e[0] - 7.2) / 66.0), round((e[1] - 15.15) / 38.1)) for e in folhas[0])
    confere("'comecar na etiqueta nº 5': as 4 primeiras posicoes (linha 1 inteira e a coluna 1 da linha 2) ficam VAZIAS", ocupadas == [(0, 2), (1, 1), (1, 2), (2, 1)], ocupadas)
    confere("a primeira etiqueta impressa esta em 73,2 mm da esquerda e 53,25 mm de cima (posicao 5: coluna 2, linha 2)", perto(min(folhas[0], key=lambda e: (e[1], e[0]))[0], 73.2) and perto(min(e[1] for e in folhas[0]), 53.25), folhas[0])
else:
    confere("a folha de inicio=5 tem as 4 etiquetas", False, folhas)

ir(href_rolo)
esperar(lambda: js("document.querySelectorAll('.etq-linha .etq').length") == 4, 30)
time.sleep(1.5)
rolo = js("Array.from(document.querySelectorAll('.etq-linha')).map(l => { const r = l.getBoundingClientRect(); const e = l.querySelector('.etq').getBoundingClientRect(); return [r.width, r.height, e.width, e.height]; })") or []
rolo_mm = [[round(mm(v), 2) for v in l] for l in rolo]
confere("rolo: 4 linhas, cada uma uma etiqueta de 40 x 25 mm", len(rolo_mm) == 4 and all(perto(l[2], 40) and perto(l[3], 25) and perto(l[0], 40) and perto(l[1], 25) for l in rolo_mm), rolo_mm)
confere("o @page do rolo e 40mm x 25mm", "size: 40mm 25mm" in (js("Array.from(document.querySelectorAll('style')).map(s => s.textContent).join(' ')") or ""), "")
barras = barras_do_svg(".etq-linha svg[role=img]")
for codigo, mods, n in barras:
    confere("rolo, barras de " + codigo + ": decodificadas batem com o EAN independente", mods == ean_modulos(codigo) and n == (95 if len(codigo) == 13 else 67), n)
captura("etiquetas-rolo.png", 320, 520, ".etq-folha")
cdp("Page.removeScriptToEvaluateOnNewDocument", identifier=ident["identifier"])

# --- 7 ------------------------------------------------------------------------------------------------------------------
passo("7. Celular (390 px): sem rolagem horizontal; sem legenda")
tela(390, 844, 1, True)
for rotulo, destino in [("Etiquetas", "/emporio/produtos/etiquetas"), ("Configuracoes", "/emporio/configuracoes")]:
    ir(destino)
    time.sleep(1.5)
    larg = rolagem_horizontal()
    confere(rotulo + " a 390 px: a pagina nao rola na horizontal", larg is not None and larg[0] <= larg[1] and larg[1] == 390, larg)
confere("390 px: abre o painel Balcao e etiquetas e ele cabe", abrir_painel_por(lambda: js(MUDAR)))
caixa = js("(() => { const d = document.querySelector('[role=dialog]'); const b = d.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)]; })()")
larg = rolagem_horizontal()
confere("390 px: o painel cabe na largura e a pagina nao rola", caixa[0] >= 0 and caixa[1] <= 390 and larg[0] <= larg[1], [caixa, larg])
fechar_painel_por_botao()
ir("/emporio/produtos/etiquetas")
js("(() => { const s = document.getElementById('etq-loja'); const alvo = Array.from(s.options).find(o => o.text === " + repr(LOJA) + "); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, alvo.value); s.dispatchEvent(new Event('change', { bubbles: true })); })()")
time.sleep(1)
larg = rolagem_horizontal()
confere("Etiquetas com a lista da loja a 390 px: sem rolagem horizontal", larg[0] <= larg[1], larg)
# a legenda ja esta desligada nas configuracoes: religa pela API para provar que no celular ela some mesmo ligada
r = api("PATCH", "/api/v1/emporio/settings/balcao", {"show_shortcut_legend": True})
confere("religa a legenda pela API (para medir o celular)", r["status"] == 200, [r["status"], r["body"]])
tela(390, 844, 1, True)
na_pagina_do_balcao()
lg = legenda()
confere("a 390 px as teclas existem no DOM mas estao ocultas (display none)", lg is not None and lg[1] is False, lg)
larg = rolagem_horizontal()
confere("balcao a 390 px: sem rolagem horizontal", larg[0] <= larg[1], larg)
cdp("Emulation.clearDeviceMetricsOverride")

# --- 8 ------------------------------------------------------------------------------------------------------------------
passo("8. Desarquivar com codigo tomado, Editar o codigo, F8 como Caixa, Gestor nas Etiquetas, teto de 2000")
tela(1280, 900)
entrar("owner")
produtos = api("GET", "/api/v1/emporio/products?limit=500")["body"]["data"]
lista = produtos if isinstance(produtos, list) else (produtos.get("items") or produtos.get("products") or [])
TOMADO = next((p for p in lista if p["name"] == "Br Tomado"), None)
confere("acha o produto Br Tomado pela API", TOMADO is not None, len(lista))
TOMADO_ID = TOMADO["id"] if TOMADO else ""
CODIGO_TOMADO = "7891000200117"


def pres_do_tomado():
    d = api("GET", "/api/v1/emporio/products/" + TOMADO_ID)["body"]["data"]
    return {a["name"]: [a.get("barcode"), a.get("archived_at")] for a in d["presentations"]}


antes = pres_do_tomado()
confere("o cenario deixou 'Saco antigo' arquivada e 'Saco novo' ativa com o MESMO codigo", antes.get("Saco antigo", [0, None])[1] is not None and antes.get("Saco novo", [0, 1])[1] is None and antes["Saco antigo"][0] == antes["Saco novo"][0] == CODIGO_TOMADO, antes)
ir("/emporio/produtos/" + TOMADO_ID)
DESARQUIVAR = "(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(t => t.innerText.includes('Saco antigo')); const b = tr && Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === 'Desarquivar'); if (!b) return false; b.click(); return true; })()"
confere("a linha 'Saco antigo' tem o botao Desarquivar", bool(esperar(lambda: js(DESARQUIVAR), 30)))


def recusas_na_tela():
    """A recusa de uma acao sem formulario vai para o aviso de erro (role=alert), nao para o de sucesso (role=status)."""
    return js("Array.from(document.querySelectorAll('[role=alert]')).map(s => s.innerText.replace(/\\s+/g, ' ')).join(' || ')") or ""


recusa = esperar(lambda: recusas_na_tela() if "Br Tomado" in recusas_na_tela() or CODIGO_TOMADO in recusas_na_tela() else "", 20) or ""
confere("desarquivar com o codigo tomado: a recusa aparece na tela e nomeia o produto dono do codigo", "Br Tomado" in recusa or CODIGO_TOMADO in recusa, recusa or recusas_na_tela())
time.sleep(1)
confere("e a apresentacao antiga segue arquivada no servidor", pres_do_tomado()["Saco antigo"][1] is not None, pres_do_tomado())

# Editar o codigo pelo botao Editar: a Br Saco 5 kg nasceu na secao 1 com CODIGO_NOVO.
CODIGO_EDITADO = com_digito("789100010088")
ir("/emporio/produtos/" + CADASTRO_ID)
EDITAR = "(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(t => t.innerText.includes('Br Saco 5 kg')); const b = tr && Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === 'Editar'); if (!b) return false; b.click(); return true; })()"
confere("abre o painel 'Editar apresentacao' da Br Saco 5 kg", abrir_painel_por(lambda: js(EDITAR)))
confere("o painel traz o codigo gravado", valor_de("#" + rotulo_comeca(ROTULO_CODIGO)) == CODIGO_NOVO, valor_de("#" + rotulo_comeca(ROTULO_CODIGO)))
definir("#" + rotulo_comeca(ROTULO_CODIGO), CODIGO_EDITADO)
enviar_painel()
confere("salvar fecha o painel", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(1.5)
confere("o servidor gravou o codigo editado", apresentacoes_do_cadastro().get("Br Saco 5 kg") == CODIGO_EDITADO, apresentacoes_do_cadastro())

# F8 como Caixa. A loja do cenario nao tem vendedor vinculado: o campo Vendedor existe, vazio.
entrar("caixa")
confere("o Caixa abre o balcao e escolhe a loja", na_pagina_do_balcao())
ler_codigo(MILHO_PACOTE)
focar_seletor(QTD)
f(8)
foco = em_foco()
confere("F8 como Caixa leva o foco ao campo Vendedor (a tela nao quebra)", foco.count("|") >= 1 and foco.split("|")[1] == "seller_user_id" and caminho().startswith("/emporio/vender"), [foco, caminho()])
confere("e a tela segue de pe, com a linha do balcao", itens_do_balcao() == [["Br Milho", "Pacote 1 kg", "1"]], itens_do_balcao())

# O Gestor abre a tela de etiquetas.
entrar("gestor")
ir("/emporio/produtos/etiquetas")
tem_escolha = bool(esperar(lambda: js("!!document.getElementById('etq-loja')"), 30))
titulo_h1 = js("(document.querySelector('main h1') || { innerText: '' }).innerText.trim()") or ""
confere("o Gestor abre as Etiquetas (a propria tela: h1 'Etiquetas' e o seletor de loja, nao so o menu)", caminho() == "/emporio/produtos/etiquetas" and titulo_h1 == "Etiquetas" and tem_escolha and not eh_404(), [caminho(), titulo_h1, tem_escolha])

# O teto: 3 produtos com 999 copias passam de 2000.
ETIQUETAS_MAXIMAS = 2000
entrar("owner")
ir("/emporio/produtos/etiquetas")
js("(() => { const s = document.getElementById('etq-loja'); const alvo = Array.from(s.options).find(o => o.text === " + repr(LOJA) + "); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, alvo.value); s.dispatchEvent(new Event('change', { bubbles: true })); })()")
time.sleep(1)
confere("Selecionar todas", clicar("Selecionar todas"))
time.sleep(0.5)
for nome_etq in ["Br Etq Oficial", "Br Etq Gerada", "Br Etq Curto"]:
    js("(() => { const f = " + LINHA + "; const li = f(" + repr(nome_etq) + "); const el = li.querySelector('input:not([type=checkbox])'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '999'); el.dispatchEvent(new Event('input', { bubbles: true })); })()")
time.sleep(0.8)
txt = texto_do_main()
confere("mais de " + str(ETIQUETAS_MAXIMAS) + " etiquetas: o aviso do teto aparece", ("imprima até " + str(ETIQUETAS_MAXIMAS) + " de cada vez") in txt, txt[-250:])
confere("e 'Imprimir etiquetas' vira botao desabilitado", js("(() => { const b = " + BOTAO_IMPRIMIR + "; return b.length === 1 && b[0].tagName === 'BUTTON' && b[0].disabled; })()") is True, "")
