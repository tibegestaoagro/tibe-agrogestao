# Validacao viva da onda 3 da frente de UX do Meu Empório (o Vender na ordem do balcao,
# docs/superpowers/specs/2026-11-24-emporio-ux-design.md 5.7 e o plano
# docs/superpowers/plans/2026-11-26-emporio-ux-onda3-vender.md): a faixa do caixa, o vendedor do
# Caixa em botoes, o Consumidor final ja escolhido, "Mais opcoes", as teclas junto do campo, o
# celular e a TROCA (que nenhum roteiro cobria e que a T1 partiu em blocos).
#
# O cenario tem duas lojas: A com o caixa FECHADO e vendedores Ana, Bruno, o Dono e o Gestor
# Zeca (nessa ordem para o Caixa: a lista vem por nome, e o Dono e vendedor de toda loja); B
# com o caixa aberto desde ontem as 23h50 e o Dono como UNICO vendedor possivel.
#
# cenario: scripts/_cenario-emporio-ux-onda3.ts
# sessao: dono owner@example.com
# sessao: gestor u3-gestor@teste.local
# sessao: caixa u3-caixa@teste.local
import os
import re
import base64
import datetime as _dt

PASTA_DAS_FOTOS = os.environ.get("TIBE_FOTOS", "")
LOJA_A = "U3 Loja A"
LOJA_B = "U3 Loja B"
PRODUTO = "U3 Ração"
CLIENTE = "U3 Cliente"
CONSUMIDOR = "Consumidor final"
FRETE_ROTULO = "Frete cobrado do cliente (opcional)"
RECUSA_VENDEDOR = "Escolha o vendedor que atendeu."


def foto(nome, clip_de=None):
    """Foto da tela (ou do elemento `clip_de`, com folga), so quando TIBE_FOTOS aponta uma pasta (fora do git)."""
    if not PASTA_DAS_FOTOS:
        return
    os.makedirs(PASTA_DAS_FOTOS, exist_ok=True)
    args = dict(format="png", captureBeyondViewport=True)
    if clip_de:
        c = js("(() => { const el = document.querySelector(" + repr(clip_de) + "); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return [Math.max(0, b.left + window.scrollX - 24), Math.max(0, b.top + window.scrollY - 24), b.width + 48, b.height + 48]; })()")
        if c:
            args["clip"] = {"x": c[0], "y": c[1], "width": c[2], "height": c[3], "scale": 1}
    r = cdp("Page.captureScreenshot", **args)
    with open(os.path.join(PASTA_DAS_FOTOS, nome + ".png"), "wb") as f:
        f.write(base64.b64decode(r["data"]))


def sp_agora():
    """Agora em Sao Paulo (UTC-3, sem horario de verao desde 2019), nao o relogio da maquina."""
    return _dt.datetime.utcnow() - _dt.timedelta(hours=3)


def tecla(key, code, vk, texto=None):
    """Uma tecla de verdade pelo CDP: keyDown (com `texto` quando a tecla escreve algo) e keyUp."""
    base = dict(key=key, code=code, windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk, modifiers=0)
    if texto is not None:
        cdp("Input.dispatchKeyEvent", type="keyDown", text=texto, unmodifiedText=texto, **base)
    else:
        cdp("Input.dispatchKeyEvent", type="rawKeyDown", **base)
    cdp("Input.dispatchKeyEvent", type="keyUp", **base)
    time.sleep(0.2)


def digito(n):
    tecla(str(n), "Digit" + str(n), 48 + n, str(n))


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Fechar a venda')); if (b) b.click(); })()")


def norm(s):
    return (s or "").replace(" ", " ")


def tem(texto, n=80000):
    pagina = norm(js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "")
    return texto.lower() in pagina.lower()


def faixa():
    return js("(() => { const f = document.querySelector('[data-faixa-do-caixa]'); return f ? { tom: f.dataset.faixaDoCaixa, texto: f.querySelector('span').innerText.replace(/\\u00a0/g, ' ').trim(), botoes: Array.from(f.querySelectorAll('button')).map(b => b.innerText.trim()) } : null; })()")


