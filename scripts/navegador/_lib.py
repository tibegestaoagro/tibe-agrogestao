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
    js("setTimeout(() => { location.href = " + repr(BASE + caminho) + " }, 50)")
    time.sleep(1.5)
    fim_em = time.time() + espera
    while time.time() < fim_em:
        try:
            estado = js("document.readyState + '|' + location.pathname")
            if estado and estado.startswith("complete|"):
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
    return js("fetch(" + repr(caminho) + ").then(r => r.status)")


def texto_principal(n=400):
    return (js("(document.querySelector('main') || document.body).innerText.slice(0, " + str(n) + ")") or "").replace("\n", " | ")


def eh_404():
    return bool(js("document.body.innerText.includes('404') || document.body.innerText.includes('could not be found')"))


def clicar(rotulo):
    """Clica no botao cujo texto e exatamente `rotulo`."""
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def marcar(trecho_do_rotulo, marcado=True):
    """Marca (ou desmarca) o input dentro do <label> que contem o trecho."""
    return js("(() => { const l = Array.from(document.querySelectorAll('label')).find(x => x.innerText.includes(" + repr(trecho_do_rotulo) + ")); if (!l) return 'SEM ROTULO'; const i = l.querySelector('input'); if (i.checked !== " + ("true" if marcado else "false") + ") i.click(); return i.checked; })()")


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
