# Validacao viva de "Empório, entrega 1: configurações e impressão da venda"
# (Modulo 39, spec docs/specs/module-39-meu-emporio.md, Q145 em diante):
# tela de Configuracoes (validade, rodape, bobina, logo, cabecalho da loja),
# numero da venda no resumo do balcao e o papel A4 e de bobina, que nunca
# imprime sozinho e sai sem valor fiscal.
#
# Reaproveita o cenario da F6b: duas lojas, o produto "F6b Ração" (R$ 20,00 o
# quilo, preco nas duas lojas) e um Vendedor da Loja 1.
#
# cenario: scripts/_cenario-emporio-f6b.ts
# sessao: owner owner@example.com
# sessao: vendedor1 f6b-vendedor1@teste.local

import base64
import random
import re
import struct
import zlib


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def cnpj_alfanumerico_novo():
    """CNPJ alfanumerico valido: cada posicao vale ord - 48."""
    base = [random.choice("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(12)]
    base[2] = random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    vals = [ord(c) - 48 for c in base]
    for pesos in ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]):
        r = sum(v * p for v, p in zip(vals, pesos)) % 11
        vals.append(0 if r < 2 else 11 - r)
    return "".join(base) + "".join(str(v) for v in vals[12:])


def mascarado(c):
    return c[:2] + "." + c[2:5] + "." + c[5:8] + "/" + c[8:12] + "-" + c[12:]


def valor_do_campo(rotulo):
    return js("(() => { const d = document.querySelector('[role=dialog]'); const l = d && Array.from(d.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.value : 'SEM CAMPO'; })()") or ""


def png_pequeno():
    """Um PNG 4x4 vermelho, valido, montado na mao (sem biblioteca)."""
    def bloco(tipo, dados):
        corpo = tipo + dados
        return struct.pack(">I", len(dados)) + corpo + struct.pack(">I", zlib.crc32(corpo) & 0xFFFFFFFF)
    linhas = b"".join(b"\x00" + b"\xff\x00\x00" * 4 for _ in range(4))
    return (
        b"\x89PNG\r\n\x1a\n"
        + bloco(b"IHDR", struct.pack(">IIBBBBB", 4, 4, 8, 2, 0, 0, 0))
        + bloco(b"IDAT", zlib.compress(linhas))
        + bloco(b"IEND", b"")
    )


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes('Fechar a venda')); if (b) b.click(); })()")


