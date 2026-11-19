# Validacao viva das taxas de cartao ENCERRADAS e da edicao de venda (Meu Empório,
# Modulo 39), o caso da Central do Milho de 18/11/2026:
#   1. a lista de taxas escondia as encerradas e o aviso so aparecia com a lista vazia
#   2. editar uma venda passada (fiado para debito) dava "Erro interno" em producao
#      (transacao do Prisma estourava os 5 s com ~120 ms por consulta; localmente nao
#      ha latencia, entao aqui se prova o fluxo da tela inteiro, nao o timeout)
#
# Os numeros, conferidos na tela e pela API (hoje = D):
#   Configurações: com "Mostrar encerradas" desmarcado, o aviso "Há 3 taxas encerradas
#     escondidas" aparece e as duas vigentes (1,49% e 2,50%) tambem; marcando, aparecem
#     as tres encerradas com o selo "encerrada"; a encerrada sem venda tem Editar e Remover,
#     a em uso (Elo credito a vista 3%) nao tem nenhum dos dois
#   editar a encerrada sem venda: corrigir 2,00 para 2,25 mantendo a vigencia grava;
#     estender o fim para D-3 cruza com a Elo vigente de 2,50% e a recusa fica no campo
#   remover a encerrada sem venda a apaga
#   a venda no fiado de D-2 (R$ 52,00, Txe Paulo) vira Debito Visa/Master: a antiga fica
#     cancelada ("Substituída pela venda nº ..."), a nova no debito com taxa 1,67%
#   depois da venda, a taxa de 1,67% passa a "em uso" e perde Editar e Remover
#
# cenario: scripts/_cenario-emporio-taxas-encerradas.ts
# sessao: owner owner@example.com


def texto_da_pagina():
    return js("(document.body.innerText || '').replace(/\\u00a0/g, ' ')") or ""


def tem(texto, n=40000):
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


def taxas(loja_id):
    return api("GET", "/api/v1/emporio/card-fee-rates?establishment_id=" + loja_id + "&incluir_encerradas=1")["body"]["data"]


def filtrar_loja(nome):
    xy = _centro("document.querySelector('[aria-label=\"Filtrar por loja\"]')")
    if not xy:
        return "SEM FILTRO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim() === " + repr(nome) + ")")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    return True


def linhas():
    """As linhas das tabelas de taxas: [{texto, botoes}]."""
    return js("Array.from(document.querySelectorAll('main tbody tr')).map(tr => ({ texto: tr.innerText.replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' '), botoes: Array.from(tr.querySelectorAll('button')).map(b => b.innerText.trim()) }))") or []


def linha_da(trecho):
    achadas = [l for l in linhas() if trecho in l["texto"]]
    return achadas[0] if len(achadas) == 1 else None


