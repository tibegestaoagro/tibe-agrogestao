# Validacao viva do plano 3 da Frente 3 do Meu Empório (Modulo 39, plano
# 2026-11-06, pedido para entrega e romaneio; spec
# docs/superpowers/specs/2026-11-06-emporio-clientes-fornecedores-romaneio-design.md):
# o orçamento e a venda carregam a marca "Pedido para entrega" com o endereço, o
# romaneio sai sem preço em A4 e na bobina de 58 mm, e quem fatura muda o
# pedido de uma venda fechada.
#
#   1. O Vendedor salva um orçamento para entrega: CPF pelo "Completar
#      cadastro", a recusa do principal incompleto embaixo da ESCOLHA do
#      endereço (Review Focus 1), e a recusa do Número embaixo do Número.
#   2. O cadastro do cliente não ganhou o endereço "outro" (API).
#   3. O papel A4 do orçamento diz PEDIDO PARA ENTREGA e o endereço.
#   4. O Caixa carrega o orçamento: marca e endereço vêm preenchidos; fecha em
#      dinheiro; o resumo oferece "Imprimir cupom" e "Romaneio cupom".
#   5. Romaneio A4: texto, sem preço, caixas de marcar, impressão (botão some,
#      nada acima do papel) e o bloco de assinaturas inteiro numa folha só,
#      com 40 linhas e num controle com a regra desligada.
#   6. Romaneio na bobina de 58 mm: @page com altura, PDF numa página só, sem
#      estourar a largura com o nome longo (Review Focus 4).
#   7. Venda direta ao Consumidor final: a entrega é recusada embaixo do
#      cliente; desmarcada, o romaneio diz RETIRADA e não tem endereço.
#   8. Venda da PJ (retirada): o Vendedor não vê "Mudar"; o Caixa muda para
#      entrega com o endereço do cadastro; o Gestor vê a linha no Histórico.
#      8b: o "Completar cadastro" de DENTRO do painel Mudar.
#   9. O Gestor cancela: o romaneio avisa e a venda não oferece mais "Mudar".
#  10. A 390 px: balcão com "Outro endereço", venda e painel, sem rolagem horizontal.
#
# cenario: scripts/_cenario-emporio-romaneio.ts
# sessao: caixa rom-caixa@teste.local
# sessao: gestor rom-gestor@teste.local
# sessao: vendedor rom-vendedor@teste.local

import base64
import io
import re

LOJA = "Rom Loja"
LONGO = "Rom Ração Premium Super Concentrada para Bovinos de Corte 25"  # 60 caracteres
SAL = "Rom Sal"
VENDEDOR = "Rom Vendedor"
CAIXA = "Rom Caixa"
PF = "Rom Cliente PF"
PJ = "Rom Cliente PJ"
SEM_CPF = "Rom Cliente Sem CPF"
# CPFs válidos que nenhuma outra suíte usa (o documento é único por conta).
CPF_DO_PF = "72918364509"
CPF_DO_SEM_CPF = "38192546764"
RUA_OUTRO = "Rua Nova Entrega"
MSG_PRINCIPAL = "O endereço principal do cadastro está incompleto. Complete o cadastro do cliente ou escolha outro endereço."
MSG_CPF = "Para entrega, informe o CPF do cliente."
MSG_CF = "Pedido para entrega precisa do cliente de verdade, não do Consumidor final."


def caminho():
    return js("location.pathname") or ""


def tem(texto, n=80000):
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def href_do_link(rotulo):
    return js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return a ? a.getAttribute('href') : ''; })()") or ""


def campo_existe(rotulo):
    return bool(js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return !!(l && document.getElementById(l.htmlFor)); })()"))


def texto_do_campo(rotulo):
    return js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.innerText.replace(/\\u00a0/g, ' ') : 'SEM CAMPO'; })()") or ""


def botao_existe(rotulo):
    return bool(js("Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === " + repr(rotulo) + ")"))


