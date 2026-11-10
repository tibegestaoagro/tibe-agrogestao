# Validacao viva dos dois custos do Meu Emporio (Modulo 39, Q293 a Q297):
# docs/superpowers/specs/2026-11-10-emporio-dois-custos-design.md
#
#   produto: "Preco por loja" com Custo medio, Ultima compra, selo de aviso e
#     "Sugerido calculado pela: ultima compra"; o preco gravado segue R$ 10,00
#   loja: o campo "Base do preco sugerido"; trocar para Custo medio muda so o sugerido
#   saldo zero (Q297): "Sem estoque" e o sugerido pela ultima compra
#   estoque da loja: Ultima compra e o selo
#   nova compra: "Nesta loja o sistema tem" com o aviso de contar antes; "Sem estoque nesta loja"
#   celular (360 px): a tela do produto nao rola na horizontal
#
# cenario: scripts/_cenario-emporio-dois-custos.ts
# sessao: owner owner@example.com

import re


def tem(texto, n=60000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto in pagina


def linha_da_loja():
    """O texto da linha 'Dc Loja' da tabela Preco por loja (uma por produto na tela)."""
    return js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(r => r.innerText.includes('Dc Loja')); return tr ? tr.innerText.replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ') : ''; })()") or ""


def sem_rolagem_horizontal():
    return js("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def produto_id(nome):
    r = api("GET", "/api/v1/emporio/products?q=" + nome.replace(" ", "%20"))["body"]["data"]
    achados = [p for p in r if p.get("name") == nome]
    return achados[0]["id"] if achados else ""


def loja_id():
    r = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
    achadas = [l for l in r if l.get("name") == "Dc Loja"]
    return achadas[0]["id"] if achadas else ""


def valor_gravado(pid):
    r = api("GET", "/api/v1/emporio/products/" + pid)["body"]["data"]
    linhas = [x for x in r.get("prices", []) if x.get("establishment_name") == "Dc Loja"]
    return linhas[0].get("price") if linhas else None


def escolher_item(aria, opcao):
    """Escolhe `opcao` no Select (Radix) de aria-label `aria`, por clique de verdade."""
    xy = js("(() => { const el = document.querySelector('[aria-label=' + JSON.stringify(" + repr(aria) + ") + ']'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()")
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = js("(() => { const o = Array.from(document.querySelectorAll('[role=option]')).find(x => x.innerText.trim() === " + repr(opcao) + "); if (!o) return null; o.scrollIntoView({ block: 'center' }); const b = o.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def texto_do_painel():
    return js("((document.querySelector('[role=dialog]') || { innerText: '' }).innerText).replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ')") or ""


entrar("owner")
ir("/emporio")
time.sleep(3)
esperar(lambda: api("GET", "/api/v1/emporio/products?q=Dc")["status"] == 200, 90)
TALCO = produto_id("Dc Talco")
AVEIA = produto_id("Dc Aveia")
LOJA = loja_id()
confere("o cenario existe (Dc Talco, Dc Aveia, Dc Loja)", bool(TALCO and AVEIA and LOJA), [TALCO, AVEIA, LOJA])

passo("1. Produto: os dois custos, o aviso e o sugerido pela ultima compra")
ir("/emporio/produtos/" + TALCO)
confere("a tela do produto abre", tem("Preço por loja"), texto_principal(200))
l = linha_da_loja()
print("   linha: " + l)
confere("Custo médio R$ 1,31 (ou 1,30)", ("Custo médio R$ 1,31" in l) or ("Custo médio R$ 1,30" in l), l)
confere("Última compra R$ 2,35", "Última compra R$ 2,35" in l, l)
confere("a célula de custo mostra o custo usado, não 'sem custo'", "sem custo" not in l, l)
confere("selo: acima do custo médio", "acima do custo médio" in l, l)
confere("Sugerido calculado pela: última compra", "Sugerido calculado pela: última compra" in l, l)
confere("o preço gravado continua R$ 10,00 (tela)", "R$ 10,00" in l, l)
confere("o preço gravado continua 10 (API)", valor_gravado(TALCO) == 10, valor_gravado(TALCO))

passo("2. Loja: Base do preco sugerido (padrao: o maior dos dois)")
ir("/emporio/estabelecimentos")
confere("a tela de lojas abre", tem("Dc Loja"), texto_principal(200))
confere("abre Editar da Dc Loja", clicar_na_linha("Dc Loja", "Editar") if False else bool(js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(r => r.innerText.includes('Dc Loja')); if (!tr) return false; const b = Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === 'Editar'); if (!b) return false; b.click(); return true; })()")))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("o campo Base do preço sugerido existe", "Base do preço sugerido" in texto_do_painel(), texto_do_painel()[:300])
confere("a base nasce no maior dos dois", "O maior dos dois" in texto_do_painel(), texto_do_painel()[:300])
confere("escolhe Custo médio", escolher("Base do preço sugerido", "Custo médio") is True)
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a API guarda medio", api("GET", "/api/v1/emporio/establishments/" + LOJA)["body"]["data"].get("price_cost_basis") == "medio")

passo("3. Produto com base Custo medio: o sugerido muda, o preco nao")
ir("/emporio/produtos/" + TALCO)
l = linha_da_loja()
print("   linha: " + l)
confere("Sugerido calculado pela: custo médio", "Sugerido calculado pela: custo médio" in l, l)
confere("o preço gravado continua R$ 10,00", "R$ 10,00" in l and valor_gravado(TALCO) == 10, l)

passo("4. Volta a base para o maior dos dois")
ir("/emporio/estabelecimentos")
js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(r => r.innerText.includes('Dc Loja')); Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === 'Editar').click(); })()")
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("escolhe O maior dos dois", escolher("Base do preço sugerido", "O maior dos dois (recomendado)") is True)
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a API volta a maior", api("GET", "/api/v1/emporio/establishments/" + LOJA)["body"]["data"].get("price_cost_basis") == "maior")