def vendedores():
    """Os botoes do vendedor do Caixa: [[texto, marcado]...], ou None se nao ha radiogroup."""
    return js("(() => { const g = document.querySelector('[role=radiogroup][aria-label=\"Vendedor\"]'); return g ? Array.from(g.querySelectorAll('[role=radio]')).map(b => [b.innerText.trim(), b.getAttribute('aria-checked') === 'true']) : null; })()")


def marcado_do_vendedor():
    v = vendedores() or []
    return [t for t, m in v if m]


def foco():
    return js("(() => { const a = document.activeElement; return a ? (a.tagName + '|' + (a.getAttribute('data-atalho') || '') + '|' + (a.getAttribute('role') || '') + '|' + a.id) : ''; })()") or ""


def foco_na_busca():
    return bool(esperar(lambda: foco().split("|")[1:2] == ["busca"], 8))


def focar_busca_pelo_js():
    js("document.querySelector('[data-atalho=\"busca\"]').focus()")


def mais_opcoes():
    """(titulo, aberto) da secao 'Mais opções', ou None."""
    return js("(() => { const d = Array.from(document.querySelectorAll('details')).find(x => ((x.querySelector('summary') || { innerText: '' }).innerText || '').trim().startsWith('Mais opções')); return d ? [norm(d.querySelector('summary').innerText.trim()), d.open] : null; function norm(s) { return s.replace(/\\u00a0/g, ' '); } })()")


def fechar_mais_opcoes():
    js("(() => { const d = Array.from(document.querySelectorAll('details')).find(x => ((x.querySelector('summary') || { innerText: '' }).innerText || '').trim().startsWith('Mais opções')); if (d && d.open) d.querySelector('summary').click(); })()")
    time.sleep(0.5)


def foco_dentro_de_mais_opcoes():
    return bool(js("(() => { const d = Array.from(document.querySelectorAll('details')).find(x => ((x.querySelector('summary') || { innerText: '' }).innerText || '').trim().startsWith('Mais opções')); return !!d && d.contains(document.activeElement); })()"))


def recusas_dentro_de_mais_opcoes():
    """Texto de cada campo recusado (aria-invalid) dentro de 'Mais opções'."""
    return js("(() => { const d = Array.from(document.querySelectorAll('details')).find(x => ((x.querySelector('summary') || { innerText: '' }).innerText || '').trim().startsWith('Mais opções')); if (!d) return []; return Array.from(d.querySelectorAll('[aria-invalid=true]')).map(el => (el.getAttribute('aria-describedby') || '').split(' ').map(i => (document.getElementById(i) || {}).innerText || '').join(' ').trim()); })()") or []


def teclas_junto():
    return sorted(js("Array.from(document.querySelectorAll('kbd[data-tecla-de]')).filter(k => getComputedStyle(k).display !== 'none' && k.getBoundingClientRect().width > 0).map(k => k.dataset.teclaDe)") or [])


def legenda_do_rodape():
    return bool(js("!!document.querySelector('ul[aria-label=\"Atalhos do teclado\"]')"))


def barra_do_total():
    """A barra do total e do botao: (posicao, distancia do fundo da janela em px, rolagem do documento)."""
    return js("(() => { const p = Array.from(document.querySelectorAll('p')).find(x => /^Total (da venda|a pagar|do orçamento)/.test(x.innerText.trim())); const b = p && p.closest('div.sticky'); if (!b) return null; const r = b.getBoundingClientRect(); return [getComputedStyle(b).position, Math.round(window.innerHeight - r.bottom), document.documentElement.scrollHeight - window.innerHeight]; })()")


def janela_de_clientes():
    return norm(js("(() => { const j = document.querySelector('[data-escolha=cliente]'); return j ? j.innerText : ''; })()") or "")


def sem_rolagem_lateral():
    return js("document.documentElement.scrollWidth <= window.innerWidth")


def cliente_agora():
    return norm(escolhido("cliente"))


def abrir_vender(loja=None):
    ir("/emporio/vender")
    if loja:
        esperar(lambda: js("!!document.querySelector('label[for=establishment_id]') || !!document.getElementById('establishment_id')"), 15)
        if js("!!document.getElementById('establishment_id')"):
            escolher("Loja", loja)
    esperar(lambda: js("!!document.querySelector('[data-atalho=\"busca\"]')"), 20)


