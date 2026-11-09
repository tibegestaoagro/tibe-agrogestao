# Validacao viva das entregas 2 e 3 das taxas de cartao do Meu Empório (Modulo 39):
# regra de dia util, antecipacao automatica e antecipacao pontual com desfazer.
# docs/superpowers/specs/2026-11-09-emporio-cartao-entregas-2-e-3-design.md
#
# Os numeros, conferidos na tela e pela API:
#   Configurações: a Stone Ant passa para "Próximo dia útil"; a Rede Ant liga a
#     antecipacao automatica (2% ao mes, 1 dia util, desde 01/01/2026); ligar sem
#     preencher e recusado nos campos
#   balcao: Stone Ant, Visa/Master, 3x de R$ 300,00: liquido R$ 291,00, 1ª parcela
#     em dia util, sem linha de antecipacao; Rede Ant, Elo: taxa 3% + R$ 1,00,
#     liquido R$ 290,00 e "Antecipado: cai em <1 dia util>, líquido estimado ..."
#   detalhe da venda da Rede: taxa fixa a parte e as 3 parcelas "antecipada"
#   a receber: marcar as 3 parcelas da Stone, receber R$ 280,00 de R$ 291,00:
#     custo R$ 11,00; o saldo da conta passa de R$ 0,00 para R$ 280,00
#   Resultado: a linha "Antecipação de recebíveis" com R$ 11,00
#   Desfazer: o saldo volta a R$ 0,00 e a linha do Resultado a R$ 0,00
#
# As datas nao dependem do dia da semana em que o roteiro roda: o roteiro calcula
# o dia util esperado (fim de semana e feriado nacional fixo) e confere que as
# datas da Stone caem em dia util.
#
# cenario: scripts/_cenario-emporio-antecipacao.ts
# sessao: owner owner@damata.com.br
import datetime
import re


def tem(texto, n=40000):
    # O dinheiro sai com espaco nao separavel entre "R$" e o valor.
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def texto_do_main(n=40000):
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""


def por_aria(aria, valor):
    return js("(() => { const el = Array.from(document.querySelectorAll('input')).find(x => x.getAttribute('aria-label') === " + repr(aria) + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def escolher_por_id(prefixo_id, opcao):
    xy = _centro("document.querySelector(" + repr('[id^="' + prefixo_id + '"]') + ")")
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(opcao) + ")")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def buscar_e_adicionar(nome):
    js("(() => { const el = document.querySelector('input[aria-label=\"Buscar produto\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(nome) + "); el.dispatchEvent(new Event('input', { bubbles: true })); })()")
    time.sleep(0.8)
    ok = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()")
    time.sleep(0.8)
    return bool(ok)


def fechar_venda():
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === 'Fechar a venda'); if (b) b.click(); })()")


def resumo():
    return (js("(() => { const s = document.querySelector('[role=status]'); return s ? s.innerText.replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ') : ''; })()") or "")


def clicar_no_bloco(texto_do_bloco, rotulo):
    """Clica no botao `rotulo` dentro do menor bloco que contem `texto_do_bloco`."""
    return bool(js("(() => { const cands = Array.from(document.querySelectorAll('main *')).filter(el => el.innerText && el.innerText.includes(" + repr(texto_do_bloco) + ") && Array.from(el.querySelectorAll('button')).some(b => b.innerText.trim() === " + repr(rotulo) + ")); cands.sort((a, b) => a.innerText.length - b.innerText.length); const c = cands[0]; if (!c) return false; Array.from(c.querySelectorAll('button')).find(b => b.innerText.trim() === " + repr(rotulo) + ").click(); return true; })()"))


def vendas_da_loja(loja_id):
    return api("GET", "/api/v1/emporio/sales?establishment_id=" + loja_id)["body"]["data"]


def adquirentes():
    return {a["name"]: a for a in api("GET", "/api/v1/emporio/card-acquirers")["body"]["data"]}


def saldo_da_conta():
    contas = api("GET", "/api/v1/emporio/bank-accounts")["body"]["data"]
    return [c["balance"] for c in contas if c["name"] == "Ant Banco"][0]


def antecipacoes_da_loja(loja_id):
    return api("GET", "/api/v1/emporio/card-anticipations?establishment_id=" + loja_id)["body"]["data"]


def pontuais(loja_id):
    return [o for o in antecipacoes_da_loja(loja_id) if o["kind"] == "pontual"]


def automaticas(loja_id):
    return [o for o in antecipacoes_da_loja(loja_id) if o["kind"] == "automatica"]


