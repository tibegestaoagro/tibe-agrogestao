# Validacao viva da informacao amarrada do Meu Emporio (Modulo 39, frente A, Q345 a Q348):
# docs/superpowers/specs/2026-11-17-emporio-informacao-amarrada-design.md
#
#   1. A receber: a faixa (Vencido, Vence hoje, A vencer, Recebido) com os valores do cenario; clicar em cada
#      cartao filtra as secoes (no Vencido, a frase dos cartoes); "Ver tudo" volta
#   2. Periodo: Hoje, Mes passado e Este mes mudam o Recebido; ?ver=recebido lista o recebido sem o dinheiro
#      recebido no ato da venda
#   3. A pagar: os quatro cartoes; o Pago lista com o fornecedor como link; os recortes filtram
#   4. Amarras: do cartao a receber ("Venda no X (i/n)") a venda, da venda ao cliente, da ficha de volta a uma
#      venda; o Consumidor final aparece sem link
#   5. Ficha do cliente: Total comprado, Ultima compra, Em aberto, Vencido e Recebido, e a lista de recebimentos
#   6. Um Gestor de uma loja so: nao abre o A pagar (so o Dono e o Financeiro abrem) e a ficha nao traz a outra loja
#   7. Celular (390 px): a faixa do A receber, o recebido, o A pagar e a ficha, sem rolagem horizontal da pagina
#
# Os valores esperados estao descritos no cabecalho do cenario (todos na "Ia Loja 1", filtrada por ?loja=).
#
# cenario: scripts/_cenario-emporio-informacao-amarrada.ts
# sessao: owner owner@example.com
# sessao: gestor ia-gestor@teste.local
import re

LOJA1 = "Ia Loja 1"
LOJA2 = "Ia Loja 2"
FICHA = "Ia Cliente Ficha"
FRASE_CARTAO = "Parcela de cartão cai sozinha na data; a conferência vem na próxima etapa."


_api_da_lib = api


def api(metodo, caminho_, corpo=None):
    """A `api` da lib, repetida quando o next dev recarrega a pagina no meio do fetch ('Inspected target navigated or closed')."""
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
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def tem(texto):
    return texto.lower() in texto_do_main().lower()


def secao(titulo):
    """O texto da <section> do main cujo <h2> e `titulo` (None se nao existe)."""
    return js("(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => { const h = x.querySelector('h2'); return h && h.innerText.trim() === " + repr(titulo) + "; }); return s ? s.innerText.replace(/\\u00a0/g, ' ') : null; })()")


def faixa(rotulo):
    """O texto do cartao da faixa (link do <section aria-label=Resumo>) cuja primeira linha e `rotulo`, numa linha so."""
    r = js("(() => { const a = Array.from(document.querySelectorAll('main section[aria-label=Resumo] a')).find(x => x.innerText.split('\\n')[0].trim() === " + repr(rotulo) + "); return a ? a.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : null; })()")
    return r or ""


def cartao_ativo():
    return js("(() => { const a = document.querySelector('main section[aria-label=Resumo] a[aria-current=true]'); return a ? a.innerText.split('\\n')[0].trim() : ''; })()") or ""


def clicar_cartao(rotulo):
    ok = js("(() => { const a = Array.from(document.querySelectorAll('main section[aria-label=Resumo] a')).find(x => x.innerText.split('\\n')[0].trim() === " + repr(rotulo) + "); if (!a) return false; a.click(); return true; })()")
    if not ok:
        return False
    return bool(esperar(lambda: cartao_ativo() == rotulo, 40)) and (time.sleep(1.5) or True)


def clicar_link(rotulo):
    """Clica no link do main cujo texto e exatamente `rotulo`."""
    return bool(js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!a) return false; a.click(); return true; })()"))


def linha(texto, tabela_de=None):
    """O texto da <tr> do main que contem `texto` (numa linha so), ou ''."""
    return (js("(() => { const t = Array.from(document.querySelectorAll('main tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(texto) + ")); return t ? t.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or "")


def links_da_linha(texto):
    """Os [texto, href] dos links da <tr> do main que contem `texto`."""
    return js("(() => { const t = Array.from(document.querySelectorAll('main tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(texto) + ")); return t ? Array.from(t.querySelectorAll('a')).map(a => [a.innerText.trim(), a.getAttribute('href')]) : []; })()") or []


