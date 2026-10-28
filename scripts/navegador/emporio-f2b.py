# Validacao viva da F2b do Meu Empório (Modulo 39): transferencia e composicao.
# docs/specs/module-39-meu-emporio.md, "F2b: contrato (Q72 a Q80)".
#
# Os numeros do aceite (§25), conferidos na tela:
#   composicao 65, 29 e 6 para 100 kg; produzir 400 kg baixa 260, 116 e 24;
#   custo (260 x 2 + 116 x 4 + 24 x 10) / 400 = R$ 3,06 o kg
#   transferir 3 sacas de sal da Central: sai na hora, entra so no recebimento
#   pelo custo da origem (R$ 9,00), e sem lancamento financeiro
#
# cenario: scripts/_cenario-emporio-f2b.ts
# sessao: owner owner@damata.com.br


def tem(texto, n=30000):
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "")


def secao(titulo):
    """Texto da secao cujo h2/h3 contem `titulo`."""
    return (js("(() => { const h = Array.from(document.querySelectorAll('h2, h3')).find(x => x.innerText.toLowerCase().includes(" + repr(titulo.lower()) + ")); const s = h && (h.closest('section') || h.parentElement); return s ? s.innerText.replace(/\\s+/g, ' ') : ''; })()") or "")


CARTAO_CENTRAL = "(() => { const h = Array.from(document.querySelectorAll('h2, h3')).find(x => x.innerText.toLowerCase().includes('estoque por loja')); const s = h && (h.closest('section') || h.parentElement); if (!s) return null; const cand = Array.from(s.querySelectorAll('*')).filter(el => el.innerText && el.innerText.includes('F2b Central') && !/F2b Loja|F1 Loja|F2a Loja/.test(el.innerText) && el.querySelector('button')); let c = cand.length ? cand[cand.length - 1] : null; while (c && c.parentElement && !/F2b Loja|F1 Loja|F2a Loja/.test(c.parentElement.innerText) && !/estoque por loja/i.test(c.parentElement.innerText)) c = c.parentElement; return c; })()"


def estoque_central():
    return (js("(() => { const c = " + CARTAO_CENTRAL + "; return c ? c.innerText.replace(/\\s+/g, ' ') : ''; })()") or "")