passo("5. Saldo zero (Q297): Sem estoque e o sugerido pela ultima compra")
ir("/emporio/produtos/" + AVEIA)
l = linha_da_loja()
print("   linha: " + l)
confere("mostra Sem estoque", "Sem estoque" in l, l)
confere("Última compra R$ 3,00", "Última compra R$ 3,00" in l, l)
confere("Sugerido calculado pela: última compra", "Sugerido calculado pela: última compra" in l, l)
confere("sem o médio velho: não mostra Custo médio", "Custo médio R$" not in l, l)

passo("6. Estoque da loja: Ultima compra e o selo")
ir("/emporio/estoque?loja=" + LOJA)
pagina = js("(document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' ')") or ""
confere("o estoque mostra Última compra R$ 2,35", "Última compra R$ 2,35" in pagina, pagina[:600])
confere("o estoque mostra o selo acima do custo médio", "acima do custo médio" in pagina, pagina[:600])

passo("7. Nova compra: saldo antes da compra e o aviso de contar")
ir("/emporio/compras")
confere("abre Nova compra", bool(esperar(lambda: clicar("Nova compra"), 30)))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("escolhe a Dc Loja", escolher("Loja", "Dc Loja") is True)
confere("escolhe o Dc Talco", escolher_item("Produto do item 1", "Dc Talco") is True)
time.sleep(1)
p = texto_do_painel()
confere("mostra Nesta loja o sistema tem 3.992 kg", "Nesta loja o sistema tem 3.992" in p, p[-500:])
confere("mostra o aviso faça a contagem antes de lançar a compra", "faça a contagem antes de lançar a compra" in p, p[-500:])
confere("escolhe o Dc Aveia", escolher_item("Produto do item 1", "Dc Aveia") is True)
time.sleep(1)
p = texto_do_painel()
confere("mostra Sem estoque nesta loja", "Sem estoque nesta loja" in p, p[-500:])
confere("o aviso de contar saiu", "faça a contagem antes de lançar a compra" not in p, p[-500:])

passo("8. Celular (360 px): a tela do produto nao rola na horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=360, height=800, deviceScaleFactor=2, mobile=True)
ir("/emporio/produtos/" + TALCO)
confere("a tela abre", tem("Preço por loja"), texto_principal(200))
confere("sem rolagem horizontal", sem_rolagem_horizontal(), js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth"))
cdp("Emulation.clearDeviceMetricsOverride")

fim()