def linhas_da_secao(titulo):
    """Quantas <tr> de corpo tem a tabela da secao `titulo`."""
    return js("(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => { const h = x.querySelector('h2'); return h && h.innerText.trim() === " + repr(titulo) + "; }); return s ? s.querySelectorAll('tbody tr').length : -1; })()")


def chip(rotulo):
    return bool(js("(() => { const a = Array.from(document.querySelectorAll('main [role=group][aria-label=Período] a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!a) return false; a.click(); return true; })()"))


def chip_ativo():
    return js("(() => { const a = document.querySelector('main [role=group][aria-label=Período] a[aria-current=true]'); return a ? a.innerText.trim() : ''; })()") or ""


def cartao_da_ficha(rotulo):
    """O valor do cartao da ficha (o <p> irmao do rotulo), ou None."""
    return js("(() => { const p = Array.from(document.querySelectorAll('main section[aria-label=Resumo] p')).find(x => x.innerText.trim() === " + repr(rotulo) + "); return p && p.nextElementSibling ? p.nextElementSibling.innerText.replace(/\\u00a0/g, ' ').trim() : null; })()")


def rolagem_horizontal():
    """[scrollWidth, innerWidth] da pagina: rolagem horizontal quando o primeiro passa do segundo."""
    return js("[document.documentElement.scrollWidth, window.innerWidth]")


def pagina_pronta_com(condicao, segundos=40):
    return bool(esperar(condicao, segundos))


# --- montagem ----------------------------------------------------------------------------------
entrar("owner")
ir("/emporio")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
l1 = next((l for l in lojas if l["name"] == LOJA1), None)
l2 = next((l for l in lojas if l["name"] == LOJA2), None)
confere("acha as duas lojas do cenario pela API", l1 is not None and l2 is not None, len(lojas))
ID1 = l1["id"] if l1 else ""
RECEBER = "/emporio/financeiro/receber?loja=" + ID1
PAGAR = "/emporio/financeiro/pagar?loja=" + ID1
achados = (api("GET", "/api/v1/emporio/customers?q=Ia%20Cliente%20Ficha")["body"] or {}).get("data") or []
ficha = next((c for c in achados if c["name"] == FICHA), None)
confere("acha o cliente da ficha pela API", ficha is not None, len(achados))
FICHA_ID = ficha["id"] if ficha else ""

# --- 1 -----------------------------------------------------------------------------------------
passo("1. A receber: a faixa e os filtros dos cartoes")
chegou = ir(RECEBER)
confere("o A receber abre", chegou == "/emporio/financeiro/receber" and tem("Financeiro: a receber"), chegou)
confere("a faixa mostra Vencido R$ 330,00 em 5 itens", bool(re.search(r"Vencido \| R\$ 330,00 \| 5 itens", faixa("Vencido"))), faixa("Vencido"))
confere("a faixa mostra Vence hoje R$ 240,00 em 2 itens", bool(re.search(r"Vence hoje \| R\$ 240,00 \| 2 itens", faixa("Vence hoje"))), faixa("Vence hoje"))
confere("a faixa mostra A vencer R$ 330,00 em 5 itens", bool(re.search(r"A vencer \| R\$ 330,00 \| 5 itens", faixa("A vencer"))), faixa("A vencer"))
confere("a faixa mostra Recebido no periodo R$ 490,00 em 5 itens, com o % do previsto", bool(re.search(r"Recebido no período \| R\$ 490,00 \| 5 itens, \d+% do previsto", faixa("Recebido no período"))), faixa("Recebido no período"))
confere("sem filtro nenhum cartao esta ativo e nao ha 'Ver tudo'", cartao_ativo() == "" and not clicar_link("Ver tudo"))
fiado_todo = secao("Fiado por cliente") or ""
confere("sem filtro o fiado lista os cinco clientes abertos da loja (o quitado fica de fora)", all(n in fiado_todo for n in ["Ia Cliente Vencido", "Ia Cliente Parcial", "Ia Cliente Hoje", "Ia Cliente Amanha", FICHA]) and "Ia Cliente Mes Passado" not in fiado_todo and "Ia Cliente Loja 2" not in fiado_todo, fiado_todo[:300])

