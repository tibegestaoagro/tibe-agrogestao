# Validacao viva do cheque em duas etapas do Meu Emporio (Modulo 39, frente C, Q354 a Q356):
# docs/superpowers/specs/2026-11-18-emporio-cheque-duas-etapas-design.md
#
#   1. Balcao: venda com dois cheques so com valor e nome (o bloco "Tenho os dados do cheque" recolhido, o segundo
#      cheque em nome de outra pessoa); a venda fecha
#   2. A venda mostra "Cheque a completar" e nenhuma data 01/01/1970
#   3. A receber (Financeiro): selo "A completar", "-" no que falta, sem Depositar no incompleto, com Completar;
#      o servidor recusa depositar o incompleto (409 CHEQUE_INCOMPLETO); ?ver=hoje, vencido e a_vencer nao trazem o
#      cheque sem data, e o Ver tudo traz
#   4. Hoje do Financeiro: "Cheques a completar" com a quantidade e o total certos, e o link leva ao A receber da loja
#   5. Caixa como Gestor da loja: selo e Completar; completar so o numero e o cheque seguir "A completar"; apagar o
#      numero recusa embaixo do campo, com o foco nele, sem fechar o painel
#   6. Financeiro completa o resto (banco e bom para de hoje): o selo some, aparece Depositar e Corrigir, o cheque
#      entra na faixa Vence hoje, e o Hoje baixa a conta
#   7. Vendedor: sem Completar (e a rota recusa)
#   8. Editar a venda com um cheque incompleto: o bloco do completo vem aberto com os dados, salvar mantem os dados,
#      o incompleto segue incompleto
#   9. Celular (390 px): sem rolagem horizontal no A receber, no Caixa e no Hoje; o painel de completar cabe
#
# Os valores estao descritos no cabecalho do cenario (todos na "Ch Loja 1", filtrada por ?loja=).
#
# cenario: scripts/_cenario-emporio-cheque-duas-etapas.ts
# sessao: owner owner@example.com
# sessao: financeiro ch-financeiro@teste.local
# sessao: gestor ch-gestor@teste.local
# sessao: vendedor ch-vendedor@teste.local
import re
import datetime
import json

LOJA = "Ch Loja 1"
MARIA = "Ch Maria"
TERCEIRO = "Ch Terceiro Tres"
RECEBER_BASE = "/emporio/financeiro/receber"

_api_da_lib = api
_confere_da_lib = confere


def confere(nome, condicao, detalhe=""):
    """O `confere` da lib com o detalhe aparado (o texto de uma pagina inteira enche o log)."""
    _confere_da_lib(nome, condicao, (str(detalhe)[:300].replace("\n", " | ")) if detalhe != "" else "")


def api(metodo, caminho_, corpo=None):
    """A `api` da lib, repetida quando o next dev recarrega a pagina no meio do fetch ('Inspected target navigated or closed')."""
    for tentativa in range(6):
        try:
            return _api_da_lib(metodo, caminho_, corpo)
        except RuntimeError as e:
            if "navigated or closed" not in str(e) or tentativa == 5:
                raise
            time.sleep(6)


