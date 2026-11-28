# Validacao viva da onda 5 da frente de UX do Meu Empório (a tela Estatisticas,
# docs/superpowers/specs/2026-11-24-emporio-ux-design.md 5.10 e 5.11 e o plano
# docs/superpowers/plans/2026-11-27-emporio-ux-onda5-estatisticas.md): o item unico do menu, a
# Visao geral com os tres cartoes, o filtro de periodo e loja, o Gestor de uma loja so, os quatro
# enderecos que somem, os Relatorios para imprimir (as oito planilhas e as folhas) e o celular.
#
# O cenario tem a "U5 Loja A" (Gestor so dela, Caixa dela) e a "U5 Loja B", o Financeiro e o Dono.
# Loja A, no dia 1 do mes corrente: vendas de 200,00 (Zeca Gestor U5), 100,00, 50,00 (devolvida
# inteira) e 30,00 de Adubo (margem negativa, Zeca): 330,00 com a devolucao, 380,00 sem ela; no
# mes anterior, 300,00 ("10% acima de <mes anterior>"); um produto parado (U5 Milheto). Loja B: 190,00
# no mes, fiado de 100,00 vencido e de 40,00 a vencer, e uma conta a pagar de 250,00 em 15 dias.
# Os numeros exatos valem com ?loja=<id> de uma loja U5: o Dono ainda enxerga as lojas da
# demonstracao em "Todas".
#
# cenario: scripts/_cenario-emporio-ux-onda5.ts
# sessao: dono owner@example.com
# sessao: gestor u5-gestor@teste.local
# sessao: fin u5-fin@teste.local
# sessao: caixa u5-caixa@teste.local
# sessao: gestor2 u5-gestor2@teste.local
import os
import re
import base64
import datetime

PASTA_DAS_FOTOS = os.environ.get("TIBE_FOTOS", "")

# O next dev recarrega a aba aberta quando compila uma rota nova pela primeira vez, e a leitura que estava
# em andamento morre com "Inspected target navigated or closed". Leitura (sem clique nem navegacao) se repete;
# o que clica ou navega nao se repete, para nao agir duas vezes.
_js_do_harness = js


def js(expressao, *args, **kwargs):
    pode_repetir = ".click()" not in expressao and "location.href" not in expressao and "click_at" not in expressao
    for tentativa in range(6):
        try:
            return _js_do_harness(expressao, *args, **kwargs)
        except RuntimeError as e:
            if not pode_repetir or "navigated or closed" not in str(e) or tentativa == 5:
                raise
            time.sleep(3)


LOJA_A = "U5 Loja A"
LOJA_B = "U5 Loja B"
ZECA = "Zeca Gestor U5"
RACAO = "U5 Ração"
ANTIGOS = ["/emporio/relatorios", "/emporio/resultado", "/emporio/financeiro/relatorios", "/emporio/financeiro/projecao"]
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
NBSP = " "

# O "hoje" de Brasilia (UTC-3, sem horario de verao) e os recortes que a tela calcula.
HOJE = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=3)).date()
UM_DIA = datetime.timedelta(days=1)
PRIMEIRO = HOJE.replace(day=1)
ULTIMO = (PRIMEIRO.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - UM_DIA
PASSADO_ULTIMO = PRIMEIRO - UM_DIA
PASSADO_PRIMEIRO = PASSADO_ULTIMO.replace(day=1)
RETRASADO_ULTIMO = PASSADO_PRIMEIRO - UM_DIA
MES_PASSADO = MESES[PASSADO_ULTIMO.month - 1]
MES_RETRASADO = MESES[RETRASADO_ULTIMO.month - 1]
MES_CORRENTE = MESES[HOJE.month - 1]
SETE_DIAS = HOJE - datetime.timedelta(days=6)
AAAA_MM_PASSADO = PASSADO_ULTIMO.strftime("%Y-%m")


def foto(nome):
    """Foto da tela inteira, so quando TIBE_FOTOS aponta uma pasta (fora do git)."""
    if not PASTA_DAS_FOTOS:
        return
    os.makedirs(PASTA_DAS_FOTOS, exist_ok=True)
    r = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=True)
    with open(os.path.join(PASTA_DAS_FOTOS, nome + ".png"), "wb") as f:
        f.write(base64.b64decode(r["data"]))


def norm(s):
    return (s or "").replace(NBSP, " ")


def tem(texto, n=80000):
    pagina = norm(js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "")
    return texto.lower() in pagina.lower()


def endereco():
    return (js("location.pathname + location.search") or "")


def param(nome):
    return js("new URLSearchParams(location.search).get(" + repr(nome) + ")")


def sem_rolagem_lateral():
    return js("document.documentElement.scrollWidth <= window.innerWidth")


def folga():
    return js("document.documentElement.scrollWidth + ' > ' + window.innerWidth")


def abas(rotulo_do_nav):
    return js("(() => { const n = document.querySelector('nav[aria-label=' + " + repr("'" + rotulo_do_nav + "'") + " + ']'); return n ? Array.from(n.querySelectorAll('a')).map(a => [a.innerText.replace(/\\u00a0/g, ' ').trim(), a.getAttribute('aria-current') === 'page']) : []; })()") or []


def aba_atual(rotulo_do_nav):
    return [t for t, a in abas(rotulo_do_nav) if a]


def href_da_aba(inicio):
    return js("(() => { const n = document.querySelector('nav[aria-label=\"Abas das Estatísticas\"]'); const a = n && Array.from(n.querySelectorAll('a')).find(x => x.innerText.trim().startsWith(" + repr(inicio) + ")); return a ? a.getAttribute('href') : null; })()")