def sem_rolagem_horizontal():
    return js("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def medida():
    return js("document.documentElement.scrollWidth + ' > ' + document.documentElement.clientWidth")


def entrega_marcada():
    return js("(() => { const l = Array.from(document.querySelectorAll('label')).find(x => x.innerText.includes('Pedido para entrega')); const i = l && l.querySelector('input'); return i ? i.checked : null; })()")


def escolha_do_endereco():
    """O texto do rótulo da escolha marcada no grupo 'Endereço de entrega', ou ''."""
    return js("(() => { const i = document.querySelector('[role=radiogroup] input[type=radio]:checked'); return i ? i.closest('label').innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""


def rodape_tem_alerta():
    """role=alert DENTRO do rodapé do balcão (o anunciador de rotas do Next tem um sempre)."""
    return bool(js("!!document.querySelector('form div.sticky [role=alert]')"))


def alerta_do_rodape():
    return js("(() => { const a = document.querySelector('form div.sticky [role=alert]'); return a ? a.innerText : ''; })()") or ""


def abrir_balcao(modo_orcamento=False):
    ir("/emporio/vender")
    confere("o balcão abre", caminho() == "/emporio/vender" and tem("Total da venda"), caminho())
    if campo_existe("Loja") and LOJA not in texto_do_campo("Loja"):
        confere("escolhe " + LOJA, escolher("Loja", LOJA) is True)
    if modo_orcamento:
        confere("troca para o modo Orçamento", clicar("Orçamento"))
        time.sleep(1)
        confere("o balcão mostra Salvar orçamento", esperar(lambda: tem("Total do orçamento"), 10) and "Salvar orçamento" in texto_do_main())


def adicionar(produto, busca, quantidade, n):
    confere("busca " + produto[:20], preencher_aria("Buscar produto", busca) != "SEM CAMPO")
    confere("adiciona " + produto[:20], esperar(lambda: clicar_resultado(produto), 15))
    confere("a quantidade do item " + str(n) + " é " + quantidade, preencher_aria("Quantidade do item " + str(n), quantidade) != "SEM CAMPO")


def venda_em_dinheiro(valor):
    confere("adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
    time.sleep(1)
    confere("o valor em dinheiro é " + valor, preencher_aria("Valor em Dinheiro (R$)", valor) != "SEM CAMPO")


def id_da_venda():
    href = href_do_link("Ver a venda")
    return href.split("/emporio/vendas/")[1] if "/emporio/vendas/" in href else ""


# Os painéis aninhados (o "Completar cadastro" dentro do "Mudar"): o painel de
# cima e o ULTIMO [role=dialog] do documento.
ULTIMO = "(() => { const d = document.querySelectorAll('[role=dialog]'); return d[d.length - 1]; })()"


def paineis_abertos():
    return js("document.querySelectorAll('[role=dialog]').length") or 0


def preencher_no_ultimo(rotulo, valor):
    return js("(() => { const raiz = " + ULTIMO + "; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); if (!l) return 'SEM ROTULO'; const el = document.getElementById(l.htmlFor); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.id; })()")


def cadastro_carregado():
    """O Completar cadastro lê o cliente ao abrir e SOBRESCREVE o que foi digitado antes da
    resposta (o primeiro roteiro perdeu o CPF assim): só se preenche com o Nome já na tela."""
    return js("(() => { const d = " + ULTIMO + "; const l = d && Array.from(d.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === 'Telefone'); const el = l && document.getElementById(l.htmlFor); return !!el && el.value !== ''; })()")


def enviar_o_ultimo():
    js("(() => { const d = " + ULTIMO + "; const b = d && d.querySelector('button[type=submit]'); if (b) b.click(); })()")


def texto_do_ultimo():
    return js("(() => { const d = " + ULTIMO + "; return d ? d.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""


def pdf_da_pagina():
    return base64.b64decode(cdp("Page.printToPDF", preferCSSPageSize=True, printBackground=True)["data"])


def textos_por_pagina(pdf):
    """O texto de cada folha do PDF. O python do browser-harness não tem pypdf:
    o do sistema lê o arquivo (precisa de `pip install pypdf`)."""
    import json
    import os
    import shutil
    import subprocess
    import tempfile
    arquivo = os.path.join(tempfile.gettempdir(), "tibe-romaneio.pdf")
    with open(arquivo, "wb") as f:
        f.write(pdf)
    codigo = "import sys, json; from pypdf import PdfReader; print(json.dumps([(p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages]))"
    r = subprocess.run([shutil.which("python") or "python", "-c", codigo, arquivo], capture_output=True, text=True, encoding="utf-8", cwd=tempfile.gettempdir())
    if r.returncode != 0:
        raise RuntimeError("pypdf: " + r.stderr[-300:])
    return json.loads(r.stdout)


def resumo_da_venda():
    return js("((document.querySelector('main [role=status]') || { innerText: '' }).innerText).replace(/\\u00a0/g, ' ')") or ""


def assinaturas_juntas(textos):
    """As três linhas de assinatura estão na MESMA folha?"""
    folhas = set()
    for frase in ("Separado por", "Conferido por", "Recebido por"):
        achou = [i for i, t in enumerate(textos) if frase in t]
        if len(achou) != 1:
            return False
        folhas.add(achou[0])
    return len(folhas) == 1


def ajustar_linhas(n):
    """Deixa a tabela do romaneio A4 com `n` linhas (clona a primeira, ou tira do fim)."""
    js("(() => { const tb = document.querySelector('.a4 tbody'); while (tb.children.length > " + str(n) + ") tb.removeChild(tb.lastChild); while (tb.children.length < " + str(n) + ") tb.appendChild(tb.children[0].cloneNode(true)); })()")


# --- 1 ---------------------------------------------------------------------------------
entrar("vendedor")
passo("1. O Vendedor salva um orçamento para entrega: CPF, endereço principal incompleto, Número em falta")
abrir_balcao(modo_orcamento=True)
adicionar(LONGO, "Rom Ra", "2", 1)
adicionar(SAL, "Rom Sal", "1", 2)
confere("escolhe o cliente PF", escolher_cliente(PF) is True)
confere("marca Pedido para entrega", marcar("Pedido para entrega") is True)
confere("aparece 'Para entrega, informe o CPF do cliente.'", esperar(lambda: MSG_CPF in texto_do_main(), 30), texto_principal(500))
confere("o botão Completar cadastro aparece", esperar(lambda: botao_existe("Completar cadastro"), 10))
confere("abre o Completar cadastro", clicar("Completar cadastro") and esperar(painel_aberto, 15))
confere("o cadastro do cliente carregou no painel", esperar(cadastro_carregado, 30))
confere("preenche o CPF", preencher("CPF", CPF_DO_PF) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60), erro_do_campo("CPF"))
confere("o aviso do CPF some", esperar(lambda: MSG_CPF not in texto_do_main(), 30), texto_principal(500))
confere("a marca continua marcada", entrega_marcada() is True)
confere("escolhe 'Endereço principal'", esperar(lambda: marcar("Endereço principal") is True, 30))
confere("o rótulo do principal diz (incompleto)", "(incompleto)" in escolha_do_endereco(), escolha_do_endereco())
confere("clica em Salvar orçamento", enviar_botao("Salvar orçamento"))
recusa = esperar(lambda: erro_do_campo("Endereço de entrega"), 30)
confere("a recusa do principal incompleto fica embaixo da ESCOLHA do endereço", recusa == MSG_PRINCIPAL, recusa)
confere("o rodapé não repete a recusa", not rodape_tem_alerta(), alerta_do_rodape())
confere("o orçamento não foi salvo", not tem("salvo, válido até"))
confere("escolhe 'Outro endereço'", marcar("Outro endereço") is True)
confere("a recusa da escolha some", esperar(lambda: not erro_do_campo("Endereço de entrega"), 10))
confere("preenche o CEP", preencher("CEP", "38400-500") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche a rua", preencher("Rua", RUA_OUTRO) not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o bairro", preencher("Bairro", "Tibery") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche a cidade", preencher("Cidade", "Uberlandia") not in ("SEM ROTULO", "SEM CAMPO"))
confere("escolhe a UF", escolher("UF", "MG") is True)
confere("clica em Salvar orçamento sem o número", enviar_botao("Salvar orçamento"))
recusa = esperar(lambda: erro_do_campo("Número"), 30)
confere("a recusa fica embaixo do Número", bool(recusa) and "número" in recusa.lower(), recusa)
confere("o rodapé não repete a recusa do Número", not rodape_tem_alerta(), alerta_do_rodape())
confere("preenche o número", preencher("Número", "77") not in ("SEM ROTULO", "SEM CAMPO"))
confere("clica em Salvar orçamento de novo", enviar_botao("Salvar orçamento"))
confere("o orçamento é salvo", esperar(lambda: tem("salvo, válido até"), 60), texto_principal(300))
resumo = texto_do_main()
achou = re.search(r"Orçamento nº (\d+) salvo", resumo)
numero = achou.group(1) if achou else ""
confere("o resumo traz o número do orçamento", numero != "", resumo[:300])
href_a4 = href_do_link("Imprimir A4")
orcamento_id = href_a4.split("/emporio/imprimir/orcamento/")[1].split("?")[0] if "/emporio/imprimir/orcamento/" in href_a4 else ""
confere("o resumo tem o link do papel", orcamento_id != "", href_a4)

# --- 2 ---------------------------------------------------------------------------------
passo("2. O cadastro do cliente não ganhou o endereço 'outro' (API)")
lista = api("GET", "/api/v1/emporio/customers?q=Rom%20Cliente%20PF")
itens = lista["body"]["data"] if lista["body"] and "data" in lista["body"] else []
cliente = next((c for c in itens if c["name"] == PF), None)
confere("acha o cliente PF pela API", cliente is not None, [lista["status"], len(itens)])
if cliente:
    detalhe = api("GET", "/api/v1/emporio/customers/" + cliente["id"])["body"]["data"]
    confere("o CPF completado ficou no cadastro", detalhe["document"] == CPF_DO_PF, detalhe["document"])
    confere("o cadastro não ganhou a rua de entrega", detalhe["delivery_street"] is None and detalhe["delivery_zip"] is None, [detalhe["delivery_street"], detalhe["delivery_zip"]])
    confere("o endereço principal continua sem número", detalhe["address_number"] is None, detalhe["address_number"])

# --- 3 ---------------------------------------------------------------------------------
passo("3. O papel A4 do orçamento diz PEDIDO PARA ENTREGA e o endereço")
ir(href_a4)
papel = texto_da_pagina()
confere("o A4 do orçamento abre", caminho() == "/emporio/imprimir/orcamento/" + orcamento_id, caminho())
confere("tem PEDIDO PARA ENTREGA", "PEDIDO PARA ENTREGA" in papel, papel[:400])
confere("tem o endereço do 'outro'", RUA_OUTRO in papel and "77" in papel, papel[:600])

# --- 4 ---------------------------------------------------------------------------------
entrar("caixa")
passo("4. O Caixa carrega o orçamento: marca e endereço vêm preenchidos; fecha em dinheiro")
abrir_balcao()
confere("o campo Orçamento nº existe", preencher("Orçamento nº", numero) not in ("SEM ROTULO", "SEM CAMPO"))
confere("clica em Carregar", clicar("Carregar"))
confere("o orçamento carrega", esperar(lambda: tem("Faturando o orçamento nº"), 30), texto_principal(300))
confere("a marca Pedido para entrega vem marcada", esperar(lambda: entrega_marcada() is True, 20), entrega_marcada())
confere("a escolha vem em 'Outro endereço'", esperar(lambda: "Outro endereço" in escolha_do_endereco(), 20), escolha_do_endereco())
confere("a rua do orçamento vem preenchida", RUA_OUTRO in (js("(() => { const l = Array.from(document.querySelectorAll('main label')).find(x => x.innerText.replace('*','').trim() === 'Rua'); const el = l && document.getElementById(l.htmlFor); return el ? el.value : 'SEM CAMPO'; })()") or ""))
venda_em_dinheiro("50")
confere("fecha a venda", enviar_botao("Fechar a venda"))
confere("a venda sai", esperar(lambda: tem("Venda registrada"), 60), texto_principal(400))
resumo = resumo_da_venda()
confere("a venda soma R$ 50,00 e diz para entrega", "Venda registrada: R$ 50,00" in resumo and "para entrega" in resumo, resumo[:300])
confere("o resumo oferece Imprimir cupom e Romaneio cupom", href_do_link("Imprimir cupom") != "" and href_do_link("Romaneio cupom") != "" and href_do_link("Romaneio A4") != "")
venda_id = id_da_venda()
confere("o resumo tem o link da venda", venda_id != "")

# --- 5 ---------------------------------------------------------------------------------
passo("5. Romaneio A4: texto sem preço, caixas de marcar, impressão e assinaturas inteiras")
ir("/emporio/imprimir/romaneio/" + venda_id + "?formato=a4")
pagina = texto_da_pagina()
confere("o romaneio A4 abre", caminho() == "/emporio/imprimir/romaneio/" + venda_id, caminho())
confere("tem ROMANEIO", bool(re.search(r"(^|\n)ROMANEIO(\n|$)", pagina)), pagina[:200])
confere("tem ENTREGA", bool(re.search(r"(^|\n)ENTREGA(\n|$)", pagina)), pagina[:300])
confere("tem o endereço", RUA_OUTRO in pagina, pagina[:600])
confere("tem Orçamento nº " + numero, "Orçamento nº " + numero in pagina, pagina[:400])
confere("tem o vendedor e o caixa", "Vendedor: " + VENDEDOR in pagina and "Caixa: Caixa 1 (" + CAIXA + ")" in pagina, pagina[:700])
confere("tem as linhas de assinatura", all(f in pagina for f in ("Separado por", "Conferido por", "Recebido por: nome, documento e assinatura")))
confere("nenhum R$ no romaneio", "R$" not in pagina, pagina[:600])
confere("as caixas de marcar são tantas quanto as linhas de produto", js("[document.querySelectorAll('.a4 tbody .caixa').length, document.querySelectorAll('.a4 tbody tr').length]") == [2, 2] and "2 linhas de produto" in pagina, js("[document.querySelectorAll('.a4 tbody .caixa').length, document.querySelectorAll('.a4 tbody tr').length]"))
confere("o botão Imprimir existe", botao_existe("Imprimir"))
cdp("Emulation.setEmulatedMedia", media="print")
sobra = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === 'Imprimir'); return { botao_visivel: !!b && b.getBoundingClientRect().height > 0, topo_do_papel_px: Math.round(document.querySelector('.a4').getBoundingClientRect().top) }; })()") or {}
cdp("Emulation.setEmulatedMedia", media="")
confere("na impressão, o botão some e nada sobra acima do papel", sobra.get("botao_visivel") is False and sobra.get("topo_do_papel_px") == 0, sobra)

try:
    t2 = textos_por_pagina(pdf_da_pagina())
    confere("o romaneio curto sai numa folha só", len(t2) == 1, len(t2))
    # 40 linhas: o bloco de assinaturas não pode começar numa folha e terminar noutra.
    ajustar_linhas(40)
    t40 = textos_por_pagina(pdf_da_pagina())
    confere("com 40 linhas há mais de uma folha", len(t40) >= 2, len(t40))
    confere("com 40 linhas, as assinaturas ficam inteiras numa folha", assinaturas_juntas(t40), [len(t40), [("Recebido por" in t) for t in t40]])
    # Varredura: nenhuma quantidade de linhas, de 26 a 63, separa o bloco.
    separou = []
    for n in range(26, 64):
        ajustar_linhas(n)
        if not assinaturas_juntas(textos_por_pagina(pdf_da_pagina())):
            separou.append(n)
    confere("a varredura de 26 a 63 linhas nunca separa o bloco", separou == [], separou)
    # Controle: com a regra break-inside desligada, ALGUMA quantidade separa. Sem isso a prova não discrimina.
    js("(() => { const s = document.createElement('style'); s.id = 'sem-break'; s.textContent = '.a4 .assinaturas { break-inside: auto !important }'; document.head.appendChild(s); })()")
    separou_sem_regra = []
    for n in range(26, 64):
        ajustar_linhas(n)
        if not assinaturas_juntas(textos_por_pagina(pdf_da_pagina())):
            separou_sem_regra.append(n)
    confere("controle: sem o break-inside, alguma quantidade separa o bloco", separou_sem_regra != [], separou_sem_regra)
except Exception as e:
    confere("o PDF do romaneio A4 foi lido", False, repr(e))

# --- 6 ---------------------------------------------------------------------------------
passo("6. Romaneio na bobina de 58 mm")
ir("/emporio/imprimir/romaneio/" + venda_id + "?formato=cupom")
pagina = texto_da_pagina()
confere("tem ROMANEIO e ENTREGA", "ROMANEIO" in pagina and "ENTREGA" in pagina, pagina[:300])
confere("tem Entregar em com o endereço", "Entregar em: " in pagina and RUA_OUTRO in pagina, pagina[:600])
confere("nenhum R$ no romaneio da bobina", "R$" not in pagina, pagina[:600])
REGRAS_PAGE = "(() => { const out = []; for (const s of document.styleSheets) { let rs; try { rs = s.cssRules; } catch (e) { continue; } for (const r of rs) { if (r.cssText.includes('@page')) out.push(r.cssText); } } return out.join(' ; '); })()"
esperar(lambda: re.search(r"size:\s*58mm\s+\d+(\.\d+)?mm", js(REGRAS_PAGE) or ""), 10)
regra = js(REGRAS_PAGE) or ""
tamanho = re.search(r"size:\s*58mm\s+(\d+(?:\.\d+)?)mm", regra)
confere("a regra @page tem size 58mm por uma altura em mm", bool(tamanho), regra)
confere("a bobina tem 58 mm de largura", js("(() => { const a = document.querySelector('.cupom'); return Math.abs(a.getBoundingClientRect().width - 58 * 96 / 25.4) < 2; })()"))
try:
    pdf = pdf_da_pagina()
    paginas = len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", pdf))
    caixa = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", pdf)
    largura_pt = float(caixa.group(1)) if caixa else 0
    altura_pt = float(caixa.group(2)) if caixa else 0
    confere("o PDF do romaneio sai numa página só", paginas == 1, [paginas, regra])
    confere("a página do PDF tem 58 mm de largura", abs(largura_pt - 58 * 72 / 25.4) < 3, caixa.group(0) if caixa else "sem MediaBox")
    print("   PDF da bobina: " + str(paginas) + " pagina(s), " + str(round(largura_pt * 25.4 / 72, 1)) + " mm x " + str(round(altura_pt * 25.4 / 72, 1)) + " mm")
except Exception as e:
    confere("o PDF do romaneio sai numa página só", False, repr(e))
nome_longo_cabe = js("(() => { const a = document.querySelector('.cupom'); const lim = a.getBoundingClientRect().right + 0.5; return a.scrollWidth <= a.clientWidth && Array.from(a.querySelectorAll('*')).every(e => e.getBoundingClientRect().right <= lim); })()")
confere("com o nome de 60 caracteres, nada passa da largura do papel", nome_longo_cabe)
js("(() => { const n = document.querySelector('.cupom .item span:last-child'); if (n) n.textContent = '1 x SupercalifragilisticoexpialidosoSupercalifragilisticoexpialidosoSuperRacaoPremium25kgEmbalagemReforcada'; })()")
confere("com um nome de 100 letras sem espaço, nada passa da largura", js("(() => { const a = document.querySelector('.cupom'); const lim = a.getBoundingClientRect().right + 0.5; return a.scrollWidth <= a.clientWidth && Array.from(a.querySelectorAll('*')).every(e => e.getBoundingClientRect().right <= lim); })()"))

# --- 7 ---------------------------------------------------------------------------------
passo("7. O Caixa vende ao Consumidor final e tenta marcar a entrega")
abrir_balcao()
adicionar(SAL, "Rom Sal", "1", 1)
confere("escolhe o vendedor que atendeu", escolher("Vendedor", VENDEDOR) is True)
confere("escolhe o Consumidor final", escolher_cliente("Consumidor final") is True)
venda_em_dinheiro("10")
confere("marca Pedido para entrega", marcar("Pedido para entrega") is True)
confere("o quadro avisa que precisa do cliente de verdade", esperar(lambda: MSG_CF in texto_do_main(), 20), texto_principal(500))
confere("fecha sem escolher o endereço", enviar_botao("Fechar a venda"))
recusa = esperar(lambda: erro_do_campo("Endereço de entrega"), 20)
confere("sem escolha: a recusa fica embaixo do endereço", recusa == "Escolha o endereço de entrega.", recusa)
confere("escolhe 'Endereço principal'", marcar("Endereço principal") is True)
confere("fecha a venda de novo", enviar_botao("Fechar a venda"))
recusa = esperar(lambda: erro_do_campo("Cliente"), 30)
confere("a recusa do Consumidor final fica embaixo do cliente", recusa == MSG_CF, recusa)
confere("o rodapé não repete a recusa", not rodape_tem_alerta(), alerta_do_rodape())
confere("nenhuma venda foi registrada", not tem("Venda registrada"))
confere("desmarca a entrega", marcar("Pedido para entrega", False) is False)
confere("fecha a venda como retirada", enviar_botao("Fechar a venda"))
confere("a venda sai", esperar(lambda: tem("Venda registrada"), 60), texto_principal(400))
confere("o resumo não diz para entrega", "Venda registrada" in resumo_da_venda() and "para entrega" not in resumo_da_venda(), resumo_da_venda()[:200])
venda_cf = id_da_venda()
ir("/emporio/imprimir/romaneio/" + venda_cf + "?formato=a4")
pagina = texto_da_pagina()
confere("o romaneio diz RETIRADA NO BALCÃO", "RETIRADA NO BALCÃO" in pagina, pagina[:300])
confere("o romaneio não tem Endereço de entrega", "Endereço de entrega" not in pagina and "ENTREGA" not in pagina.replace("RETIRADA NO BALCÃO", ""), pagina[:500])
ir("/emporio/imprimir/romaneio/" + venda_cf + "?formato=cupom")
pagina = texto_da_pagina()
confere("a bobina diz RETIRADA e não tem Entregar em", "RETIRADA NO BALCÃO" in pagina and "Entregar em" not in pagina, pagina[:400])

# --- 8 ---------------------------------------------------------------------------------
passo("8. Venda da PJ como retirada: o Vendedor não vê Mudar; o Caixa muda para entrega")
abrir_balcao()
adicionar(SAL, "Rom Sal", "2", 1)
confere("escolhe o vendedor que atendeu", escolher("Vendedor", VENDEDOR) is True)
confere("escolhe a PJ", escolher_cliente(PJ) is True)
venda_em_dinheiro("20")
confere("fecha a venda", enviar_botao("Fechar a venda"))
confere("a venda sai", esperar(lambda: tem("Venda registrada"), 60), texto_principal(400))
venda_pj = id_da_venda()
confere("o resumo tem o link da venda", venda_pj != "")

entrar("vendedor")
ir("/emporio/vendas/" + venda_pj)
confere("o Vendedor abre a venda da loja dele", caminho() == "/emporio/vendas/" + venda_pj and tem("Venda nº"), texto_principal(200))
confere("o Vendedor não vê Mudar", not botao_existe("Mudar"))

entrar("caixa")
ir("/emporio/vendas/" + venda_pj)
confere("o Caixa vê Mudar", esperar(lambda: botao_existe("Mudar"), 15))
confere("abre o painel Mudar", clicar("Mudar") and esperar(painel_aberto, 15))
confere("marca Pedido para entrega no painel", marcar("Pedido para entrega") is True)
confere("a opção do endereço de entrega do cadastro aparece", esperar(lambda: marcar("Endereço de entrega do cadastro") is True, 30))
enviar_painel()
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Endereço de entrega"))
ir("/emporio/imprimir/romaneio/" + venda_pj + "?formato=a4")
pagina = texto_da_pagina()
confere("o romaneio reimpresso diz ENTREGA com o endereço do cadastro", bool(re.search(r"(^|\n)ENTREGA(\n|$)", pagina)) and "Rodovia BR 050" in pagina, pagina[:600])

entrar("gestor")
ir("/emporio/historico")
hist = texto_da_pagina()
confere("o Gestor vê 'Mudou a venda nº ... para entrega' no Histórico", re.search(r"Mudou a venda nº \d+ para entrega", hist) is not None, hist[:600])

# 8b: o "Completar cadastro" de dentro do painel Mudar.
passo("8b. O Completar cadastro de dentro do painel Mudar")
entrar("caixa")
abrir_balcao()
adicionar(SAL, "Rom Sal", "1", 1)
confere("escolhe o vendedor que atendeu", escolher("Vendedor", VENDEDOR) is True)
confere("escolhe o cliente sem CPF", escolher_cliente(SEM_CPF) is True)
venda_em_dinheiro("10")
confere("fecha a venda como retirada", enviar_botao("Fechar a venda"))
confere("a venda sai", esperar(lambda: tem("Venda registrada"), 60), texto_principal(400))
venda_sem_cpf = id_da_venda()
ir("/emporio/vendas/" + venda_sem_cpf)
confere("abre o painel Mudar", esperar(lambda: botao_existe("Mudar"), 15) and clicar("Mudar") and esperar(painel_aberto, 15))
confere("marca Pedido para entrega no painel", marcar("Pedido para entrega") is True)
confere("o painel pede o CPF", esperar(lambda: MSG_CPF in texto_do_ultimo(), 30), texto_do_ultimo()[:400])
confere("o painel tem o botão Completar cadastro", esperar(lambda: botao_existe("Completar cadastro"), 10))
# A corrida: o GET do cadastro guardado demora 2,5 s de propósito. Enquanto pende, o campo
# CPF tem de estar travado e o painel dizer "Carregando o cadastro...".
lista = api("GET", "/api/v1/emporio/customers?q=" + SEM_CPF.replace(" ", "%20"))
itens = lista["body"]["data"] if lista["body"] and "data" in lista["body"] else []
cliente_sem_cpf = next((c for c in itens if c["name"] == SEM_CPF), None)
confere("acha o cliente sem CPF pela API", cliente_sem_cpf is not None, [lista["status"], len(itens)])
js("(() => { const orig = window.fetch.bind(window); window.__orig_fetch = orig; window.__atrasados = 0; const alvo = '/api/v1/emporio/customers/' + " + repr(cliente_sem_cpf["id"]) + "; window.fetch = (u, o) => { const p = orig(u, o); const metodo = ((o && o.method) || 'GET').toUpperCase(); if (String(u).endsWith(alvo) && metodo === 'GET') { window.__atrasados++; return p.then(r => new Promise(res => setTimeout(() => res(r), 2500))); } return p; }; })()")
confere("abre o Completar cadastro (segundo painel)", clicar("Completar cadastro") and esperar(lambda: paineis_abertos() == 2, 15), paineis_abertos())
time.sleep(0.8)
travado = js("(() => { const d = " + ULTIMO + "; const l = d && Array.from(d.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === 'CPF'); const el = l && document.getElementById(l.htmlFor); return el ? { desabilitado: el.matches(':disabled'), carregando: d.innerText.includes('Carregando o cadastro...') } : null; })()")
confere("a corrida: com o GET pendente, o CPF está travado e aparece 'Carregando o cadastro...'", travado == {"desabilitado": True, "carregando": True}, travado)
confere("o GET do cadastro foi mesmo atrasado", js("window.__atrasados") == 1, js("window.__atrasados"))
js("window.fetch = window.__orig_fetch")
confere("o cadastro do cliente carregou no painel de cima", esperar(cadastro_carregado, 30))
livre = js("(() => { const d = " + ULTIMO + "; const l = Array.from(d.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === 'CPF'); const el = document.getElementById(l.htmlFor); return { desabilitado: el.matches(':disabled'), carregando: d.innerText.includes('Carregando o cadastro...') }; })()")
confere("depois da carga, o CPF está liberado e o aviso some", livre == {"desabilitado": False, "carregando": False}, livre)
confere("preenche o CPF no painel de cima", preencher_no_ultimo("CPF", CPF_DO_SEM_CPF) not in ("SEM ROTULO", "SEM CAMPO"))
enviar_o_ultimo()
confere("o painel do cadastro fecha e o Mudar continua aberto", esperar(lambda: paineis_abertos() == 1, 60), [paineis_abertos(), texto_do_ultimo()[:200]])
salvo = api("GET", "/api/v1/emporio/customers/" + cliente_sem_cpf["id"])["body"]["data"]
confere("o CPF digitado foi salvo no cadastro (API)", salvo["document"] == CPF_DO_SEM_CPF, salvo["document"])
confere("o submit do cadastro não gravou o Mudar sozinho", "Escolha o endereço de entrega." not in texto_do_ultimo(), texto_do_ultimo()[:300])
confere("o aviso do CPF some do painel", esperar(lambda: MSG_CPF not in texto_do_ultimo(), 30), texto_do_ultimo()[:400])
confere("escolhe 'Endereço principal'", esperar(lambda: marcar("Endereço principal") is True, 30))
enviar_painel()
confere("o Mudar salva e fecha", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Endereço de entrega"))
ir("/emporio/imprimir/romaneio/" + venda_sem_cpf + "?formato=a4")
pagina = texto_da_pagina()
confere("o romaneio diz ENTREGA com o endereço principal", bool(re.search(r"(^|\n)ENTREGA(\n|$)", pagina)) and "Rua do Cerrado" in pagina, pagina[:600])

# --- 9 ---------------------------------------------------------------------------------
passo("9. O Gestor cancela a venda da PJ")
entrar("gestor")
ir("/emporio/vendas/" + venda_pj)
confere("o Gestor abre a venda", caminho() == "/emporio/vendas/" + venda_pj, caminho())
confere("a venda ativa ainda oferece Mudar ao Gestor", botao_existe("Mudar"))
confere("abre o painel de cancelar", clicar("Cancelar venda") and esperar(painel_aberto, 15))
confere("preenche o motivo", preencher("Motivo", "teste do roteiro") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("o painel fecha", esperar(lambda: not painel_aberto(), 60))
confere("a venda fica cancelada", esperar(lambda: tem("cancelada"), 30), texto_principal(300))
confere("a venda cancelada não oferece mais Mudar", not botao_existe("Mudar"))
ir("/emporio/imprimir/romaneio/" + venda_pj + "?formato=a4")
pagina = texto_da_pagina()
confere("o romaneio mostra VENDA CANCELADA: NÃO SEPARAR", "VENDA CANCELADA: NÃO SEPARAR" in pagina, pagina[:400])
ir("/emporio/imprimir/romaneio/" + venda_pj + "?formato=cupom")
confere("a bobina também", "VENDA CANCELADA: NÃO SEPARAR" in texto_da_pagina())

# --- 10 --------------------------------------------------------------------------------
passo("10. A 390 px: balcão com Outro endereço, venda e painel Mudar, sem rolagem horizontal")
entrar("vendedor")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
abrir_balcao()
confere("escolhe a PJ a 390 px", escolher_cliente(PJ) is True)
confere("marca Pedido para entrega", marcar("Pedido para entrega") is True)
confere("escolhe 'Outro endereço'", esperar(lambda: marcar("Outro endereço") is True, 30))
time.sleep(1)
confere("o balcão com Outro endereço aberto: sem rolagem horizontal", sem_rolagem_horizontal(), medida())
entrar("caixa")
ir("/emporio/vendas/" + venda_sem_cpf)
time.sleep(1)
confere("a venda: sem rolagem horizontal", sem_rolagem_horizontal(), medida())
confere("abre o painel Mudar a 390 px", esperar(lambda: botao_existe("Mudar"), 15) and clicar("Mudar") and esperar(painel_aberto, 15))
confere("escolhe 'Outro endereço' no painel", esperar(lambda: marcar("Outro endereço") is True, 30))
time.sleep(1)
confere("o painel Pedido para entrega: sem rolagem horizontal", sem_rolagem_horizontal() and (js("document.querySelector('[role=dialog]').scrollWidth") or 999) <= 390, [medida(), js("document.querySelector('[role=dialog]').scrollWidth")])
cdp("Emulation.clearDeviceMetricsOverride")

fim()
