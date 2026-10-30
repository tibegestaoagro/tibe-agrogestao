# Validacao viva da F6a do Meu Empório (Modulo 39): saca e fardo, conteudo,
# mais dados no produto e fim do tipo da loja.
# docs/specs/module-39-meu-emporio.md, "F6a: contrato (produto e fim do tipo)".
#
# Os produtos levam o prefixo "F1 " de proposito: o cenario da F1 apaga o que
# tem esse prefixo, e assim o roteiro roda de novo sem sobrar "Ração gato".
#
# cenario: scripts/_cenario-emporio-f1.ts
# sessao: owner owner@damata.com.br


def tem(texto, n=20000):
    return texto in (js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or "")


def no_painel(texto):
    return texto in (js("((document.querySelector('[role=dialog]') || {}).innerText || '').replace(/\\u00a0/g, ' ')") or "")


def rotulos_do_painel():
    return js("Array.from(((document.querySelector('[role=dialog]') || document).querySelectorAll('label'))).map(x => x.innerText.replace('*','').trim())") or []


def caminho():
    return js("location.pathname") or ""


def filtrar_especie(valor):
    js("(() => { const s = document.getElementById('busca-species'); s.value = " + repr(valor) + "; s.dispatchEvent(new Event('change', { bubbles: true })); })()")
    enviar_formulario()


entrar("owner")
ir("/emporio")
time.sleep(3)
# A primeira abertura compila a rota no next dev e a pagina ainda pode navegar.
categoria = esperar(lambda: api("GET", "/api/v1/product-categories")["body"]["data"][0], 90)