def cheque_e_fecha_a_janela():
    """Onda 3 da UX (5.7): o cliente ja vem como Consumidor final, e '+ Cheque' com ele abre a janela de clientes
    sozinha, com o motivo. O cheque entra na lista do mesmo jeito: fecha-se a janela sem escolher (Escape) e o
    roteiro segue como antes, escolhendo o cliente depois."""
    ok = clicar("+ Cheque")
    aberta = esperar(lambda: js("!!document.querySelector('[data-escolha=cliente]')"), 10)
    if aberta:
        cdp("Input.dispatchKeyEvent", type="rawKeyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27, nativeVirtualKeyCode=27)
        cdp("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27, nativeVirtualKeyCode=27)
        esperar(lambda: not js("!!document.querySelector('[data-escolha=cliente]')"), 8)
    return ok and bool(aberta)


def caminho():
    return js("location.pathname + location.search") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def tem(texto):
    return texto.lower() in texto_do_main().lower()


def br(dia_iso):
    return dia_iso[8:10] + "/" + dia_iso[5:7] + "/" + dia_iso[0:4]


def soma_dias(dia_iso, n):
    return (datetime.date.fromisoformat(dia_iso) + datetime.timedelta(days=n)).isoformat()


# --- a tabela de cheques (A receber e Caixa): a que tem a coluna "Bom para"; o valor esta na 4a celula ----------------------
_LINHA = "(() => { const ts = Array.from(document.querySelectorAll('main table')).filter(t => t.innerText.toLowerCase().includes('bom para')); for (const t of ts) { const r = Array.from(t.querySelectorAll('tbody tr')).find(tr => { const td = tr.querySelectorAll('td'); return td.length >= 5 && td[3].innerText.replace(/\\u00a0/g, ' ').trim() === VALOR; }); if (r) return r; } return null; })()"


def _linha_expr(valor):
    return _LINHA.replace("VALOR", repr(valor))


def linha_cheque(valor):
    """O texto (numa linha so) da <tr> do cheque de `valor` ('R$ 150,00'), ou ''."""
    return js("(() => { const t = " + _linha_expr(valor) + "; return t ? t.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""


def celulas_cheque(valor):
    """As celulas da <tr> do cheque, como texto (None sem a linha)."""
    return js("(() => { const t = " + _linha_expr(valor) + "; return t ? Array.from(t.querySelectorAll('td')).map(td => td.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ').trim()) : null; })()")


def botoes_cheque(valor):
    return js("(() => { const t = " + _linha_expr(valor) + "; return t ? Array.from(t.querySelectorAll('button')).map(b => b.innerText.trim()) : null; })()")


def clicar_no_cheque(valor, rotulo):
    return bool(js("(() => { const t = " + _linha_expr(valor) + "; if (!t) return false; const b = Array.from(t.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def valores_dos_cheques():
    """O valor de cada cheque da tabela, na ordem em que aparecem."""
    return js("(() => { const ts = Array.from(document.querySelectorAll('main table')).filter(t => t.innerText.toLowerCase().includes('bom para')); return ts.length ? Array.from(ts[0].querySelectorAll('tbody tr')).map(tr => { const td = tr.querySelectorAll('td'); return td.length >= 5 ? td[3].innerText.replace(/\\u00a0/g, ' ').trim() : ''; }) : []; })()") or []


def a_completar(valor):
    return "a completar" in linha_cheque(valor).lower()


# --- painel --------------------------------------------------------------------------------------------------------------------
def painel():
    return js("(() => { const d = document.querySelector('[role=dialog]'); return d ? d.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""


def campo_do_painel(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? el.value : null; })()")


def focar_campo(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); if (!el) return false; el.focus(); return true; })()")


def campo_em_foco():
    """O texto do <label> do campo que tem o foco agora ('' se o foco nao esta num campo rotulado)."""
    return js("(() => { const a = document.activeElement; if (!a || !a.id) return ''; const l = document.querySelector('label[for=\"' + a.id + '\"]'); return l ? l.innerText.replace('*','').trim() : ''; })()") or ""


def abrir_painel(clicar_fn, segundos=60):
    """Clica ate o painel aparecer (antes da hidratacao o clique nao abre nada). Nao clica de novo com o painel aberto."""
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


def fechar_painel():
    js("(() => { const d = document.querySelector('[role=dialog]'); if (!d) return; const b = Array.from(d.querySelectorAll('button')).find(x => x.getAttribute('aria-label') === 'Close' || x.innerText.trim() === 'Fechar' || x.innerText.trim() === 'Cancelar'); if (b) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()")
    esperar(lambda: not painel_aberto(), 10)
    time.sleep(0.5)


def rolagem_horizontal():
    return js("[document.documentElement.scrollWidth, window.innerWidth]")


# --- balcao ----------------------------------------------------------------------------------------------------------------------
def por_aria(aria, valor, indice=0):
    return js("(() => { const els = Array.from(document.querySelectorAll('input')).filter(x => x.getAttribute('aria-label') === " + repr(aria) + "); const el = els[" + str(indice) + "]; if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def por_id(prefixo, valor, indice=0):
    return js("(() => { const els = Array.from(document.querySelectorAll(" + repr('[id^="' + prefixo + '"]') + ")); const el = els[" + str(indice) + "]; if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")


def ler_ids(prefixo):
    return js("Array.from(document.querySelectorAll(" + repr('[id^="' + prefixo + '"]') + ")).map(el => el.value)") or []


def buscar_e_adicionar(nome):
    js("(() => { const el = document.querySelector('input[aria-label=\"Buscar produto\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(nome) + "); el.dispatchEvent(new Event('input', { bubbles: true })); })()")
    time.sleep(0.8)
    ok = js("(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()")
    time.sleep(0.8)
    return bool(ok)


def botoes_do_main_com(texto):
    return js("Array.from(document.querySelectorAll('main button')).filter(b => b.innerText.trim() === " + repr(texto) + ").length") or 0


def enviar_botao(rotulo):
    js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (b) b.click(); })()")


def resumo():
    return (js("(() => { const s = document.querySelector('[role=status]'); return s ? s.innerText.replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ') : ''; })()") or "")


def vendas_de(cliente):
    return api("GET", "/api/v1/emporio/sales")["body"]["data"]


def cheques_da_venda(venda):
    return sorted([p for p in venda.get("payments", []) if p.get("kind") == "cheque"], key=lambda p: p["amount"])