def menu_do_empório():
    ir("/emporio")
    abrir_subgrupos()
    return menu()


def centavos(texto):
    """'R$ 1.234,56' (ou '-R$ 15,00') vira centavos; texto sem numero vira None."""
    t = norm(texto)
    m = re.search(r"(\d[\d.]*),(\d\d)", t)
    if not m:
        return None
    c = int(m.group(1).replace(".", "")) * 100 + int(m.group(2))
    return -c if "-" in t.split("R$")[0] or re.search(r"-\s*R\$", t) else c


# --- os cartoes da Visao geral -------------------------------------------------------------
def _cartao(titulo):
    return "(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === " + repr(titulo) + "); return h ? h.closest('section') : null; })()"


def cartao_existe(titulo):
    return bool(js("!!" + _cartao(titulo)))


def texto_do_cartao(titulo):
    return norm(js("(() => { const s = " + _cartao(titulo) + "; return s ? s.innerText : ''; })()") or "")


def grande(titulo):
    return norm(js("(() => { const s = " + _cartao(titulo) + "; const p = s && s.querySelector('p.text-3xl'); return p ? p.innerText.trim() : ''; })()") or "")


def rotulo_do_grande(titulo):
    return norm(js("(() => { const s = " + _cartao(titulo) + "; const p = s && s.querySelector('p.text-3xl'); const q = p && p.nextElementSibling; return q ? q.innerText.trim() : ''; })()") or "")


def linha_do_cartao(titulo, rotulo):
    return norm(js("(() => { const s = " + _cartao(titulo) + "; const d = s && Array.from(s.querySelectorAll('div')).find(x => x.children.length === 2 && x.children[0].innerText.trim() === " + repr(rotulo) + "); return d ? d.children[1].innerText.trim() : ''; })()") or "")


def esperar_cartoes():
    esperar(lambda: cartao_existe("Vendas") and grande("Vendas") != "", 60)


def total_das_lojas_na_aba_vendas():
    """A soma da coluna Total do bloco 'Vendas por loja' da aba Vendas, em centavos, e os nomes."""
    linhas = js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Vendas por loja'); const b = h && h.parentElement; if (!b) return null; return Array.from(b.querySelectorAll('tbody tr')).map(r => [r.children[0].innerText.trim(), r.children[2].innerText]); })()")
    if linhas is None:
        return None, []
    return sum(centavos(t) or 0 for n, t in linhas), [n for n, t in linhas]


def clicar_link(texto):
    return bool(js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(texto) + "); if (!a) return false; a.click(); return true; })()"))


def botao_do_topo():
    """O botao 'Loja: ...' do topo (onda 6 da UX: o filtro de loja saiu da tela), ou None."""
    return js("(Array.from(document.querySelectorAll('button')).map(b => b.innerText.replace(/\\u00a0/g, ' ').trim()).find(t => t.startsWith('Loja:'))) || null")


def escolher_loja(nome):
    """Escolhe a loja no seletor do topo: abre o botao e toca no item `nome`."""
    if not js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().startsWith('Loja:')); if (!b) return false; b.click(); return true; })()"):
        return "SEM CAMPO"
    time.sleep(0.8)
    if not js("(() => { const i = Array.from(document.querySelectorAll('button[type=button]')).find(x => x.innerText.trim() === " + repr(nome) + " && x.closest('.absolute')); if (!i) return false; i.click(); return true; })()"):
        return "SEM OPCAO"
    time.sleep(3)
    return True


def ir_com_loja(caminho, loja_id):
    """Abre `caminho` com a loja escolhida no topo (cookie), sem `?loja=`: os links da tela (chips, abas)
    nao levam mais a loja, e com `?loja=` na URL o primeiro clique voltava a 'Todas as lojas'."""
    api("POST", "/api/v1/emporio/loja-do-topo", {"establishment_id": loja_id or None})
    ir(caminho)


def lista_de(chave):
    return (api("GET", "/api/v1/emporio/" + chave) or {}).get("body", {}).get("data", []) or []


def buscar(caminho):
    """GET na pagina com a sessao do navegador: {status, tipo, texto}. Repete se o next dev ainda compilava a rota."""
    expr = "fetch(" + repr(caminho) + ").then(async r => ({ status: r.status, tipo: r.headers.get('content-type') || '', texto: await r.text() }))"
    for tentativa in range(4):
        try:
            return js(expr)
        except RuntimeError as e:
            if "timed out" not in str(e) or tentativa == 3:
                raise
            time.sleep(20)


def json_de(caminho):
    r = api("GET", caminho) or {}
    return r.get("status"), (r.get("body") or {}).get("data")


def primeira_linha(csv):
    return csv.lstrip("﻿").split("\r\n")[0]


def relatorios_da_aba():
    """Os relatorios da aba Relatorios para imprimir: [[titulo, href da folha, href da planilha]...]."""
    return js("Array.from(document.querySelectorAll('main li')).map(li => { const t = li.querySelector('p.font-medium'); const ach = (rot) => { const a = Array.from(li.querySelectorAll('a')).find(x => x.innerText.trim() === rot); return a ? a.getAttribute('href') : null; }; return [t ? t.innerText.trim() : '', ach('Imprimir ou PDF'), ach('Planilha')]; })") or []


def titulos_h2():
    return js("Array.from(document.querySelectorAll('main h2')).map(h => h.innerText.trim())") or []


