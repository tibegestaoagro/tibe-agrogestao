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
            estado = js("(window.__tibe_ir ? 'velha' : (document.readyState === 'complete' && document.querySelector('main') ? 'pronta' : 'carregando')) + '|' + location.pathname")
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


def status_api(caminho):
    return api("GET", caminho)["status"]


def texto_principal(n=400):
    return (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "").replace("\n", " | ")


def eh_404():
    return bool(js("document.body.innerText.includes('404') || document.body.innerText.includes('could not be found')"))


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


def escolher(rotulo, opcao):
    """Escolhe `opcao` no Select (Radix) do campo `rotulo`. O Radix abre no
    pointerdown de mouse de verdade, entao o clique e por coordenada; el.click()
    nao abre a lista."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    xy = _centro(gatilho)
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