def venda_com_cheques(cliente, valores):
    """A venda (mais recente) do cliente cujos cheques somam exatamente `valores`, ou None."""
    for v in vendas_de(cliente):
        if v.get("customer_name") != cliente or v.get("status") == "cancelada":
            continue
        if sorted(float(p["amount"]) for p in cheques_da_venda(v)) == sorted(valores):
            return v
    return None


def cheques_do_receber(loja_id):
    r = api("GET", "/api/v1/emporio/finance/receivables?establishment_id=" + loja_id)
    return (((r["body"] or {}).get("data") or {}).get("checks")) or []


# --- montagem ----------------------------------------------------------------------------------------------------------------
entrar("owner")
ir("/emporio")
lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
l1 = next((l for l in lojas if l["name"] == LOJA), None)
confere("acha a loja do cenario pela API", l1 is not None, len(lojas))
LOJA_ID = l1["id"] if l1 else ""
RECEBER = RECEBER_BASE + "?aba=cheques&loja=" + LOJA_ID
HOJE_FIN = "/emporio/financeiro?loja=" + LOJA_ID
hoje_iso = js("new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())")
inicial = cheques_do_receber(LOJA_ID)
confere("o cenario deixou 4 cheques em carteira, 3 incompletos (R$ 150, 30 e 70) e 1 completo (R$ 50)", len(inicial) == 4 and sorted(float(c["amount"]) for c in inicial if c.get("incomplete")) == [30.0, 70.0, 150.0], [(c["amount"], c.get("incomplete")) for c in inicial])
ID_A = next((c["id"] for c in inicial if float(c["amount"]) == 150.0), "")
ID_P = next((c["id"] for c in inicial if float(c["amount"]) == 70.0), "")
contas = api("GET", "/api/v1/emporio/bank-accounts")["body"]["data"]
CONTA_ID = next((c["id"] for c in contas if c["name"] == "Ch Banco"), "")
confere("acha a conta Ch Banco", CONTA_ID != "", [c["name"] for c in contas][:8])

# --- 1 ---------------------------------------------------------------------------------------------------------------------------
passo("1. Balcao: venda com dois cheques so com valor e nome")
ir("/emporio/vender")
confere("o balcao abre", caminho() == "/emporio/vender" and tem("Fechar a venda"), caminho())
confere("escolhe a Ch Loja 1", escolher("Loja", LOJA) is True)
confere("adiciona Ch Ração", esperar(lambda: buscar_e_adicionar("Ch Ração"), 30))
confere("a quantidade e 10 (R$ 100,00)", por_aria("Quantidade do item 1", "10") is True)
time.sleep(0.5)
confere("adiciona o 1o cheque (com o Consumidor final, a janela de clientes abre e se fecha)", cheque_e_fecha_a_janela())
time.sleep(0.8)
confere("adiciona o 2o cheque (idem)", cheque_e_fecha_a_janela())
time.sleep(0.8)
confere("valor do 1o cheque: 60", por_aria("Valor em Cheque (R$)", "60", 0) is True)
confere("valor do 2o cheque: 40", por_aria("Valor em Cheque (R$)", "40", 1) is True)
confere("escolhe a Ch Maria", escolher_cliente(MARIA) is True)
tit = ler_ids("cheque-titular-")
confere("os dois 'Em nome de' vem com o nome do cliente", tit == [MARIA, MARIA], tit)
confere("o 2o cheque e de terceiros: troca o nome para " + TERCEIRO, por_id("cheque-titular-", TERCEIRO, 1) is True and ler_ids("cheque-titular-") == [MARIA, TERCEIRO], ler_ids("cheque-titular-"))
confere("o bloco 'Tenho os dados do cheque' aparece recolhido nos dois cheques", botoes_do_main_com("Tenho os dados do cheque") == 2, botoes_do_main_com("Tenho os dados do cheque"))
confere("com o bloco recolhido nao ha campo de numero, banco nem bom para", ler_ids("cheque-numero-") == [] and ler_ids("cheque-banco-") == [] and ler_ids("cheque-bom-para-") == [], [ler_ids("cheque-numero-"), ler_ids("cheque-banco-"), ler_ids("cheque-bom-para-")])
confere("a dica de terceiros aparece no formulario", "cheque de terceiros" in texto_do_main().lower(), "")
confere("abrir o bloco do 1o cheque mostra numero, banco e bom para vazios", clicar("Tenho os dados do cheque") and bool(esperar(lambda: ler_ids("cheque-numero-") == [""] and ler_ids("cheque-banco-") == [""] and ler_ids("cheque-bom-para-") == [""], 10)), [ler_ids("cheque-numero-"), ler_ids("cheque-banco-"), ler_ids("cheque-bom-para-")])
enviar_botao("Fechar a venda")
confere("a venda no cheque so com valor e nome e registrada", bool(esperar(lambda: "Venda registrada" in texto_do_main() and "Cheque" in resumo(), 90)), [texto_do_main()[:200], resumo()[:200]])
VENDA_N = venda_com_cheques(MARIA, [60.0, 40.0])
confere("a API tem a venda com os dois cheques (R$ 60 e R$ 40)", VENDA_N is not None, "")
VENDA_N_ID = VENDA_N["id"] if VENDA_N else ""
if VENDA_N_ID:
    det = api("GET", "/api/v1/emporio/sales/" + VENDA_N_ID)["body"]["data"]
    chs = cheques_da_venda(det)
    confere("os dois cheques vieram sem numero, banco e data, marcados incompletos", len(chs) == 2 and all(p["check"]["number"] is None and p["check"]["bank"] is None and p["check"]["good_for"] is None and p["check"]["incomplete"] is True for p in chs), [p.get("check") for p in chs])
    confere("os titulares gravados: " + MARIA + " (R$ 40,00 ou 60,00) e " + TERCEIRO, sorted(p["check"]["holder_name"] for p in chs) == sorted([MARIA, TERCEIRO]), [p["check"]["holder_name"] for p in chs])

