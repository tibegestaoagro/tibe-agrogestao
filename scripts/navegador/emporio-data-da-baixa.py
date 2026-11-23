# Validacao viva da data da baixa do Meu Emporio (Modulo 39, Q370 a Q373):
# docs/superpowers/specs/2026-11-19-emporio-data-da-baixa.md
#
#   1. Financeiro recebe um fiado por PIX com "Data em que caiu" de ontem; o extrato da conta mostra a linha em ontem
#   2. Financeiro compensa um cheque: hoje mais 40 recusa embaixo do campo (com o painel aberto); anteontem passa e
#      o extrato mostra a linha em anteontem
#   3. Financeiro paga um boleto com data de amanha: aparece em "Agendados", fora do saldo de fechamento
#   4. Vendedor recebe fiado: o painel NAO tem o campo "Data em que caiu"
#   5. Financeiro corrige o PIX de R$ 30,00 de uma venda para ontem (hoje mais 40 recusa embaixo do campo): a linha
#      muda de dia na MESMA <tr> com o valor; a linha carimbada (R$ 40,00) nao mostra "Corrigir a data"
#   6. Financeiro paga o boleto BOL-DD-2 de R$ 99,90 digitando R$ 100,10 (Q373): valor 0 recusa embaixo do campo; a
#      linha em Pagos mostra "pago R$ 100,10 (juros R$ 0,20)"; o Resultado da loja mostra "Juros recebidos R$ 0,20"
#   7c. Agendados na tela (cenario: PIX de fiado de Dd Ana e cheque 000555, ambos para amanha, na conta Dd Cofre):
#       selo Agendado nos Movimentos e na ficha do cliente, Recebido sem o valor, "Compensa em" na venda do cheque
#   7d. Gestor da loja: o campo "Data em que caiu" do boleto BOL-DD-4 tem max igual a hoje; o Financeiro nao tem max
#   7. Celular (390 px): sem rolagem horizontal no extrato e no A receber
#
# Os valores estao descritos no cabecalho do cenario (todos na "Dd Loja 1"): fiado de "Dd Maria" R$ 200,00
# (recebe R$ 50,00), boleto R$ 60,00 (BOL-DD-1) e cheque R$ 80,00 (000444, depositado); mais dois PIX de venda,
# R$ 30,00 (sem carimbo) e R$ 40,00 (carimbado); e um boleto de R$ 99,90 (BOL-DD-2).
#
# cenario: scripts/_cenario-emporio-data-da-baixa.ts
# sessao: financeiro dd-financeiro@teste.local
# sessao: vendedor dd-vendedor@teste.local
# sessao: gestor dd-gestor@teste.local
import datetime
import re

LOJA = "Dd Loja 1"
CONTA = "Dd Banco"
CAMPO_DATA = "Data em que caiu"
CAMPO_VALOR = "Valor pago (R$)"
RECEBER = "/emporio/financeiro/receber"
EXTRATO = "/emporio/financeiro/caixa"

_confere_da_lib = confere


def confere(nome, condicao, detalhe=""):
    _confere_da_lib(nome, condicao, (str(detalhe)[:300].replace("\n", " | ")) if detalhe != "" else "")


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def painel():
    return js("(() => { const d = document.querySelector('[role=dialog]'); return d ? d.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""


def br(dia_iso):
    return dia_iso[8:10] + "/" + dia_iso[5:7] + "/" + dia_iso[0:4]


def soma_dias(dia_iso, n):
    return (datetime.date.fromisoformat(dia_iso) + datetime.timedelta(days=n)).isoformat()


def tem_campo(rotulo):
    return bool(js("(() => { const raiz = document.querySelector('[role=dialog]') || document; return Array.from(raiz.querySelectorAll('label')).some(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); })()"))


def valor_do_campo(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.value : null; })()")