def em_reais(n):
    return "R$ " + ("%.2f" % n).replace(".", ",")


def custo_do_mes(loja_id):
    return api("GET", "/api/v1/emporio/result?establishment_id=" + loja_id + "&month=" + HOJE.strftime("%Y-%m"))["body"]["data"].get("anticipation_costs")


# O dia de hoje em Brasilia (UTC-3), como o app conta.
HOJE = (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).date()
FERIADOS_FIXOS = {(1, 1), (21, 4), (1, 5), (7, 9), (12, 10), (2, 11), (15, 11), (20, 11), (25, 12)}


def eh_util(d):
    return d.weekday() < 5 and (d.month, d.day) not in FERIADOS_FIXOS


def proximo_util(d):
    while not eh_util(d):
        d += datetime.timedelta(days=1)
    return d


def somar_uteis(d, n):
    atual = proximo_util(d)
    for _ in range(n):
        atual = proximo_util(atual + datetime.timedelta(days=1))
    return atual


def dia_mes_para_data(dd_mm):
    """'DD/MM' de uma data futura (ate ~60 dias) vira a data completa."""
    dia, mes = [int(x) for x in dd_mm.split("/")]
    ano = HOJE.year + (1 if (mes, dia) < (HOJE.month, HOJE.day) else 0)
    return datetime.date(ano, mes, dia)


def abrir_balcao_com_racao(qtd):
    ir("/emporio/vender")
    ok = escolher("Loja", "Ant Loja") is True and buscar_e_adicionar("Ant Ração")
    por_aria("Quantidade do item 1", str(qtd))
    time.sleep(0.5)
    return ok


def parcelado(parcelas, adquirente, bandeira, novo=True):
    """Com `novo=False` troca a adquirente e a bandeira do parcelado ja aberto (a prévia muda sem somar outro pagamento)."""
    if novo:
        clicar("+ Parcelado")
        time.sleep(0.8)
        escolher_por_id("parcelas-", str(parcelas) + "x")
    escolher("Adquirente", adquirente)
    clicar(bandeira)
    time.sleep(1)


def fechar_parcelado():
    """Fecha a venda aberta no balcao. Devolve o id da venda nova, ou None."""
    antes = {v["id"] for v in vendas_da_loja(loja["id"])}
    escolher_cliente("Consumidor final")
    fechar_venda()
    esperar(lambda: "Parcelado" in resumo(), 90)
    novas = [v["id"] for v in vendas_da_loja(loja["id"]) if v["id"] not in antes]
    if len(novas) != 1:
        print("  recusa na tela: " + str(js("Array.from(document.querySelectorAll('[role=alert]')).map(a => a.innerText).join(' | ')")))
    return novas[0] if len(novas) == 1 else None


def marcar_parcelas_da_stone():
    return js("(() => { const cks = Array.from(document.querySelectorAll('main input[type=checkbox][aria-label^=\"Antecipar a parcela\"]')); cks.forEach(c => { if (!c.checked) c.click(); }); return cks.length; })()")


def linhas_antecipada(tabela_texto="antecipada em"):
    return js("Array.from(document.querySelectorAll('main tbody tr')).filter(tr => tr.innerText.includes(" + repr(tabela_texto) + ")).length")


