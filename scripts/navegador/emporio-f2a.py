# Validacao viva da F2a do Meu Empório (Modulo 39): compra e estoque.
# docs/specs/module-39-meu-emporio.md, "F2a: contrato (Q60 a Q71)".
#
# Pela tela: estoque inicial, perda com a recusa no campo, receber a compra,
# encaminhar a Lista e a recusa de cancelar compra paga. Pela API do proprio
# navegador: as compras e os limites. Os numeros conferidos na tela:
#   inicial 2 sacas de 10 kg + 3 kg a R$ 9,00 = 23 kg, medio R$ 9,00
#   perda de 1 kg avulso = 22 kg, medio continua R$ 9,00
#   compra de 3 sacas, itens R$ 270 + frete R$ 30 = R$ 10,00 o kg
#   recebida: 52 kg, medio (22 x 9 + 30 x 10) / 52 = R$ 9,58
#   limites 60 e 100: precisa repor, sugestao 48 kg
#
# cenario: scripts/_cenario-emporio-f2a.ts
# sessao: owner owner@damata.com.br


def tem(texto, n=20000):
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ")") or "")


def preencher_aria(aria, valor):
    return js("(() => { const el = document.querySelector('[role=dialog] input[aria-label=' + JSON.stringify(" + repr(aria) + ") + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.id || 'ok'; })()")


# O bloco "Estoque por loja" lista TODAS as lojas da conta (a do roteiro da F1
# tambem), e o primeiro botao do bloco e o da primeira loja. O cartao da F2a
# Loja e o menor ancestral que contem o nome dela e nao o de outra loja.
CARTAO_DA_LOJA = "(() => { const h = Array.from(document.querySelectorAll('h2, h3')).find(x => x.innerText.toLowerCase().includes('estoque por loja')); const s = h && (h.closest('section') || h.parentElement); if (!s) return null; const outras = (t) => /F1 Loja/.test(t); const cand = Array.from(s.querySelectorAll('*')).filter(el => el.innerText && el.innerText.includes('F2a Loja') && !outras(el.innerText) && el.querySelector('button')); return cand.length ? cand[cand.length - 1].closest('li, article, tr, div') : null; })()"


def bloco_estoque():
    """Texto do cartao da F2a Loja no bloco Estoque por loja da tela do produto."""
    return (js("(() => { let c = " + CARTAO_DA_LOJA + "; while (c && c.parentElement && !/F1 Loja/.test(c.parentElement.innerText) && c.parentElement.innerText.includes('F2a Loja') && !/estoque por loja/i.test(c.parentElement.innerText)) c = c.parentElement; return c ? c.innerText.replace(/\\s+/g, ' ') : ''; })()") or "")