def clicar_na_linha(trecho, rotulo):
    """Clica no botao `rotulo` da <tr> (de qualquer tabela do main) cujo texto contem `trecho`."""
    return bool(js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(tr => tr.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(trecho) + ") && Array.from(tr.querySelectorAll('button')).some(b => b.innerText.trim() === " + repr(rotulo) + ")); if (!r) return false; Array.from(r.querySelectorAll('button')).find(b => b.innerText.trim() === " + repr(rotulo) + ").click(); return true; })()"))


def abrir_pela_linha(trecho, rotulo, segundos=60):
    fim_em = time.time() + segundos
    while time.time() < fim_em:
        if painel_aberto():
            time.sleep(1)
            return True
        clicar_na_linha(trecho, rotulo)
        time.sleep(2)
    return painel_aberto()


def enviar_e_esperar_fechar():
    enviar_painel()
    return bool(esperar(lambda: not painel_aberto(), 40))


def abrir_extrato_da_conta():
    ir(EXTRATO)
    href = js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(t => t.innerText.includes(" + repr(CONTA) + ")); const a = tr && tr.querySelector('a'); return a ? a.getAttribute('href') : null; })()")
    if not href:
        return False
    # O extrato so lista em Agendados o que cai ate o fim do periodo (D1): o periodo vai ate amanha.
    ir(href + ("&" if "?" in href else "?") + "ate=" + amanha)
    return True


def linhas_do_extrato(agendados=False):
    """O texto de cada <tr> da tabela do extrato (4+ colunas: Data, O que, Loja, Valor) ou da de Agendados (3 colunas)."""
    return js("(() => { const ts = Array.from(document.querySelectorAll('main table')).filter(t => { const h = t.querySelector('thead').innerText.toLowerCase(); return h.includes('data') && h.includes('valor') && !h.includes('loja') === " + ("true" if agendados else "false") + "; }); return ts.flatMap(t => Array.from(t.querySelectorAll('tbody tr')).map(tr => tr.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | '))); })()") or []


def linha_com(linhas, *trechos):
    """A primeira linha que tem TODOS os trechos (data, valor e descricao juntos), ou None."""
    return next((l for l in linhas if all(t in l for t in trechos)), None)


def botoes_da_linha(trecho):
    """Os botoes da <tr> do extrato que tem `trecho` (o texto de cada um), ou None se a linha nao existe."""
    # Só as tabelas do extrato (cabeçalho com Data e Valor, a principal e a de Agendados) e só a linha de VENDA:
    # outra tabela da página (ex.: cheques) pode ter o mesmo valor e nenhum botão.
    return js("(() => { const ts = Array.from(document.querySelectorAll('main table')).filter(t => { const h = t.querySelector('thead').innerText.toLowerCase(); return h.includes('data') && h.includes('valor'); }); const r = ts.flatMap(t => Array.from(t.querySelectorAll('tbody tr'))).find(tr => { const x = tr.innerText.replace(/\\u00a0/g, ' '); return x.includes(" + repr(trecho) + ") && x.includes('Venda'); }); return r ? Array.from(r.querySelectorAll('button')).map(b => b.innerText.trim()) : null; })()")


def linha_da_lista(trecho):
    """O texto da <tr> da lista de boletos (a tabela com a coluna Vencimento) que tem `trecho`, ou None."""
    return js("(() => { const ts = Array.from(document.querySelectorAll('main table')).filter(t => t.querySelector('thead').innerText.toLowerCase().includes('vencimento')); const r = ts.flatMap(t => Array.from(t.querySelectorAll('tbody tr'))).find(tr => tr.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(trecho) + ")); return r ? r.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : null; })()")


def linha_do_resultado(rotulo):
    """O texto da linha da conta do Resultado (a primeira <div> da conta com o rotulo), ou None."""
    return js("(() => { const ds = Array.from(document.querySelectorAll('main div')).filter(d => d.className.includes('py-2.5') && d.innerText.includes(" + repr(rotulo) + ")); return ds.length ? ds[0].innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : null; })()")


def fechamento():
    m = re.search(r"Saldo de fechamento:\s*(R\$\s*[\d.,\-]+)", texto_do_main())
    return m.group(1) if m else None


