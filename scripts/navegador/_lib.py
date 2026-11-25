# Passos comuns dos roteiros de navegador. Nao roda sozinho: `npm run
# navegador` concatena este arquivo, o CTX (cookies e tenants) e o roteiro, e
# entrega ao browser-harness, que ja traz cdp(), js(), new_tab() e afins.
#
# Os atritos que imitam defeito (aba oculta, leitura cedo, acento) estao no
# cofre: a-aba-oculta-e-a-leitura-cedo-imitam-defeito-no-navegador.
import time

BASE = CTX["base"]
_falhas = []


def entrar(nome):
    """Troca a sessao do navegador pela do cookie `nome` do cabecalho."""
    c = CTX["cookies"][nome]
    cdp("Network.enable")
    cdp("Network.clearBrowserCookies")
    cdp("Network.setCookie", name=c["nome"], value=c["valor"], domain="localhost", path="/", httpOnly=True)


def tenant(nome):
    return CTX["cookies"][nome]["tenant_id"]


def ir(caminho, espera=240):
    """Navega por JS e espera a pagina terminar. O goto_url estoura o tempo do
    harness quando o next dev ainda esta compilando a rota (ja levou 97 s)."""
    if js("location.protocol") == "about:":
        cdp("Page.navigate", url=BASE + "/robots.txt")
        time.sleep(3)
    # A marca no `window` some quando o documento novo chega. Sem ela, o
    # `readyState` lido era o da pagina ANTIGA, que continua na tela enquanto o
    # servidor renderiza a nova (20 s no next dev), e o roteiro procurava o
    # botao na pagina errada.
    js("window.__tibe_ir = 1; setTimeout(() => { location.href = " + repr(BASE + caminho) + " }, 50)")
    time.sleep(1.5)
    fim_em = time.time() + espera
    while time.time() < fim_em:
        try:
            # `main` presente: a casca do painel ja montou (a pagina de 404 e a
            # da Plataforma tambem tem). Sem ele, a leitura pegava body nulo.
            # O /login nao tem `main`: la basta o formulario, senao esperava os 240 s.
            estado = js("(window.__tibe_ir ? 'velha' : (document.readyState === 'complete' && (document.querySelector('main') || (location.pathname === '/login' && document.querySelector('form'))) ? 'pronta' : 'carregando')) + '|' + location.pathname")
            if estado and estado.startswith("pronta|"):
                time.sleep(2.5)
                return estado.split("|", 1)[1]
        except Exception:
            pass
        time.sleep(2)
    return "TIMEOUT"


def menu():
    """Os hrefs que a sidebar desenhou (o que a tela mostra, nao o show)."""
    return js("Array.from(document.querySelectorAll('nav a')).map(a => a.getAttribute('href'))") or []


def abrir_grupo(rotulo):
    js("(() => { const b = Array.from(document.querySelectorAll('nav button')).find(x => x.innerText.includes(" + repr(rotulo) + ")); if (b) b.click(); })()")
    time.sleep(1.5)


def abrir_subgrupos():
    """Abre todo subgrupo fechado do menu do Empório (Vendas, Estoque, Dinheiro,
    Estatísticas, Ajustes): os itens de um subgrupo fechado não estão no DOM."""
    for rotulo in ("Vendas", "Estoque", "Dinheiro", "Estatísticas", "Ajustes"):
        js("(() => { const b = Array.from(document.querySelectorAll('nav button')).find(x => x.innerText.trim() === " + repr(rotulo) + " && x.getAttribute('aria-expanded') === 'false'); if (b) b.click(); })()")
    time.sleep(1.5)


def titulo_da_tela():
    """O texto do <h1> da tela (o título que o CabecalhoDaTela desenha)."""
    return (js("(document.querySelector('main h1') || { innerText: '' }).innerText") or "").strip()