def montar_item(qtd="1"):
    ok_busca = preencher_aria("Buscar produto", "U3") != "SEM CAMPO"
    ok_add = bool(esperar(lambda: clicar_resultado(PRODUTO), 15))
    ok_qtd = preencher_aria("Quantidade do item 1", qtd) != "SEM CAMPO"
    return ok_busca and ok_add and ok_qtd


def pagar_em_dinheiro(valor):
    ok = clicar("+ Dinheiro")
    time.sleep(1)
    return ok and preencher_aria("Valor em Dinheiro (R$)", valor) != "SEM CAMPO"


def venda_registrada(segundos=60):
    return bool(esperar(lambda: tem("Venda registrada"), segundos))


# --- 0. Computador -------------------------------------------------------------------
cdp("Emulation.setDeviceMetricsOverride", width=1280, height=900, deviceScaleFactor=1, mobile=False)

# --- 1. O Caixa na loja A: caixa fechado, vendedor em botoes, F8 e o dígito ----------------
passo("1. Caixa na Loja A: faixa laranja, vendedor em botões, F8 e o dígito, abrir o caixa e vender")
entrar("caixa")
ir("/emporio/vender")
confere("o Caixa abre o balcão", (js("location.pathname") or "") == "/emporio/vender" and tem("Fechar a venda"), js("location.pathname"))
confere("o foco está na busca ao abrir a tela", foco_na_busca(), foco())
confere("escolhe a Loja A", escolher("Loja", LOJA_A) is True)
confere("a faixa do caixa aparece", bool(esperar(faixa, 20)), faixa())
f = faixa() or {}
confere("a faixa é laranja (fechado)", f.get("tom") == "fechado", f)
confere("a faixa diz 'Dá para montar a venda; para fechar, abra o caixa'", f.get("texto") == "Dá para montar a venda; para fechar, abra o caixa", f.get("texto"))
confere("a faixa traz o botão 'Abrir o caixa'", "Abrir o caixa" in (f.get("botoes") or []), f.get("botoes"))
foto("vender-caixa-1280")
foto("faixa-laranja-abrir-o-caixa", "[data-faixa-do-caixa]")
v = vendedores()
print("   vendedores do Caixa na Loja A:", v)
confere("o vendedor é um grupo de botões: 1 Ana, 2 Bruno, 3 Dono, 4 Zeca", bool(v) and [t for t, m in v] == ["1 Ana U3", "2 Bruno U3", "3 Owner Da Mata", "4 Zeca Gestor U3"], v)
confere("nenhum vendedor vem escolhido (o Caixa escolhe a cada venda)", marcado_do_vendedor() == [], v)
confere("o cliente já vem como Consumidor final", CONSUMIDOR in cliente_agora(), cliente_agora())
confere("não há 'Escolher cliente' (o botão é 'Trocar')", not clicar("Escolher cliente") and "Trocar" in cliente_agora(), cliente_agora())
tj = teclas_junto()
print("   teclas junto dos campos:", tj)
confere("as cinco teclas aparecem junto do campo (a partir de lg)", tj == ["cliente", "fechar", "pagamento", "produto", "vendedor"], tj)
confere("a legenda do rodapé saiu", not legenda_do_rodape())
mo = mais_opcoes()
confere("'Mais opções' começa recolhido e sem nada: título 'Mais opções'", mo == ["Mais opções", False], mo)
confere("monta o item (1 kg)", montar_item("1"))
confere("paga em dinheiro R$ 10,00", pagar_em_dinheiro("10"))