def cabecalho_do_menu_ok(m, quem):
    confere("o menu do " + quem + " tem o item Estatísticas", "/emporio/estatisticas" in m, m)
    for antigo in ANTIGOS:
        confere("o menu do " + quem + " NÃO tem " + antigo, antigo not in m, m)


def url_da_aba(aba, extra=""):
    return "/emporio/estatisticas?aba=" + aba + extra


# --- 0. Computador -------------------------------------------------------------------------
cdp("Emulation.setDeviceMetricsOverride", width=1280, height=900, deviceScaleFactor=1, mobile=False)
print("   hoje (Brasilia):", HOJE, "| mes passado:", MES_PASSADO, "| mes anterior ao passado:", MES_RETRASADO)

# --- 1. O menu e o Caixa ---------------------------------------------------------------------
passo("1. Menu: Dono e Gestor têm Estatísticas e nenhum dos quatro itens antigos; o Caixa volta ao Início")
entrar("dono")
m = menu_do_empório()
print("   menu do Dono:", m)
cabecalho_do_menu_ok(m, "Dono")
lojas = lista_de("establishments")
loja_a = next((x["id"] for x in lojas if x.get("name") == LOJA_A), None)
loja_b = next((x["id"] for x in lojas if x.get("name") == LOJA_B), None)
print("   lojas do cenário:", loja_a, loja_b)
confere("achou a " + LOJA_A + " e a " + LOJA_B + " pela API", bool(loja_a) and bool(loja_b), [x.get("name") for x in lojas][:8])

entrar("gestor")
m = menu_do_empório()
print("   menu do Gestor:", m)
cabecalho_do_menu_ok(m, "Gestor")

entrar("caixa")
# O Início do Caixa é o balcão (/emporio redireciona para /emporio/vender). A aba do Chrome de testes NÃO
# navega até lá: o balcão do Caixa, neste cenário, entra em laço de recarga (ver o relato da T7). O
# caminho do redirecionamento se lê por fetch, que segue os redirecionamentos e diz onde parou.
ir("/robots.txt")
final = js("fetch('/emporio/estatisticas').then(r => ({ status: r.status, caminho: new URL(r.url).pathname }))")
print("   o Caixa pedindo /emporio/estatisticas parou em:", final)
confere("o Caixa, abrindo /emporio/estatisticas, volta ao Início (o balcão), não fica nas Estatísticas", final["status"] == 200 and final["caminho"] in ("/emporio", "/emporio/vender"), final)
html_caixa = buscar("/emporio/vender")["texto"]
confere("o menu do Caixa (a casca do balcão) NÃO tem o link das Estatísticas", html_caixa.count('href="/emporio/vender"') > 0 and 'href="/emporio/estatisticas"' not in html_caixa, len(html_caixa))

# --- 2. Dono, Visão geral ---------------------------------------------------------------------
passo("2. Dono: a Visão geral com os três cartões, a comparação exata e os números da " + LOJA_A)
entrar("dono")
ir("/emporio/estatisticas?loja=" + (loja_a or ""))
esperar_cartoes()
confere("a aba atual é a Visão geral", aba_atual("Abas das Estatísticas") == ["Visão geral"], abas("Abas das Estatísticas"))
confere("as cinco abas, com Dinheiro", [t for t, a in abas("Abas das Estatísticas")] == ["Visão geral", "Vendas", "Dinheiro", "Resultado", "Relatórios para imprimir"], abas("Abas das Estatísticas"))
confere("os três cartões: Vendas, Dinheiro e Resultado", all(cartao_existe(c) for c in ("Vendas", "Dinheiro", "Resultado")), titulos_h2())
print("   cartão Vendas (loja A):", texto_do_cartao("Vendas").replace("\n", " | ")[:300])
confere("Vendas da " + LOJA_A + ": R$ 330,00 (380,00 menos a devolução de 50,00)", grande("Vendas") == "R$ 330,00", grande("Vendas"))
confere("a comparação exata: '10% acima de " + MES_PASSADO + ", no mesmo período'", tem("10% acima de " + MES_PASSADO + ", no mesmo período"), texto_do_cartao("Vendas")[:200])
confere("Produto que mais vendeu: " + RACAO, linha_do_cartao("Vendas", "Produto que mais vendeu") == RACAO, linha_do_cartao("Vendas", "Produto que mais vendeu"))
confere("Melhor vendedor: " + ZECA, linha_do_cartao("Vendas", "Melhor vendedor") == ZECA, linha_do_cartao("Vendas", "Melhor vendedor"))
confere("Produtos parados no período: 1 (o Milheto)", linha_do_cartao("Vendas", "Produtos parados no período") == "1", linha_do_cartao("Vendas", "Produtos parados no período"))
print("   cartão Resultado (loja A):", texto_do_cartao("Resultado").replace("\n", " | ")[:300])
confere("Resultado: 'de resultado em <mês>, margem de ...'", rotulo_do_grande("Resultado").startswith("de resultado em "), rotulo_do_grande("Resultado"))
confere("Resultado: 1 venda com margem negativa", linha_do_cartao("Resultado", "Vendas com margem negativa") == "1", linha_do_cartao("Resultado", "Vendas com margem negativa"))
resultado_do_cartao = grande("Resultado")
ir(url_da_aba("resultado", "&loja=" + (loja_a or "")))
esperar(lambda: aba_atual("Abas das Estatísticas") == ["Resultado"] and "Vendas com margem negativa" in titulos_h2(), 60)
confere("a aba Resultado é a atual, com o mês detalhado da loja", aba_atual("Abas das Estatísticas") == ["Resultado"] and "Vendas com margem negativa" in titulos_h2(), [abas("Abas das Estatísticas"), titulos_h2()])
confere("o resultado do cartão (" + resultado_do_cartao + ") é o da aba Resultado", bool(resultado_do_cartao) and tem(resultado_do_cartao), texto_principal(400))
confere("a aba Resultado lista a venda de margem negativa (Adubo, R$ 30,00)", tem("Vendas com margem negativa") or tem("margem negativa"), texto_principal(300))