# --- 2 ---------------------------------------------------------------------------------------------------------------------------
passo("2. A venda mostra 'Cheque a completar', sem data 01/01/1970")
ir("/emporio/vendas/" + VENDA_N_ID)
pagina = texto_da_pagina()
confere("a venda abre", not eh_404() and "/emporio/vendas/" + VENDA_N_ID == caminho(), caminho())
confere("mostra 'Cheque a completar' nos dois cheques", pagina.count("Cheque a completar") == 2, pagina.count("Cheque a completar"))
confere("nenhuma data 01/01/1970 (nem 1970) na venda", "01/01/1970" not in pagina and "1970" not in pagina, pagina[:600])
confere("mostra o titular de terceiros 'Em nome de " + TERCEIRO + "'", ("Em nome de " + TERCEIRO) in pagina, pagina[:700])
confere("nao mostra 'bom para' (nao ha data)", "bom para" not in pagina.lower(), pagina[:700])

# --- 3 ---------------------------------------------------------------------------------------------------------------------------
passo("3. A receber (Financeiro): selo, tracos, sem Depositar, com Completar")
entrar("financeiro")
chegou = ir(RECEBER)
confere("o A receber abre para o Financeiro", chegou == RECEBER_BASE and not eh_404() and tem("Cheques em carteira"), chegou)
confere("a lista de cheques tem os 6 (R$ 150, 50, 30, 70, 60 e 40)", sorted(valores_dos_cheques()) == sorted(["R$ 150,00", "R$ 50,00", "R$ 30,00", "R$ 70,00", "R$ 60,00", "R$ 40,00"]), valores_dos_cheques())
for valor in ["R$ 150,00", "R$ 30,00", "R$ 70,00", "R$ 60,00", "R$ 40,00"]:
    confere(valor + ": selo 'A completar'", a_completar(valor), linha_cheque(valor))
confere("R$ 50,00 (completo): sem selo 'A completar'", not a_completar("R$ 50,00") and "000222" in linha_cheque("R$ 50,00"), linha_cheque("R$ 50,00"))
ca = celulas_cheque("R$ 150,00") or []
confere("R$ 150,00 sem numero, banco e data: 'nº -', '-,' e '-' no bom para", len(ca) >= 5 and ca[0].startswith("nº -") and "| -, " in ca[0] and ca[2] == "-", ca)
cp = celulas_cheque("R$ 70,00") or []
confere("R$ 70,00 com numero e banco, sem data: 'nº 000333', 'Caixa' e '-' no bom para", len(cp) >= 5 and cp[0].startswith("nº 000333") and "Caixa," in cp[0] and cp[2] == "-", cp)
confere("o incompleto traz o titular e a venda (Em nome de Ch Joao)", "Em nome de Ch Joao" in linha_cheque("R$ 150,00"), linha_cheque("R$ 150,00"))
for valor in ["R$ 150,00", "R$ 30,00", "R$ 70,00", "R$ 60,00", "R$ 40,00"]:
    b = botoes_cheque(valor) or []
    confere(valor + ": tem Completar e NAO tem Depositar", "Completar" in b and "Depositar" not in b, b)
b50 = botoes_cheque("R$ 50,00") or []
confere("R$ 50,00 (completo): tem Corrigir e Depositar, sem Completar", "Corrigir" in b50 and "Depositar" in b50 and "Completar" not in b50, b50)
vs = valores_dos_cheques()
ultimo_incompleto = max(i for i, v in enumerate(vs) if a_completar(v)) if any(a_completar(v) for v in vs) else -1
primeiro_completo = min((i for i, v in enumerate(vs) if not a_completar(v)), default=99)
confere("os incompletos vem no topo da lista (antes do completo)", ultimo_incompleto < primeiro_completo, vs)