hoje = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).date().isoformat()
ontem = soma_dias(hoje, -1)
anteontem = soma_dias(hoje, -2)
amanha = soma_dias(hoje, 1)

passo("1. Financeiro recebe um fiado por PIX com a data de ontem")
entrar("financeiro")
ir(RECEBER)
confere("A receber abre (nao e 404)", not eh_404(), texto_principal(120))
confere("a linha do fiado de Dd Maria existe", abrir_pela_linha("Dd Maria", "Receber"), texto_principal(200))
confere("o painel do fiado tem o campo da data", tem_campo(CAMPO_DATA), painel()[:200])
confere("a data vem com hoje", valor_do_campo(CAMPO_DATA) == hoje, valor_do_campo(CAMPO_DATA))
preencher("Valor recebido (R$)", "50,00")
escolher("Loja que recebe", LOJA)
time.sleep(2)
preencher(CAMPO_DATA, ontem)
confere("o recebimento fecha o painel", enviar_e_esperar_fechar(), painel()[:200])

passo("2. Financeiro compensa o cheque: hoje + 40 recusa, anteontem passa")
ir(RECEBER)
confere("o cheque depositado tem Compensou", abrir_pela_linha("R$ 80,00", "Compensou"), texto_principal(200))
confere("o painel de compensar tem o campo da data", tem_campo(CAMPO_DATA), painel()[:200])
preencher(CAMPO_DATA, soma_dias(hoje, 40))
enviar_painel()
recusa = esperar(lambda: erro_do_campo(CAMPO_DATA), 30)
confere("hoje + 40 recusa embaixo do campo", bool(recusa) and "A data precisa estar entre" in recusa, recusa)
confere("o painel segue aberto", painel_aberto())
preencher(CAMPO_DATA, anteontem)
confere("anteontem compensa e fecha o painel", enviar_e_esperar_fechar(), painel()[:200])

passo("3. O extrato da conta: ontem e anteontem como linhas")
confere("abre o extrato da conta", abrir_extrato_da_conta(), texto_principal(150))
linhas = linhas_do_extrato()
confere("a linha de ontem e UMA so: data, fiado e R$ 50,00", linha_com(linhas, br(ontem), "Fiado recebido", "R$ 50,00") is not None, linhas)
confere("a linha de anteontem e UMA so: data, cheque e R$ 80,00", linha_com(linhas, br(anteontem), "Cheque compensado", "R$ 80,00") is not None, linhas)
confere("sem Agendados ainda", not linhas_do_extrato(True) and "Agendados" not in texto_do_main(), texto_do_main()[-200:])

passo("4. Financeiro paga o boleto com data de amanha: Agendados, fora do saldo")
confere("abre o extrato antes de pagar o boleto", abrir_extrato_da_conta(), texto_principal(150))
antes = fechamento()
confere("o saldo de fechamento de antes foi lido", antes is not None, antes)
ir(RECEBER)
confere("o boleto aberto tem Boleto pago", abrir_pela_linha("BOL-DD-1", "Boleto pago"), texto_principal(200))
confere("o painel do boleto tem o campo da data", tem_campo(CAMPO_DATA), painel()[:200])
escolher("Conta onde caiu", CONTA)
preencher(CAMPO_DATA, amanha)
confere("o boleto agendado fecha o painel", enviar_e_esperar_fechar(), painel()[:200])
confere("abre o extrato da conta de novo", abrir_extrato_da_conta(), texto_principal(150))
agendadas = linhas_do_extrato(True)
confere("existe a secao Agendados", "Agendados" in texto_do_main(), texto_do_main()[-300:])
confere("o agendado e UMA linha: amanha, boleto e R$ 60,00", linha_com(agendadas, br(amanha), "Boleto pago", "R$ 60,00") is not None, agendadas)
principal = linhas_do_extrato()
confere("o boleto de amanha NAO esta na tabela principal (que tem as 2 linhas)", len(principal) >= 2 and linha_com(principal, br(amanha)) is None and linha_com(principal, "R$ 60,00") is None, principal)
confere("o saldo de fechamento nao mudou", fechamento() == antes, str(antes) + " -> " + str(fechamento()))

