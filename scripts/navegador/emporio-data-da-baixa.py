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
#   6. Celular (390 px): sem rolagem horizontal no extrato e no A receber
#
# Os valores estao descritos no cabecalho do cenario (todos na "Dd Loja 1"): fiado de "Dd Maria" R$ 200,00
# (recebe R$ 50,00), boleto R$ 60,00 (BOL-DD-1) e cheque R$ 80,00 (000444, depositado); mais dois PIX de venda,
# R$ 30,00 (sem carimbo) e R$ 40,00 (carimbado).
#
# cenario: scripts/_cenario-emporio-data-da-baixa.ts
# sessao: financeiro dd-financeiro@teste.local
# sessao: vendedor dd-vendedor@teste.local
import datetime
import re

LOJA = "Dd Loja 1"
CONTA = "Dd Banco"
CAMPO_DATA = "Data em que caiu"
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
    ir(href)
    return True


def linhas_do_extrato(agendados=False):
    """O texto de cada <tr> da tabela do extrato (4+ colunas: Data, O que, Loja, Valor) ou da de Agendados (3 colunas)."""
    return js("(() => { const ts = Array.from(document.querySelectorAll('main table')).filter(t => { const h = t.querySelector('thead').innerText.toLowerCase(); return h.includes('data') && h.includes('valor') && (t.querySelectorAll('thead th').length === 3) === " + ("true" if agendados else "false") + "; }); return ts.flatMap(t => Array.from(t.querySelectorAll('tbody tr')).map(tr => tr.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | '))); })()") or []


def linha_com(linhas, *trechos):
    """A primeira linha que tem TODOS os trechos (data, valor e descricao juntos), ou None."""
    return next((l for l in linhas if all(t in l for t in trechos)), None)


def botoes_da_linha(trecho):
    """Os botoes da <tr> do extrato que tem `trecho` (o texto de cada um), ou None se a linha nao existe."""
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(tr => tr.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(trecho) + ")); return r ? Array.from(r.querySelectorAll('button')).map(b => b.innerText.trim()) : null; })()")


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

passo("7. Celular (390 px): sem rolagem horizontal")
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