def clicar_na_central(rotulo):
    return bool(js("(() => { const c = " + CARTAO_CENTRAL + "; const b = c && Array.from(c.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def saldo(loja_id, nome):
    linhas = api("GET", "/api/v1/emporio/stock?establishment_id=" + loja_id)["body"]["data"]
    achada = [x for x in linhas if x["product_name"] == nome]
    return achada[0]["total_qty"] if achada else None


passo("0. Achar as lojas e os produtos do cenário")
entrar("owner")
ir("/emporio")
lojas = {l["name"]: l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"]}
prods = {p["name"]: p for p in api("GET", "/api/v1/emporio/products")["body"]["data"]}
central, loja = lojas["F2b Central"], lojas["F2b Loja"]
racao, sal = prods["F2b Ração"], prods["F2b Sal"]
saca = [a for a in api("GET", "/api/v1/emporio/products/" + sal["id"])["body"]["data"]["presentations"] if a["name"] == "Saca 10 kg"][0]
confere("cenário montado", bool(central and loja and racao and sal and saca))
confere("cartão Transferências no início", tem("Transferências"))

passo("1. Composição na tela do produto (Q77)")
ir("/emporio/produtos/" + racao["id"])
comp = secao("Composição")
confere("receita 65, 29 e 6 para 100 kg", all(x in comp for x in ["F2b Milho", "F2b Soja", "F2b Núcleo", "65", "29", "6", "100"]), comp[:200])
confere("cadastrar a composição não movimentou estoque", saldo(central["id"], "F2b Ração") in (0, None))

passo("2. Produzir 400 kg pela tela: baixa 260, 116 e 24 (aceite §25)")
confere("abre Produzir aqui na Central", clicar_na_central("Produzir aqui"))
time.sleep(1.5)
preencher("Quantidade produzida (kg)", "400")
time.sleep(1)
previa = (js("(() => { const d = document.querySelector('[role=dialog]'); return d ? d.innerText.replace(/\\s+/g, ' ') : ''; })()") or "")
confere("prévia 260, 116 e 24", all(x in previa for x in ["260", "116", "24"]), previa[:300])
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto(), 60))
confere("Ração 400 kg a R$ 3,06 na Central", esperar(lambda: "400" in estoque_central() and "3,06" in estoque_central()), estoque_central()[:200])
confere("Milho 40, Soja 34, Núcleo 6", (saldo(central["id"], "F2b Milho"), saldo(central["id"], "F2b Soja"), saldo(central["id"], "F2b Núcleo")) == (40, 34, 6))

passo("3. Falta de componente: recusa embaixo da prévia")
clicar_na_central("Produzir aqui")
time.sleep(1.5)
preencher("Quantidade produzida (kg)", "1000")
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Baixa dos componentes (prévia)")) or ""
confere("recusa na prévia dizendo o que falta", "F2b" in recusa or "falt" in recusa.lower(), recusa)
press_key("Escape")
time.sleep(1.5)
confere("nada gravado: Milho continua 40", saldo(central["id"], "F2b Milho") == 40)

passo("4. Transferência: sai na hora, entra no recebimento (Q19, Q21)")
corpo = {
    "operation_key": "roteiro-f2b-" + str(int(time.time())),
    "origin_establishment_id": central["id"],
    "destination_establishment_id": loja["id"],
    "items": [{"emporio_product_id": sal["id"], "presentation_id": saca["id"], "packages": 3}],
}
r = api("POST", "/api/v1/emporio/transfers", corpo)
confere("transferência enviada", r["status"] == 201, r["status"])
confere("Central caiu para 70 kg de sal", saldo(central["id"], "F2b Sal") == 70)
confere("Loja ainda sem sal", saldo(loja["id"], "F2b Sal") in (0, None))
ir("/emporio/transferencias")
confere("lista mostra Em trânsito", tem("Em trânsito"))
confere("clica Receber", clicar("Receber"))
time.sleep(1.5)
enviar_painel()
confere("virou Recebida", esperar(lambda: tem("Recebida"), 60))
linhas_loja = api("GET", "/api/v1/emporio/stock?establishment_id=" + loja["id"])["body"]["data"]
sal_loja = [x for x in linhas_loja if x["product_name"] == "F2b Sal"][0]
confere("Loja: 30 kg, 3 sacas lacradas, custo R$ 9,00", sal_loja["total_qty"] == 30 and sal_loja["sealed"][0]["packages"] == 3 and abs(sal_loja["average_cost"] - 9) < 0.001, sal_loja)

passo("5. Cancelar transferência em trânsito pela tela (Q73)")
r = api("POST", "/api/v1/emporio/transfers", dict(corpo, operation_key=corpo["operation_key"] + "-b"))
confere("segunda transferência enviada", r["status"] == 201)
confere("Central em 40 kg", saldo(central["id"], "F2b Sal") == 40)
ir("/emporio/transferencias")
confere("clica Cancelar", clicar("Cancelar"))
time.sleep(1.5)
preencher("Motivo", "Enviada errado")
enviar_painel()
confere("virou Cancelada", esperar(lambda: tem("Cancelada"), 60))
confere("Central voltou a 70 kg", saldo(central["id"], "F2b Sal") == 70)

passo("6. Cancelar a produção pela tela (Q79)")
ir("/emporio/produtos/" + racao["id"])
confere("seção Produções", "400" in secao("Produções"), secao("Produções")[:150])
confere("clica Cancelar produção", clicar("Cancelar produção"))
time.sleep(1.5)
preencher("Motivo", "Lançada errada")
enviar_painel()
confere("Ração voltou a 0 na Central", esperar(lambda: saldo(central["id"], "F2b Ração") in (0, None), 60))
confere("componentes voltaram: Milho 300, Soja 150, Núcleo 30", (saldo(central["id"], "F2b Milho"), saldo(central["id"], "F2b Soja"), saldo(central["id"], "F2b Núcleo")) == (300, 150, 30))