passo("5. Vendedor: sem o campo da data")
entrar("vendedor")
ir("/emporio/fiado")
confere("Fiado abre para o Vendedor", not eh_404(), texto_principal(120))
confere("o Vendedor abre o Receber", abrir_pela_linha("Dd Maria", "Receber"), texto_principal(200))
confere("o Vendedor escolhe PIX", escolher("Como o cliente pagou", "PIX (entra na conta PIX da loja)") is True)
confere("com PIX escolhido, o painel do Vendedor NAO tem a data", "PIX" in painel() and not tem_campo(CAMPO_DATA), painel()[:300])

passo("6. Financeiro corrige a data do PIX da venda: ontem muda a linha de dia")
entrar("financeiro")
confere("abre o extrato da conta", abrir_extrato_da_conta(), texto_principal(150))
linhas = linhas_do_extrato()
confere("o PIX de R$ 30,00 esta em hoje", linha_com(linhas, br(hoje), "R$ 30,00") is not None, linhas)
botoes40 = botoes_da_linha("R$ 40,00") or []
confere("a linha carimbada de R$ 40,00 tem Retirar e NAO tem Corrigir a data", "Retirar" in botoes40 and "Corrigir a data" not in botoes40, botoes40)
botoes30 = botoes_da_linha("R$ 30,00") or []
confere("a linha sem carimbo de R$ 30,00 tem Corrigir a data", "Corrigir a data" in botoes30, botoes30)
confere("o painel de corrigir abre", abrir_pela_linha("R$ 30,00", "Corrigir a data"), texto_principal(200))
confere("o campo vem com o dia atual da linha", valor_do_campo(CAMPO_DATA) == hoje, valor_do_campo(CAMPO_DATA))
preencher(CAMPO_DATA, soma_dias(hoje, 40))
enviar_painel()
recusa = esperar(lambda: erro_do_campo(CAMPO_DATA), 30)
confere("hoje + 40 recusa embaixo do campo", bool(recusa) and "A data precisa estar entre" in recusa, recusa)
preencher(CAMPO_DATA, ontem)
confere("ontem corrige e fecha o painel", enviar_e_esperar_fechar(), painel()[:200])
esperar(lambda: linha_com(linhas_do_extrato(), br(ontem), "R$ 30,00"), 30)
linhas = linhas_do_extrato()
confere("a linha de R$ 30,00 mudou para ontem, na mesma linha do valor", linha_com(linhas, br(ontem), "R$ 30,00") is not None, linhas)
confere("e saiu de hoje", linha_com(linhas, br(hoje), "R$ 30,00") is None, linhas)

passo("6b. Corrigida por engano para amanha: a linha vai a Agendados e VOLTA por la")
confere("o painel de corrigir abre na tabela principal", abrir_pela_linha("R$ 30,00", "Corrigir a data"), texto_principal(200))
preencher(CAMPO_DATA, amanha)
confere("amanha corrige e fecha o painel", enviar_e_esperar_fechar(), painel()[:200])
esperar(lambda: linha_com(linhas_do_extrato(True), br(amanha), "R$ 30,00"), 30)
agendadas = linhas_do_extrato(True)
confere("a linha de R$ 30,00 esta em Agendados, em amanha", linha_com(agendadas, br(amanha), "R$ 30,00") is not None, agendadas)
confere("e saiu da tabela principal", linha_com(linhas_do_extrato(), "R$ 30,00") is None, linhas_do_extrato())
botoes_ag = botoes_da_linha("R$ 30,00") or []
confere("a linha agendada tem Corrigir a data (o caminho de volta)", "Corrigir a data" in botoes_ag, botoes_ag)
confere("o painel de corrigir abre pela linha de Agendados", abrir_pela_linha("R$ 30,00", "Corrigir a data"), texto_principal(200))
confere("o campo vem com amanha", valor_do_campo(CAMPO_DATA) == amanha, valor_do_campo(CAMPO_DATA))
preencher(CAMPO_DATA, ontem)
confere("ontem corrige e fecha o painel", enviar_e_esperar_fechar(), painel()[:200])
esperar(lambda: linha_com(linhas_do_extrato(), br(ontem), "R$ 30,00"), 30)
confere("a linha de R$ 30,00 voltou para ontem na tabela principal", linha_com(linhas_do_extrato(), br(ontem), "R$ 30,00") is not None, linhas_do_extrato())
confere("e saiu de Agendados", linha_com(linhas_do_extrato(True), "R$ 30,00") is None, linhas_do_extrato(True))

