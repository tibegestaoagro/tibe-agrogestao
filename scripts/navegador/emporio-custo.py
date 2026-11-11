# Validacao viva do custo do produto do Meu Emporio (Modulo 39, Q297 a Q299):
# docs/superpowers/specs/2026-11-11-emporio-custo-um-so-design.md
#
#   produto: "Preco por loja" com UM custo; o Talco (contagem zerou, compra depois)
#     mostra R$ 2,35, nao R$ 1,30; sem "Ultima compra", sem selo, sem "Sugerido calculado pela"
#   loja: o campo "Base do preco sugerido" saiu do painel
#   saldo zero (Q297): o custo e a ultima compra, com "sem estoque: ultima compra"
#   estoque da loja: R$ 2,35 por kg, sem "Ultima compra"
#   nova compra (Q296): "Nesta loja o sistema tem 100 kg" e "Sem estoque nesta loja"
#   celular (360 px): a tela do produto nao rola na horizontal
#
# cenario: scripts/_cenario-emporio-custo.ts
# sessao: owner owner@example.com


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

passo("1. Produto: um custo so, e o do Talco e o da compra feita depois da contagem")
ir("/emporio/produtos/" + TALCO)
confere("a tela do produto abre", tem("Preço por loja"), texto_principal(200))
l = linha_da_loja()
print("   linha: " + l)
confere("o custo do Talco é R$ 2,35", "R$ 2,35" in l, l)
confere("não é a mistura com o estoque que não existia (R$ 1,30 ou 1,31)", ("R$ 1,30" not in l) and ("R$ 1,31" not in l), l)
confere("sem Última compra ao lado", "Última compra" not in l, l)
confere("sem selo de diferença", "do custo médio" not in l, l)
confere("sem Sugerido calculado pela", "Sugerido calculado pela" not in l, l)
confere("com estoque, sem aviso de origem", "sem estoque" not in l, l)
confere("o preço gravado continua R$ 10,00 (tela)", "R$ 10,00" in l, l)
confere("o preço gravado continua 10 (API)", valor_gravado(TALCO) == 10, valor_gravado(TALCO))

passo("2. Loja: o campo Base do preco sugerido saiu")
ir("/emporio/estabelecimentos")
confere("a tela de lojas abre", tem("Dc Loja"), texto_principal(200))
confere("abre Editar da Dc Loja", bool(js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(r => r.innerText.includes('Dc Loja')); if (!tr) return false; const b = Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === 'Editar'); if (!b) return false; b.click(); return true; })()")))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
p = texto_do_painel()
confere("o painel ainda tem Lucro padrão", "Lucro padrão" in p, p[:300])
confere("o campo Base do preço sugerido não existe mais", "Base do preço sugerido" not in p, p[:600])
confere("a API da loja não traz price_cost_basis", "price_cost_basis" not in api("GET", "/api/v1/emporio/establishments/" + LOJA)["body"]["data"])
js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
time.sleep(1)

passo("3. Saldo zero (Q297): o custo e a ultima compra")
ir("/emporio/produtos/" + AVEIA)
l = linha_da_loja()
print("   linha: " + l)
confere("o custo da Aveia é R$ 3,00", "R$ 3,00" in l, l)
confere("com o aviso sem estoque: última compra", "sem estoque: última compra" in l, l)
confere("sem Custo médio ao lado", "Custo médio" not in l, l)

passo("4. Estoque da loja: um custo so")
ir("/emporio/estoque?loja=" + LOJA)
pagina = js("(document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' ')") or ""
confere("o estoque mostra R$ 2,35 por kg", "R$ 2,35 por kg" in pagina, pagina[:800])
confere("o estoque não mostra Última compra", "Última compra" not in pagina, pagina[:800])

passo("5. Nova compra: saldo antes da compra (Q296)")
ir("/emporio/compras")
confere("abre Nova compra", bool(esperar(lambda: clicar("Nova compra"), 30)))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("escolhe a Dc Loja", escolher("Loja", "Dc Loja") is True)
confere("escolhe o Dc Talco", escolher_item("Produto do item 1", "Dc Talco") is True)
time.sleep(1)
p = texto_do_painel()
confere("mostra Nesta loja o sistema tem 100 kg", "Nesta loja o sistema tem 100" in p, p[-500:])
confere("mostra o aviso faça a contagem antes de lançar a compra", "faça a contagem antes de lançar a compra" in p, p[-500:])
confere("escolhe o Dc Aveia", escolher_item("Produto do item 1", "Dc Aveia") is True)
time.sleep(1)
p = texto_do_painel()
confere("mostra Sem estoque nesta loja", "Sem estoque nesta loja" in p, p[-500:])

passo("6. Celular (360 px): a tela do produto nao rola na horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=360, height=800, deviceScaleFactor=2, mobile=True)
ir("/emporio/produtos/" + TALCO)
confere("a tela abre", tem("Preço por loja"), texto_principal(200))
confere("sem rolagem horizontal", sem_rolagem_horizontal(), js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth"))
cdp("Emulation.clearDeviceMetricsOverride")

fim()