passo("0. O cenário: a Stone Ant e a Rede Ant, sem nenhuma venda")
entrar("owner")
ir("/emporio")
loja = [l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"] == "Ant Loja"][0]
adq = adquirentes()
confere("as duas adquirentes do cenário", "Stone Ant" in adq and "Rede Ant" in adq, list(adq.keys()))
confere("a Stone Ant começa em dias corridos, sem automática", adq["Stone Ant"]["business_day_rule"] == "dias_corridos" and adq["Stone Ant"]["auto_anticipation_enabled"] is False, adq["Stone Ant"])
confere("o saldo da conta Ant Banco começa em R$ 0,00", saldo_da_conta() == 0, saldo_da_conta())
# A primeira visita a uma rota compila no next dev e pode recarregar a pagina no meio do passo.
for rota in ["/emporio/vender", "/emporio/configuracoes", "/emporio/financeiro/receber", "/emporio/financeiro/caixa", "/emporio/resultado", "/emporio/vendas/x"]:
    js("fetch(" + repr(rota) + ").then(r => r.status)")
for rota in ["/api/v1/emporio/card-anticipations", "/api/v1/emporio/result?establishment_id=" + loja["id"] + "&month=" + HOJE.strftime("%Y-%m")]:
    api("GET", rota)
time.sleep(2)

passo("1. Configurações: a Stone Ant passa para o próximo dia útil")
ir("/emporio/configuracoes")
confere("a Stone Ant mostra 'Dias corridos'", tem("Dias corridos"), texto_do_main(2500))
confere("abre Editar da Stone Ant", clicar_no_bloco("Stone Ant", "Editar"))
time.sleep(1.5)
confere("o painel tem a regra, a devolução e a automática", painel_aberto() and "Regra de dia útil" in texto_da_pagina() and "Devolve a taxa no cancelamento" in texto_da_pagina() and "Antecipação automática" in texto_da_pagina())
confere("escolhe 'Próximo dia útil'", escolher("Regra de dia útil", "Próximo dia útil") is True)
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Nome"))
confere("a regra gravada é a do próximo dia útil", bool(esperar(lambda: adquirentes()["Stone Ant"]["business_day_rule"] == "proximo_dia_util", 30)), adquirentes()["Stone Ant"])
ir("/emporio/configuracoes")
confere("a lista mostra 'Dia útil' na Stone Ant", tem("Dia útil"), texto_do_main(2500))

passo("2. Configurações: ligar a antecipação automática na Rede Ant (a recusa nos campos, depois o preenchimento)")
confere("abre Editar da Rede Ant", clicar_no_bloco("Rede Ant", "Editar"))
time.sleep(1.5)
confere("sem automática, os campos da antecipação não aparecem", "Taxa da antecipação" not in texto_da_pagina())
confere("escolhe 'Ligada'", escolher("Antecipação automática", "Ligada") is True)
time.sleep(0.8)
confere("ligada, os três campos aparecem", all(t in texto_da_pagina() for t in ["Taxa da antecipação (% ao mês)", "Dias úteis até cair", "A partir de"]))
enviar_painel()
time.sleep(1.5)
confere("ligar sem a taxa: a recusa fica no campo da taxa", bool(esperar(lambda: erro_do_campo("Taxa da antecipação (% ao mês)"), 20)), erro_do_campo("Taxa da antecipação (% ao mês)"))
confere("ligar sem a data: a recusa fica no campo 'A partir de'", bool(erro_do_campo("A partir de")), erro_do_campo("A partir de"))
confere("o painel segue aberto e nada foi gravado", painel_aberto() and adquirentes()["Rede Ant"]["auto_anticipation_enabled"] is False)
preencher("Taxa da antecipação (% ao mês)", "2")
preencher("Dias úteis até cair", "1")
preencher("A partir de", "2026-01-01")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Taxa da antecipação (% ao mês)"))
rede_cfg = lambda: adquirentes()["Rede Ant"]
confere("a automática gravada: 2% ao mês, 1 dia útil, desde 01/01/2026", bool(esperar(lambda: rede_cfg()["auto_anticipation_enabled"] is True, 30)) and rede_cfg()["auto_anticipation_pct_month"] == 2 and rede_cfg()["auto_anticipation_business_days"] == 1 and str(rede_cfg()["auto_anticipation_since"])[:10] == "2026-01-01", rede_cfg())
ir("/emporio/configuracoes")
confere("a lista resume a automática", tem("automática 2% a.m. desde 01/01/2026"), texto_do_main(2500))

passo("3. Balcão: a prévia da Stone Ant (dia útil, sem antecipação) e a da Rede Ant (antecipada)")
abrir_balcao_com_racao(15)
parcelado(3, "Stone Ant", "Visa/Master")
principal = texto_do_main()
m_stone = re.search(r"Taxa 3[^:]*: líquido R\$ 291,00, 1ª parcela em (\d\d/\d\d)", principal)
confere("Stone Ant: taxa 3%, líquido R$ 291,00 e a 1ª parcela", m_stone is not None, texto_principal(1500))
if m_stone:
    primeira = dia_mes_para_data(m_stone.group(1))
    confere("a 1ª parcela da Stone Ant cai em dia útil", eh_util(primeira), primeira.isoformat() + " " + primeira.strftime("%a"))
confere("a Stone Ant não mostra a linha de antecipação", "Antecipado: cai em" not in principal)
parcelado(3, "Rede Ant", "Elo", novo=False)
principal = texto_do_main()
confere("Rede Ant: taxa 3% mais R$ 1,00, líquido R$ 290,00", re.search(r"Taxa 3[^:]*\+ R\$ 1,00: líquido R\$ 290,00", principal) is not None, texto_principal(1500))
m_auto = re.search(r"Antecipado: cai em (\d\d/\d\d), líquido estimado R\$ ([\d.,]+)", principal)
confere("a Rede Ant mostra 'Antecipado: cai em ..., líquido estimado'", m_auto is not None, texto_principal(1500))
if m_auto:
    esperado = somar_uteis(HOJE, 1)
    confere("cai em 1 dia útil: " + esperado.strftime("%d/%m"), m_auto.group(1) == esperado.strftime("%d/%m"), m_auto.group(1))
    estimado = float(m_auto.group(2).replace(".", "").replace(",", "."))
    confere("o líquido estimado fica entre R$ 250,00 e R$ 290,00 (o custo existe)", 250 < estimado < 290, estimado)
else:
    estimado = None

passo("4. A venda da Rede Ant nasce antecipada; o detalhe mostra a taxa fixa e as parcelas")
venda_rede = fechar_parcelado()
confere("venda na Rede Ant registrada", venda_rede is not None)
if venda_rede:
    ir("/emporio/vendas/" + venda_rede)
    detalhe = texto_do_main(4000)
    confere("detalhe: Elo, Rede Ant, 3x, taxa 3% + R$ 1,00 (R$ 10,00)", re.search(r"Elo, Rede Ant, 3x, taxa 3[^(]*\+ R\$ 1,00 \(R\$ 10,00\)", detalhe) is not None, detalhe[:1500])
    confere("as 3 parcelas aparecem como antecipadas", len(re.findall(r"antecipada \(previsto", detalhe)) == 3, len(re.findall(r"antecipada \(previsto", detalhe)))
    confere("as parcelas trazem data e líquido efetivos", re.search(r"Parcela 1/3: \d\d/\d\d/\d{4}, R\$ ", detalhe) is not None, detalhe[:1500])
    auto_ops = automaticas(loja["id"])
    confere("nasceu uma operação automática: previsto R$ 290,00, sem Desfazer", len(auto_ops) == 1 and auto_ops[0]["expected_net"] == 290 and auto_ops[0]["receivables_count"] == 3 and auto_ops[0]["can_undo"] is False, auto_ops)
    custo_auto = auto_ops[0]["fee_amount"] if len(auto_ops) == 1 else 0
    confere("o líquido estimado da prévia é o que a venda gravou", estimado is not None and len(auto_ops) == 1 and abs(auto_ops[0]["received_net"] - estimado) < 0.005, (estimado, auto_ops[0]["received_net"] if auto_ops else None))
    confere("o custo da automática, 2% ao mês, é positivo", custo_auto > 0 and auto_ops[0]["effective_pct_month"] == 2, auto_ops[0].get("effective_pct_month") if auto_ops else None)
else:
    custo_auto = 0

passo("5. Venda da Stone Ant: 3x de R$ 300,00 no Visa/Master")
abrir_balcao_com_racao(15)
parcelado(3, "Stone Ant", "Visa/Master")
venda_stone = fechar_parcelado()
confere("venda na Stone Ant registrada", venda_stone is not None)
confere("o saldo da conta segue em R$ 0,00 (nenhuma parcela caiu)", saldo_da_conta() == 0, saldo_da_conta())

passo("6. A receber: marcar as três parcelas da Stone Ant e antecipar recebendo R$ 280,00")
ir("/emporio/financeiro/receber?loja=" + loja["id"])
confere("Cartões a receber e Antecipações existem", tem("Cartões a receber") and tem("Antecipações") and tem("Automática"), texto_principal(800))
confere("as três parcelas da Rede Ant já aparecem antecipadas", linhas_antecipada() == 3, linhas_antecipada())
confere("o botão Antecipar começa desabilitado", js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.trim() === 'Antecipar'); return b ? b.disabled : null; })()") is True)
n = marcar_parcelas_da_stone()
confere("três parcelas marcáveis (as da Stone Ant)", n == 3, n)
time.sleep(0.8)
confere("o botão vira 'Antecipar (3)'", clicar("Antecipar (3)"))
time.sleep(1.5)
confere("o painel abre com as 3 parcelas e o líquido previsto", painel_aberto() and "3 parcelas" in texto_da_pagina() and "R$ 291,00" in texto_da_pagina(), texto_da_pagina()[:600])
preencher("Líquido recebido (R$)", "280,00")
time.sleep(0.8)
painel = texto_da_pagina()
confere("o painel calcula o custo: R$ 11,00 e o ao mês", "Custo da antecipação: R$ 11,00" in painel and "ao mês" in painel, painel[-500:])
preencher("Líquido recebido (R$)", "300,00")
enviar_painel()
time.sleep(1.5)
confere("receber mais do que o líquido é recusado no campo", bool(esperar(lambda: erro_do_campo("Líquido recebido (R$)"), 30)), erro_do_campo("Líquido recebido (R$)"))
confere("o painel segue aberto e nada foi gravado", painel_aberto() and len(pontuais(loja["id"])) == 0)
preencher("Líquido recebido (R$)", "280,00")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Líquido recebido (R$)"))
ops = lambda: pontuais(loja["id"])
confere("uma operação pontual gravada", bool(esperar(lambda: len(ops()) == 1, 30)), len(ops()))
if len(ops()) == 1:
    op = ops()[0]
    confere("previsto R$ 291,00, recebido R$ 280,00, custo R$ 11,00, 3 parcelas, pode desfazer", op["kind"] == "pontual" and op["expected_net"] == 291 and op["received_net"] == 280 and op["fee_amount"] == 11 and op["receivables_count"] == 3 and op["can_undo"] is True, op)
    confere("o custo efetivo ao mês veio calculado", isinstance(op.get("effective_pct_month"), (int, float)) and op["effective_pct_month"] > 0, op.get("effective_pct_month"))
    op_id = op["id"]