passo("7. Boleto de R$ 99,90 pago com R$ 100,10: juros de R$ 0,20 na lista e no Resultado")
entrar("financeiro")
ir(RECEBER)
confere("o boleto BOL-DD-2 tem Boleto pago", abrir_pela_linha("BOL-DD-2", "Boleto pago"), texto_principal(200))
confere("o campo Valor pago vem com R$ 99,90 do boleto", valor_do_campo(CAMPO_VALOR) == "99,90", valor_do_campo(CAMPO_VALOR))
escolher("Conta onde caiu", CONTA)
preencher(CAMPO_VALOR, "0")
enviar_painel()
recusa = esperar(lambda: erro_do_campo(CAMPO_VALOR), 30)
confere("valor 0 recusa embaixo do campo Valor pago", bool(recusa) and recusa != "invalido sem texto", recusa)
confere("o painel segue aberto", painel_aberto())
preencher(CAMPO_VALOR, "100,10")
confere("R$ 100,10 paga e fecha o painel", enviar_e_esperar_fechar(), painel()[-280:])
js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.trim() === 'Pagos'); if (b) b.click(); })()")
esperar(lambda: linha_da_lista("BOL-DD-2"), 30)
lista = linha_da_lista("BOL-DD-2") or ""
confere("a linha do boleto pago diz pago R$ 100,10 (juros R$ 0,20)", "pago R$ 100,10 (juros R$ 0,20)" in lista, lista or "sem a linha")
confere("e traz o valor do boleto R$ 99,90 na mesma linha", "R$ 99,90" in lista, lista)
resp = api("GET", "/api/v1/emporio/establishments")
dados = (resp.get("body") or {}).get("data") if isinstance(resp, dict) else None
dados = dados.get("items") if isinstance(dados, dict) else dados
loja_id = next((x["id"] for x in (dados or []) if x.get("name") == LOJA), None)
confere("achei o id da loja", loja_id is not None, resp)
ir("/emporio/resultado?loja=" + str(loja_id))
esperar(lambda: linha_do_resultado("Juros recebidos"), 40)
juros = linha_do_resultado("Juros recebidos") or ""
confere("o Resultado tem a linha Juros recebidos com R$ 0,20", "R$ 0,20" in juros, juros)
confere("e ainda nao tem Desconto concedido (nenhum pago com desconto ate aqui)", linha_do_resultado("Desconto concedido") is None, linha_do_resultado("Desconto concedido"))

passo("7b. Boleto de R$ 50,00 pago com R$ 49,50: desconto de R$ 0,50 na lista e no Resultado")
ir(RECEBER)
confere("o boleto BOL-DD-3 tem Boleto pago", abrir_pela_linha("BOL-DD-3", "Boleto pago"), texto_principal(200))
confere("o campo Valor pago vem com 50,00 do boleto", valor_do_campo(CAMPO_VALOR) == "50,00", valor_do_campo(CAMPO_VALOR))
escolher("Conta onde caiu", CONTA)
preencher(CAMPO_VALOR, "49,50")
confere("R$ 49,50 paga e fecha o painel", enviar_e_esperar_fechar(), painel()[-280:])
js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.trim() === 'Pagos'); if (b) b.click(); })()")
esperar(lambda: linha_da_lista("BOL-DD-3"), 30)
lista = linha_da_lista("BOL-DD-3") or ""
confere("a linha do boleto pago diz pago R$ 49,50 (desconto R$ 0,50)", "pago R$ 49,50 (desconto R$ 0,50)" in lista, lista or "sem a linha")
ir("/emporio/resultado?loja=" + str(loja_id))
esperar(lambda: linha_do_resultado("Desconto concedido"), 40)
desc = linha_do_resultado("Desconto concedido") or ""
confere("o Resultado tem a linha Desconto concedido com R$ 0,50", "R$ 0,50" in desc, desc)
juros = linha_do_resultado("Juros recebidos") or ""
confere("e a linha Juros recebidos segue com R$ 0,20", "R$ 0,20" in juros, juros)