def tem_com_ajuda(texto):
    """O texto está na tela OU no balão do (i): a apresentação da tela mora no
    balão (hidden), que o innerText não lê. Lê o textContent do <main>."""
    pagina = js("(document.querySelector('main') || document.body).textContent.replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def status_api(caminho):
    return api("GET", caminho)["status"]


def texto_principal(n=400):
    return (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "").replace("\n", " | ")


def eh_404():
    """A pagina de 404 do Next ('This page could not be found'). Nao procura '404' solto: numero de venda como 004043 casa."""
    return bool(js("document.body.innerText.includes('could not be found')"))


def clicar(rotulo):
    """Clica no botao cujo texto e exatamente `rotulo`."""
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def marcar(trecho_do_rotulo, marcado=True):
    """Marca (ou desmarca) o input dentro do <label> que contem o trecho."""
    return js("(() => { const l = Array.from(document.querySelectorAll('label')).find(x => x.innerText.includes(" + repr(trecho_do_rotulo) + ")); if (!l) return 'SEM ROTULO'; const i = l.querySelector('input'); if (i.checked !== " + ("true" if marcado else "false") + ") i.click(); return i.checked; })()")


def preencher(rotulo, valor):
    """Preenche o campo cujo <label> tem exatamente `rotulo`, no painel aberto
    (ou na pagina). Usa o setter nativo e dispara `input`: atribuir `.value`
    direto nao avisa o React, e o formulario envia o valor antigo."""
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); if (!l) return 'SEM ROTULO'; const el = document.getElementById(l.htmlFor); if (!el) return 'SEM CAMPO'; const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.id; })()")


def _centro(expr_elemento):
    r = js("(() => { const el = " + expr_elemento + "; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()")
    return r


def _abrir_select(gatilho):
    """Abre o Select (Radix) cujo gatilho e a expressao `gatilho`, e SO devolve
    "ABERTO" com o gatilho em aria-expanded=true. O clique e por coordenada
    medida antes, e a tela se mexe entre a medida e o clique (o balcao rola
    sozinho ate o campo recusado, o layout reflui): o clique cai no vazio, a
    lista nao abre e a falha so aparecia depois como "SEM OPCAO", sem dizer que
    o clique nunca acertou. Por isso remede e clica de novo ate abrir."""
    aberto = "!!(() => { const t = " + gatilho + "; return t && t.getAttribute('aria-expanded') === 'true'; })()"
    fim_em = time.time() + 20
    while time.time() < fim_em:
        xy = _centro(gatilho)
        if not xy:
            return "SEM CAMPO"
        click_at_xy(xy[0], xy[1])
        if esperar(lambda: js(aberto), 1.6):
            return "ABERTO"
    return "NAO ABRIU"