st, cmp = json_de("/api/v1/emporio/reports/sales/comparison?from=" + PRIMEIRO.isoformat() + "&to=" + ULTIMO.isoformat() + "&establishment_id=" + (loja_a or ""))
print("   API de comparação:", st, cmp)
confere("a comparação pela API: atual 330, anterior 300, variação 10", st == 200 and cmp and cmp["atual"]["total"] == 330 and cmp["anterior"]["total"] == 300 and cmp["variacao_pct"] == 10, cmp)
# "Este mês" vai até o último dia, mas só há venda até hoje: a comparação corta em hoje, e o anterior é o
# mesmo trecho (do dia 1 ao dia de hoje no mês passado), não o mês passado quase inteiro.
MESMO_DIA_PASSADO = PASSADO_ULTIMO.replace(day=min(HOJE.day, PASSADO_ULTIMO.day))
confere("Este mês: a comparação vai do dia 1 a hoje, contra o dia 1 a " + MESMO_DIA_PASSADO.strftime("%d/%m"), bool(cmp) and cmp["atual"]["to"] == HOJE.isoformat() and cmp["anterior"]["to"] == MESMO_DIA_PASSADO.isoformat(), cmp)
st, rel = json_de("/api/v1/emporio/reports/sales?from=" + PRIMEIRO.isoformat() + "&to=" + ULTIMO.isoformat() + "&establishment_id=" + (loja_a or ""))
dias = (rel or {}).get("por_dia") or []
print("   por_dia: ", len(dias), "dias, soma", round(sum(d["total"] for d in dias), 2))
confere("por_dia cobre todos os dias do mês (zero incluído)", len(dias) == (ULTIMO - PRIMEIRO).days + 1, len(dias))
confere("a soma do por_dia é 330 (a devolução desconta no dia dela)", round(sum(d["total"] for d in dias), 2) == 330, round(sum(d["total"] for d in dias), 2))

passo("2b. Dono: Dinheiro e a comparação sem venda anterior, na " + LOJA_B)
ir("/emporio/estatisticas?loja=" + (loja_b or ""))
esperar_cartoes()
print("   cartão Dinheiro (loja B):", texto_do_cartao("Dinheiro").replace("\n", " | ")[:400])
confere("Vendas da " + LOJA_B + ": R$ 190,00", grande("Vendas") == "R$ 190,00", grande("Vendas"))
confere("sem venda no mês anterior: 'Sem vendas em " + MES_PASSADO + ", no mesmo período'", tem("Sem vendas em " + MES_PASSADO + ", no mesmo período"), texto_do_cartao("Vendas")[:200])
confere("Dinheiro: A receber R$ 140,00", linha_do_cartao("Dinheiro", "A receber") == "R$ 140,00", linha_do_cartao("Dinheiro", "A receber"))
confere("Dinheiro: 'dos quais vencido' R$ 100,00 (o fiado vencido)", linha_do_cartao("Dinheiro", "dos quais vencido") == "R$ 100,00", linha_do_cartao("Dinheiro", "dos quais vencido"))
confere("Dinheiro: A pagar nos próximos 30 dias R$ 250,00", linha_do_cartao("Dinheiro", "A pagar nos próximos 30 dias") == "R$ 250,00", linha_do_cartao("Dinheiro", "A pagar nos próximos 30 dias"))
confere("Dinheiro: 'em caixa e nas contas agora' e 'Saldo previsto em 30 dias'", rotulo_do_grande("Dinheiro") == "em caixa e nas contas agora" and bool(linha_do_cartao("Dinheiro", "Saldo previsto em 30 dias")), texto_do_cartao("Dinheiro")[:200])
confere("Dinheiro: diz que olha de hoje para a frente", "Olha de hoje para a frente e não usa o período escolhido." in texto_do_cartao("Dinheiro"), texto_do_cartao("Dinheiro")[-120:])
confere("'Ver dinheiro ›' leva à aba Dinheiro (a loja vai pelo topo, não mais pelo link: onda 6 da UX)", bool(js("(() => { const s = " + _cartao("Dinheiro") + "; const a = s && s.querySelector('a'); return !!a && a.getAttribute('href').includes('aba=dinheiro') && !a.getAttribute('href').includes('loja='); })()")))

passo("2c. Dono, Todas: o total do cartão Vendas é o da aba Vendas (lido na mesma tela)")
ir("/emporio/estatisticas")
esperar_cartoes()
total_cartao = centavos(grande("Vendas"))
ir(url_da_aba("vendas"))
soma_aba, nomes = total_das_lojas_na_aba_vendas()
print("   cartão:", total_cartao, "| soma de Vendas por loja:", soma_aba, "|", nomes)
confere("o cartão e a soma de 'Vendas por loja' da aba Vendas batem", total_cartao is not None and soma_aba == total_cartao, [total_cartao, soma_aba])
confere("'Todas' inclui as duas lojas do cenário", LOJA_A in nomes and LOJA_B in nomes, nomes)