passo("7c. Agendados na tela: Movimentos, ficha do cliente e venda do cheque")
entrar("financeiro")
ir("/emporio/caixa")
esperar(lambda: "Movimentos" in texto_do_main(), 40)
movs = js("(() => { const t = Array.from(document.querySelectorAll('main table')).find(t => t.querySelector('thead').innerText.toLowerCase().includes('origem')); return t ? Array.from(t.querySelectorAll('tbody tr')).map(tr => tr.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ')) : []; })()") or []
agendada = linha_com(movs, "R$ 20,00", "Agendado")
confere("nos Movimentos, a linha agendada do PIX de R$ 20,00 tem o selo Agendado", agendada is not None, movs)
comum = linha_com(movs, "R$ 40,00")
confere("e uma linha de hoje (sem agendar) NAO tem o selo", comum is not None and "Agendado" not in comum, comum)

ana = next((x for x in (lambda d: d.get("items") if isinstance(d, dict) else d)((api("GET", "/api/v1/emporio/customers?q=Dd%20Ana")["body"] or {}).get("data")) or [] if x.get("name") == "Dd Ana"), None)
confere("acha Dd Ana pela API", ana is not None, ana)
ir("/emporio/clientes/" + str((ana or {}).get("id")))
esperar(lambda: "Recebimentos" in texto_do_main(), 40)
recs = js("(() => { const t = Array.from(document.querySelectorAll('main table')).find(t => t.querySelector('thead').innerText.toLowerCase().includes('forma')); return t ? Array.from(t.querySelectorAll('tbody tr')).map(tr => tr.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ')) : []; })()") or []
confere("a ficha mostra o PIX de R$ 20,00 com Agendado", linha_com(recs, "Fiado", "R$ 20,00", "Agendado") is not None, recs)
confere("e o cheque compensado para amanha de R$ 70,00 com Agendado", linha_com(recs, "Cheque", "R$ 70,00", "Agendado") is not None, recs)
risco = js("Array.from(document.querySelectorAll('main td span.line-through')).map(s => s.innerText.replace(/\\u00a0/g, ' ') + '|' + (s.getAttribute('title') || ''))") or []
linha_cheque = linha_com(recs, "Cheque", "R$ 70,00") or ""
confere("na ficha, o cheque futuro diz Compensa em DD/MM de amanha e NAO Compensado (D4)", ("Compensa em " + br(amanha)[:5]) in linha_cheque and "Compensado" not in linha_cheque, linha_cheque)
confere("o valor agendado sai riscado com a dica", any("R$ 20,00" in x and "Não entra no Recebido" in x for x in risco), risco)
recebido = js("(() => { const p = Array.from(document.querySelectorAll('main p')).find(x => x.innerText.trim() === 'Recebido'); return p && p.nextElementSibling ? p.nextElementSibling.innerText.replace(/\\u00a0/g, ' ') : null; })()")
confere("o Recebido do cliente nao soma o agendado (R$ 0,00)", recebido == "R$ 0,00", recebido)
# Q375: o recebimento com data futura ainda nao caiu: segue no Em aberto ate o dia chegar. Dd Ana deve R$ 70,00 do
# fiado de R$ 90,00 (o PIX de R$ 20,00 agendado ja quitou a conta), mais o PIX agendado (R$ 20,00) e o cheque
# compensado para amanha (R$ 70,00): R$ 160,00. Sem a Q375 o card mostraria so os R$ 70,00 do fiado.
em_aberto = js("(() => { const p = Array.from(document.querySelectorAll('main p')).find(x => x.innerText.trim() === 'Em aberto'); return p && p.nextElementSibling ? p.nextElementSibling.innerText.replace(/\\u00a0/g, ' ') : null; })()")
confere("Q375: o Em aberto do cliente soma o fiado (R$ 70,00) e os dois agendados (R$ 20,00 e R$ 70,00): R$ 160,00", em_aberto == "R$ 160,00", em_aberto)
confere("Q375: e o Recebido segue em R$ 0,00 com o mesmo agendado no Em aberto", recebido == "R$ 0,00" and em_aberto != recebido, [em_aberto, recebido])
venda_href =js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(tr => tr.innerText.replace(/\\u00a0/g, ' ').includes('Cheque') && tr.innerText.replace(/\\u00a0/g, ' ').includes('R$ 70,00')); const a = r && r.querySelector('a[href*=\"/emporio/vendas/\"]'); return a ? a.getAttribute('href') : null; })()")
confere("acha o link da venda do cheque", bool(venda_href), venda_href)
ir(venda_href or "/emporio")
esperar(lambda: "Cheque nº" in texto_do_main(), 40)
confere("a venda do cheque mostra Compensa em DD/MM de amanha", ("Compensa em " + br(amanha)[:5]) in texto_do_main(), texto_do_main()[-400:])
confere("e NAO mostra Compensado (D4)", "Compensado" not in texto_do_main(), texto_do_main()[-400:])