def escolher(rotulo, opcao):
    """Escolhe `opcao` no Select (Radix) do campo `rotulo`. O Radix abre no
    pointerdown de mouse de verdade, entao o clique e por coordenada; el.click()
    nao abre a lista."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    aberto = _abrir_select(gatilho)
    if aberto != "ABERTO":
        return aberto
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(opcao) + ")")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def _escolher_por_busca(tipo, rotulo, abrir, nome, busca=None):
    """Escolhe pela janela de busca (`[data-escolha=<tipo>]`): abre pelo botao
    dentro do campo `rotulo` (o texto ou o aria-label estao em `abrir`), digita
    na busca e toca na linha cujo `data-nome` e exatamente `nome`. A linha fixa
    do topo (o Consumidor final) nao precisa de busca: o toque e direto."""
    janela = "document.querySelector('[data-escolha=" + tipo + "]')"
    botao = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const campo = l && document.getElementById(l.htmlFor); if (!campo) return 'SEM CAMPO'; const b = Array.from(campo.querySelectorAll('button')).find(x => " + repr(abrir) + ".includes(x.innerText.trim()) || " + repr(abrir) + ".includes(x.getAttribute('aria-label'))); if (!b) return 'SEM BOTAO'; b.click(); return true; })()"
    # Antes da hidratacao o clique nao abre nada: repete ate a janela aparecer.
    fim_em = time.time() + 60
    aberta = False
    while time.time() < fim_em:
        r = js(botao)
        if r is not True:
            return r
        if esperar(lambda: js("!!" + janela), 5):
            aberta = True
            break
    if not aberta:
        return "SEM JANELA"
    linha = "Array.from(" + janela + ".querySelectorAll('[data-opcao]')).find(b => b.dataset.nome === " + repr(nome) + ")"
    fixa = js("(() => { const b = " + linha + "; return !!(b && b.hasAttribute('data-fixo')); })()")
    if not fixa:
        js("(() => { const el = " + janela + ".querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(busca or nome) + "); el.dispatchEvent(new Event('input', { bubbles: true })); })()")
    if not esperar(lambda: js("!!(" + linha + ")"), 30):
        return "SEM OPCAO"
    js("(" + linha + ").click()")
    if not esperar(lambda: not js("!!" + janela), 10):
        return "JANELA NAO FECHOU"
    time.sleep(0.5)
    return True


def escolher_cliente(nome, busca=None):
    """Escolhe o cliente na janela de busca da venda, do orcamento ou da troca."""
    return _escolher_por_busca("cliente", "Cliente", ["Escolher cliente", "Trocar cliente"], nome, busca)


def escolher_fornecedor(nome, busca=None):
    """Escolhe o fornecedor na janela de busca da Compra."""
    return _escolher_por_busca("fornecedor", "Fornecedor", ["Escolher fornecedor", "Trocar fornecedor"], nome, busca)


def escolhido(tipo="cliente"):
    """O texto do quadro do escolhido (`[data-escolhido=<tipo>]`), ou '' sem escolha."""
    return (js("(() => { const q = document.querySelector('[data-escolhido=" + tipo + "]'); return q ? q.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or "")


def esperar(condicao, segundos=40):
    """Espera `condicao()` ficar verdadeira (a primeira escrita de uma rota
    compila no next dev e demora). Devolve o ultimo valor."""
    fim_em = time.time() + segundos
    valor = None
    while time.time() < fim_em:
        try:
            valor = condicao()
            if valor:
                return valor
        except Exception:
            pass
        time.sleep(1.5)
    return valor


def erro_do_campo(rotulo):
    """Texto da recusa ligada ao campo (aria-describedby), ou '' sem recusa."""
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); if (!el || el.getAttribute('aria-invalid') !== 'true') return ''; return (el.getAttribute('aria-describedby') || '').split(' ').map(i => (document.getElementById(i) || {}).innerText || '').join(' ').trim() || 'invalido sem texto'; })()") or ""


def enviar_painel():
    """Clica no botao de enviar do painel aberto."""
    js("(() => { const d = document.querySelector('[role=dialog]'); const b = d && d.querySelector('button[type=submit]'); if (b) b.click(); })()")


def painel_aberto():
    return bool(js("!!document.querySelector('[role=dialog]')"))


def api(metodo, caminho, corpo=None):
    """Chama a API com a sessao do navegador. Devolve {status, body}."""
    import json as _json
    corpo_js = "undefined" if corpo is None else repr(_json.dumps(corpo))
    expr = "fetch(" + repr(caminho) + ", { method: " + repr(metodo) + ", headers: { 'Content-Type': 'application/json' }, body: " + corpo_js + " }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }))"
    # A primeira chamada de uma rota compila no next dev e passa do tempo do
    # harness. Repetir e seguro nas escritas do Empório (nome unico da 409,
    # preco e vinculo sao upsert), mas quem cria deve reler o estado depois.
    for tentativa in range(4):
        try:
            return js(expr)
        except RuntimeError as e:
            if "timed out" not in str(e) or tentativa == 3:
                raise
            time.sleep(20)


def enviar_formulario():
    js("Array.from(document.querySelectorAll('form button[type=submit]'))[0].click()")


def confere(nome, condicao, detalhe=""):
    marca = "[ok]     " if condicao else "[FALHOU] "
    print(marca + nome + (("  (" + str(detalhe) + ")") if detalhe != "" else ""))
    if not condicao:
        _falhas.append(nome)


def _pascoa(ano):
    """Domingo de Pascoa (algoritmo de Meeus, calendario gregoriano)."""
    import datetime as _dt
    a = ano % 19
    b, c = divmod(ano, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes, dia = divmod(h + l - 7 * m + 114, 31)
    return _dt.date(ano, mes, dia + 1)


def feriados_nacionais(ano):
    """Feriados nacionais do `ano` como conjunto de 'AAAA-MM-DD': os fixos mais
    Carnaval (segunda e terca), Sexta-feira Santa e Corpus Christi, com a
    Pascoa calculada aqui, sem ler o codigo do app."""
    import datetime as _dt
    fixos = [(1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (11, 20), (12, 25)]
    dias = {_dt.date(ano, m, d) for m, d in fixos}
    p = _pascoa(ano)
    for delta in (-48, -47, -2, 60):
        dias.add(p + _dt.timedelta(days=delta))
    return {d.isoformat() for d in dias}


def passo(titulo):
    print("")
    print("== " + titulo)


def fim():
    print("")
    for f in _falhas:
        print("  falhou: " + f)
    print("RESULTADO: " + str(len(_falhas)) + " falha(s)")
    try:
        close_tab()
    except Exception:
        pass


new_tab("about:blank")