def clicar_no_bloco(rotulo):
    return bool(js("(() => { let c = " + CARTAO_DA_LOJA + "; while (c && c.parentElement && !/F1 Loja/.test(c.parentElement.innerText) && c.parentElement.innerText.includes('F2a Loja') && !/estoque por loja/i.test(c.parentElement.innerText)) c = c.parentElement; const b = c && Array.from(c.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


passo("0. Achar a loja e o produto do cenário")
entrar("owner")
ir("/emporio")
loja = [l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"] == "F2a Loja"][0]
prod = [p for p in api("GET", "/api/v1/emporio/products")["body"]["data"] if p["name"] == "F2a Ração"][0]
detalhe = api("GET", "/api/v1/emporio/products/" + prod["id"])["body"]["data"]
saca = [a for a in detalhe["presentations"] if a["name"] == "Saca 10 kg"][0]
confere("cenário montado", bool(loja and prod and saca))
confere("início com cartões Estoque e Compras", tem("Estoque") and tem("Compras"))

passo("1. Estoque inicial pela tela (Q69)")
ir("/emporio/produtos/" + prod["id"])
confere("bloco Estoque por loja", "F2a Loja" in bloco_estoque(), bloco_estoque()[:120])
confere("abre Estoque inicial", clicar_no_bloco("Estoque inicial"))
time.sleep(1.5)
confere("embalagens da saca", preencher_aria("Embalagens de Saca 10 kg", "2") != "SEM CAMPO")
preencher("Avulso (kg)", "3")
preencher("Custo por kg (R$)", "9")
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto()))
confere("saldo 23 kg com custo médio R$ 9,00", esperar(lambda: "23" in bloco_estoque() and "9,00" in bloco_estoque()), bloco_estoque()[:200])
confere("Estoque inicial some depois de usado", not clicar_no_bloco("Estoque inicial"))

passo("2. Perda acima do saldo: recusa no campo (Q66)")
confere("abre Registrar perda", clicar_no_bloco("Registrar perda"))
time.sleep(1.5)
preencher("Quantidade (kg)", "50")
escolher("Motivo", "Avaria")
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Quantidade (kg)")) or ""
confere("recusa embaixo da quantidade", recusa != "", recusa)
preencher("Quantidade (kg)", "1")
enviar_painel()
confere("perda de 1 kg gravou", esperar(lambda: not painel_aberto()))
confere("saldo 22 kg, médio continua R$ 9,00", esperar(lambda: "22" in bloco_estoque() and "9,00" in bloco_estoque()), bloco_estoque()[:200])

passo("3. Compra a prazo ainda não recebida (Q38, Q62, Q70)")
corpo = {
    "operation_key": "roteiro-f2a-" + str(int(time.time())),
    "establishment_id": loja["id"],
    "purchased_at": "2026-10-27T12:00:00.000Z",
    "received": False,
    "freight": 30,
    "items": [{"emporio_product_id": prod["id"], "presentation_id": saca["id"], "quantity": 3, "item_total": 270}],
    "payment": {"kind": "a_prazo", "due_date": "2026-11-27T12:00:00.000Z"},
}
r1 = api("POST", "/api/v1/emporio/purchases", corpo)
confere("compra criada", r1["status"] == 201, r1["status"])
r2 = api("POST", "/api/v1/emporio/purchases", corpo)
confere("mesma chave: 200 e a mesma compra", r2["status"] == 200 and r2["body"]["data"]["id"] == r1["body"]["data"]["id"], r2["status"])
compra = r1["body"]["data"]
confere("custo do kg R$ 10,00 com frete", abs(compra["items"][0]["unit_cost"] - 10) < 0.0001, compra["items"][0]["unit_cost"])
confere("conta a pagar pendente de R$ 300", [e["status"] for e in compra["entries"]] == ["pending"] and compra["entries"][0]["amount"] == 300, compra["entries"])
ir("/emporio/produtos/" + prod["id"])
confere("estoque não mudou antes de chegar", "22" in bloco_estoque() and "52" not in bloco_estoque(), bloco_estoque()[:200])

passo("4. Receber pela tela e o custo médio móvel (Q64)")
ir("/emporio/compras")
confere("compra pendente na lista", tem("Pendente") and tem("300,00"))
confere("clica Receber", clicar("Receber"))
time.sleep(1.5)
if painel_aberto():
    enviar_painel()
confere("virou Recebida", esperar(lambda: tem("Recebida")))
ir("/emporio/produtos/" + prod["id"])
confere("saldo 52 kg, médio R$ 9,58", esperar(lambda: "52" in bloco_estoque() and "9,58" in bloco_estoque()), bloco_estoque()[:200])

passo("5. Limites, Precisa repor e encaminhar à Lista (Q67, Q68)")
r = api("PUT", "/api/v1/emporio/stock/limits", {"establishment_id": loja["id"], "emporio_product_id": prod["id"], "min_qty": 60, "max_qty": 100})
confere("limites gravados", r["status"] == 200, r["status"])
ir("/emporio/estoque?loja=" + loja["id"])
confere("Precisa repor com F2a Ração", tem("Precisa repor") and tem("F2a Ração"))
confere("sugestão 48", tem("48"))
confere("abre Encaminhar", clicar("Encaminhar à Lista"))
time.sleep(1.5)
enviar_painel()
confere("encaminhou", esperar(lambda: not painel_aberto()))
ir("/lista-de-compra")
confere("Lista tem o item da loja", tem("F2a Ração") and tem("F2a Loja"))

passo("6. Cancelar compra paga é recusado (Q63)")
pago = dict(corpo, operation_key=corpo["operation_key"] + "-vista", received=True, payment={"kind": "a_vista"})
r = api("POST", "/api/v1/emporio/purchases", pago)
confere("compra à vista criada", r["status"] == 201, r["status"])
r = api("POST", "/api/v1/emporio/purchases/" + r["body"]["data"]["id"] + "/cancel", {"reason": "teste"})
confere("cancelar compra paga: 409 PURCHASE_HAS_PAYMENT", r["status"] == 409 and r["body"]["error"]["code"] == "PURCHASE_HAS_PAYMENT", r)

passo("7. Fazenda intocada (Q2, Q51)")
ir("/estoque")
confere("estoque da fazenda abre", tem("Estoque"))
confere("F2a Ração fora do estoque da fazenda", not tem("F2a Ração"))