passo("7d. Gestor da loja: o campo da data do boleto nao aceita futuro")
entrar("gestor")
ir("/emporio/caixa")
confere("o Gestor abre o boleto BOL-DD-4 em Boleto pago", abrir_pela_linha("BOL-DD-4", "Boleto pago"), texto_principal(200))
confere("o painel tem o campo da data", tem_campo(CAMPO_DATA), painel()[:200])
maximo = js("(() => { const raiz = document.querySelector('[role=dialog]'); const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(CAMPO_DATA) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.getAttribute('max') : null; })()")
confere("o campo tem max igual a hoje", maximo == hoje, maximo)
confere("a dica diz so para tras", "Até 31 dias para trás." in painel() and "Agendados" not in painel(), painel()[-300:])
ir("/emporio/caixa")
confere("o Gestor ve Compensou no cheque 000666 (depositado daqui a 3 dias)", abrir_pela_linha("R$ 15,00", "Compensou"), texto_principal(200))
confere("o painel de compensar do Gestor NAO tem o campo da data", not tem_campo(CAMPO_DATA), painel()[:200])
enviar_painel()
recusa_rodape = esperar(lambda: "não pode ser antes do depósito" in painel(), 30)
confere("a recusa de compensar antes do deposito aparece no painel do Gestor", bool(recusa_rodape), painel()[-300:])
confere("o painel segue aberto", painel_aberto())
entrar("financeiro")
ir(RECEBER)
confere("o Financeiro abre o mesmo boleto", abrir_pela_linha("BOL-DD-4", "Boleto pago"), texto_principal(200))
maximo = js("(() => { const raiz = document.querySelector('[role=dialog]'); const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(CAMPO_DATA) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.getAttribute('max') : 'sem'; })()")
confere("o campo do Financeiro NAO tem max", maximo is None, maximo)

passo("8. Celular (390 px): sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=800, deviceScaleFactor=2, mobile=True)
entrar("financeiro")
for caminho_ in (RECEBER,):
    ir(caminho_)
    larg = js("[document.documentElement.scrollWidth, window.innerWidth]")
    confere("sem rolagem horizontal em " + caminho_, larg[0] <= larg[1], larg)
abrir_extrato_da_conta()
larg = js("[document.documentElement.scrollWidth, window.innerWidth]")
confere("sem rolagem horizontal no extrato", larg[0] <= larg[1], larg)
cdp("Emulation.clearDeviceMetricsOverride")

fim()