r = api("POST", "/api/v1/emporio/checks/" + ID_A + "/deposit", {"bank_account_id": CONTA_ID})
confere("o servidor recusa depositar o incompleto: 409 CHEQUE_INCOMPLETO", r["status"] == 409 and "CHEQUE_INCOMPLETO" in json.dumps(r["body"]), [r["status"], r["body"]])
ir(RECEBER)
confere("depois da recusa o cheque de R$ 150,00 segue na carteira, 'A completar'", a_completar("R$ 150,00"), linha_cheque("R$ 150,00"))

passo("3b. Filtros por data: o cheque sem data nao aparece em hoje, vencido e a vencer; em Ver tudo aparece")
for ver, esperado in [("hoje", []), ("vencido", []), ("a_vencer", ["R$ 50,00"])]:
    ir(RECEBER + "&ver=" + ver)
    vs = valores_dos_cheques()
    confere("?ver=" + ver + ": " + ("nenhum cheque" if not esperado else "so o R$ 50,00 (bom para daqui a 10 dias)"), vs == esperado, vs)
    sem_data = [v for v in ["R$ 150,00", "R$ 30,00", "R$ 70,00", "R$ 60,00", "R$ 40,00"] if linha_cheque(v) != ""]
    confere("?ver=" + ver + ": nenhum dos 5 incompletos aparece", sem_data == [], sem_data)
ir(RECEBER)
confere("Ver tudo (sem ?ver): os 6 aparecem", len(valores_dos_cheques()) == 6, valores_dos_cheques())
txt = texto_do_main()
confere("nenhuma data 01/01/1970 no A receber", "01/01/1970" not in txt and "1970" not in txt, "")

# --- 4 ---------------------------------------------------------------------------------------------------------------------------
passo("4. Hoje do Financeiro: Cheques a completar")
chegou = ir(HOJE_FIN)
principal = texto_do_main()
confere("o Hoje abre", chegou == "/emporio/financeiro" and "Cheques a completar" in principal, principal[:300])
confere("o Hoje mostra 'A completar: 5 cheques' com R$ 350,00 (150 + 30 + 70 + 60 + 40)", bool(re.search(r"A completar: 5 cheques\s*R\$ 350,00", principal)), principal[:700])
hrefs_cheques = js("Array.from(document.querySelectorAll('main a')).filter(a => a.innerText.includes('Ver os cheques')).map(a => a.getAttribute('href'))") or []
confere("o link 'Ver os cheques' leva ao A receber da loja", any(RECEBER_BASE in h and LOJA_ID in h for h in hrefs_cheques), hrefs_cheques)
fim_em = time.time() + 60
while time.time() < fim_em and RECEBER_BASE not in caminho():
    js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.includes('Ver os cheques')); if (a) a.click(); })()")
    esperar(lambda: RECEBER_BASE in caminho(), 8)
confere("clicando no link chega ao A receber da loja", RECEBER_BASE in caminho() and LOJA_ID in caminho(), caminho())
time.sleep(1.5)
confere("e a lista tem os cheques a completar", a_completar("R$ 150,00"), valores_dos_cheques())
confere("o link leva ao filtro", "cheques=a_completar" in caminho() and LOJA_ID in caminho(), caminho())
vs = valores_dos_cheques()
confere("so os incompletos: 5 linhas, todas com o selo, e o cheque completo (R$ 50,00) fora", len(vs) == 5 and "R$ 50,00" not in vs and all(a_completar(v) for v in vs), vs)
tx = texto_do_main()
# Onda 4: "Boletos", "Cartões" e "Fiado" agora são também o rótulo das abas; o que não pode aparecer são as seções delas.
titulos = js("Array.from(document.querySelectorAll('main h2')).map(h => h.innerText.trim())") or []
confere("fiado e cartao fora", "Fiado por cliente" not in tx and "Buscar cliente" not in tx and "Cartões a receber" not in titulos and "Boletos" not in titulos, [titulos, tx[:200]])
confere("a frase do filtro", tem("Mostrando só os cheques a completar"), tx[:300])
ir(RECEBER + "&ver=hoje&cheques=a_completar")
vs = valores_dos_cheques()
confere("com ?ver=hoje na URL o filtro dos cheques vence (os 5 incompletos) e a loja continua", len(vs) == 5 and "R$ 50,00" not in vs and tem("Mostrando só os cheques a completar"), vs)
ir(RECEBER + "&cheques=a_completar")
hrefs_tudo = js("Array.from(document.querySelectorAll('main a')).filter(a => a.innerText.includes('Ver tudo o que receber')).map(a => a.getAttribute('href'))") or []
confere("'Ver tudo o que receber' mantem a loja e a aba Cheques, e tira o filtro", len(hrefs_tudo) == 1 and LOJA_ID in hrefs_tudo[0] and "aba=cheques" in hrefs_tudo[0] and "cheques=" not in hrefs_tudo[0].replace("aba=cheques", ""), hrefs_tudo)
fim_em = time.time() + 60
while time.time() < fim_em and "cheques=" in caminho():
    js("(() => { const a = Array.from(document.querySelectorAll('main a')).find(x => x.innerText.includes('Ver tudo o que receber')); if (a) a.click(); })()")
    esperar(lambda: "cheques=" not in caminho(), 8)