else:
    op_id = None
ir("/emporio/financeiro/receber?loja=" + loja["id"])
secao = texto_do_main()
confere("a seção Antecipações lista a operação: Pontual, R$ 280,00, R$ 11,00, ao mês", all(t in secao for t in ["Pontual", "Automática", "R$ 280,00", "R$ 11,00", "ao mês", "Stone Ant", "Rede Ant"]), secao[-900:])
confere("as 6 parcelas aparecem antecipadas (3 da Rede Ant e 3 da Stone Ant)", linhas_antecipada() == 6, linhas_antecipada())

passo("7. O saldo da conta: R$ 280,00 (o líquido efetivo), não R$ 291,00")
confere("a API: saldo da Ant Banco R$ 280,00", saldo_da_conta() == 280, saldo_da_conta())
ir("/emporio/financeiro/caixa?loja=" + loja["id"])
confere("a posição de caixa mostra a Ant Banco com R$ 280,00", bool(js("Array.from(document.querySelectorAll('main tr, main li')).some(el => el.innerText.includes('Ant Banco') && el.innerText.replace(/\\u00a0/g, ' ').includes('R$ 280,00'))")), texto_principal(1200))

def linha_do_resultado(texto):
    return bool(js("Array.from(document.querySelectorAll('main *')).some(el => el.innerText && el.innerText.length < 400 && el.innerText.includes('Antecipação de recebíveis') && el.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(texto) + "))"))