# --- 3. O filtro ------------------------------------------------------------------------------
passo("3. Filtro: Mês passado, 7 dias, a loja (do topo) preserva a aba e o período inválido")
ir_com_loja("/emporio/estatisticas", loja_a)
esperar_cartoes()
confere("'Este mês' é o chip ativo", bool(js("!!Array.from(document.querySelectorAll('main a[aria-current=true]')).find(a => a.innerText.trim() === 'Este mês')")))
confere("clica em 'Mês passado'", clicar_link("Mês passado"))
esperar(lambda: param("de") == PASSADO_PRIMEIRO.isoformat(), 40)
print("   endereço:", endereco())
confere("'Mês passado' grava de e ate do mês passado", param("de") == PASSADO_PRIMEIRO.isoformat() and param("ate") == PASSADO_ULTIMO.isoformat(), endereco())
esperar_cartoes()
confere("'Mês passado' muda o total: Vendas da " + LOJA_A + " R$ 300,00", bool(esperar(lambda: grande("Vendas") == "R$ 300,00", 40)), grande("Vendas"))
confere("e a comparação passa para o mês anterior a ele ('Sem vendas em " + MES_RETRASADO + "')", tem("Sem vendas em " + MES_RETRASADO + ", no mesmo período"), texto_do_cartao("Vendas")[:200])
confere("o cartão Resultado vai para o mês passado ('de resultado em " + MES_PASSADO + "')", MES_PASSADO in rotulo_do_grande("Resultado").lower(), rotulo_do_grande("Resultado"))
confere("a aba Resultado, com o mesmo filtro, mostra o mês passado", bool(js("(() => { const a = Array.from(document.querySelectorAll('nav[aria-label=\"Abas das Estatísticas\"] a')).find(x => x.innerText.trim() === 'Resultado'); return !!a && a.getAttribute('href').includes('de=' + " + repr(PASSADO_PRIMEIRO.isoformat()) + "); })()")), href_da_aba("Resultado"))

confere("clica em '7 dias'", clicar_link("7 dias"))
esperar(lambda: param("de") == SETE_DIAS.isoformat(), 40)
confere("'7 dias' grava de = hoje menos 6 e ate = hoje", param("de") == SETE_DIAS.isoformat() and param("ate") == HOJE.isoformat(), endereco())

ir(url_da_aba("vendas", "&de=" + PRIMEIRO.isoformat() + "&ate=" + ULTIMO.isoformat()))
confere("escolhe a " + LOJA_B + " no seletor de loja", escolher_loja(LOJA_B) is True)
esperar(lambda: botao_do_topo() == "Loja: " + LOJA_B, 40)
time.sleep(2)
print("   endereço depois da loja:", endereco(), "| topo:", botao_do_topo())
confere("a loja do topo vale (botão 'Loja: " + LOJA_B + "') e preserva a aba (vendas)", param("aba") == "vendas" and botao_do_topo() == "Loja: " + LOJA_B and param("loja") is None, [endereco(), botao_do_topo()])
confere("a loja preserva o período", param("de") == PRIMEIRO.isoformat() and param("ate") == ULTIMO.isoformat(), endereco())
confere("a aba Vendas é a atual depois de trocar a loja", aba_atual("Abas das Estatísticas") == ["Vendas"], abas("Abas das Estatísticas"))

ir("/emporio/estatisticas?de=2025-01-01&ate=" + HOJE.isoformat())
esperar_cartoes()
confere("período de mais de 366 dias: o aviso 'Período inválido. Mostrando este mês.'", tem("Período inválido. Mostrando este mês."), texto_principal(300))
confere("e a tela abre normal, sem erro cru (os cartões estão lá)", cartao_existe("Vendas") and not eh_404(), titulos_h2())
confere("volta a Este mês: o chip 'Este mês' é o ativo", bool(js("!!Array.from(document.querySelectorAll('main a[aria-current=true]')).find(a => a.innerText.trim() === 'Este mês')")))

# --- 4. O Gestor de uma loja só ---------------------------------------------------------------
passo("4. Gestor da " + LOJA_A + ": sem Dinheiro, ?aba=dinheiro cai na Visão geral, só os números da loja dele")
entrar("gestor")
ir("/emporio/estatisticas")
esperar_cartoes()
ab = abas("Abas das Estatísticas")
print("   abas do Gestor:", ab)
confere("o Gestor não tem a aba Dinheiro", [t for t, a in ab] == ["Visão geral", "Vendas", "Resultado", "Relatórios para imprimir"], ab)
confere("o Gestor não tem o cartão Dinheiro, e vê Vendas e Resultado", not cartao_existe("Dinheiro") and cartao_existe("Vendas") and cartao_existe("Resultado"), titulos_h2())
confere("o Gestor, com uma loja só, não recebe o seletor de loja", not js("!!document.querySelector('main button[aria-label=\"Loja\"]')"))
confere("Vendas do Gestor (sem filtro): só a loja dele, R$ 330,00", grande("Vendas") == "R$ 330,00", grande("Vendas"))
confere("o Gestor vê o mesmo melhor vendedor e a mesma comparação", linha_do_cartao("Vendas", "Melhor vendedor") == ZECA and tem("10% acima de " + MES_PASSADO + ", no mesmo período"), texto_do_cartao("Vendas")[:200])
confere("o Gestor: 1 venda com margem negativa (a da loja dele)", linha_do_cartao("Resultado", "Vendas com margem negativa") == "1", linha_do_cartao("Resultado", "Vendas com margem negativa"))