enviar_venda()
recusa = esperar(lambda: erro_do_campo("Vendedor"), 20)
confere("'Fechar a venda' sem vendedor recusa no campo Vendedor", RECUSA_VENDEDOR in (recusa or ""), recusa)
confere("o foco foi ao grupo do vendedor", "radiogroup" in foco(), foco())
confere("a venda não saiu", not tem("Venda registrada"), texto_principal(200))
focar_busca_pelo_js()
tecla("F8", "F8", 119)
confere("F8 leva o foco ao grupo do vendedor", "radiogroup" in foco(), foco())
digito(2)
confere("o dígito 2 escolhe o segundo vendedor (Bruno)", marcado_do_vendedor() == ["2 Bruno U3"], vendedores())
digito(9)
confere("o dígito 9 (sem vendedor naquela posição) não muda nada", marcado_do_vendedor() == ["2 Bruno U3"], vendedores())
confere("a recusa do vendedor some ao escolher", not erro_do_campo("Vendedor"), erro_do_campo("Vendedor"))

enviar_venda()
recusa_caixa = esperar(lambda: erro_do_campo("Caixa"), 20)
confere("com o caixa fechado, 'Fechar a venda' recusa embaixo da faixa", "Nenhum caixa aberto" in (recusa_caixa or ""), recusa_caixa)
confere("a faixa continua laranja", (faixa() or {}).get("tom") == "fechado", faixa())
confere("clica em 'Abrir o caixa'", clicar("Abrir o caixa"))
confere("abre o painel do caixa", bool(esperar(painel_aberto, 15)))
confere("preenche o troco contado", preencher("Troco contado (R$)", "200") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("a venda fecha sozinha depois de abrir o caixa", venda_registrada(60), texto_principal(300))
confere("o resumo mostra o vendedor Bruno", tem("vendedor Bruno U3"), texto_principal(400))
fx = esperar(lambda: (faixa() or {}).get("tom") == "aberto", 20)
f = faixa() or {}
agora = sp_agora()
m = re.match(r"^Caixa 1 aberto desde (\d\d):(\d\d) · " + re.escape(LOJA_A) + "$", f.get("texto", ""))
hora_ok = False
if m:
    minutos = int(m.group(1)) * 60 + int(m.group(2))
    hora_ok = abs(minutos - (agora.hour * 60 + agora.minute)) <= 3
confere("'Abrir o caixa' deixa a faixa verde com a hora de hoje (sem data)", bool(fx) and bool(m) and hora_ok, f)
confere("depois da venda, o cliente volta ao Consumidor final", CONSUMIDOR in cliente_agora(), cliente_agora())
confere("depois da venda, o vendedor do Caixa volta vazio", marcado_do_vendedor() == [], vendedores())
confere("depois da venda, o foco volta à busca", foco_na_busca(), foco())

# --- 2. O Consumidor final pedindo cliente de verdade, e o cliente que volta -------------
passo("2. Cheque, boleto e fiado com o Consumidor final abrem a janela de clientes, com o motivo")
for rotulo in ("Cheque", "Boleto", "Fiado"):
    abrir_vender(LOJA_A)
    confere("com o Consumidor final escolhido, '+ " + rotulo + "' entra", clicar("+ " + rotulo))
    abriu = esperar(lambda: js("!!document.querySelector('[data-escolha=cliente]')"), 10)
    confere("'+ " + rotulo + "' abre a janela de clientes", bool(abriu), texto_principal(160))
    frase = rotulo + " precisa do cliente de verdade: escolha quem paga."
    confere("a janela mostra o motivo '" + frase + "'", frase in janela_de_clientes(), janela_de_clientes()[:200])
    tecla("Escape", "Escape", 27)
    fechou = esperar(lambda: not js("!!document.querySelector('[data-escolha=cliente]')"), 8)
    confere("Escape fecha a janela sem escolher", bool(fechou))
    confere("fechada a janela, o cliente segue Consumidor final e o campo repete o motivo", CONSUMIDOR in cliente_agora() and frase in norm(js("document.querySelector('[role=group][aria-label=Cliente]').innerText")), cliente_agora())
    if rotulo == "Fiado":
        confere("escolhe o cliente de verdade pela janela", escolher_cliente(CLIENTE) is True)
        confere("o cliente passa a ser " + CLIENTE + " e o motivo some", CLIENTE in cliente_agora() and "precisa do cliente de verdade" not in norm(js("document.querySelector('[role=group][aria-label=Cliente]').innerText")), cliente_agora())

passo("2b. Cliente de verdade escolhido: depois da venda volta ao Consumidor final, e o foco à busca")
abrir_vender(LOJA_A)
confere("escolhe " + CLIENTE, escolher_cliente(CLIENTE) is True)
confere("monta o item", montar_item("1"))
confere("paga em dinheiro R$ 10,00", pagar_em_dinheiro("10"))
confere("escolhe o vendedor Ana pelo botão (escolher('Vendedor', ...))", escolher("Vendedor", "Ana U3") is True)
confere("o botão da Ana ficou marcado", marcado_do_vendedor() == ["1 Ana U3"], vendedores())
enviar_venda()
confere("a venda sai", venda_registrada(60), texto_principal(300))
confere("o resumo cita o cliente " + CLIENTE, tem("cliente " + CLIENTE), texto_principal(400))
confere("e o cliente volta ao Consumidor final (não ao anterior, nem a vazio)", CONSUMIDOR in cliente_agora(), cliente_agora())
confere("e o vendedor volta vazio", marcado_do_vendedor() == [], vendedores())
confere("o foco volta à busca", foco_na_busca(), foco())

# --- 3. "Mais opções": título com o que está preenchido, e a recusa que a abre -------------
passo("3. 'Mais opções': título com o preenchido, e recusa de campo recolhido abre a seção")
abrir_vender(LOJA_A)
confere("fechado e vazio, o título é 'Mais opções'", mais_opcoes() == ["Mais opções", False], mais_opcoes())
confere("abre a seção", abrir_mais_opcoes() is True)
confere("preenche o frete de R$ 30,00", preencher(FRETE_ROTULO, "30,00") == "freight_amount")
mo = mais_opcoes()
confere("com frete de R$ 30, o título é 'Mais opções (frete R$ 30,00)'", mo and mo[0] == "Mais opções (frete R$ 30,00)", mo)
fechar_mais_opcoes()
mo = mais_opcoes()
confere("recolhida, a seção mantém o título com o frete", mo == ["Mais opções (frete R$ 30,00)", False], mo)

passo("3b. Pedido para entrega marcado com a seção fechada: a recusa abre a seção, fica embaixo do campo e leva o foco")
abrir_vender(LOJA_A)
confere("abre a seção", abrir_mais_opcoes() is True)
confere("marca 'Pedido para entrega'", marcar("Pedido para entrega") is True)
mo = mais_opcoes()
confere("o título passa a dizer 'para entrega'", bool(mo) and "para entrega" in mo[0], mo)
fechar_mais_opcoes()
confere("a seção está recolhida antes de fechar a venda", (mais_opcoes() or [None, True])[1] is False, mais_opcoes())
confere("monta o item", montar_item("1"))
confere("paga em dinheiro R$ 10,00", pagar_em_dinheiro("10"))
confere("escolhe o vendedor Ana", escolher("Vendedor", "Ana U3") is True)
enviar_venda()
abriu = esperar(lambda: (mais_opcoes() or [None, False])[1], 15)
confere("a recusa abre 'Mais opções'", bool(abriu), mais_opcoes())
recusas = esperar(recusas_dentro_de_mais_opcoes, 10)
print("   recusas dentro de 'Mais opções':", recusas)
confere("a recusa fica embaixo de um campo de dentro da seção, com texto", bool(recusas) and all(r and r != "invalido sem texto" for r in recusas), recusas)
confere("o foco foi a um campo de dentro da seção", esperar(foco_dentro_de_mais_opcoes, 8), foco())
confere("a venda não saiu", not tem("Venda registrada"), texto_principal(200))
foto("recusa-em-mais-opcoes-1280")

passo("3c. Frete negativo com a seção fechada: a recusa também abre a seção")
abrir_vender(LOJA_A)
confere("abre a seção", abrir_mais_opcoes() is True)
preencher(FRETE_ROTULO, "-5,00")
valor_frete = js("(document.getElementById('freight_amount') || {}).value")
print("   o campo de frete ficou com:", repr(valor_frete))
fechar_mais_opcoes()
confere("monta o item", montar_item("1"))
confere("paga em dinheiro R$ 10,00", pagar_em_dinheiro("10"))
confere("escolhe o vendedor Ana", escolher("Vendedor", "Ana U3") is True)
enviar_venda()
time.sleep(3)
if "-" in (valor_frete or ""):
    abriu = esperar(lambda: (mais_opcoes() or [None, False])[1], 15)
    confere("o frete negativo abre 'Mais opções'", bool(abriu), mais_opcoes())
    confere("a recusa fica embaixo do frete", "frete" in (erro_do_campo(FRETE_ROTULO) or "").lower(), erro_do_campo(FRETE_ROTULO))
    confere("o foco foi ao campo do frete", foco().endswith("freight_amount"), foco())
else:
    print("   (o campo de frete não aceita sinal negativo: o 3c não se aplica, a recusa de dentro é a do 3b)")

# --- 4. Loja B: vendedor único e turno de ontem ----------------------------------------------
passo("4. Loja B (um vendedor só, caixa aberto desde ontem 23h50)")
abrir_vender(LOJA_B)
confere("a faixa aparece", bool(esperar(faixa, 20)), faixa())
f = faixa() or {}
ontem = (sp_agora() - _dt.timedelta(days=1)).strftime("%d/%m")
esperado = "Caixa 1 aberto desde " + ontem + ", 23:50 · " + LOJA_B
confere("a faixa é verde e mostra a data de ontem: '" + esperado + "'", f.get("tom") == "aberto" and f.get("texto") == esperado, f)
foto("faixa-com-a-data-de-ontem", "[data-faixa-do-caixa]")
v = vendedores()
confere("o vendedor único já vem escolhido: '1 Owner Da Mata' marcado", v == [["1 Owner Da Mata", True]], v)
confere("monta o item", montar_item("1"))
confere("paga em dinheiro R$ 10,00", pagar_em_dinheiro("10"))
enviar_venda()
confere("a venda fecha sem o Caixa escolher vendedor", venda_registrada(60), texto_principal(300))
confere("o resumo mostra o vendedor Owner Da Mata", tem("vendedor Owner Da Mata"), texto_principal(400))
confere("depois da venda, o vendedor único continua escolhido", marcado_do_vendedor() == ["1 Owner Da Mata"], vendedores())

# --- 5. Orçamento: Consumidor final e 'Novo atendimento' -----------------------------------
passo("5. Orçamento: Consumidor final já escolhido, e o foco na busca depois de 'Novo atendimento'")
abrir_vender(LOJA_A)
confere("troca para o modo Orçamento", clicar("Orçamento"))
time.sleep(1)
confere("o cliente do orçamento já vem como Consumidor final", CONSUMIDOR in cliente_agora(), cliente_agora())
confere("no modo Orçamento a faixa do caixa some", faixa() is None, faixa())
confere("monta o item", montar_item("1"))
confere("escolhe o vendedor Ana", escolher("Vendedor", "Ana U3") is True)
confere("clica em 'Salvar orçamento'", js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Salvar orçamento')); if (!b) return false; b.click(); return true; })()") is True)
confere("o orçamento é salvo", bool(esperar(lambda: tem("salvo, válido até"), 40)), texto_principal(300))
confere("clica em 'Novo atendimento'", js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Novo atendimento')); if (!b) return false; b.click(); return true; })()") is True)
confere("depois de 'Novo atendimento', o foco está na busca", foco_na_busca(), foco())
confere("e o cliente é o Consumidor final", CONSUMIDOR in cliente_agora(), cliente_agora())

passo("5b. Orçamento com frete, 'Faturar agora': a venda abre com 'Mais opções' aberto (achado do juiz)")
confere("monta o item do orçamento com frete", montar_item("1"))
confere("escolhe o vendedor Ana", escolher("Vendedor", "Ana U3") is True)
confere("abre a seção para o frete", abrir_mais_opcoes() is True)
confere("preenche o frete de R$ 30,00 no orçamento", preencher(FRETE_ROTULO, "30,00") == "freight_amount")
fechar_mais_opcoes()
confere("a seção fica fechada antes de salvar", (mais_opcoes() or [None, None])[1] is False, mais_opcoes())
confere("clica em 'Salvar orçamento'", js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Salvar orçamento')); if (!b) return false; b.click(); return true; })()") is True)
confere("o orçamento com frete é salvo", bool(esperar(lambda: tem("salvo, válido até"), 40)), texto_principal(300))
confere("clica em 'Faturar agora'", clicar("Faturar agora"))
time.sleep(1.5)
mo = mais_opcoes()
confere("na venda faturada, 'Mais opções' já vem aberto com o frete no título", bool(mo) and mo[1] is True and "frete R$ 30,00" in mo[0], mo)

# --- 6. Editar a venda com frete: 'Mais opções' já aberto ---------------------------------
passo("6. Dono: editar a venda com frete abre 'Mais opções' já aberto")
entrar("dono")
vs = (api("GET", "/api/v1/emporio/sales?limit=500") or {}).get("body", {}).get("data", [])
com_frete = [x for x in vs if x.get("customer_name") == CLIENTE and abs(x.get("freight_amount", 0) - 30) < 0.005 and x.get("status") != "cancelada"]
sem_frete = [x for x in vs if x.get("customer_name") == CLIENTE and x.get("freight_amount", 0) == 0 and abs(x.get("net_amount", 0) - 30) < 0.005]
confere("achou a venda com frete de R$ 30 do cenário", len(com_frete) >= 1, [x.get("id") for x in com_frete])
confere("achou a venda de R$ 30 para a troca", len(sem_frete) >= 1, [x.get("id") for x in sem_frete])
if com_frete:
    ir("/emporio/vender?editar=" + com_frete[0]["id"])
    esperar(lambda: tem("Editando a venda"), 30)
    mo = mais_opcoes()
    confere("a edição abre 'Mais opções' já aberto, com o frete no título", bool(mo) and mo[1] is True and "frete R$ 30,00" in mo[0], mo)
    confere("o campo de frete mostra R$ 30,00", "30,00" in (js("(document.getElementById('freight_amount') || {}).value") or ""), js("(document.getElementById('freight_amount') || {}).value"))
    foto("edicao-com-frete-1280")

# --- 7. A troca ----------------------------------------------------------------------
passo("7. Dono: 'Trocar mercadoria' na ficha de uma venda registra a troca")
if sem_frete:
    ir("/emporio/vendas/" + sem_frete[0]["id"])
    confere("a ficha abre", tem("U3 Cliente") and tem("U3 Ração"), texto_principal(200))
    confere("clica em 'Trocar'", clicar("Trocar"))
    confere("abre 'Trocar mercadoria'", bool(esperar(painel_aberto, 15)) and "Trocar mercadoria" in (js("document.querySelector('[role=dialog]').innerText") or ""))
    rotulos = js("Array.from(document.querySelectorAll('[role=dialog] label')).map(l => l.innerText.replace('*', '').trim())") or []
    print("   rótulos da troca:", rotulos)
    ordem = [r for r in rotulos if r in ("O que o cliente devolve", "Valor devolvido", "Cliente", "Pagamento", "Motivo da troca")]
    confere("a troca mostra, nesta ordem, devolução, valor, cliente, pagamento e motivo", ordem == ["O que o cliente devolve", "Valor devolvido", "Cliente", "Pagamento", "Motivo da troca"], rotulos)
    texto_painel = norm(js("document.querySelector('[role=dialog]').innerText") or "")
    confere("a troca não ganhou 'Mais opções', frete, loja nem a faixa do caixa", all(x not in texto_painel for x in ("Mais opções", "Frete cobrado", "Caixa 1 aberto")) and "Loja" not in rotulos, rotulos)
    confere("o cliente da venda de origem vem escolhido", CLIENTE in norm(js("(document.querySelector('[role=dialog] [data-escolhido=cliente]') || { innerText: '' }).innerText")), texto_painel[:300])
    confere("informa 1 kg devolvido", preencher_aria("Quantidade devolvida de " + PRODUTO, "1") != "SEM CAMPO")
    time.sleep(0.8)
    confere("o valor devolvido passa a R$ 10,00", "R$ 10,00" in norm(js("document.querySelector('[role=dialog]').innerText")), norm(js("document.querySelector('[role=dialog]').innerText"))[:400])
    confere("a venda nova: busca o produto e adiciona", preencher_aria("Buscar produto", "U3") != "SEM CAMPO" and bool(esperar(lambda: clicar_resultado(PRODUTO), 15)))
    confere("a venda nova: 2 kg", preencher_aria("Quantidade do item 1", "2") != "SEM CAMPO")
    confere("a venda nova: paga a diferença em dinheiro", pagar_em_dinheiro("10"))
    confere("motivo da troca", preencher("Motivo da troca", "Prova viva da onda 3") not in ("SEM ROTULO", "SEM CAMPO"))
    enviar_painel()
    fechou = esperar(lambda: not painel_aberto(), 60)
    confere("o painel fecha depois de registrar", bool(fechou), texto_principal(300))
    ir("/emporio/vendas/" + sem_frete[0]["id"])
    vs2 = (api("GET", "/api/v1/emporio/sales?limit=500") or {}).get("body", {}).get("data", [])
    ja_conhecidas = {x["id"] for x in vs}
    novas = [x for x in vs2 if x["id"] not in ja_conhecidas and x.get("customer_name") == CLIENTE and abs(x.get("net_amount", 0) - 20) < 0.005 and x.get("status") != "cancelada"]
    print("   vendas NOVAS do cliente de R$ 20,00 (a venda nova da troca):", [(x.get("id"), x.get("status")) for x in novas])
    confere("a troca gravou UMA venda nova de 2 kg (R$ 20,00), que não existia antes", len(novas) == 1, len(novas))
    confere("a ficha da venda de origem mostra a devolução", tem("devolu"), texto_principal(400))

# --- 8. Celular (390 px) -----------------------------------------------------------------
passo("8. Celular (390 px): sem rolagem lateral, e o total preso no rodapé")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
entrar("caixa")
ir("/emporio/vender")
confere("390 px: o foco está na busca ao abrir", foco_na_busca(), foco())
abrir_vender(LOJA_A)
confere("390 px: sem rolagem lateral", sem_rolagem_lateral(), js("document.documentElement.scrollWidth + ' > ' + window.innerWidth"))
confere("390 px: as teclas de atalho não aparecem (não há teclado)", teclas_junto() == [], teclas_junto())
confere("390 px: monta o item", montar_item("1"))
confere("390 px: paga em dinheiro", pagar_em_dinheiro("10"))
js("window.scrollTo(0, 0)")
time.sleep(0.5)
b = barra_do_total()
print("   barra do total (posição, folga do fundo da janela, rolagem do documento):", b)
confere("390 px: o total e o botão estão numa barra sticky", bool(b) and b[0] == "sticky", b)
confere("390 px: a página é mais alta que a janela (a prova do rodapé vale)", bool(b) and b[2] > 0, b)
confere("390 px: no topo da página, a barra do total está colada no fundo da janela", bool(b) and abs(b[1]) <= 2, b)
confere("390 px: o botão 'Fechar a venda' está visível sem rolar", js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Fechar a venda')); const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; })()"))
confere("390 px: ainda sem rolagem lateral com o item e o pagamento", sem_rolagem_lateral(), js("document.documentElement.scrollWidth + ' > ' + window.innerWidth"))

# --- 9. Fotos por papel --------------------------------------------------------------------
passo("9. Fotos do Vender por papel (só com TIBE_FOTOS)")
for chave, papel in (("dono", "dono"), ("gestor", "gestor"), ("caixa", "caixa")):
    for largura, altura, movel in ((1280, 900, False), (390, 844, True)):
        cdp("Emulation.setDeviceMetricsOverride", width=largura, height=altura, deviceScaleFactor=1, mobile=movel)
        entrar(chave)
        abrir_vender(LOJA_A)
        time.sleep(1.5)
        foto("vender-" + papel + "-" + str(largura))
        confere("foto " + papel + " " + str(largura) + ": sem rolagem lateral", sem_rolagem_lateral(), js("document.documentElement.scrollWidth + ' > ' + window.innerWidth"))

cdp("Emulation.clearDeviceMetricsOverride")
fim()
