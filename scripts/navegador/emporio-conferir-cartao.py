# Validacao viva da conferencia do cartao do Meu Emporio (Modulo 39, frente B, Q349 a Q353):
# docs/superpowers/specs/2026-11-17-emporio-conferir-cartao-design.md
#
#   1. A receber, Cartoes a receber: as parcelas com os selos Prevista, A conferir, Atrasada e Conferida, com as
#      datas calculadas de HOJE em Brasilia e do proximo dia util (conferidas aqui contra uma conta independente)
#   2. Conferir o dia com diferenca para menos: o painel soma o previsto; sem aviso ate 10%; acima de 10% o aviso
#      pede confirmacao; depois as parcelas viram Conferida com o valor conferido e o ajuste, reparte em centavos
#   3. O saldo da conta (Posicao de caixa) muda pela diferenca, e no extrato a linha "Ajuste da conferencia do
#      cartao" vem logo depois da linha do cartao
#   4. O Resultado mostra "Ajustes da conferencia" no Custo do cartao
#   5. Conferir uma parcela so, sem diferenca
#   6. Desfazer: motivo vazio recusado embaixo do campo; com motivo a parcela volta a Atrasada e o ajuste some
#   7. ?ver=vencido mostra as atrasadas e nao traz mais a frase provisoria da frente A
#   8. O Hoje do Financeiro mostra "Cartao a conferir" e "Atrasadas", e os links levam ao A receber filtrado
#   9. Um Gestor de loja nao ve os botoes Conferir (e a rota recusa)
#  10. Celular (390 px): sem rolagem horizontal da pagina no A receber e nos paineis de conferir
#  11. No extrato da conta, Retirar na linha de cartao conferida: a linha volta a sem carimbo e a parcela a A
#      conferir; Carimbar de novo: volta a Conferida pelo carimbo (Q352)
#  12. Antecipacao pontual de uma parcela Prevista: nasce Conferida, conferido igual ao liquido antecipado, sem ajuste
#  13. Venda cancelada depois de conferida (numero 4043, que o eh_404 nao pode confundir com a pagina 404): no
#      extrato, "Estorno de cartao" pelo valor conferido, o ajuste continua, e o saldo volta ao de antes da venda
#
# Os valores estao descritos no cabecalho do cenario (os passos 1 a 10 na "Cc Loja 1", filtrada por ?loja=; os
# passos 11 a 13 na "Cc Loja 2", cada um numa conta propria).
# A ordem de execucao e: 1, 8 e 7 (estado inicial), 2, 3, 4, 5, 6, 9, 10, 11, 12 e 13 (estado final).
#
# cenario: scripts/_cenario-emporio-conferir-cartao.ts
# sessao: owner owner@example.com
# sessao: gestor cc-gestor@teste.local
import re
import datetime

LOJA1 = "Cc Loja 1"
CONTA = "Cc Banco"
FRASE_PROVISORIA = "Parcela de cartão cai sozinha na data"
SECAO = "Cartões a receber"

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


# A <tr> da secao de cartoes cuja celula de Liquido comeca por `valor` ("R$ 100,00"). O Liquido pode trazer
# "conferido R$ ..., ajuste ..." logo abaixo, entao a celula e comparada pelo comeco.
_ACHA_LINHA = "(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => { const h = x.querySelector('h2'); return h && h.innerText.trim() === " + repr(SECAO) + "; }); if (!s) return null; return Array.from(s.querySelectorAll('tbody tr')).find(t => Array.from(t.querySelectorAll('td')).some(td => { const v = td.innerText.replace(/\\u00a0/g, ' ').trim(); return v === VALOR || v.startsWith(VALOR + '\\n'); })) || null; })()"


def _linha_expr(valor):
    return _ACHA_LINHA.replace("VALOR", repr(valor))


def linha_cartao(valor):
    """O texto (numa linha so) da <tr> de cartao cujo Liquido e `valor`, ou ''."""
    return js("(() => { const t = " + _linha_expr(valor) + "; return t ? t.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""


def clicar_na_linha(valor, rotulo):
    """Clica no botao `rotulo` da linha de cartao do `valor`."""
    return bool(js("(() => { const t = " + _linha_expr(valor) + "; if (!t) return false; const b = Array.from(t.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def botoes_da_linha(valor):
    return js("(() => { const t = " + _linha_expr(valor) + "; return t ? Array.from(t.querySelectorAll('button')).map(b => b.innerText.trim()) : null; })()")


def estado_da_linha(valor):
    """O selo da linha, em minusculas (o CSS pode pôr em caixa alta)."""
    t = linha_cartao(valor).lower()
    for e in ["a conferir", "atrasada", "conferida", "prevista"]:
        if e in t:
            return e
    return ""


def botao_do_main(rotulo):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def botoes_do_main():
    return js("Array.from(document.querySelectorAll('main button')).map(b => b.innerText.trim())") or []


def clicar_link(rotulo):
    return bool(js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!a) return false; a.click(); return true; })()"))


def hrefs(rotulo):
    return js("Array.from(document.querySelectorAll('main a')).filter(x => x.innerText.trim() === " + repr(rotulo) + ").map(a => a.getAttribute('href'))") or []


def painel():
    """O texto do painel aberto ([role=dialog])."""
    return js("(() => { const d = document.querySelector('[role=dialog]'); return d ? d.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""


def campo_do_painel(rotulo):
    """O valor atual do campo `rotulo` do painel aberto."""
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.value : null; })()")


def aviso_do_painel():
    """O texto do aviso (role=alert) do painel, sem o aviso global do rodape do formulario."""
    return js("(() => { const d = document.querySelector('[role=dialog]'); const a = d && Array.from(d.querySelectorAll('[role=alert]')).map(x => x.innerText.replace(/\\u00a0/g, ' ').trim()).filter(Boolean); return a ? a.join(' || ') : ''; })()") or ""


def rotulo_do_envio():
    return js("(() => { const d = document.querySelector('[role=dialog]'); const b = d && d.querySelector('button[type=submit]'); return b ? b.innerText.trim() : ''; })()") or ""