passo("1. Novo produto em saca de 10 kg, pela tela")
ir("/emporio/produtos")
confere("botão Novo produto", clicar("Novo produto"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
confere("preenche o nome", preencher("Nome", "F1 Ração gato") not in ("SEM ROTULO", "SEM CAMPO"))
confere("escolhe a categoria", escolher("Categoria", categoria["name"]) is True)
confere("sem unidade-base, não há campo de conteúdo", "Unidade do conteúdo" not in rotulos_do_painel())
confere("escolhe a unidade Saca", escolher("Unidade-base", "Saca") is True)
confere("o conteúdo aparece, com o rótulo da saca", "Quanto pesa ou quanto cabe em uma saca" in rotulos_do_painel(), rotulos_do_painel())
confere("o custo segue a unidade: por saca", "Custo por saca (R$)" in rotulos_do_painel(), rotulos_do_painel())
confere("a frase da apresentação fechada", no_painel("já nasce com a apresentação fechada"))
confere("Marca fica dentro de Mais dados, fechado", "Marca" not in rotulos_do_painel())
confere("abre Mais dados", clicar("Mais dados"))
time.sleep(0.5)
confere("Mais dados mostra os quatro campos", all(r in rotulos_do_painel() for r in ["Marca", "Fabricante", "Código interno", "Espécie"]), rotulos_do_painel())
# Sem conteudo a saca nao existe: a recusa cai embaixo do campo.
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Quanto pesa ou quanto cabe em uma saca")) or ""
confere("sem conteúdo, a recusa fica no campo", "saca" in recusa.lower(), recusa)
confere("preenche o conteúdo", preencher("Quanto pesa ou quanto cabe em uma saca", "10") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("foi para a tela do produto", esperar(lambda: caminho().startswith("/emporio/produtos/") and caminho() != "/emporio/produtos", 60), caminho())
time.sleep(2)
confere("o conteúdo junto do nome: Saca de 10 kg", esperar(lambda: tem("Saca de 10 kg")))
confere("a apresentação Saca 10 kg nasceu fechada", tem("Saca 10 kg") and tem("Fechada"))
url_gato = caminho()

passo("2. Apresentação Quilo informada no conteúdo")
confere("botão Nova apresentação", clicar("Nova apresentação"))
time.sleep(1.5)
confere("o campo é Quanto (em kg)", "Quanto (em kg)" in rotulos_do_painel(), rotulos_do_painel())
confere("sem o campo Vale quanto", not any(r.startswith("Vale quanto") for r in rotulos_do_painel()))
preencher("Nome", "Quilo")
preencher("Quanto (em kg)", "1")
time.sleep(0.5)
confere("mostra a conversão = 0,1 saca", no_painel("= 0,1 saca"))
enviar_painel()
confere("painel fechou", esperar(lambda: not painel_aberto()))
confere("a lista tem a apresentação Quilo", esperar(lambda: tem("Quilo")))
apres = {a["name"]: a for a in api("GET", "/api/v1/emporio/products/" + url_gato.rsplit("/", 1)[1])["body"]["data"]["presentations"]}
confere("o servidor gravou 0,1 saca", "Quilo" in apres and abs(apres["Quilo"]["base_qty"] - 0.1) < 1e-9 and apres["Quilo"]["content_equivalent"] == 1, apres.get("Quilo"))

passo("3. 1 kg numa saca de 30 kg: a recusa fica no campo")
r = api("POST", "/api/v1/emporio/products", {"name": "F1 Ração saca 30", "category_id": categoria["id"], "base_unit": "saca", "content_qty": 30, "content_unit": "quilograma"})
confere("produto da saca de 30 kg criado", r["status"] == 201, r)
url_30 = "/emporio/produtos/" + r["body"]["data"]["id"]
ir(url_30)
confere("botão Nova apresentação", clicar("Nova apresentação"))
time.sleep(1.5)
preencher("Nome", "Quilo")
preencher("Quanto (em kg)", "1")
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Quanto (em kg)")) or ""
confere("recusa embaixo de Quanto (em kg), citando os 30 kg", "30" in recusa, recusa)
press_key("Escape")
time.sleep(1)

passo("4. Dados do produto: marca, fabricante, código e espécie")
ir(url_gato)
confere("botão Editar dos dados", clicar("Editar"))
time.sleep(1.5)
confere("preenche a marca", preencher("Marca", "Marca F6") not in ("SEM ROTULO", "SEM CAMPO"))
preencher("Fabricante", "Fabricante F6")
preencher("Código interno", "F6-001")
confere("marca a espécie Gato", marcar("Gato") is True)
enviar_painel()
confere("painel fechou depois de salvar", esperar(lambda: not painel_aberto()))
confere("a tela mostra os dados", esperar(lambda: tem("F6-001") and tem("Marca F6") and tem("Fabricante F6") and tem("Gato")))

passo("5. Código repetido: a recusa cai no campo")
ir(url_30)
confere("botão Editar dos dados", clicar("Editar"))
time.sleep(1.5)
preencher("Código interno", "F6-001")
enviar_painel()
recusa = esperar(lambda: erro_do_campo("Código interno")) or ""
confere("recusa embaixo de Código interno", "F6-001" in recusa or "já existe" in recusa.lower(), recusa)
press_key("Escape")
time.sleep(1)

passo("6. Lista: busca pelo código e filtro de espécie")
ir("/emporio/produtos")
confere("sem filtro, os dois produtos", tem("F1 Ração gato") and tem("F1 Ração saca 30"))
# O cabeçalho do kit é `uppercase` no CSS, e o innerText devolve em caixa alta.
confere("as colunas Marca e Código", tem("MARCA") and tem("CÓDIGO") and tem("Marca F6") and tem("F6-001"))
confere("preenche a busca", preencher("Buscar", "f6-001") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_formulario()
confere("a busca pelo código acha só a ração de gato", esperar(lambda: "q=f6-001" in (js("location.search") or "") and tem("F1 Ração gato") and not tem("F1 Ração saca 30")))
ir("/emporio/produtos")
filtrar_especie("gato")
confere("o filtro Gato acha só a ração de gato", esperar(lambda: "species=gato" in (js("location.search") or "") and tem("F1 Ração gato") and not tem("F1 Ração saca 30")))
ir("/emporio/produtos")
filtrar_especie("cao")
confere("o filtro Cão não acha nada", esperar(lambda: "species=cao" in (js("location.search") or "") and tem("Nenhum produto encontrado")))

passo("7. Estabelecimento sem Tipo")
ir("/emporio/estabelecimentos")
confere("a lista não tem a coluna Tipo", not js("Array.from(document.querySelectorAll('th')).some(x => x.innerText.trim() === 'Tipo')"))
confere("botão Novo estabelecimento", clicar("Novo estabelecimento"))
time.sleep(1.5)
confere("o painel abriu com o Nome", "Nome" in rotulos_do_painel(), rotulos_do_painel())
confere("o painel não tem o campo Tipo", "Tipo" not in rotulos_do_painel(), rotulos_do_painel())