def clicar_na_linha(trecho, rotulo):
    return bool(js("(() => { const tr = Array.from(document.querySelectorAll('main tbody tr')).find(t => t.innerText.replace(/\\u00a0/g, ' ').includes(" + repr(trecho) + ")); if (!tr) return false; const b = Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def abrir_configuracoes():
    ir("/emporio/configuracoes")
    filtrar_loja("Txe Loja")


passo("0. O cenário: uma loja, cinco taxas da STONE Txe, a venda no fiado e o turno novo")
entrar("owner")
ir("/emporio")
loja = [l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if l["name"] == "Txe Loja"][0]
confere("cinco taxas na loja", len(taxas(loja["id"])) == 5, len(taxas(loja["id"])))
# A primeira visita a uma rota compila no next dev e pode recarregar a pagina no meio do passo.
for rota in ["/emporio/vender", "/emporio/configuracoes", "/emporio/vendas/x"]:
    js("fetch(" + repr(rota) + ").then(r => r.status)")
time.sleep(2)

passo("1. Configurações: o aviso das escondidas e as vigentes na tela")
abrir_configuracoes()
confere("a seção de taxas abre", tem("Cartões: adquirentes e taxas"))
aviso = texto_da_pagina()
confere("o aviso conta as três encerradas escondidas", "Há 3 taxas encerradas escondidas" in aviso and "Mostrar encerradas" in aviso, texto_principal(1500))
confere("a vigente de 1,49% aparece", linha_da("1,49") is not None, [l["texto"] for l in linhas()])
confere("a vigente de 2,5% aparece", any("2,5" in l["texto"] and "desde" in l["texto"] and "Elo" in l["texto"] for l in linhas()), [l["texto"] for l in linhas()])
confere("a encerrada de 1,67% fica escondida", linha_da("1,67") is None)
confere("só as duas vigentes na tabela", len(linhas()) == 2, len(linhas()))

passo("2. Mostrar encerradas: as três aparecem, com Editar e Remover só na que nenhuma venda usou")
confere("marca 'Mostrar encerradas'", marcar("Mostrar encerradas", True) is True)
time.sleep(1)
confere("cinco linhas", len(linhas()) == 5, len(linhas()))
confere("o aviso some quando nada está escondido", "taxas encerradas escondidas" not in texto_da_pagina() and "taxa encerrada escondida" not in texto_da_pagina())
encerradas = [l for l in linhas() if "encerrada" in l["texto"]]
confere("três linhas com o selo 'encerrada'", len(encerradas) == 3, [l["texto"] for l in encerradas])
sem_uso = linha_da("1,67")
confere("a encerrada de 1,67% (sem venda) tem Editar e Remover", sem_uso is not None and "Editar" in sem_uso["botoes"] and "Remover" in sem_uso["botoes"], sem_uso)
confere("a encerrada de 1,67% não está 'em uso'", sem_uso is not None and "em uso" not in sem_uso["texto"], sem_uso)
em_uso = [l for l in linhas() if "em uso" in l["texto"] and "encerrada" in l["texto"]]
confere("a encerrada EM USO é uma só (a de 3%)", len(em_uso) == 1 and "3%" in em_uso[0]["texto"].replace(",00", ""), [l["texto"] for l in em_uso])
confere("a encerrada em uso não tem Editar nem Remover nem Encerrar", len(em_uso) == 1 and not any(b in em_uso[0]["botoes"] for b in ["Editar", "Remover", "Encerrar", "Nova vigência"]), em_uso)
vigente = linha_da("1,49")
confere("a vigente segue com as ações de vigente (Editar e Nova vigência)", vigente is not None and "Editar" in vigente["botoes"] and "Nova vigência".replace("ê", "e") in [b.replace("ê", "e") for b in vigente["botoes"]], vigente)

passo("3. Editar a encerrada sem venda: corrigir a taxa de 2,00% para 2,25% grava")
elo_2 = [t for t in taxas(loja["id"]) if t["brand"] == "elo" and t["kind"] == "debito" and t["fee_pct"] == 2]
confere("a Elo de 2% do cenário existe", len(elo_2) == 1, len(elo_2))
confere("abre o Editar da Elo encerrada de 2%", clicar_na_linha("2,00", "Editar") or clicar_na_linha("2%", "Editar"))
time.sleep(1.5)
confere("o painel abriu", painel_aberto())
preencher("Taxa (%)", "2,25")
enviar_painel()
confere("o painel fechou", esperar(lambda: not painel_aberto(), 60), erro_do_campo("Taxa (%)"))
gravada = lambda: [t for t in taxas(loja["id"]) if t["id"] == elo_2[0]["id"]][0]
confere("a API tem 2,25 e a vigência intacta", esperar(lambda: gravada()["fee_pct"] == 2.25, 30) and gravada()["valid_from"] == elo_2[0]["valid_from"] and gravada()["valid_to"] == elo_2[0]["valid_to"], gravada())
ir("/emporio/configuracoes")
filtrar_loja("Txe Loja")
marcar("Mostrar encerradas", True)
time.sleep(1)
confere("a tela mostra 2,25 na linha", linha_da("2,25") is not None, [l["texto"] for l in linhas()])

passo("4. Estender o fim da encerrada até D-3: cruza com a Elo vigente e a recusa fica no campo")
fim_de_hoje3 = [t for t in taxas(loja["id"]) if t["brand"] == "elo" and t["kind"] == "debito" and t["fee_pct"] == 2.5][0]["valid_from"][:10]
confere("abre o Editar da 2,25", clicar_na_linha("2,25", "Editar"))
time.sleep(1.5)
preencher("Vale até", fim_de_hoje3)
enviar_painel()
time.sleep(2)
recusa = esperar(lambda: erro_do_campo("Vale até") or erro_do_campo("Vale a partir de"), 30)
confere("a recusa de sobreposição aparece embaixo de um campo de vigência", bool(recusa), recusa)
confere("o painel segue aberto", painel_aberto())
confere("nada foi gravado (o fim continua o mesmo)", gravada()["valid_to"] == elo_2[0]["valid_to"], gravada())

passo("5. Remover a encerrada sem venda a apaga")
ir("/emporio/configuracoes")
filtrar_loja("Txe Loja")
marcar("Mostrar encerradas", True)
time.sleep(1)
confere("abre o Remover da 2,25", clicar_na_linha("2,25", "Remover"))
time.sleep(1.5)
confere("o diálogo de remover abriu", "Remover taxa de cartão" in texto_da_pagina(), "")
confere("confirma", clicar("Remover taxa"))
confere("a API não lista mais a taxa", bool(esperar(lambda: len([t for t in taxas(loja["id"]) if t["id"] == elo_2[0]["id"]]) == 0, 30)), len(taxas(loja["id"])))
confere("restam quatro taxas", len(taxas(loja["id"])) == 4, len(taxas(loja["id"])))

passo("6. Editar a venda: o fiado de D-2 (R$ 52,00) vira Débito Visa/Master")


def fiado_da_loja():
    for v in api("GET", "/api/v1/emporio/sales?establishment_id=" + loja["id"])["body"]["data"]:
        d = api("GET", "/api/v1/emporio/sales/" + v["id"])["body"]["data"]
        if d["status"] == "concluida" and d["payments"] and d["payments"][0]["kind"] == "fiado":
            return d
    return None


antiga = fiado_da_loja()
confere("a venda no fiado existe", antiga is not None)
taxa_1_67 = [t for t in taxas(loja["id"]) if t["fee_pct"] == 1.67][0]
confere("a taxa de 1,67% ainda não está em uso", taxa_1_67["in_use"] is False, taxa_1_67)
ir("/emporio/vender?editar=" + antiga["id"])
confere("o balcão abriu em modo edição (Salvar a venda nova)", bool(esperar(lambda: "Salvar a venda nova" in texto_da_pagina(), 60)), texto_principal(600))
confere("o cliente Txe Paulo veio preenchido", "Txe Paulo" in escolhido(), escolhido())
confere("a linha do Fiado veio preenchida", js("!!document.querySelector('[aria-label=\"Remover pagamento em Fiado\"]')") is True)
js("(() => { const b = document.querySelector('[aria-label=\"Remover pagamento em Fiado\"]'); if (b) b.click(); })()")
time.sleep(1)
confere("tira o Fiado", js("!document.querySelector('[aria-label=\"Remover pagamento em Fiado\"]')") is True)
confere("adiciona Débito", clicar("+ Débito"))
time.sleep(1.5)
confere("escolhe a bandeira Visa/Master", clicar("Visa/Master"))
time.sleep(1.5)
confere("a prévia mostra a taxa encerrada de 1,67% (a do dia da venda)", tem("Taxa 1,67"), texto_principal(1200))
confere("Salvar a venda nova habilitado", js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === 'Salvar a venda nova'); return b ? !b.disabled : null; })()") is True)
js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.trim() === 'Salvar a venda nova'); if (b) b.click(); })()")
nova_id = esperar(lambda: (api("GET", "/api/v1/emporio/sales/" + antiga["id"])["body"]["data"].get("replaced_by") or {}).get("id"), 90)
confere("a API diz que a antiga foi substituída (sem 'Erro interno')", bool(nova_id), texto_principal(600))
if nova_id:
    a = api("GET", "/api/v1/emporio/sales/" + antiga["id"])["body"]["data"]
    n = api("GET", "/api/v1/emporio/sales/" + nova_id)["body"]["data"]
    confere("a antiga ficou cancelada com 'Substituída pela venda nº'", a["status"] == "cancelada" and "Substituída pela venda nº" in (a["canceled_reason"] or ""), a["canceled_reason"])
    confere("a nova está concluída, R$ 52,00, e aponta a antiga", n["status"] == "concluida" and n["total_amount"] == 52 and (n["replaces"] or {}).get("id") == antiga["id"], n["replaces"])
    pg = n["payments"][0]
    confere("a nova no débito Visa/Master com taxa 1,67%", pg["kind"] == "debito" and pg["brand"] == "visa_master" and pg["fee_pct"] == 1.67, pg)
    confere("a data da venda nova é a da antiga (D-2)", n["sold_at"][:10] == antiga["sold_at"][:10], (n["sold_at"], antiga["sold_at"]))
    ir("/emporio/vendas/" + antiga["id"])
    confere("o detalhe da antiga diz 'Substituída pela venda nº'", "Substituída pela venda nº" in texto_da_pagina(), texto_principal(800))
    ir("/emporio/vendas/" + nova_id)
    p = texto_da_pagina()
    confere("o detalhe da nova mostra Visa/Master e 1,67%", "Visa/Master" in p and "1,67" in p, texto_principal(1200))
    confere("o detalhe da nova diz 'Substitui a venda nº'", "Substitui a venda nº" in p, "")

passo("7. Depois da venda, a taxa de 1,67% está em uso: perde Editar e Remover")
abrir_configuracoes()
marcar("Mostrar encerradas", True)
time.sleep(1)
l167 = linha_da("1,67")
confere("a linha de 1,67% tem o selo 'em uso'", l167 is not None and "em uso" in l167["texto"], l167)
confere("sem Editar nem Remover", l167 is not None and not any(b in l167["botoes"] for b in ["Editar", "Remover"]), l167)
confere("a API confirma in_use", [t for t in taxas(loja["id"]) if t["fee_pct"] == 1.67][0]["in_use"] is True)