confere("clica em Vencido", clicar_cartao("Vencido"))
confere("a URL ganha ?ver=vencido e preserva a loja", "ver=vencido" in caminho() and "loja=" + ID1 in caminho(), caminho())
fiado = secao("Fiado por cliente") or ""
cheques = secao("Cheques em carteira") or ""
cartoes = secao("Cartões a receber") or ""
confere("Vencido: o fiado so tem Vencido, Parcial e Ficha", all(n in fiado for n in ["Ia Cliente Vencido", "Ia Cliente Parcial", FICHA]) and "Ia Cliente Hoje" not in fiado and "Ia Cliente Amanha" not in fiado, fiado[:300])
confere("Vencido: o total do recorte do fiado e R$ 250,00 em 3 clientes", "R$ 250,00" in fiado and "3 clientes" in fiado, fiado[:200])
confere("Vencido: o cliente Parcial mostra o aberto de R$ 40,00 (nao os 100 vendidos)", "R$ 40,00" in linha("Ia Cliente Parcial"), linha("Ia Cliente Parcial"))
confere("Vencido: so o cheque IA-K1 (bom para ontem)", "IA-K1" in cheques and "IA-K2" not in cheques, cheques[:200])
confere("Vencido: o boleto vencido IA-B1 aparece e o IA-B2 (a vencer) nao", bool(esperar(lambda: "IA-B1" in (secao("Boletos") or ""), 20)) and "IA-B2" not in (secao("Boletos") or ""), (secao("Boletos") or "")[:300])
confere("Vencido: a secao de cartoes traz a frase da proxima etapa", FRASE_CARTAO in cartoes, cartoes[:300])
confere("Vencido: o cartao ativo e o Vencido e aparece 'Ver tudo'", cartao_ativo() == "Vencido" and js("!!Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === 'Ver tudo')"))

confere("clica em Vence hoje", clicar_cartao("Vence hoje"))
fiado = secao("Fiado por cliente") or ""
cheques = secao("Cheques em carteira") or ""
cartoes = secao("Cartões a receber") or ""
confere("Hoje: o fiado so tem o Cliente Hoje", "Ia Cliente Hoje" in fiado and "Ia Cliente Vencido" not in fiado and "Ia Cliente Amanha" not in fiado, fiado[:250])
confere("Hoje: nenhum cheque neste recorte", "Nenhum cheque neste recorte" in cheques, cheques[:200])
confere("Hoje: a parcela de cartao e so a de R$ 200,00 (nao a de 100 nem a de 60)", "R$ 200,00" in cartoes and "R$ 100,00" not in cartoes and "R$ 60,00" not in cartoes, cartoes[:400])
confere("Hoje: o fiado total do recorte e R$ 40,00", "R$ 40,00" in fiado and "1 cliente" in fiado, fiado[:200])

confere("clica em A vencer", clicar_cartao("A vencer"))
fiado = secao("Fiado por cliente") or ""
cheques = secao("Cheques em carteira") or ""
cartoes = secao("Cartões a receber") or ""
confere("A vencer: o fiado so tem o Cliente Amanha", "Ia Cliente Amanha" in fiado and "Ia Cliente Hoje" not in fiado and "Ia Cliente Vencido" not in fiado, fiado[:250])
confere("A vencer: so o cheque IA-K2", "IA-K2" in cheques and "IA-K1" not in cheques, cheques[:200])
confere("A vencer: o boleto IA-B2 aparece e o IA-B1 nao", bool(esperar(lambda: "IA-B2" in (secao("Boletos") or ""), 20)) and "IA-B1" not in (secao("Boletos") or ""), (secao("Boletos") or "")[:300])
confere("A vencer: os cartoes de R$ 100,00 e R$ 60,00 (nao o de 200) e a soma R$ 160,00", "R$ 100,00" in cartoes and "R$ 60,00" in cartoes and "R$ 200,00" not in cartoes and "R$ 160,00" in cartoes, cartoes[:500])

confere("clica em Recebido no periodo", clicar_cartao("Recebido no período"))
confere("Recebido: as secoes dao lugar a lista 'Recebido no periodo'", bool(esperar(lambda: secao("Recebido no período") is not None, 20)) and secao("Fiado por cliente") is None and secao("Cheques em carteira") is None, caminho())
confere("a URL tem ?ver=recebido", "ver=recebido" in caminho(), caminho())

confere("'Ver tudo' volta", clicar_link("Ver tudo"))
confere("depois do Ver tudo: URL sem ?ver, secoes de volta e nenhum cartao ativo", bool(esperar(lambda: secao("Fiado por cliente") is not None, 30)) and "ver=" not in caminho() and cartao_ativo() == "", caminho())