passo("8. O Resultado: a linha 'Antecipação de recebíveis' soma a automática e a pontual (R$ 11,00)")
total_custo = round(11 + custo_auto, 2)
ir("/emporio/resultado?loja=" + loja["id"])
confere("a linha aparece com " + em_reais(total_custo), linha_do_resultado(em_reais(total_custo)), texto_principal(3000))
confere("a API: anticipation_costs " + str(total_custo), custo_do_mes(loja["id"]) == total_custo, custo_do_mes(loja["id"]))

passo("9. Desfazer: o saldo e a linha do Resultado voltam")
ir("/emporio/financeiro/receber?loja=" + loja["id"])
confere("abre Desfazer", clicar("Desfazer"))
time.sleep(1.5)
confere("o diálogo explica o que volta", "voltam à data prevista" in texto_da_pagina(), texto_da_pagina()[-400:])
confere("confirma 'Desfazer antecipação'", clicar("Desfazer antecipação"))
confere("a operação fica desfeita", bool(esperar(lambda: ops()[0]["undone_at"] is not None, 40)), ops())
confere("a automática segue valendo", len(automaticas(loja["id"])) == 1 and automaticas(loja["id"])[0]["undone_at"] is None)
confere("a API: saldo da Ant Banco volta a R$ 0,00", saldo_da_conta() == 0, saldo_da_conta())
ir("/emporio/financeiro/receber?loja=" + loja["id"])
confere("a tela mostra 'Desfeita' e só as 3 parcelas da Rede Ant seguem antecipadas", tem("Desfeita") and linhas_antecipada() == 3, linhas_antecipada())
confere("a API: anticipation_costs fica só com a automática (" + str(custo_auto) + ")", custo_do_mes(loja["id"]) == custo_auto, custo_do_mes(loja["id"]))
ir("/emporio/resultado?loja=" + loja["id"])
confere("o Resultado mostra a linha só com " + em_reais(custo_auto), linha_do_resultado(em_reais(custo_auto)) and not linha_do_resultado(em_reais(total_custo)), texto_principal(3000))