confere("clicar em 'Ver tudo o que receber' volta o cheque completo", bool(esperar(lambda: "R$ 50,00" in valores_dos_cheques(), 20)) and LOJA_ID in caminho(), [caminho(), valores_dos_cheques()])

# --- 5 ---------------------------------------------------------------------------------------------------------------------------
passo("5. Caixa como Gestor da loja: selo, Completar, so o numero, apagar recusa")
entrar("gestor")
chegou = ir("/emporio/caixa")
confere("o Gestor abre o Caixa", chegou == "/emporio/caixa" and not eh_404(), chegou)
confere("o Caixa mostra R$ 150,00 com o selo 'A completar'", a_completar("R$ 150,00"), linha_cheque("R$ 150,00"))
bg = botoes_cheque("R$ 150,00") or []
confere("o Gestor ve Completar e nao ve Depositar no incompleto", "Completar" in bg and "Depositar" not in bg, bg)
cg = celulas_cheque("R$ 150,00") or []
confere("no Caixa o incompleto traz '-' no que falta (nº -, bom para -)", len(cg) >= 5 and cg[0].startswith("nº -") and cg[2] == "-", cg)
vs = valores_dos_cheques()
inc = [i for i, v in enumerate(vs) if a_completar(v)]
comp = [i for i, v in enumerate(vs) if not a_completar(v)]
confere("no Caixa os incompletos vem antes do completo (R$ 50,00)", len(inc) >= 5 and len(comp) >= 1 and max(inc) < min(comp), vs)
confere("abre o painel Completar do R$ 150,00", abrir_painel(lambda: clicar_no_cheque("R$ 150,00", "Completar")))
p = painel()
confere("o painel tem os quatro campos e o titular vem preenchido", "Número do cheque" in p and "Banco" in p and "Bom para" in p and campo_do_painel("Em nome de") == "Ch Joao" and campo_do_painel("Número do cheque") == "", [p[:200], campo_do_painel("Em nome de")])
confere("preenche so o numero: 000555", preencher("Número do cheque", "000555") not in ("SEM ROTULO", "SEM CAMPO"))
time.sleep(0.5)
enviar_painel()
confere("o painel fecha", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(2.5)
l = linha_cheque("R$ 150,00")
confere("com so o numero, o cheque mostra 'nº 000555' e segue 'A completar'", "000555" in l and a_completar("R$ 150,00"), l)
confere("e continua sem Depositar, com Completar", "Completar" in (botoes_cheque("R$ 150,00") or []) and "Depositar" not in (botoes_cheque("R$ 150,00") or []), botoes_cheque("R$ 150,00"))
confere("abre o painel de novo (agora com o numero)", abrir_painel(lambda: clicar_no_cheque("R$ 150,00", "Completar")))
confere("o numero vem preenchido: 000555", campo_do_painel("Número do cheque") == "000555", campo_do_painel("Número do cheque"))
confere("apaga o numero", preencher("Número do cheque", "") not in ("SEM ROTULO", "SEM CAMPO"))
focar_campo("Banco")
time.sleep(0.4)
confere("(antes de enviar) o foco esta no Banco, nao no numero", campo_em_foco() == "Banco", campo_em_foco())
enviar_painel()
time.sleep(2)
recusa = esperar(lambda: erro_do_campo("Número do cheque"), 30) or ""
confere("a recusa aparece embaixo do campo Numero do cheque", recusa != "" and recusa != "invalido sem texto", recusa)
confere("o painel segue aberto", painel_aberto(), "")
confere("o foco foi para o campo recusado (Numero do cheque)", bool(esperar(lambda: campo_em_foco() == "Número do cheque", 10)), campo_em_foco())
fechar_painel()
time.sleep(1.5)
confere("o numero 000555 segue gravado", "000555" in linha_cheque("R$ 150,00"), linha_cheque("R$ 150,00"))

# --- 6 ---------------------------------------------------------------------------------------------------------------------------
passo("6. Financeiro completa o resto: banco e bom para de hoje")
entrar("financeiro")
ir(RECEBER)
r_vence_hoje = js("(() => { const a = Array.from(document.querySelectorAll('main section[aria-label=Resumo] a')).find(x => x.innerText.split('\\n')[0].trim() === 'Vence hoje'); return a ? a.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""
confere("antes: a faixa Vence hoje nao tem os R$ 150,00", "R$ 150,00" not in r_vence_hoje, r_vence_hoje)
confere("abre o painel Completar do R$ 150,00 (numero ja preenchido)", abrir_painel(lambda: clicar_no_cheque("R$ 150,00", "Completar")))
confere("o numero vem com 000555", campo_do_painel("Número do cheque") == "000555", campo_do_painel("Número do cheque"))
confere("preenche o banco: Sicoob", preencher("Banco", "Sicoob") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o bom para de hoje", preencher("Bom para (data)", hoje_iso) not in ("SEM ROTULO", "SEM CAMPO"))
time.sleep(0.5)
enviar_painel()
confere("o painel fecha", bool(esperar(lambda: not painel_aberto(), 60)))
time.sleep(2.5)
l = linha_cheque("R$ 150,00")
confere("o selo 'A completar' sumiu", not a_completar("R$ 150,00"), l)
confere("a linha mostra nº 000555, Sicoob e a data de hoje (" + br(hoje_iso) + ")", "000555" in l and "Sicoob" in l and br(hoje_iso) in l, l)
b = botoes_cheque("R$ 150,00") or []
confere("agora tem Depositar e Corrigir, sem Completar", "Depositar" in b and "Corrigir" in b and "Completar" not in b, b)
ir(RECEBER)
r_vence_hoje = js("(() => { const a = Array.from(document.querySelectorAll('main section[aria-label=Resumo] a')).find(x => x.innerText.split('\\n')[0].trim() === 'Vence hoje'); return a ? a.innerText.replace(/\\u00a0/g, ' ').split('\\n').join(' | ') : ''; })()") or ""
confere("a faixa Vence hoje soma os R$ 150,00", "R$ 150,00" in r_vence_hoje, r_vence_hoje)
ir(RECEBER + "&ver=hoje")
confere("?ver=hoje agora traz o cheque de R$ 150,00 e so ele", valores_dos_cheques() == ["R$ 150,00"], valores_dos_cheques())
ir(HOJE_FIN)
principal = texto_do_main()
confere("o Hoje baixou para 'A completar: 4 cheques' com R$ 200,00 (30 + 70 + 60 + 40)", bool(re.search(r"A completar: 4 cheques\s*R\$ 200,00", principal)), principal[:700])
confere("o Hoje mostra o cheque completo no 'Vence hoje a receber'", "R$ 150,00" in principal, principal[:900])

# --- 7 ---------------------------------------------------------------------------------------------------------------------------
passo("7. Vendedor: sem Completar")
entrar("vendedor")
chegou = ir("/emporio/caixa")
btn_vend = js("Array.from(document.querySelectorAll('main button')).map(b => b.innerText.trim())") or []
print("   o Vendedor em /emporio/caixa: caminho=" + chegou + ", 404=" + str(eh_404()) + ", botoes=" + str(btn_vend[:12]))
confere("o Vendedor nao ve nenhum botao Completar nem Corrigir no Caixa", "Completar" not in btn_vend and "Corrigir" not in btn_vend, btn_vend)
confere("e nao ve o cheque como carteira para completar (sem linha de R$ 70,00 com botoes)", not botoes_cheque("R$ 70,00"), botoes_cheque("R$ 70,00"))
r = api("PATCH", "/api/v1/emporio/checks/" + ID_P, {"number": "999999"})
confere("a rota recusa o Vendedor: 403", r["status"] == 403, [r["status"], r["body"]])

# --- 8 ---------------------------------------------------------------------------------------------------------------------------
passo("8. Editar a venda com um cheque incompleto")
entrar("owner")
VENDA_E = venda_com_cheques(MARIA, [50.0, 30.0])
confere("acha a venda do cenario com os cheques de R$ 50 e R$ 30", VENDA_E is not None, "")
VENDA_E_ID = VENDA_E["id"] if VENDA_E else ""
ir("/emporio/vender?editar=" + VENDA_E_ID)
confere("o balcao abre editando a venda", bool(esperar(lambda: tem("Editando a venda nº"), 60)), texto_principal(300))
time.sleep(2)
confere("a venda tem 2 cheques no formulario", bool(esperar(lambda: len(ler_ids("cheque-titular-")) == 2, 20)), ler_ids("cheque-titular-"))
confere("os titulares: " + MARIA + " e Ch Terceiro Dois", sorted(ler_ids("cheque-titular-")) == sorted([MARIA, "Ch Terceiro Dois"]), ler_ids("cheque-titular-"))
confere("o bloco do cheque completo vem aberto, com os dados (000222, Sicoob, bom para daqui a 10 dias)", ler_ids("cheque-numero-") == ["000222"] and ler_ids("cheque-banco-") == ["Sicoob"] and ler_ids("cheque-bom-para-") == [soma_dias(hoje_iso, 10)], [ler_ids("cheque-numero-"), ler_ids("cheque-banco-"), ler_ids("cheque-bom-para-")])
confere("o do incompleto segue recolhido ('Tenho os dados do cheque' aparece uma vez)", botoes_do_main_com("Tenho os dados do cheque") == 1, botoes_do_main_com("Tenho os dados do cheque"))
enviar_botao("Salvar a venda nova")
ok_ = esperar(lambda: caminho().startswith("/emporio/vendas/") and "Substitui a venda nº" in texto_do_main(), 90)
confere("salvar a venda nova funciona (sem recusa) e abre a venda que substitui a antiga", bool(ok_), [caminho(), texto_do_main()[:300]])
nova = caminho().split("/emporio/vendas/")[1] if caminho().startswith("/emporio/vendas/") else ""
if nova:
    det = api("GET", "/api/v1/emporio/sales/" + nova)["body"]["data"]
    chs = cheques_da_venda(det)
    por_valor = {float(p["amount"]): p["check"] for p in chs}
    c50 = por_valor.get(50.0) or {}
    c30 = por_valor.get(30.0) or {}
    confere("a venda nova guardou o cheque completo: 000222, Sicoob, bom para daqui a 10 dias, completo", c50.get("number") == "000222" and c50.get("bank") == "Sicoob" and (c50.get("good_for") or "")[:10] == soma_dias(hoje_iso, 10) and c50.get("incomplete") is False, c50)
    confere("o incompleto segue incompleto (sem numero, banco e data), no nome de Ch Terceiro Dois", c30.get("number") is None and c30.get("bank") is None and c30.get("good_for") is None and c30.get("incomplete") is True and c30.get("holder_name") == "Ch Terceiro Dois", c30)
    pagina = texto_da_pagina()
    confere("a venda nova mostra 'Cheque a completar' uma vez e o cheque completo com Sicoob", pagina.count("Cheque a completar") == 1 and "Sicoob" in pagina and "1970" not in pagina, pagina[:700])
    # A venda antiga ficou substituida: o cheque sem dados saiu da carteira (nao e mais "a completar") e seguia
    # mostrando "Cheque nº null, null" (achado do juiz, 18/11). Agora sai "-" no que falta.
    ir("/emporio/vendas/" + VENDA_E_ID)
    antiga = texto_da_pagina()
    confere("a venda antiga abre", not eh_404() and "/emporio/vendas/" + VENDA_E_ID == caminho(), caminho())
    confere("a venda antiga nao mostra 'null' e mostra o cheque sem dados com '-' (Cheque nº -, -)", "null" not in antiga and "Cheque nº -, -" in antiga, antiga[:900])
entrar("financeiro")
ir(RECEBER)
confere("no A receber o R$ 50,00 segue completo (000222) e o R$ 30,00 segue 'A completar', uma linha de cada", valores_dos_cheques().count("R$ 50,00") == 1 and valores_dos_cheques().count("R$ 30,00") == 1 and "000222" in linha_cheque("R$ 50,00") and not a_completar("R$ 50,00") and a_completar("R$ 30,00"), valores_dos_cheques())

# --- 9 ---------------------------------------------------------------------------------------------------------------------------
passo("9. Celular (390 px): sem rolagem horizontal")
cdp("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=True)
entrar("financeiro")
for rotulo, destino in [("A receber", RECEBER), ("Hoje do Financeiro", HOJE_FIN)]:
    ir(destino)
    time.sleep(2)
    larg = rolagem_horizontal()
    confere(rotulo + " a 390 px: a pagina nao rola na horizontal", larg is not None and larg[0] <= larg[1] and larg[1] == 390, larg)
entrar("gestor")
ir("/emporio/caixa")
time.sleep(2)
larg = rolagem_horizontal()
confere("Caixa a 390 px: a pagina nao rola na horizontal", larg is not None and larg[0] <= larg[1] and larg[1] == 390, larg)
confere("390 px: abre o painel Completar do R$ 70,00 no Caixa", abrir_painel(lambda: clicar_no_cheque("R$ 70,00", "Completar")))
caixa = js("(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null; const b = d.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width), Math.round(b.top), Math.round(b.bottom), window.innerHeight]; })()")
larg = rolagem_horizontal()
confere("390 px: o painel cabe na largura da tela e a pagina nao rola", caixa is not None and caixa[0] >= 0 and caixa[1] <= 390 and larg[0] <= larg[1], [caixa, larg])
confere("390 px: o painel mostra os quatro campos e o botao Salvar", all(campo_do_painel(r) is not None for r in ["Número do cheque", "Banco", "Bom para (data)", "Em nome de"]) and js("(() => { const d = document.querySelector('[role=dialog]'); const b = d && d.querySelector('button[type=submit]'); return b ? b.innerText.trim() : ''; })()") == "Salvar", painel()[:200])
fechar_painel()
cdp("Emulation.clearDeviceMetricsOverride")

fim()