def itens_do_dia(data_br):
    """O texto do item da lista 'Conferir o dia' (li fora de tabela) da data."""
    return js("(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => { const h = x.querySelector('h2'); return h && h.innerText.trim() === " + repr(SECAO) + "; }); if (!s) return ''; const li = Array.from(s.querySelectorAll(':scope > ul > li')).find(x => x.innerText.replace(/\\u00a0/g, ' ').startsWith(" + repr(data_br) + ")); return li ? li.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""


def conferir_o_dia_de(data_br):
    return bool(js("(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => { const h = x.querySelector('h2'); return h && h.innerText.trim() === " + repr(SECAO) + "; }); if (!s) return false; const li = Array.from(s.querySelectorAll(':scope > ul > li')).find(x => x.innerText.replace(/\\u00a0/g, ' ').startsWith(" + repr(data_br) + ")); const b = li && Array.from(li.querySelectorAll('button')).find(x => x.innerText.trim() === 'Conferir o dia'); if (!b) return false; b.click(); return true; })()"))


def abrir_painel(clicar_fn, segundos=60):
    """Clica ate o painel aparecer (antes da hidratacao o clique nao abre nada). Nao clica de novo com o painel
    aberto, porque o gatilho do FormSheet alterna."""
    fim_em = time.time() + segundos
    while time.time() < fim_em:
        if painel_aberto():
            time.sleep(1)
            return True
        clicar_fn()
        if esperar(painel_aberto, 6):
            time.sleep(1)
            return True
    return False


def seguir_link(rotulo, condicao, segundos=60):
    """Clica no link `rotulo` ate `condicao()` ficar verdadeira (o clique antes da hidratacao nao navega)."""
    fim_em = time.time() + segundos
    while time.time() < fim_em:
        clicar_link(rotulo)
        if esperar(condicao, 8):
            return True
    return False


def fechar_painel():
    js("(() => { const d = document.querySelector('[role=dialog]'); if (!d) return; const b = Array.from(d.querySelectorAll('button')).find(x => x.getAttribute('aria-label') === 'Close' || x.innerText.trim() === 'Fechar' || x.innerText.trim() === 'Cancelar'); if (b) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()")
    esperar(lambda: not painel_aberto(), 10)
    time.sleep(0.5)


def reais_de(texto):
    """O primeiro valor 'R$ 1.234,56' do texto, como float (negativo se vier '-' antes)."""
    m = re.search(r"(-)?\s*R\$\s*(-)?\s*([\d.]+),(\d\d)", texto or "")
    if not m:
        return None
    v = float(m.group(3).replace(".", "") + "." + m.group(4))
    return -v if (m.group(1) or m.group(2)) else v


def saldo_da_conta():
    """O saldo da Posicao de caixa da conta do cenario."""
    ir("/emporio/financeiro/caixa?loja=" + ID1)
    achar = lambda: js("(() => { const t = Array.from(document.querySelectorAll('main tr')).find(x => x.innerText.includes(" + repr(CONTA) + ") && x.innerText.includes('Ver extrato') || x.innerText.includes(" + repr(CONTA) + ") && x.innerText.includes('Aberto abaixo')); return t ? t.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""
    lin = esperar(achar, 30) or ""
    return reais_de(lin), lin


def linhas_do_extrato():
    return js("Array.from(document.querySelectorAll('main tbody tr')).map(t => t.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | '))") or []


def rolagem_horizontal():
    return js("[document.documentElement.scrollWidth, window.innerWidth]")


def br(dia_iso):
    return dia_iso[8:10] + "/" + dia_iso[5:7] + "/" + dia_iso[0:4]


def eh_util(d):
    # Feriados nacionais fixos (os moveis ficam de fora: nao caem na janela de uma rodada desta frente).
    fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]
    return d.weekday() < 5 and d.strftime("%m-%d") not in fixos


def estado_esperado(dia_iso, hoje_iso):
    """A regra da Q351 refeita aqui, sem olhar o codigo do app: prevista, a conferir ou atrasada."""
    d = datetime.date.fromisoformat(dia_iso)
    hoje = datetime.date.fromisoformat(hoje_iso)
    if d > hoje:
        return "prevista"
    limite = d + datetime.timedelta(days=1)
    while not eh_util(limite):
        limite += datetime.timedelta(days=1)
    return "atrasada" if hoje > limite else "a conferir"


# --- montagem ----------------------------------------------------------------------------------
entrar("owner")
ir("/emporio")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
l1 = next((l for l in lojas if l["name"] == LOJA1), None)
confere("acha a loja do cenario pela API", l1 is not None, len(lojas))
ID1 = l1["id"] if l1 else ""
RECEBER = "/emporio/financeiro/receber?loja=" + ID1
HOJE_FIN = "/emporio/financeiro?loja=" + ID1
hoje_iso = js("new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())")
r = api("GET", "/api/v1/emporio/finance/receivables?establishment_id=" + ID1)
cartoes_api = (((r["body"] or {}).get("data") or {}).get("cards")) or []
atrasadas = sorted({c["effective_on"] for c in cartoes_api if c.get("status") == "atrasada"}, reverse=True)
confere("a API lista as parcelas do cenario com selo (status)", len(cartoes_api) >= 7 and all("status" in c for c in cartoes_api), [(c["effective_on"], c.get("status")) for c in cartoes_api])
D1 = atrasadas[0] if len(atrasadas) >= 1 else ""
D2 = atrasadas[1] if len(atrasadas) >= 2 else ""
D3 = (datetime.date.fromisoformat(D1) - datetime.timedelta(days=3)).isoformat() if D1 else ""  # o dia da parcela ja conferida do cenario
ID_DA_90 = next((c["id"] for c in cartoes_api if c["effective_net"] == 90), "")
confere("dois dias atrasados distintos (D1 " + D1 + ", D2 " + D2 + ")", D1 != "" and D2 != "" and D1 > D2, atrasadas)
HOJE_BR = br(hoje_iso)
D1_BR = br(D1) if D1 else ""
D2_BR = br(D2) if D2 else ""

# --- 1 -----------------------------------------------------------------------------------------
passo("1. A receber, Cartoes a receber: os quatro selos e as datas")
chegou = ir(RECEBER)
confere("o A receber abre", chegou == "/emporio/financeiro/receber" and tem("Financeiro: a receber"), chegou)
SECAO_TXT = secao(SECAO) or ""
dia_prevista = (datetime.date.fromisoformat(hoje_iso) + datetime.timedelta(days=2)).isoformat()
esperadas = [("R$ 70,00", dia_prevista), ("R$ 80,00", hoje_iso), ("R$ 90,00", hoje_iso), ("R$ 100,00", D1), ("R$ 200,00", D1), ("R$ 60,00", D2), ("R$ 40,00", D2)]
for valor, dia in esperadas:
    est = estado_da_linha(valor)
    confere(valor + ": selo '" + est + "' = o esperado pela conta independente (" + estado_esperado(dia, hoje_iso) + ") e a data " + br(dia), est == estado_esperado(dia, hoje_iso) and br(dia) in linha_cartao(valor), linha_cartao(valor))
confere("os selos do cenario cobrem Prevista, A conferir e Atrasada", {estado_da_linha(v) for v, _ in esperadas} == {"prevista", "a conferir", "atrasada"}, [estado_da_linha(v) for v, _ in esperadas])
confere("a data de hoje (" + HOJE_BR + ") e a das parcelas que 'caem hoje' esta na linha de R$ 80,00", HOJE_BR in linha_cartao("R$ 80,00"), linha_cartao("R$ 80,00"))
# A conferida com data nos ultimos 7 dias fica na lista, com Desfazer; a mais antiga sai (achado 5 do juiz).
if D3 and D3 >= (datetime.date.fromisoformat(hoje_iso) - datetime.timedelta(days=7)).isoformat():
    confere("a parcela ja conferida (R$ 50,00, de " + br(D3) + ", ate 7 dias atras) fica na lista como Conferida, com Desfazer", "conferida" in linha_cartao("R$ 50,00").lower() and botoes_da_linha("R$ 50,00") == ["Desfazer"], [linha_cartao("R$ 50,00"), botoes_da_linha("R$ 50,00")])
else:
    confere("a parcela ja conferida (R$ 50,00, de " + br(D3) + ", mais de 7 dias atras) sai da lista", linha_cartao("R$ 50,00") == "", linha_cartao("R$ 50,00"))
# O rodape soma so a Prevista como a receber; o que ja caiu (A conferir e Atrasada) vem separado; a Conferida fica fora.
rodape = texto_do_main()
confere("o rodape dos cartoes: 'Total a receber: R$ 70,00' (so a Prevista) e 'Ja caiu, a conferir: R$ 625,00' (55 + 80 + 90 + 100 + 200 + 60 + 40)", "Total a receber: R$ 70,00. Já caiu, a conferir: R$ 625,00" in rodape, re.findall(r"Total a receber[^\n]*", rodape))
confere("a Atrasada e a A conferir trazem o botao Conferir", botoes_da_linha("R$ 100,00") == ["Conferir"] and botoes_da_linha("R$ 80,00") == ["Conferir"], [botoes_da_linha("R$ 100,00"), botoes_da_linha("R$ 80,00")])
confere("a Prevista nao tem botao de conferir", "Conferir" not in (botoes_da_linha("R$ 70,00") or []), botoes_da_linha("R$ 70,00"))
conferir_dia_d1 = itens_do_dia(D1_BR)
confere("'Conferir o dia' do D1: 2 parcelas, R$ 300,00 previsto, adquirente e conta", "Cc Adquirente" in conferir_dia_d1 and "2 parcelas" in conferir_dia_d1 and "R$ 300,00 previsto" in conferir_dia_d1 and CONTA in conferir_dia_d1, conferir_dia_d1)
conferir_dia_d2 = itens_do_dia(D2_BR)
confere("'Conferir o dia' do D2: 2 parcelas, R$ 100,00 previsto", "2 parcelas" in conferir_dia_d2 and "R$ 100,00 previsto" in conferir_dia_d2, conferir_dia_d2)
confere("as parcelas de hoje tem o proprio 'Conferir o dia' (2 parcelas, R$ 170,00)", "2 parcelas" in itens_do_dia(HOJE_BR) and "R$ 170,00 previsto" in itens_do_dia(HOJE_BR), itens_do_dia(HOJE_BR))

ir("/emporio/caixa")
caixa_cartao = secao("A receber do cartão") or ""
confere("o Caixa traz o mesmo selo na secao 'A receber do cartao' (coluna Estado, a parcela de R$ 70,00 Prevista)", "estado" in caixa_cartao.lower() and "Prevista" in caixa_cartao, caixa_cartao[:300])

# --- 8 (estado inicial) --------------------------------------------------------------------------
passo("8. O Hoje do Financeiro: Cartao a conferir e Atrasadas")
chegou = ir(HOJE_FIN)
principal = texto_do_main()
confere("o Hoje mostra 'A conferir: 3 parcelas' com R$ 225,00", bool(re.search(r"A conferir: 3 parcelas\s*R\$ 225,00", principal)), principal[:600])
confere("o Hoje mostra 'Atrasadas: 4 parcelas' com R$ 400,00", bool(re.search(r"Atrasadas: 4 parcelas\s*R\$ 400,00", principal)), principal[:600])
confere("o link 'Conferir as parcelas' leva ao A receber com ?ver=hoje e a loja", any("receber" in h and "ver=hoje" in h and ID1 in h for h in hrefs("Conferir as parcelas (hoje e anteriores)")), hrefs("Conferir as parcelas (hoje e anteriores)"))
confere("o link 'Ver as atrasadas' leva ao A receber com ?ver=vencido e a loja", any("receber" in h and "ver=vencido" in h and ID1 in h for h in hrefs("Ver as atrasadas")), hrefs("Ver as atrasadas"))
confere("clica em 'Conferir as parcelas' e chega ao A receber filtrado (?ver=hoje)", seguir_link("Conferir as parcelas (hoje e anteriores)", lambda: "ver=hoje" in caminho() and secao(SECAO) is not None), caminho())
time.sleep(1.5)
confere("?ver=hoje: a parcela A conferir de R$ 80,00 esta na lista e a Atrasada de R$ 100,00 nao", linha_cartao("R$ 80,00") != "" and linha_cartao("R$ 100,00") == "", [linha_cartao("R$ 80,00"), linha_cartao("R$ 100,00")])
confere("o A receber diz que traz as anteriores", "também as parcelas de dias anteriores que ainda esperam conferência" in texto_do_main(), texto_do_main()[:300])
ir(HOJE_FIN)
confere("clica em 'Ver as atrasadas' e chega ao A receber filtrado (?ver=vencido)", seguir_link("Ver as atrasadas", lambda: "ver=vencido" in caminho() and secao(SECAO) is not None), caminho())
time.sleep(1.5)
confere("?ver=vencido (pelo link do Hoje): a Atrasada de R$ 100,00 esta na lista e a A conferir de R$ 80,00 nao", linha_cartao("R$ 100,00") != "" and linha_cartao("R$ 80,00") == "", [linha_cartao("R$ 100,00"), linha_cartao("R$ 80,00")])

# --- 7 (estado inicial) --------------------------------------------------------------------------
passo("7. ?ver=vencido mostra as atrasadas e a frase provisoria saiu")
ir(RECEBER + "&ver=vencido")
txt = secao(SECAO) or ""
confere("a secao de cartoes traz as 4 atrasadas (R$ 100, 200, 60 e 40)", all(linha_cartao(v) != "" for v in ["R$ 100,00", "R$ 200,00", "R$ 60,00", "R$ 40,00"]), txt[:300])
confere("a secao NAO traz a Prevista (R$ 70), a A conferir (R$ 80) nem a Conferida (R$ 50)", all(linha_cartao(v) == "" for v in ["R$ 70,00", "R$ 80,00", "R$ 50,00"]), txt[:300])
confere("a frase provisoria da frente A nao aparece mais, nem na secao nem na pagina", FRASE_PROVISORIA not in texto_do_main() and "próxima etapa" not in txt, txt[:200])
fx = js("(() => { const a = Array.from(document.querySelectorAll('main section[aria-label=Resumo] a')).find(x => x.innerText.split('\\n')[0].trim() === 'Vencido'); return a ? a.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""
confere("a faixa do A receber: o Vencido soma as 4 atrasadas (R$ 400,00)", "R$ 400,00" in fx, fx)

# --- 2 -----------------------------------------------------------------------------------------
passo("2. Conferir o dia com diferenca para menos")
saldo0, lin_saldo0 = saldo_da_conta()
confere("a Posicao de caixa mostra a conta do cenario com saldo", saldo0 is not None, lin_saldo0)
links_ver = js("(() => { const t = Array.from(document.querySelectorAll('main tr')).find(x => x.innerText.includes(" + repr(CONTA) + ")); return t ? Array.from(t.querySelectorAll('a')).map(a => a.getAttribute('href')) : []; })()") or []
EXTRATO = next((h for h in links_ver if "lugar=conta" in h), "")
confere("a conta tem link para o extrato", EXTRATO != "", links_ver)

ir(RECEBER)
confere("abre o painel 'Conferir o dia' do D1", abrir_painel(lambda: conferir_o_dia_de(D1_BR)))
p = painel()
confere("o painel soma o previsto: '2 parcelas, previsto R$ 300,00'", "2 parcelas, previsto R$ 300,00" in p, p[:400])
confere("o painel lista a venda de R$ 100,00 e a de R$ 200,00", "R$ 100,00" in p and "R$ 200,00" in p, p[:400])
confere("o total que caiu vem preenchido com o previsto (300,00)", campo_do_painel("Total que caiu (R$)") == "300,00", campo_do_painel("Total que caiu (R$)"))
preencher("Total que caiu (R$)", "280,00")
time.sleep(0.5)
enviar_painel()
confere("diferenca de 6,7% (menos de 10%) confere direto, sem aviso: o painel fecha", bool(esperar(lambda: not painel_aberto(), 60)), aviso_do_painel())
time.sleep(2.5)
# A conferida dos ultimos 7 dias fica no A receber, com o valor conferido, o ajuste e o Desfazer (achado 5 do juiz).
l100 = linha_cartao("R$ 100,00")
l200 = linha_cartao("R$ 200,00")
confere("R$ 100,00 fica na lista como Conferida, com Desfazer (conferido 93,34, ajuste - 6,66)", "conferida" in l100.lower() and "conferido R$ 93,34" in l100 and "ajuste - R$ 6,66" in l100 and "Desfazer" in l100, l100)
confere("R$ 200,00 fica na lista como Conferida, com Desfazer (conferido 186,66, ajuste - 13,34)", "conferida" in l200.lower() and "conferido R$ 186,66" in l200 and "ajuste - R$ 13,34" in l200 and "Desfazer" in l200, l200)
confere("o item 'Conferir o dia' do D1 saiu da lista", itens_do_dia(D1_BR) == "", itens_do_dia(D1_BR))

confere("abre o painel 'Conferir o dia' do D2 (previsto R$ 100,00)", abrir_painel(lambda: conferir_o_dia_de(D2_BR)))
confere("o painel do D2 soma 'R$ 100,00'", "2 parcelas, previsto R$ 100,00" in painel(), painel()[:300])
preencher("Total que caiu (R$)", "50,00")
time.sleep(0.5)
enviar_painel()
confere("diferenca de 50% pede confirmacao: o painel segue aberto", bool(esperar(lambda: "Confirma?" in aviso_do_painel(), 30)) and painel_aberto(), aviso_do_painel())
confere("o aviso diz 'Caiu R$ 50,00 a menos do que o previsto. Confirma?'", "Caiu R$ 50,00 a menos do que o previsto. Confirma?" in aviso_do_painel(), aviso_do_painel())
confere("o botao passa a 'Confirmar e conferir'", rotulo_do_envio() == "Confirmar e conferir", rotulo_do_envio())
l60 = linha_cartao("R$ 60,00")
confere("enquanto nao confirma, nada foi conferido (R$ 60,00 segue Atrasada)", "atrasada" in l60.lower(), l60)
enviar_painel()
confere("confirmado: o painel fecha", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(2.5)
l60 = linha_cartao("R$ 60,00")
l40 = linha_cartao("R$ 40,00")
confere("R$ 60,00 fica na lista como Conferida, com Desfazer (conferido 30,00, ajuste - 30,00, proporcional ao liquido)", "conferida" in l60.lower() and "conferido R$ 30,00" in l60 and "ajuste - R$ 30,00" in l60 and "Desfazer" in l60, l60)
confere("R$ 40,00 fica na lista como Conferida, com Desfazer (conferido 20,00, ajuste - 20,00)", "conferida" in l40.lower() and "conferido R$ 20,00" in l40 and "ajuste - R$ 20,00" in l40 and "Desfazer" in l40, l40)
confere("nenhum 'Conferir o dia' do D1 nem do D2 sobrou", itens_do_dia(D1_BR) == "" and itens_do_dia(D2_BR) == "")

# --- 3 -----------------------------------------------------------------------------------------
passo("3. O saldo da conta e o extrato")
saldo1, lin_saldo1 = saldo_da_conta()
confere("o saldo da conta caiu R$ 70,00 (20,00 do D1 + 50,00 do D2): " + str(saldo0) + " -> " + str(saldo1), saldo0 is not None and saldo1 is not None and abs((saldo0 - saldo1) - 70.00) < 0.005, [lin_saldo0, lin_saldo1])
ir(EXTRATO)
linhas = linhas_do_extrato()
idx_aj = [i for i, t in enumerate(linhas) if "Ajuste da conferência do cartão" in t]
confere("o extrato tem 4 linhas 'Ajuste da conferência do cartão' (uma por parcela com ajuste)", len(idx_aj) == 4, [t[:90] for t in linhas])
ordem_ok = True
for i in idx_aj:
    anterior = linhas[i - 1] if i > 0 else ""
    venda_aj = re.search(r"venda nº (\d+)", linhas[i], re.I)
    venda_ant = re.search(r"venda nº (\d+)", anterior, re.I)
    # o ajuste vem na linha logo abaixo da linha do cartao da MESMA venda
    if not (venda_aj and venda_ant) or venda_aj.group(1) != venda_ant.group(1) or "Cartão, parcela" not in anterior:
        ordem_ok = False
confere("cada ajuste vem na linha logo abaixo da linha do cartao da mesma venda", ordem_ok and len(idx_aj) > 0, [t[:120] for t in linhas])
def valor_com_sinal(texto):
    """O ultimo '+ R$ x' ou '- R$ x' da linha do extrato, com sinal."""
    achados = re.findall(r"([+-]) R\$ ([\d.]+,\d\d)", texto)
    if not achados:
        return None
    s, v = achados[-1]
    return (-1 if s == "-" else 1) * float(v.replace(".", "").replace(",", "."))


valores_aj = sorted(valor_com_sinal(linhas[i]) or 0 for i in idx_aj)
confere("os ajustes do extrato sao saidas (sinal -) de 6,66, 13,34, 20,00 e 30,00", valores_aj == [-30.0, -20.0, -13.34, -6.66], valores_aj)
confere("o extrato mostra, nas linhas do cartao, o conferido de cada parcela (93,34, 186,66, 30,00 e 20,00)", all(any(("conferido R$ " + v) in t for t in linhas) for v in ["93,34", "186,66", "30,00", "20,00"]), [t[:140] for t in linhas if "Cartão" in t])
principal = texto_do_main()
m = re.search(r"Saldo de fechamento:\s*R\$\s*([\d.]+,\d\d)", principal)
fechamento = float(m.group(1).replace(".", "").replace(",", ".")) if m else None
confere("o saldo de fechamento do extrato bate com a Posicao de caixa (" + str(saldo1) + ")", fechamento is not None and saldo1 is not None and abs(fechamento - saldo1) < 0.005, fechamento)

# --- 4 -----------------------------------------------------------------------------------------
passo("4. O Resultado: Ajustes da conferencia no Custo do cartao")
mes_atual = hoje_iso[:7]
no_mes = sum(v for d, v in [(D1, 20.00), (D2, 50.00)] if d[:7] == mes_atual)
ir("/emporio/resultado?loja=" + ID1 + "&mes=" + mes_atual)
custo = secao("Custo do cartão") or ""
if no_mes > 0:
    confere("o Custo do cartao mostra 'Ajustes da conferência' de R$ " + ("%.2f" % no_mes).replace(".", ","), "Ajustes da conferência" in custo and ("R$ " + ("%.2f" % no_mes).replace(".", ",")) in custo.replace("\n", " "), custo)
else:
    confere("(as datas caem no mes anterior) o Custo do cartao nao mostra ajuste neste mes", "Ajustes da conferência" not in custo, custo)
confere("o Custo do cartao segue com a taxa e a antecipacao (as linhas de antes)", "Taxa do cartão" in custo and "Antecipação" in custo, custo)

# --- 5 -----------------------------------------------------------------------------------------
passo("5. Conferir uma parcela so, sem diferenca")
ir(RECEBER)
confere("clica em Conferir na linha de R$ 80,00", abrir_painel(lambda: clicar_na_linha("R$ 80,00", "Conferir")))
p = painel()
confere("o painel da parcela diz o previsto 'Previsto: R$ 80,00' e a conta", "Previsto: R$ 80,00" in p and CONTA in p, p[:400])
confere("o valor que caiu vem com o previsto (80,00) e sem aviso", campo_do_painel("Valor que caiu (R$)") == "80,00" and aviso_do_painel() == "", [campo_do_painel("Valor que caiu (R$)"), aviso_do_painel()])
enviar_painel()
confere("sem diferenca: o painel fecha", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(2.5)
l80 = linha_cartao("R$ 80,00")
confere("R$ 80,00 virou Conferida, 'conferido R$ 80,00', sem ajuste", "conferida" in l80.lower() and "conferido R$ 80,00" in l80 and "ajuste" not in l80, l80)
saldo2, lin2 = saldo_da_conta()
confere("o saldo da conta nao mudou com a conferencia sem diferenca (" + str(saldo1) + " -> " + str(saldo2) + ")", saldo1 is not None and saldo2 is not None and abs(saldo1 - saldo2) < 0.005, lin2)

passo("5b. Conferir uma parcela com diferenca para mais (entrada)")
ir(RECEBER)
confere("clica em Conferir na linha de R$ 90,00", abrir_painel(lambda: clicar_na_linha("R$ 90,00", "Conferir")))
preencher("Valor que caiu (R$)", "91,00")
time.sleep(0.5)
enviar_painel()
confere("1,1% a mais confere direto (sem aviso): o painel fecha", bool(esperar(lambda: not painel_aberto(), 60)), aviso_do_painel())
time.sleep(2.5)
l90 = linha_cartao("R$ 90,00")
confere("R$ 90,00 virou Conferida, conferido R$ 91,00, ajuste + R$ 1,00 (hoje: a linha segue na lista)", "conferida" in l90.lower() and "conferido R$ 91,00" in l90 and "ajuste + R$ 1,00" in l90, l90)
confere("a linha conferida de hoje troca o Conferir pelo Desfazer", botoes_da_linha("R$ 90,00") == ["Desfazer"], botoes_da_linha("R$ 90,00"))
saldo2b, lin2b = saldo_da_conta()
confere("o saldo da conta subiu R$ 1,00 (a diferenca para mais entra): " + str(saldo2) + " -> " + str(saldo2b), saldo2 is not None and saldo2b is not None and abs((saldo2b - saldo2) - 1.00) < 0.005, lin2b)
ir("/emporio/resultado?loja=" + ID1 + "&mes=" + mes_atual)
custo = secao("Custo do cartão") or ""
esperado_total = round(no_mes - 1.00, 2)
if esperado_total > 0:
    confere("o Custo do cartao: 'Ajustes da conferência' caiu para R$ " + ("%.2f" % esperado_total).replace(".", ",") + " (a entrada de 1,00 abate a saida)", "Ajustes da conferência" in custo and ("R$ " + ("%.2f" % esperado_total).replace(".", ",")) in custo.replace("\n", " "), custo)
else:
    confere("o Custo do cartao: a entrada de 1,00 abate (as saidas caem no mes anterior)", "Ajustes da conferência" in custo, custo)

# --- 6 -----------------------------------------------------------------------------------------
passo("6. Desfazer a conferencia")
ir(RECEBER)
confere("clica em Desfazer na linha de R$ 90,00 (conferido 91,00)", abrir_painel(lambda: clicar_na_linha("R$ 90,00", "Desfazer")))
p = painel()
confere("o painel diz a parcela, o conferido e que o ajuste e apagado", "conferida em R$ 91,00" in p and "O ajuste da diferença é apagado" in p, p[:500])
enviar_painel()
time.sleep(1.5)
confere("motivo vazio: a recusa aparece embaixo do campo Motivo", "motivo" in erro_do_campo("Motivo").lower(), erro_do_campo("Motivo"))
confere("e o painel segue aberto, sem desfazer nada", painel_aberto() and "conferida" in linha_cartao("R$ 90,00").lower(), linha_cartao("R$ 90,00"))
preencher("Motivo", "Conferido na maquininha errada")
time.sleep(0.5)
enviar_painel()
confere("com motivo: o painel fecha", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(2.5)
l90 = linha_cartao("R$ 90,00")
confere("R$ 90,00 voltou a 'A conferir', sem 'conferido' nem ajuste", "a conferir" in l90.lower() and "conferido" not in l90 and "ajuste" not in l90, l90)
confere("e voltou a ter o botao Conferir", botoes_da_linha("R$ 90,00") == ["Conferir"], botoes_da_linha("R$ 90,00"))
confere("a irma de hoje (R$ 80,00) segue Conferida", "conferida" in linha_cartao("R$ 80,00").lower(), linha_cartao("R$ 80,00"))
saldo3, lin3 = saldo_da_conta()
confere("o saldo da conta voltou R$ 1,00 (o ajuste da parcela sumiu): " + str(saldo2b) + " -> " + str(saldo3), saldo2b is not None and saldo3 is not None and abs((saldo2b - saldo3) - 1.00) < 0.005, lin3)
ir(EXTRATO)
linhas = linhas_do_extrato()
confere("o extrato voltou a 4 linhas de ajuste (a entrada de 1,00 sumiu)", len([t for t in linhas if "Ajuste da conferência do cartão" in t]) == 4 and not any("1,00" in t and "Ajuste" in t for t in linhas), [t[:100] for t in linhas])
ir("/emporio/financeiro?loja=" + ID1)
principal = texto_do_main()
confere("o Hoje: 'A conferir: 2 parcelas' com R$ 145,00 e nenhuma linha de 'Atrasadas' (todas conferidas)", bool(re.search(r"A conferir: 2 parcelas\s*R\$ 145,00", principal)) and "Atrasadas:" not in principal, principal[:500])
ir("/emporio/resultado?loja=" + ID1 + "&mes=" + mes_atual)
custo = secao("Custo do cartão") or ""
confere("o Resultado voltou aos ajustes de antes (R$ " + ("%.2f" % no_mes).replace(".", ",") + ")", ("R$ " + ("%.2f" % no_mes).replace(".", ",")) in custo.replace("\n", " ") if no_mes > 0 else "Ajustes da conferência" not in custo, custo)

# --- 9 -----------------------------------------------------------------------------------------
passo("9. Gestor de loja: nao ve os botoes de conferir")
r_conf = api("POST", "/api/v1/emporio/finance/card-receivables/" + ID_DA_90 + "/confirm", {"received_amount": 90})
confere("o dono confere pela rota (sanidade do id): 200 na parcela de R$ 90,00 voltada a 'A conferir'", r_conf["status"] == 200, [r_conf["status"], r_conf["body"]])
r_un = api("POST", "/api/v1/emporio/finance/card-receivables/" + ID_DA_90 + "/unconfirm", {"reason": "Voltar ao cenario"})
confere("e desfaz pela rota (volta ao estado do roteiro): 200", r_un["status"] == 200, [r_un["status"], r_un["body"]])
entrar("gestor")
chegou = ir(RECEBER)
if chegou == "/emporio/financeiro/receber" and not eh_404():
    confere("o Gestor abre o A receber e ve os selos (A conferir)", "a conferir" in linha_cartao("R$ 90,00").lower(), linha_cartao("R$ 90,00"))
    bts = botoes_do_main()
    confere("o Gestor nao ve nenhum botao Conferir, Conferir o dia nem Desfazer no A receber", not any(b in ("Conferir", "Conferir o dia", "Desfazer") for b in bts), bts)
else:
    confere("o Gestor nao abre o A receber (404): so Dono, Gerente geral e Financeiro abrem, entao nao ha botao a ver", eh_404(), texto_principal(120))
chegou = ir("/emporio/caixa")
confere("o Gestor abre o Caixa da loja", chegou == "/emporio/caixa" and not eh_404(), chegou)
# O "Conferir" da gaveta (contagem de dinheiro) existe no Caixa e nao e o do cartao: a conferencia do cartao so se
# procura dentro da secao 'A receber do cartao'.
cartao_gestor = secao("A receber do cartão") or ""
bts_cartao = js("(() => { const s = Array.from(document.querySelectorAll('main section')).find(x => { const h = x.querySelector('h2'); return h && h.innerText.trim() === 'A receber do cartão'; }); return s ? Array.from(s.querySelectorAll('button')).map(b => b.innerText.trim()) : null; })()")
confere("o Gestor ve a secao 'A receber do cartao' com os selos, so leitura", "estado" in cartao_gestor.lower() and "Prevista" in cartao_gestor, cartao_gestor[:200])
confere("e ela nao traz botao Conferir, Conferir o dia nem Desfazer", bts_cartao is not None and not any(b in ("Conferir", "Conferir o dia", "Desfazer") for b in bts_cartao), bts_cartao)
r_g = api("POST", "/api/v1/emporio/finance/card-receivables/" + ID_DA_90 + "/confirm", {"received_amount": 90})
confere("a rota de conferir recusa o Gestor: 403", r_g["status"] == 403, [r_g["status"], r_g["body"]])
r_g2 = api("POST", "/api/v1/emporio/finance/card-receivables/confirm-day", {"bank_account_id": "x", "acquirer_id": "y", "effective_on": D1, "received_total": 1})
confere("a rota de conferir o dia recusa o Gestor: 403", r_g2["status"] == 403, [r_g2["status"], r_g2["body"]])
entrar("owner")
ir(RECEBER)
confere("depois da recusa, a parcela de R$ 90,00 segue 'A conferir' (nada foi conferido pelo Gestor)", "a conferir" in linha_cartao("R$ 90,00").lower(), linha_cartao("R$ 90,00"))

# --- 10 ----------------------------------------------------------------------------------------
passo("10. Celular (390 px): sem rolagem horizontal da pagina")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=True)
for rotulo, destino in [("A receber", RECEBER), ("A receber, vencido", RECEBER + "&ver=vencido"), ("Hoje do Financeiro", HOJE_FIN), ("extrato", EXTRATO)]:
    ir(destino)
    time.sleep(2)
    larg = rolagem_horizontal()
    confere(rotulo + " a 390 px: a pagina nao rola na horizontal", larg is not None and larg[0] <= larg[1] and larg[1] == 390, larg)
ir(RECEBER)
confere("390 px: abre o painel Conferir de uma parcela", abrir_painel(lambda: clicar_na_linha("R$ 90,00", "Conferir")))
caixa = js("(() => { const d = document.querySelector('[role=dialog]'); const b = d.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)]; })()")
larg = rolagem_horizontal()
confere("390 px: o painel Conferir cabe na tela e a pagina nao rola", caixa is not None and caixa[0] >= 0 and caixa[1] <= 390 and larg[0] <= larg[1], [caixa, larg])
confere("390 px: o painel mostra o campo e o botao Conferir", campo_do_painel("Valor que caiu (R$)") is not None and rotulo_do_envio() == "Conferir", painel()[:200])
fechar_painel()
confere("390 px: abre o painel 'Conferir o dia'", abrir_painel(lambda: conferir_o_dia_de(HOJE_BR)))
caixa = js("(() => { const d = document.querySelector('[role=dialog]'); const b = d.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)]; })()")
larg = rolagem_horizontal()
confere("390 px: o painel 'Conferir o dia' cabe na tela e a pagina nao rola", caixa is not None and caixa[0] >= 0 and caixa[1] <= 390 and larg[0] <= larg[1], [caixa, larg])
fechar_painel()
cdp("Emulation.clearDeviceMetricsOverride")


# --- 11 a 13: a Loja 2, cada passo numa conta propria ---------------------------------------------
def posicao_da_conta(nome):
    """O saldo e o endereco do extrato da conta `nome`, na Posicao de caixa de todas as lojas."""
    ir("/emporio/financeiro/caixa")
    achar = "(() => { const t = Array.from(document.querySelectorAll('main tr')).find(x => x.innerText.includes(" + repr(nome) + ") && (x.innerText.includes('Ver extrato') || x.innerText.includes('Aberto abaixo'))); return t || null; })()"
    lin = esperar(lambda: js("(() => { const t = " + achar + "; return t ? t.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()"), 30) or ""
    href = js("(() => { const t = " + achar + "; const a = t && Array.from(t.querySelectorAll('a')).find(x => (x.getAttribute('href') || '').includes('lugar=conta')); return a ? a.getAttribute('href') : ''; })()") or ""
    return reais_de(lin), href, lin


def _linha_do_extrato_expr(trechos):
    return "(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(t => { const v = t.innerText.replace(/\\u00a0/g, ' '); return " + repr(trechos) + ".every(x => v.includes(x)); }); return tr || null; })()"


def linha_do_extrato(*trechos):
    """O texto (numa linha so) da primeira linha do extrato que traz todos os `trechos`, ou ''."""
    return js("(() => { const t = " + _linha_do_extrato_expr(list(trechos)) + "; return t ? t.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""


def clicar_no_extrato(rotulo, *trechos):
    return bool(js("(() => { const t = " + _linha_do_extrato_expr(list(trechos)) + "; if (!t) return false; const b = Array.from(t.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
l2 = next((l for l in lojas if l["name"] == "Cc Loja 2"), None)
confere("acha a Loja 2 do cenario pela API", l2 is not None, len(lojas))
ID2 = l2["id"] if l2 else ""
RECEBER2 = "/emporio/financeiro/receber?loja=" + ID2


def cartao_da_api(liquido):
    r = api("GET", "/api/v1/emporio/finance/receivables?establishment_id=" + ID2)
    cartoes = ((((r["body"] or {}).get("data") or {}).get("cards")) or [])
    return next((c for c in cartoes if c["effective_net"] == liquido), None)


# --- 11 ----------------------------------------------------------------------------------------
passo("11. Extrato da conta: Retirar e Carimbar a linha de cartao conferida (Q352)")
_, EXTRATO_RESERVA, lin_res = posicao_da_conta("Cc Reserva")
confere("a conta 'Cc Reserva' tem link para o extrato", EXTRATO_RESERVA != "", lin_res)
ir(EXTRATO_RESERVA)
esperar(lambda: linha_do_extrato("Cartão, parcela", "130,00") != "", 30)
l130 = linha_do_extrato("Cartão, parcela", "130,00")
confere("a linha de cartao de R$ 130,00 vem carimbada (conferida), com o botao Retirar", "Carimbado em" in l130 and "Retirar" in l130, l130)
ir(RECEBER2)
confere("no A receber a parcela de R$ 130,00 esta Conferida", estado_da_linha("R$ 130,00") == "conferida", linha_cartao("R$ 130,00"))
ir(EXTRATO_RESERVA)
esperar(lambda: linha_do_extrato("Cartão, parcela", "130,00") != "", 30)
confere("clica em Retirar na linha de R$ 130,00", bool(esperar(lambda: clicar_no_extrato("Retirar", "Cartão, parcela", "130,00"), 30)))
sem_carimbo = esperar(lambda: "Carimbado em" not in linha_do_extrato("Cartão, parcela", "130,00") and "Carimbar" in linha_do_extrato("Cartão, parcela", "130,00"), 40)
confere("a linha volta a sem carimbo (botao Carimbar, sem 'Carimbado em')", bool(sem_carimbo), linha_do_extrato("Cartão, parcela", "130,00"))
ir(RECEBER2)
confere("e a parcela voltou a 'A conferir', com o botao Conferir", estado_da_linha("R$ 130,00") == "a conferir" and botoes_da_linha("R$ 130,00") == ["Conferir"], [linha_cartao("R$ 130,00"), botoes_da_linha("R$ 130,00")])
ir(EXTRATO_RESERVA)
esperar(lambda: linha_do_extrato("Cartão, parcela", "130,00") != "", 30)
confere("clica em Carimbar de novo", bool(esperar(lambda: clicar_no_extrato("Carimbar", "Cartão, parcela", "130,00"), 30)))
carimbada = esperar(lambda: "Carimbado em" in linha_do_extrato("Cartão, parcela", "130,00") and "Retirar" in linha_do_extrato("Cartão, parcela", "130,00"), 40)
confere("a linha volta a carimbada (Carimbado em, botao Retirar)", bool(carimbada), linha_do_extrato("Cartão, parcela", "130,00"))
ir(RECEBER2)
l130 = linha_cartao("R$ 130,00")
confere("e a parcela volta a Conferida pelo carimbo: 'conferido R$ 130,00', sem ajuste", "conferida" in l130.lower() and "conferido R$ 130,00" in l130 and "ajuste" not in l130.lower(), l130)

# --- 12 ----------------------------------------------------------------------------------------
passo("12. Antecipacao pontual de uma parcela Prevista: nasce Conferida, sem ajuste")
prevista = cartao_da_api(120)
confere("a parcela de R$ 120,00 da Loja 2 e Prevista (daqui a 3 dias)", prevista is not None and prevista.get("status") == "prevista", prevista and prevista.get("status"))
r_ant = api("POST", "/api/v1/emporio/card-anticipations", {"receivable_ids": [prevista["id"]] if prevista else [], "operated_on": hoje_iso, "received_net": 114})
confere("antecipa pela rota: 201 (a adquirente pagou R$ 114,00 pelos R$ 120,00)", r_ant["status"] == 201, [r_ant["status"], r_ant["body"]])
ir(RECEBER2)
l114 = linha_cartao("R$ 114,00")
confere("a parcela aparece Conferida, com o conferido igual ao liquido antecipado (R$ 114,00) e sem ajuste", "conferida" in l114.lower() and "conferido R$ 114,00" in l114 and "ajuste" not in l114.lower(), l114)
apos = cartao_da_api(114)
confere("a API da a parcela como conferida, confirmed_net 114", apos is not None and apos.get("status") == "conferida" and apos.get("confirmed_net") == 114, apos and [apos.get("status"), apos.get("confirmed_net")])
_, EXTRATO_RESERVA, _ = posicao_da_conta("Cc Reserva")
ir(EXTRATO_RESERVA)
esperar(lambda: linha_do_extrato("Cartão, parcela", "114,00") != "", 30)
lin114 = linha_do_extrato("Cartão, parcela", "114,00")
confere("o extrato mostra a linha de cartao de R$ 114,00 com 'conferido R$ 114,00'", "conferido R$ 114,00" in lin114, lin114)
confere("e a conta nao tem nenhuma linha de 'Ajuste da conferência do cartão' (antecipar e carimbar nao ajustam)", not any("Ajuste da conferência do cartão" in t for t in linhas_do_extrato()), [t[:100] for t in linhas_do_extrato()])

# --- 13 ----------------------------------------------------------------------------------------
passo("13. Venda cancelada depois de conferida: Estorno de cartao pelo conferido, ajuste fica, saldo volta")
c200 = cartao_da_api(200)
confere("acha a parcela de R$ 200,00 (venda 4043) na API", c200 is not None and c200.get("sale_number") == 4043, c200 and c200.get("sale_number"))
SALE_ID = c200["sale_id"] if c200 else ""
chegou = ir("/emporio/vendas/" + SALE_ID)
pagina_da_venda = texto_do_main()
confere("a venda de numero 004043 abre e NAO e tomada por pagina 404 (o numero contem '404')", "004043" in pagina_da_venda and not eh_404(), [chegou, pagina_da_venda[:120]])
saldo_a, EXTRATO_ESTORNO, lin_a = posicao_da_conta("Cc Estorno")
confere("a conta 'Cc Estorno' tem saldo e extrato (saldo inicial 1000 mais a parcela de 200: " + str(saldo_a) + ")", saldo_a is not None and EXTRATO_ESTORNO != "", lin_a)
r_c = api("POST", "/api/v1/emporio/finance/card-receivables/" + (c200["id"] if c200 else "x") + "/confirm", {"received_amount": 190})
confere("confere a parcela por R$ 190,00 (ajuste - R$ 10,00): 200", r_c["status"] == 200, [r_c["status"], r_c["body"]])
saldo_b, _, lin_b = posicao_da_conta("Cc Estorno")
confere("o saldo caiu R$ 10,00 com o ajuste: " + str(saldo_a) + " -> " + str(saldo_b), saldo_a is not None and saldo_b is not None and abs((saldo_a - saldo_b) - 10.00) < 0.005, lin_b)
r_x = api("POST", "/api/v1/emporio/sales/" + SALE_ID + "/cancel", {"reason": "Cliente desistiu"})
confere("cancela a venda 4043: 200", r_x["status"] == 200, [r_x["status"], r_x["body"]])
saldo_c, EXTRATO_ESTORNO, lin_c = posicao_da_conta("Cc Estorno")
confere("o saldo da conta voltou ao de antes da venda (R$ 1.000,00): " + str(saldo_b) + " -> " + str(saldo_c), saldo_c is not None and abs(saldo_c - 1000.00) < 0.005, lin_c)
ir(EXTRATO_ESTORNO)
# A linha do estorno e o movimento `estorno_cartao`: o extrato a descreve como "Estorno de cartão: <motivo do
# cancelamento>" (Q368), para a linha se ler como estorno e nao so como o motivo solto.
esperar(lambda: linha_do_extrato("Estorno de cartão: Cliente desistiu") != "", 30)
lin_est = linha_do_extrato("Estorno de cartão: Cliente desistiu")
confere("o extrato traz a linha do estorno (descricao 'Estorno de cartão: Cliente desistiu') pelo valor conferido (- R$ 190,00), da venda 004043", "- R$ 190,00" in lin_est and "004043" in lin_est, lin_est)
lin_aj = linha_do_extrato("Ajuste da conferência do cartão")
confere("a linha do ajuste continua (- R$ 10,00)", "- R$ 10,00" in lin_aj, lin_aj)
lin_cart = linha_do_extrato("Cartão, parcela", "conferido R$ 190,00")
confere("a linha do cartao continua, com 'conferido R$ 190,00'", lin_cart != "", [t[:100] for t in linhas_do_extrato()])