ir("/emporio/estatisticas?aba=dinheiro")
esperar_cartoes()
print("   endereço após ?aba=dinheiro:", endereco())
confere("?aba=dinheiro cai na Visão geral para o Gestor", aba_atual("Abas das Estatísticas") == ["Visão geral"], abas("Abas das Estatísticas"))
confere("e não mostra o cartão Dinheiro nem 'A receber'", not cartao_existe("Dinheiro") and not tem("A receber"), titulos_h2())
st = buscar("/api/v1/emporio/finance/reports/receivables-aging?format=csv")
confere("a rota do CSV do dinheiro continua recusando o Gestor (403)", st["status"] == 403, st["status"])

ir(url_da_aba("vendas"))
soma_g, nomes_g = total_das_lojas_na_aba_vendas()
print("   Vendas por loja do Gestor:", soma_g, nomes_g)
confere("a aba Vendas do Gestor lista só a " + LOJA_A + " (R$ 330,00)", nomes_g == [LOJA_A] and soma_g == 33000, [soma_g, nomes_g])
ir(url_da_aba("resultado"))
confere("a aba Resultado do Gestor mostra o mês detalhado da loja dele, sem a " + LOJA_B, not tem(LOJA_B) and not eh_404(), texto_principal(300))
st = buscar("/api/v1/emporio/result/stores?month=" + HOJE.strftime("%Y-%m") + "&format=csv")
confere("a planilha do Resultado do Gestor só tem a " + LOJA_A, st["status"] == 200 and LOJA_A in st["texto"] and LOJA_B not in st["texto"], [st["status"], st["texto"][:200]])
# A loja de fora do alcance, pedida pela URL: a tela e a folha a descartam, a rota recusa.
ir(url_da_aba("vendas", "&loja=" + (loja_b or "")))
soma_f, nomes_f = total_das_lojas_na_aba_vendas()
confere("o Gestor com ?loja=<" + LOJA_B + "> na URL continua vendo só a " + LOJA_A, nomes_f == [LOJA_A] and not tem(LOJA_B), [soma_f, nomes_f])
folha_fora = buscar("/emporio/imprimir/relatorio/vendedores?de=" + PRIMEIRO.isoformat() + "&ate=" + ULTIMO.isoformat() + "&loja=" + (loja_b or ""))
confere("a folha 'Vendas por vendedor' com a " + LOJA_B + " na URL não mostra a " + LOJA_B, folha_fora["status"] == 200 and LOJA_B not in folha_fora["texto"], [folha_fora["status"], len(folha_fora["texto"])])
csv_fora = buscar("/api/v1/emporio/reports/sales?from=" + PRIMEIRO.isoformat() + "&to=" + ULTIMO.isoformat() + "&establishment_id=" + (loja_b or "") + "&format=csv&relatorio=vendedores")
confere("a planilha com establishment_id da " + LOJA_B + " é recusada ao Gestor (404)", csv_fora["status"] == 404, [csv_fora["status"], csv_fora["texto"][:120]])

# --- 4b. O Gestor das duas lojas: Resultado com "Todas" (decisao 5) ------------------------------
passo("4b. Gestor das duas lojas U5, sem Dinheiro: Resultado com Todas mostra a soma e 'Loja por loja'")
entrar("gestor2")
ir(url_da_aba("resultado"))
esperar(lambda: tem("Resultado das suas lojas"), 60)
print("   aba Resultado do Gestor Duas:", texto_principal(500))
confere("o Gestor Duas não tem a aba Dinheiro", "Dinheiro" not in [t for t, a in abas("Abas das Estatísticas")], abas("Abas das Estatísticas"))
confere("aparece a soma das lojas dele ('Resultado das suas lojas')", tem("Resultado das suas lojas"), texto_principal(300))
confere("a soma de Vendas das duas lojas: R$ 520,00 (330,00 + 190,00)", tem("R$ 520,00"), texto_principal(400))
lojas_tabela = js("(() => { const h = Array.from(document.querySelectorAll('main h2')).find(x => x.innerText.trim() === 'Loja por loja'); const b = h && h.parentElement; return b ? Array.from(b.querySelectorAll('tbody tr')).map(r => r.children[0].innerText.trim()) : null; })()")
print("   Loja por loja:", lojas_tabela)
confere("'Loja por loja' lista só as lojas dele (" + LOJA_A + " e " + LOJA_B + ")", lojas_tabela is not None and sorted(lojas_tabela) == [LOJA_A, LOJA_B], lojas_tabela)
confere("'Produtos do mês' NÃO aparece", "Produtos do mês" not in titulos_h2(), titulos_h2())
confere("'Vendas com margem negativa' NÃO aparece", "Vendas com margem negativa" not in titulos_h2(), titulos_h2())
confere("aparece 'Escolha uma loja para ver o mês detalhado'", tem("Escolha uma loja para ver o mês detalhado"), texto_principal(400))
ir("/emporio/estatisticas")
esperar_cartoes()
confere("o cartão Resultado do Gestor Duas, em Todas: 1 venda com margem negativa (a da " + LOJA_A + ") e o aviso do ponto de equilíbrio", linha_do_cartao("Resultado", "Vendas com margem negativa") == "1" and "Escolha uma loja para ver o ponto de equilíbrio." in texto_do_cartao("Resultado"), texto_do_cartao("Resultado")[:300])
confere("a Visão geral do Gestor Duas, em Todas: cartão Resultado com as duas lojas e sem o Dinheiro", cartao_existe("Resultado") and not cartao_existe("Dinheiro") and LOJA_A in texto_do_cartao("Resultado") and LOJA_B in texto_do_cartao("Resultado"), texto_do_cartao("Resultado")[:300])
confere("e com seletor de loja no topo (tem mais de uma)", botao_do_topo() is not None, botao_do_topo())