# --- 2 -----------------------------------------------------------------------------------------
passo("2. O periodo muda o Recebido")
confere("abre em Este mes (atalho ativo)", chip_ativo() == "Este mês", chip_ativo())
confere("clica em Mes passado", chip("Mês passado") and bool(esperar(lambda: chip_ativo() == "Mês passado", 30)))
time.sleep(1.5)
confere("Mes passado: Recebido R$ 40,00 em 1 item (o fiado quitado no dia 10)", bool(re.search(r"R\$ 40,00 \| 1 item", faixa("Recebido no período"))), faixa("Recebido no período"))
confere("a URL ganha de e ate", "de=" in caminho() and "ate=" in caminho(), caminho())
confere("Vencido nao depende do periodo: segue R$ 330,00", "R$ 330,00" in faixa("Vencido"), faixa("Vencido"))
confere("clica em Hoje", chip("Hoje") and bool(esperar(lambda: chip_ativo() == "Hoje", 30)))
time.sleep(1.5)
confere("Hoje: Recebido R$ 200,00 em 1 item (so a parcela de cartao que cai hoje)", bool(re.search(r"R\$ 200,00 \| 1 item", faixa("Recebido no período"))), faixa("Recebido no período"))
confere("clica em Este mes", chip("Este mês") and bool(esperar(lambda: chip_ativo() == "Este mês", 30)))
time.sleep(1.5)
confere("Este mes: Recebido de volta a R$ 490,00 em 5 itens", bool(re.search(r"R\$ 490,00 \| 5 itens", faixa("Recebido no período"))), faixa("Recebido no período"))

confere("clica em Recebido de novo", clicar_cartao("Recebido no período"))
lista = secao("Recebido no período") or ""
confere("a lista tem 5 linhas", linhas_da_secao("Recebido no período") == 5, linhas_da_secao("Recebido no período"))
confere("a lista traz o periodo do mes ('De dd/mm/aaaa a dd/mm/aaaa')", bool(re.search(r"De \d\d/\d\d/\d{4} a \d\d/\d\d/\d{4}\.", lista)), lista[:120])
for nome, forma, valor in [("Ia Cliente Parcial", "Fiado", "R$ 60,00"), (FICHA, "Cheque", "R$ 30,00"), ("Ia Cliente Boleto", "Boleto", "R$ 50,00"), ("Ia Cliente Cartao", "Cartão", "R$ 150,00")]:
    lin = linha(nome + " ")
    # varias linhas do mesmo cliente: procura a que traz a forma e o valor
    ok = js("(() => Array.from(document.querySelectorAll('main tr')).some(x => { const t = x.innerText.replace(/\\u00a0/g, ' '); return t.includes(" + repr(nome) + ") && t.includes(" + repr(forma) + ") && t.includes(" + repr(valor) + "); }))()")
    confere("a lista tem " + nome + ": " + forma + " " + valor, bool(ok), lin)
confere("a lista tem a parcela de cartao que caiu hoje (R$ 200,00)", js("Array.from(document.querySelectorAll('main tr')).some(x => x.innerText.replace(/\\u00a0/g, ' ').includes('R$ 200,00'))") is True)
confere("a lista nao traz o dinheiro recebido no ato da venda (R$ 45,00) nem forma Dinheiro ou PIX", "R$ 45,00" not in lista and "Dinheiro" not in lista and not re.search(r"\bPIX\b", lista), lista[:600])
confere("a lista nao traz o fiado vencido (so pagamentos): Ia Cliente Vencido fora", "Ia Cliente Vencido" not in lista)
confere("o cliente da lista e link para a ficha", any(h and h.startswith("/emporio/clientes/") for _, h in links_da_linha("Ia Cliente Parcial")), links_da_linha("Ia Cliente Parcial"))
confere("o boleto e o cartao da lista trazem 'Venda no' como link", any(t.startswith("Venda nº ") for t, _ in links_da_linha("Ia Cliente Boleto")) and any(t.startswith("Venda nº ") for t, _ in links_da_linha("R$ 150,00")), [links_da_linha("Ia Cliente Boleto"), links_da_linha("R$ 150,00")])
datas = js("Array.from(document.querySelectorAll('main section tbody tr')).map(tr => tr.querySelector('td').innerText.trim().split('/').reverse().join('-'))") or []
confere("a lista vem da mais recente para a mais antiga", len(datas) == 5 and all(datas[i] >= datas[i + 1] for i in range(len(datas) - 1)), datas)