def sem_rolagem_horizontal():
    return js("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


CNPJ = cnpj_alfanumerico_novo()
RODAPE = "Obrigado, volte sempre"

entrar("owner")
ir("/emporio")
time.sleep(3)
esperar(lambda: api("GET", "/api/v1/emporio/products?q=F6b")["status"] == 200, 90)

passo("1. Configurações: validade, rodapé e bobina")
ir("/emporio/configuracoes")
confere("a tela de Configurações abre", caminho() == "/emporio/configuracoes" and tem("Impressão e orçamento"), caminho())
confere("abre o painel Editar", clicar("Editar"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("preenche a validade 0", preencher("Validade do orçamento (dias)", "0") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Validade do orçamento (dias)"))
confere("a validade 0 é recusada no campo", "A validade deve ser de 1 a 365 dias." in (recusa or ""), recusa)
confere("o painel continua aberto", painel_aberto())
confere("preenche a validade 10", preencher("Validade do orçamento (dias)", "10") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o rodapé da venda", preencher("Rodapé da venda", RODAPE) not in ("SEM ROTULO", "SEM CAMPO"))
confere("escolhe a bobina de 58 mm", escolher("Largura da bobina", "58 mm") is True)
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a tela mostra 10 dias", esperar(lambda: tem("10 dias")), texto_principal(300))
confere("a tela mostra 58 mm", tem("58 mm"))
confere("a tela mostra o rodapé", tem(RODAPE))

passo("2. Logo")
confere("abre Enviar logo ou Trocar logo", clicar("Enviar logo") or clicar("Trocar logo"))
time.sleep(1.5)
confere("painel do logo abriu", painel_aberto())
b64 = base64.b64encode(png_pequeno()).decode("ascii")
colocou = js("(() => { const i = document.querySelector('[role=dialog] input[type=file]'); if (!i) return 'SEM INPUT'; const bin = atob(" + repr(b64) + "); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); const dt = new DataTransfer(); dt.items.add(new File([u], 'logo.png', { type: 'image/png' })); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return i.files.length; })()")
confere("coloca o PNG no campo de arquivo", colocou == 1, colocou)
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("a prévia do logo aparece e carrega", esperar(lambda: js("(() => { const i = document.querySelector('main img[alt=\"Logo da loja\"]'); return !!i && i.complete && i.naturalWidth > 0; })()")))
confere("o botão passou a Trocar logo", bool(js("Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Trocar logo')")))

passo("3. Cabeçalho da Loja 1: CNPJ alfanumérico em minúscula")
confere("abre Editar da Loja 1", bool(js("(() => { const a = Array.from(document.querySelectorAll('article')).find(x => x.innerText.includes('F6b Loja 1')); const b = a && Array.from(a.querySelectorAll('button')).find(x => x.innerText.trim() === 'Editar'); if (!b) return false; b.click(); return true; })()")))
time.sleep(1.5)
confere("painel da loja abriu", painel_aberto())
confere("preenche o CNPJ em minúscula", preencher("CNPJ", mascarado(CNPJ).lower()) not in ("SEM ROTULO", "SEM CAMPO"))
confere("a máscara mostra o CNPJ em maiúscula", esperar(lambda: valor_do_campo("CNPJ") == mascarado(CNPJ)), valor_do_campo("CNPJ"))
confere("preenche o telefone", preencher("Telefone", "(38) 3221-0000") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("o cartão da loja mostra o CNPJ", esperar(lambda: tem(CNPJ) or tem(mascarado(CNPJ))), texto_principal(500))

passo("4. Venda no balcão: número e links")
ir("/emporio/vender")
confere("o balcão abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
confere("escolhe a Loja 1", escolher("Loja", "F6b Loja 1") is True)
confere("busca o produto", preencher_aria("Buscar produto", "F6b") != "SEM CAMPO")
confere("adiciona o produto", esperar(lambda: clicar_resultado("F6b Ração"), 15))
confere("a quantidade é 1", preencher_aria("Quantidade do item 1", "1") != "SEM CAMPO")
confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
time.sleep(1)
confere("o valor em dinheiro é 20", preencher_aria("Valor em Dinheiro (R$)", "20") != "SEM CAMPO")
confere("escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
enviar_venda()
confere("a venda é registrada", esperar(lambda: tem("Venda registrada"), 60), texto_principal(200))
confere("o resumo mostra Venda nº com 6 dígitos", bool(re.search(r"Venda nº \d{6}", texto_principal(600))), texto_principal(200))
links = js("Array.from(document.querySelectorAll('main a')).filter(a => a.innerText.trim().startsWith('Imprimir')).map(a => [a.innerText.trim(), a.getAttribute('href'), a.getAttribute('target')])") or []
confere("os dois links de impressão existem, em nova aba", [l[0] for l in links] == ["Imprimir A4", "Imprimir cupom"] and all(l[2] == "_blank" for l in links), links)
href_a4 = links[0][1] if links else ""
href_cupom = links[1][1] if len(links) > 1 else ""
venda_id = href_a4.split("/venda/")[1].split("?")[0] if "/venda/" in href_a4 else ""

passo("5. Papel A4")
ir(href_a4)
pagina = texto_da_pagina()
confere("o papel A4 abre", caminho() == "/emporio/imprimir/venda/" + venda_id, caminho())
confere("tem o título VENDA", bool(re.search(r"(^|\n)VENDA(\n|$)", pagina)), pagina[:200])
confere("tem o número da venda", bool(re.search(r"Nº\s*\d{6}", pagina)), pagina[:300])
confere("tem o CNPJ da loja", CNPJ in re.sub(r"[^0-9A-Z]", "", pagina.upper()), pagina[:300])
confere("tem Documento sem valor fiscal.", "Documento sem valor fiscal." in pagina)
confere("tem o rodapé configurado", RODAPE in pagina)
confere("sem bloco de cliente (Consumidor final)", "Cliente" not in pagina and "CLIENTE" not in pagina, pagina[:300])
confere("o logo carregou (naturalWidth > 0)", esperar(lambda: js("(() => { const i = document.querySelector('.a4 img.logo'); return !!i && i.complete && i.naturalWidth > 0; })()")))
confere("o botão Imprimir existe", bool(js("Array.from(document.querySelectorAll('button')).some(x => x.innerText.trim() === 'Imprimir')")))
# A classe sozinha nao prova nada: um display inline vence o print:hidden. Na
# midia de impressao, nada pode sobrar acima do papel.
cdp("Emulation.setEmulatedMedia", media="print")
sobra = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === 'Imprimir'); const visivel = !!b && b.getBoundingClientRect().height > 0; return { botao_visivel: visivel, topo_do_papel_px: Math.round(document.querySelector('.a4').getBoundingClientRect().top) }; })()") or {}
cdp("Emulation.setEmulatedMedia", media="")
confere("na impressão, o botão some e nada sobra acima do papel", sobra.get("botao_visivel") is False and sobra.get("topo_do_papel_px") == 0, sobra)
confere("a página não está no casco do painel (sem menu lateral)", js("document.querySelectorAll('nav a').length") == 0)

passo("6. Papel de bobina")
ir(href_cupom)
pagina = texto_da_pagina()
confere("tem COMPROVANTE DE VENDA", "COMPROVANTE DE VENDA" in pagina)
confere("tem SEM VALOR FISCAL", "SEM VALOR FISCAL" in pagina)
confere("tem o rodapé configurado", RODAPE in pagina)
confere("tem o número da venda", bool(re.search(r"Venda nº \d{6}", pagina)), pagina[:300])
REGRAS_PAGE = "(() => { const out = []; for (const s of document.styleSheets) { let rs; try { rs = s.cssRules; } catch (e) { continue; } for (const r of rs) { if (r.cssText.includes('@page')) out.push(r.cssText); } } return out.join(' ; '); })()"
# "58mm auto" e invalido no CSS e o Chrome descarta o size em silencio: so vale
# o size que sobrevive no CSSOM, com largura E altura em milimetros.
esperar(lambda: re.search(r"size:\s*58mm\s+\d+(\.\d+)?mm", js(REGRAS_PAGE) or ""), 10)
regra = js(REGRAS_PAGE) or ""
tamanho = re.search(r"size:\s*58mm\s+(\d+(?:\.\d+)?)mm", regra)
confere("a regra @page tem size 58mm por uma altura em mm", bool(tamanho), regra)
altura_mm = js("(() => { const a = document.querySelector('.cupom'); return a.getBoundingClientRect().height * 25.4 / 96; })()") or 0
confere("a altura da página cobre o comprovante, sem sobra grande", bool(tamanho) and altura_mm <= float(tamanho.group(1)) <= altura_mm + 6, [regra, altura_mm])
# O "Salvar como PDF" do diálogo: com o @page valendo, o recibo inteiro cabe
# numa página só, com a largura da bobina (58 mm = 164,4 pt).
try:
    pdf = base64.b64decode(cdp("Page.printToPDF", preferCSSPageSize=True, printBackground=True)["data"])
    paginas = len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", pdf))
    caixa = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", pdf)
    largura_pt = float(caixa.group(1)) if caixa else 0
    # Na impressao, onde o cupom comeca: qualquer sobra acima dele (o div do
    # botao com display inline vencendo o print:hidden) vira segunda folha.
    cdp("Emulation.setEmulatedMedia", media="print")
    topo_mm = js("Math.round(document.querySelector('.cupom').getBoundingClientRect().top * 25.4 / 96 * 10) / 10")
    cdp("Emulation.setEmulatedMedia", media="")
    confere("o PDF do cupom sai numa página só", paginas == 1, [paginas, regra, "topo do cupom na impressão: " + str(topo_mm) + " mm"])
    confere("a página do PDF tem 58 mm de largura", abs(largura_pt - 58 * 72 / 25.4) < 3, caixa.group(0) if caixa else "sem MediaBox")
except Exception as e:
    confere("o PDF do cupom sai numa página só", False, repr(e))
confere("a bobina tem 58 mm de largura", js("(() => { const a = document.querySelector('.cupom'); return Math.abs(a.getBoundingClientRect().width - 58 * 96 / 25.4) < 2; })()"))
# Nome longo e sem espaco: tem que quebrar, nao estourar o papel.
js("(() => { const n = document.querySelector('.cupom .nome'); if (n) n.textContent = 'SupercalifragilisticoexpialidosoSupercalifragilisticoexpialidosoSuperRacaoPremium25kgEmbalagemReforcada'; })()")
confere("nada passa da largura do papel", js("(() => { const a = document.querySelector('.cupom'); const lim = a.getBoundingClientRect().right + 0.5; return a.scrollWidth <= a.clientWidth && Array.from(a.querySelectorAll('*')).every(e => e.getBoundingClientRect().right <= lim); })()"))

passo("7. Vendedor: sem Configurações, vê o papel da venda da loja")
entrar("vendedor1")
ir("/emporio")
vend = [h for h in menu() if h.startswith("/emporio")]
confere("o Vendedor não vê Configurações no menu", "/emporio/configuracoes" not in vend and "/emporio" in vend, vend)
ir("/emporio/configuracoes")
confere("abrir Configurações pela URL manda de volta ao Meu Empório", caminho() == "/emporio", caminho())
ir("/emporio/imprimir/venda/" + venda_id + "?formato=a4")
pagina = texto_da_pagina()
confere("o Vendedor vê o papel da venda da loja dele", caminho() == "/emporio/imprimir/venda/" + venda_id and "Documento sem valor fiscal." in pagina and not eh_404(), pagina[:200])

passo("8. Celular (390 px): Configurações sem rolagem horizontal")
entrar("owner")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
ir("/emporio/configuracoes")
confere("a tela abre no celular", caminho() == "/emporio/configuracoes" and tem("Impressão e orçamento"), caminho())
confere("sem rolagem horizontal", sem_rolagem_horizontal(), js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth"))
cdp("Emulation.clearDeviceMetricsOverride")

fim()