# --- 5. Os quatro endereços antigos -------------------------------------------------------------
passo("5. Os quatro endereços antigos caem na aba e no período certos (Dono)")
entrar("dono")
ir("/emporio/relatorios?de=" + PRIMEIRO.isoformat() + "&ate=" + HOJE.isoformat() + "&loja=" + (loja_a or "") + "&abc=clientes&medida=lucro")
print("   /relatorios ->", endereco())
confere("/emporio/relatorios vira a aba Vendas, com de, ate, loja, abc e medida", endereco().startswith("/emporio/estatisticas") and param("aba") == "vendas" and param("de") == PRIMEIRO.isoformat() and param("ate") == HOJE.isoformat() and param("loja") == loja_a and param("abc") == "clientes" and param("medida") == "lucro", endereco())
confere("a aba Vendas está aberta", aba_atual("Abas das Estatísticas") == ["Vendas"], abas("Abas das Estatísticas"))

ir("/emporio/resultado?mes=" + AAAA_MM_PASSADO + "&loja=all")
print("   /resultado ->", endereco())
confere("/emporio/resultado?mes=<mês passado>&loja=all vira a aba Resultado do mês passado, sem loja", endereco().startswith("/emporio/estatisticas") and param("aba") == "resultado" and param("de") == PASSADO_PRIMEIRO.isoformat() and param("ate") == PASSADO_ULTIMO.isoformat() and param("loja") is None, endereco())
confere("a aba Resultado está aberta", aba_atual("Abas das Estatísticas") == ["Resultado"], abas("Abas das Estatísticas"))
confere("o filtro marca 'Mês passado' como o período ativo", bool(js("!!Array.from(document.querySelectorAll('main a[aria-current=true]')).find(a => a.innerText.trim() === 'Mês passado')")), endereco())

ir("/emporio/financeiro/relatorios?loja=" + (loja_a or "") + "&de=" + PRIMEIRO.isoformat() + "&ate=" + HOJE.isoformat())
print("   /financeiro/relatorios ->", endereco())
confere("/emporio/financeiro/relatorios vira a aba Dinheiro, com loja e período", endereco().startswith("/emporio/estatisticas") and param("aba") == "dinheiro" and param("loja") == loja_a and param("de") == PRIMEIRO.isoformat() and param("ate") == HOJE.isoformat(), endereco())
confere("a aba Dinheiro está aberta", aba_atual("Abas das Estatísticas") == ["Dinheiro"], abas("Abas das Estatísticas"))

ir("/emporio/financeiro/projecao?loja=" + (loja_a or "") + "&dias=60")
print("   /financeiro/projecao ->", endereco())
confere("/emporio/financeiro/projecao vira a aba Dinheiro, com loja e dias=60", endereco().startswith("/emporio/estatisticas") and param("aba") == "dinheiro" and param("loja") == loja_a and param("dias") == "60", endereco())

# --- 6. Relatórios para imprimir ---------------------------------------------------------------
passo("6. Relatórios para imprimir: os oito do Dono (folhas e planilhas) e os quatro do Gestor")
ir(url_da_aba("imprimir", "&loja=" + (loja_a or "")))
rels = relatorios_da_aba()
print("   relatórios do Dono:", [r[0] for r in rels])
confere("o Dono vê as três seções: Vendas, Dinheiro e Resultado", [h for h in titulos_h2() if h in ("Vendas", "Dinheiro", "Resultado")] == ["Vendas", "Dinheiro", "Resultado"], titulos_h2())
confere("o Dono vê os oito relatórios", [r[0] for r in rels] == ["Curva ABC de produtos", "Vendas por vendedor", "Produtos parados", "A receber por idade", "A pagar por vencimento", "Posição de caixa", "Fluxo projetado", "Resultado do mês por loja"], [r[0] for r in rels])
confere("todo relatório tem a folha e a planilha", all(r[1] and r[2] for r in rels), rels)
cabecalhos = {
    "Curva ABC de produtos": "Classe;Nome;Valor;%;% acumulado",
    "Vendas por vendedor": "Vendedor;Vendas;Total;Ticket médio",
    "Produtos parados": "Produto;Loja",
    "Resultado do mês por loja": "Loja;Vendas;Margem;Despesas fixas;Perdas;Resultado",
}
for titulo, folha, planilha in rels:
    if not (folha and planilha):
        continue
    r = buscar(planilha)
    primeira = primeira_linha(r["texto"])
    confere("planilha '" + titulo + "': 200, text/csv e linha de títulos", r["status"] == 200 and r["tipo"].startswith("text/csv") and len(primeira) > 0 and not re.search(r"\d", primeira.split(";")[0]), [r["status"], r["tipo"], primeira])
    if titulo in cabecalhos:
        confere("planilha '" + titulo + "': títulos exatos", primeira == cabecalhos[titulo], primeira)
    corpo = r["texto"].lstrip("﻿")
    confere("planilha '" + titulo + "': vírgula decimal, sem separador de milhar", not re.search(r"\d\.\d{3},\d\d", corpo) and not re.search(r"(^|;)\d+\.\d\d(;|\r|$)", corpo), corpo[:200])
    f = buscar(folha)
    confere("folha '" + titulo + "': abre (200)", f["status"] == 200, [f["status"], folha])