confere("Mes passado + ver=recebido: so o fiado de R$ 40,00 do Cliente Mes Passado", chip("Mês passado") and bool(esperar(lambda: "Ia Cliente Mes Passado" in (secao("Recebido no período") or ""), 30)) and linhas_da_secao("Recebido no período") == 1 and "Ia Cliente Parcial" not in (secao("Recebido no período") or ""), (secao("Recebido no período") or "")[:300])
confere("o atalho preservou o ?ver=recebido", "ver=recebido" in caminho(), caminho())

# --- 3 -----------------------------------------------------------------------------------------
passo("3. A pagar: os quatro cartoes")
chegou = ir(PAGAR)
confere("o A pagar abre", chegou == "/emporio/financeiro/pagar" and tem("Financeiro: a pagar"), chegou)
confere("Vencida R$ 70,00 em 1 item", bool(re.search(r"Vencida \| R\$ 70,00 \| 1 item", faixa("Vencida"))), faixa("Vencida"))
confere("Vence hoje R$ 80,00 em 1 item", bool(re.search(r"Vence hoje \| R\$ 80,00 \| 1 item", faixa("Vence hoje"))), faixa("Vence hoje"))
confere("A vencer R$ 90,00 em 1 item", bool(re.search(r"A vencer \| R\$ 90,00 \| 1 item", faixa("A vencer"))), faixa("A vencer"))
confere("Pago no periodo R$ 60,00 em 1 item, 20% do previsto", bool(re.search(r"Pago no período \| R\$ 60,00 \| 1 item, 20% do previsto", faixa("Pago no período"))), faixa("Pago no período"))
confere("sem filtro as quatro contas pendentes da Loja 1 estao na lista (a paga e a da Loja 2 nao)", all(n in texto_do_main() for n in ["Ia Conta vencida", "Ia Conta de hoje", "Ia Conta de amanha"]) and "Ia Conta paga" not in texto_do_main() and "Ia Conta da Loja 2" not in texto_do_main(), texto_do_main()[:300])
confere("clica em Vencida", clicar_cartao("Vencida"))
principal = texto_do_main()
confere("Vencida: so a conta vencida", "Ia Conta vencida" in principal and "Ia Conta de hoje" not in principal and "Ia Conta de amanha" not in principal, principal[:600])
confere("clica em Vence hoje", clicar_cartao("Vence hoje"))
principal = texto_do_main()
confere("Hoje: so a conta de hoje", "Ia Conta de hoje" in principal and "Ia Conta vencida" not in principal and "Ia Conta de amanha" not in principal, principal[:600])
confere("clica em A vencer", clicar_cartao("A vencer"))
principal = texto_do_main()
confere("A vencer: so a conta de amanha", "Ia Conta de amanha" in principal and "Ia Conta de hoje" not in principal, principal[:600])
confere("clica em Pago no periodo", clicar_cartao("Pago no período"))
pago = secao("Pago no período") or ""
confere("o Pago mostra a lista 'Pago no periodo' com a conta paga de R$ 60,00", "Ia Conta paga" in pago and "R$ 60,00" in pago, pago[:300])
confere("a lista do Pago nao traz as pendentes", "Ia Conta vencida" not in texto_do_main(), texto_do_main()[:200])
links = links_da_linha("Ia Conta paga")
confere("o fornecedor da conta paga e link para /emporio/fornecedores/<id>", any(t == "Ia Fornecedor" and h and h.startswith("/emporio/fornecedores/") for t, h in links), links)
confere("'Ver tudo' volta a lista de pendentes", clicar_link("Ver tudo") and bool(esperar(lambda: "Ia Conta de hoje" in texto_do_main(), 30)) and "ver=" not in caminho(), caminho())
confere("a conta vencida da lista de pendentes traz o fornecedor como link", any(t == "Ia Fornecedor" and h and h.startswith("/emporio/fornecedores/") for t, h in links_da_linha("Ia Conta vencida")), links_da_linha("Ia Conta vencida"))

# --- 4 -----------------------------------------------------------------------------------------
passo("4. Amarras: cartao a receber, venda, cliente, ficha, venda")
ir(RECEBER)
rotulos_cartao = links_da_linha("R$ 200,00")
confere("a linha do cartao de R$ 200,00 tem 'Venda no ... (1/1)' e o cliente como links", any(re.match(r"^Venda nº \d{6} \(1/1\)$", t) for t, _ in rotulos_cartao) and any(t == "Ia Cliente Cartao" and h.startswith("/emporio/clientes/") for t, h in rotulos_cartao), rotulos_cartao)
venda_href = next((h for t, h in rotulos_cartao if t.startswith("Venda nº")), "")
confere("o link da venda aponta para /emporio/vendas/<id>", venda_href.startswith("/emporio/vendas/"), venda_href)
js("(() => { const t = Array.from(document.querySelectorAll('main tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes('R$ 200,00')); Array.from(t.querySelectorAll('a')).find(a => a.innerText.trim().startsWith('Venda nº')).click(); })()")
confere("o clique leva a pagina da venda", bool(esperar(lambda: js("location.pathname") == venda_href, 40)), caminho())
time.sleep(2)
venda = texto_do_main()
confere("a venda mostra 'Venda no' e o cliente Ia Cliente Cartao", re.search(r"Venda nº \d{6}", venda) is not None and "Ia Cliente Cartao" in venda, venda[:200])
cli_link = js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === 'Ia Cliente Cartao'); return a ? a.getAttribute('href') : ''; })()") or ""
confere("o cliente do cabecalho da venda e link para a ficha", cli_link.startswith("/emporio/clientes/"), cli_link)
confere("clica no cliente", clicar_link("Ia Cliente Cartao"))
confere("chega a ficha do cliente", bool(esperar(lambda: js("location.pathname") == cli_link, 40)) and bool(esperar(lambda: js("document.querySelector('main h1') && document.querySelector('main h1').innerText") == "Ia Cliente Cartao", 30)), caminho())