csv_vend = next((buscar(p)["texto"] for t, f, p in rels if t == "Vendas por vendedor"), "")
linhas = csv_vend.lstrip("﻿").split("\r\n")
print("   planilha dos vendedores:", linhas)
confere("a planilha dos vendedores: " + ZECA + " com 2 vendas e 230,00", any(l.startswith(ZECA + ";2;230,00;") for l in linhas), linhas)
confere("a planilha dos vendedores: o Dono com 100,00 (a devolução descontada)", any(l.startswith("Owner Da Mata;2;100,00;") for l in linhas), linhas)
folha_vend = next((buscar(f)["texto"] for t, f, p in rels if t == "Vendas por vendedor"), "")
confere("a folha 'Vendas por vendedor' abre com o vendedor do cenário (" + ZECA + ")", ZECA in folha_vend and "Vendas por vendedor" in folha_vend and "230,00" in folha_vend, len(folha_vend))
folha_par = next((buscar(f)["texto"] for t, f, p in rels if t == "Produtos parados"), "")
confere("a folha 'Produtos parados' lista o U5 Milheto", "U5 Milheto" in folha_par, len(folha_par))
folha_res = next((buscar(f)["texto"] for t, f, p in rels if t == "Resultado do mês por loja"), "")
confere("a folha do Resultado lista a " + LOJA_A + " e o Total", LOJA_A in folha_res and "Total" in folha_res, len(folha_res))

passo("6b. A medida da Curva ABC acompanha a troca entre Vendas e Relatórios para imprimir")
ir(url_da_aba("vendas", "&medida=lucro&loja=" + (loja_a or "")))
href_imp = href_da_aba("Relatórios para imprimir")
print("   link da aba Relatórios para imprimir:", href_imp)
confere("com ?aba=vendas&medida=lucro, o link da aba Relatórios para imprimir carrega medida=lucro", bool(href_imp) and "medida=lucro" in href_imp, href_imp)
ir(href_imp or url_da_aba("imprimir"))
abc = next((r for r in relatorios_da_aba() if r[0] == "Curva ABC de produtos"), None)
print("   Curva ABC na aba imprimir:", abc)
confere("a planilha da ABC pede measure=profit", bool(abc) and "measure=profit" in (abc[2] or ""), abc)
confere("a folha da ABC leva medida=lucro", bool(abc) and "medida=lucro" in (abc[1] or ""), abc)
ir(url_da_aba("imprimir", "&loja=" + (loja_a or "")))
abc = next((r for r in relatorios_da_aba() if r[0] == "Curva ABC de produtos"), None)
confere("sem medida, a planilha da ABC pede measure=revenue", bool(abc) and "measure=revenue" in (abc[2] or ""), abc)

passo("6c. Gestor: só os quatro relatórios de Vendas e Resultado")
entrar("gestor")
ir(url_da_aba("imprimir"))
rels_g = relatorios_da_aba()
print("   relatórios do Gestor:", [r[0] for r in rels_g])
confere("o Gestor vê quatro relatórios: três de Vendas e o Resultado", [r[0] for r in rels_g] == ["Curva ABC de produtos", "Vendas por vendedor", "Produtos parados", "Resultado do mês por loja"], [r[0] for r in rels_g])
confere("o Gestor não vê a seção Dinheiro", "Dinheiro" not in titulos_h2(), titulos_h2())
for titulo, folha, planilha in rels_g:
    r = buscar(planilha) if planilha else {"status": None, "tipo": "", "texto": ""}
    f = buscar(folha) if folha else {"status": None, "texto": ""}
    confere("Gestor, '" + titulo + "': planilha 200 e folha 200", r["status"] == 200 and r["tipo"].startswith("text/csv") and f["status"] == 200, [r["status"], f["status"]])
f = buscar("/emporio/imprimir/relatorio/a-receber")
confere("a folha do dinheiro (a-receber) continua negada ao Gestor (404)", f["status"] == 404, f["status"])

# --- 7. Celular (390 px) -----------------------------------------------------------------------
passo("7. Celular (390 px): a Visão geral e as abas sem rolagem lateral")
entrar("dono")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
for aba, extra in (("geral", ""), ("vendas", ""), ("dinheiro", "&loja=" + (loja_b or "")), ("resultado", ""), ("imprimir", "")):
    ir(url_da_aba(aba, extra))
    esperar(lambda: not tem("Carregando"), 20)
    confere("390 px: a aba " + aba + " sem rolagem lateral", sem_rolagem_lateral(), folga())

# --- 8. Fotos (só com TIBE_FOTOS) ----------------------------------------------------------------
passo("8. Fotos (só com TIBE_FOTOS)")
for largura, altura, movel, sufixo in ((1280, 900, False, "1280"), (390, 844, True, "390")):
    cdp("Emulation.setDeviceMetricsOverride", width=largura, height=altura, deviceScaleFactor=1, mobile=movel)
    entrar("dono")
    for aba, extra in (("geral", "&loja=" + (loja_a or "")), ("vendas", "&loja=" + (loja_a or "")), ("dinheiro", "&loja=" + (loja_b or "")), ("resultado", "&loja=" + (loja_a or "")), ("imprimir", "&loja=" + (loja_a or ""))):
        ir(url_da_aba(aba, extra))
        esperar_cartoes() if aba == "geral" else time.sleep(1)
        foto("estatisticas-" + aba + "-" + sufixo)

cdp("Emulation.clearDeviceMetricsOverride")
fim()