ir("/emporio/clientes/" + FICHA_ID)
confere("a ficha do cliente de teste abre", js("document.querySelector('main h1') && document.querySelector('main h1').innerText") == FICHA, caminho())
recebimentos = secao("Recebimentos") or ""
links_rec = js("(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => x.querySelector('h2') && x.querySelector('h2').innerText.trim() === 'Recebimentos'); return s ? Array.from(s.querySelectorAll('a')).map(a => [a.innerText.trim(), a.getAttribute('href')]) : []; })()") or []
confere("a lista de recebimentos tem 5 links 'Venda no ...'", len([1 for t, h in links_rec if t.startswith("Venda nº ") and h.startswith("/emporio/vendas/")]) == 5, links_rec)
clicou = js("(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => x.querySelector('h2') && x.querySelector('h2').innerText.trim() === 'Recebimentos'); const a = s && Array.from(s.querySelectorAll('a')).find(x => x.innerText.trim().startsWith('Venda nº')); if (!a) return ''; const h = a.getAttribute('href'); a.click(); return h; })()") or ""
confere("clica numa venda dos recebimentos", clicou.startswith("/emporio/vendas/"), clicou)
confere("chega a pagina da venda (volta da ficha)", bool(esperar(lambda: js("location.pathname") == clicou, 40)), caminho())
time.sleep(2)
confere("a venda e do cliente da ficha, com o link de volta", FICHA in texto_do_main() and bool(js("!!Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(FICHA) + ")")), texto_do_main()[:200])

ir(RECEBER)
cons = links_da_linha("R$ 60,00")
linha_cons = linha("Consumidor final")
confere("a linha do cartao de R$ 60,00 mostra o Consumidor final", "Consumidor final" in linha_cons and "R$ 60,00" in linha_cons, linha_cons)
confere("o Consumidor final nao tem link (nenhum link para /emporio/clientes/ na linha)", not any(h and h.startswith("/emporio/clientes/") for _, h in links_da_linha("Consumidor final")), links_da_linha("Consumidor final"))
confere("a venda do Consumidor final tem o link da venda", any(t.startswith("Venda nº") for t, _ in links_da_linha("Consumidor final")), links_da_linha("Consumidor final"))
confere("os clientes do fiado sao links (Ia Cliente Vencido)", any(t == "Ia Cliente Vencido" and h.startswith("/emporio/clientes/") for t, h in links_da_linha("Ia Cliente Vencido")), links_da_linha("Ia Cliente Vencido"))
confere("o cheque tem 'Venda no' como link e o cliente como link", any(t.startswith("Venda nº") for t, _ in links_da_linha("IA-K1")) and any(t == "Ia Cliente Cheque" for t, _ in links_da_linha("IA-K1")), links_da_linha("IA-K1"))
confere("o boleto tem o cliente como link", bool(esperar(lambda: any(t == "Ia Cliente Boleto" for t, _ in links_da_linha("IA-B1")), 20)), links_da_linha("IA-B1"))

# --- 5 -----------------------------------------------------------------------------------------
passo("5. Ficha do cliente (Dono): os cinco cartoes e a lista de recebimentos")
ir("/emporio/clientes/" + FICHA_ID)
hoje_br = js("new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date())")
confere("Total comprado R$ 430,00", cartao_da_ficha("Total comprado") == "R$ 430,00", cartao_da_ficha("Total comprado"))
confere("Ultima compra e hoje (" + str(hoje_br) + ")", cartao_da_ficha("Última compra") == hoje_br, cartao_da_ficha("Última compra"))
confere("Em aberto R$ 220,00 (fiado 80 + 90, cheque em carteira 50; cartao fora)", cartao_da_ficha("Em aberto") == "R$ 220,00", cartao_da_ficha("Em aberto"))
confere("Vencido R$ 80,00", cartao_da_ficha("Vencido") == "R$ 80,00", cartao_da_ficha("Vencido"))
confere("Recebido R$ 190,00 (cartao 100, Pix 60, cheque compensado 30; cheque em carteira e devolvido fora)", cartao_da_ficha("Recebido") == "R$ 190,00", cartao_da_ficha("Recebido"))
confere("o cartao 'Vendas ativas' saiu", cartao_da_ficha("Vendas ativas") is None)
confere("o Vencido fica em destaque de perigo (token text-perigo-tinta)", bool(js("(() => { const p = Array.from(document.querySelectorAll('main section[aria-label=Resumo] p')).find(x => x.innerText.trim() === 'Vencido'); return p.nextElementSibling.className.includes('text-perigo-tinta'); })()")))
rec = secao("Recebimentos") or ""
confere("a lista de recebimentos tem 5 linhas (cartao, Pix e os tres cheques: o contrato lista o cheque em qualquer situacao)", linhas_da_secao("Recebimentos") == 5, rec[:400])
confere("cartao R$ 100,00, PIX R$ 60,00 e cheque R$ 30,00 compensado", "Cartão" in rec and "R$ 100,00" in rec and "PIX" in rec and "R$ 60,00" in rec and "Cheque" in rec and "R$ 30,00" in rec and "Compensado" in rec, rec[:500])
def linha_dos_recebimentos(valor):
    return js("(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => x.querySelector('h2') && x.querySelector('h2').innerText.trim() === 'Recebimentos'); const t = s && Array.from(s.querySelectorAll('tbody tr')).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(valor) + ")); return t ? t.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""


confere("o cheque em carteira (R$ 50,00) traz a situacao 'Na carteira' e o devolvido (R$ 20,00) 'Devolvido'", "Na carteira" in linha_dos_recebimentos("R$ 50,00") and "Devolvido" in linha_dos_recebimentos("R$ 20,00"), [linha_dos_recebimentos("R$ 50,00"), linha_dos_recebimentos("R$ 20,00")])
confere("a lista tem Data, Venda, Forma, Loja e Valor", all(c in rec.lower() for c in ["data", "venda", "forma", "loja", "valor"]), rec[:100])
confere("sem 'Ver mais' (so 5 recebimentos)", "Ver mais" not in rec)
confere("a soma dos cartoes nao confunde: os R$ 190,00 do Recebido nao contam o cheque em carteira nem o devolvido (100 + 60 + 30)", cartao_da_ficha("Recebido") == "R$ 190,00")

# --- 6 -----------------------------------------------------------------------------------------
passo("6. Gestor da Loja 1 so: nao ve a outra loja")
entrar("gestor")
ir("/emporio/financeiro/pagar")
confere("o A pagar do Gestor e recusado (pagina nao encontrada): quem abre o Financeiro e o Dono, o Gerente geral e o Financeiro", eh_404(), texto_principal(200))
confere("a recusa nao vaza a Loja 2 nem as contas", LOJA2 not in texto_do_main() and "Ia Conta da Loja 2" not in texto_do_main())
resumo_g = api("GET", "/api/v1/emporio/payables/summary")
sg = ((resumo_g["body"] or {}).get("data") or {}).get("summary") or {}
confere("a ROTA payables/summary atende o Gestor (200, o contrato da spec) mesmo com a pagina fechada", resumo_g["status"] == 200, resumo_g["status"])
confere("e so soma a Loja 1: Vencida 70/1, Vence hoje 80/1, A vencer 90/1 (sem os 100 da Loja 2) e Pago 60/1", [(sg.get(k) or {}).get("total") for k in ("overdue", "due_today", "upcoming", "paid")] == [70, 80, 90, 60] and [(sg.get(k) or {}).get("count") for k in ("overdue", "due_today", "upcoming", "paid")] == [1, 1, 1, 1], sg)
st2 = api("GET", "/api/v1/emporio/payables/summary?establishment_id=" + (l2["id"] if l2 else ""))
confere("pedir a Loja 2 pela rota (fora do vinculo do Gestor): 404", st2["status"] == 404, st2["status"])
ir("/emporio/clientes/" + FICHA_ID)
confere("o Gestor abre a ficha", js("document.querySelector('main h1') && document.querySelector('main h1').innerText") == FICHA, caminho())
confere("Total comprado so da Loja 1: R$ 340,00 (sem os 90 da Loja 2)", cartao_da_ficha("Total comprado") == "R$ 340,00", cartao_da_ficha("Total comprado"))
confere("Em aberto so da Loja 1: R$ 130,00 (fiado 80 + cheque 50)", cartao_da_ficha("Em aberto") == "R$ 130,00", cartao_da_ficha("Em aberto"))
confere("Vencido R$ 80,00", cartao_da_ficha("Vencido") == "R$ 80,00", cartao_da_ficha("Vencido"))
confere("Recebido R$ 190,00 (tudo na Loja 1)", cartao_da_ficha("Recebido") == "R$ 190,00", cartao_da_ficha("Recebido"))
confere("a ficha do Gestor nao cita a Loja 2 em lugar nenhum", LOJA2 not in texto_do_main(), [l for l in texto_do_main().split("\n") if LOJA2 in l][:3])
achados_g = (api("GET", "/api/v1/emporio/customers/" + FICHA_ID)["body"] or {}).get("data") or {}
confere("a API da ficha para o Gestor traz o mesmo resumo (em_aberto 130)", abs(float((achados_g.get("resumo") or {}).get("em_aberto", -1)) - 130) < 0.01, achados_g.get("resumo"))
ir("/emporio/vendas")
confere("a lista de Vendas do Gestor nao traz a Loja 2", LOJA2 not in texto_do_main())

# --- 7 -----------------------------------------------------------------------------------------
passo("7. Celular (390 px): sem rolagem horizontal da pagina")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=True)
entrar("owner")
for rotulo, destino, esperado in [
    ("A receber", RECEBER, "Vencido"),
    ("A receber, Vencido", RECEBER + "&ver=vencido", "Vencido"),
    ("A receber, Recebido", RECEBER + "&ver=recebido", "Recebido no período"),
    ("A pagar", PAGAR, "Vencida"),
    ("A pagar, Pago", PAGAR + "&ver=pago", "Pago no período"),
    ("ficha do cliente", "/emporio/clientes/" + FICHA_ID, "Recebimentos"),
]:
    ir(destino)
    time.sleep(2)
    larg = rolagem_horizontal()
    confere(rotulo + " a 390 px: a pagina nao rola na horizontal", larg is not None and larg[0] <= larg[1] and larg[1] == 390, larg)
    confere(rotulo + " a 390 px: o conteudo chegou (" + esperado + ")", esperado in texto_do_main(), texto_do_main()[:120])
ir(RECEBER)
quatro = js("Array.from(document.querySelectorAll('main section[aria-label=Resumo] a')).map(a => { const b = a.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)]; })") or []
confere("a faixa do A receber tem 4 cartoes dentro da tela de 390 px", len(quatro) == 4 and all(0 <= l and r <= 390 for l, r, _ in quatro), quatro)
ir("/emporio/clientes/" + FICHA_ID)
cinco = js("Array.from(document.querySelectorAll('main section[aria-label=Resumo] > div')).map(a => { const b = a.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; })") or []
confere("a ficha tem 5 cartoes dentro da tela de 390 px", len(cinco) == 5 and all(0 <= l and r <= 390 for l, r in cinco), cinco)
cdp("Emulation.clearDeviceMetricsOverride")
