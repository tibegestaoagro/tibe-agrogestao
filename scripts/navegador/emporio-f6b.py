# Validacao viva da F6b do Meu Empório (Modulo 39): a Equipe, quem e so da loja
# e a transferencia que chega com diferenca.
# docs/specs/module-39-meu-emporio.md, "F6b: contrato" (Equipe, Só da loja,
# Transferencia) e Q118 a Q135.
#
# O cenario monta duas lojas, um Gerente geral, um Gestor e um Vendedor (sem
# chaves) na Loja 1, uma venda na Loja 1 e duas transferencias da Loja 2 para a
# Loja 1: uma em aguardando_gestor e uma em transito.
#
# cenario: scripts/_cenario-emporio-f6b.ts
# sessao: owner owner@damata.com.br
# sessao: gestor1 f6b-gestor1@teste.local
# sessao: vendedor1 f6b-vendedor1@teste.local


def tem(texto, n=80000):
    # O innerText devolve o texto ja com o text-transform: cabecalhos de tabela
    # chegam em caixa alta, por isso a comparacao ignora a caixa.
    pagina = js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.slice(0, " + str(n) + ").replace(/\\u00a0/g, ' ')") or ""
    return texto.lower() in pagina.lower()


def no_painel(texto):
    return texto.lower() in (js("((document.querySelector('[role=dialog]') || {}).innerText || '').replace(/\\u00a0/g, ' ')") or "").lower()


def caminho():
    return js("location.pathname") or ""


def preencher_aria(aria, valor):
    """Preenche o input do painel pelo aria-label (o MoneyInput nao tem <label> proprio)."""
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const el = raiz.querySelector('input[aria-label=' + " + repr("'" + aria + "'") + " + ']'); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + repr(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def clicar_na_linha(texto_da_linha, rotulo):
    """Clica no botao `rotulo` da linha da tabela que contem `texto_da_linha`."""
    return bool(js("(() => { const tr = Array.from(document.querySelectorAll('tbody tr')).find(x => x.innerText.includes(" + repr(texto_da_linha) + ")); if (!tr) return false; const b = Array.from(tr.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def linha(texto_da_linha):
    return js("(() => { const tr = Array.from(document.querySelectorAll('tbody tr')).find(x => x.innerText.includes(" + repr(texto_da_linha) + ")); return tr ? tr.innerText.replace(/\\u00a0/g, ' ') : ''; })()") or ""


def equipe():
    return {u["email"]: u for u in api("GET", "/api/v1/emporio/team")["body"]["data"]["users"]}


def transferencias():
    return api("GET", "/api/v1/emporio/transfers")["body"]["data"]


def do_menu_sem(*hrefs):
    atual = menu()
    return [h for h in hrefs if h in atual]


entrar("owner")
ir("/emporio")
time.sleep(3)
# A primeira abertura compila a rota no next dev e a pagina ainda pode navegar.
esperar(lambda: api("GET", "/api/v1/emporio/team")["status"] == 200, 90)

passo("1. O Dono abre a Equipe, cadastra um Vendedor e liga uma chave")
ir("/emporio")
confere("o início tem o cartão Equipe", tem("Quem trabalha nas lojas"))
ir("/emporio/equipe")
confere("a Equipe abre", caminho() == "/emporio/equipe" and tem("Cadastrar pessoa"), caminho())
confere("mostra os assentos", tem("assento(s) em uso"))
confere("a frase das funções", tem("Gerente geral") and tem("Gestor") and tem("Vendedor"))
confere("o Dono aparece sem botão de editar", "Editar" not in linha("owner@damata.com.br"), linha("owner@damata.com.br"))
confere("o Gestor aparece com a Loja 1", "F6b Loja 1" in linha("f6b-gestor1@teste.local"), linha("f6b-gestor1@teste.local"))
confere("o Gerente geral aparece com todas as lojas", "Todas" in linha("f6b-gerente@teste.local"), linha("f6b-gerente@teste.local"))

confere("abre Cadastrar pessoa", clicar("Cadastrar pessoa"))
time.sleep(1.5)
confere("painel abriu", painel_aberto())
enviar_painel()
confere("sem nome, a recusa fica no campo Nome", "nome" in (esperar(lambda: erro_do_campo("Nome")) or "").lower())
confere("sem email, a recusa fica no campo Email", "email" in erro_do_campo("Email").lower())
confere("sem função, a recusa fica no campo Função", "função" in erro_do_campo("Função").lower())
confere("preenche o nome", preencher("Nome", "F6b Novo Vendedor") not in ("SEM ROTULO", "SEM CAMPO"))
confere("preenche o email", preencher("Email", "f6b-novo@teste.local") not in ("SEM ROTULO", "SEM CAMPO"))
confere("sem função escolhida, não há lojas nem chaves na tela", not no_painel("Fazer contagem de estoque"))
confere("escolhe a função Vendedor", escolher("Função", "Vendedor") is True)
confere("as lojas aparecem", no_painel("F6b Loja 1") and no_painel("F6b Loja 2"))
confere("as chaves aparecem, com o rótulo da tela", no_painel("Fazer contagem de estoque") and no_painel("Levar a gaveta ao banco"))
ligadas = js("Array.from(document.querySelectorAll('[role=dialog] input[type=checkbox]')).filter(x => x.checked).length")
confere("todas as chaves e lojas começam desligadas", ligadas == 0, ligadas)
enviar_painel()
confere("sem loja, a recusa fica no campo Lojas", "loja" in (esperar(lambda: erro_do_campo("Lojas")) or "").lower())
confere("marca a Loja 1", marcar("F6b Loja 1") is True)
enviar_painel()
confere("a senha temporária aparece", esperar(lambda: js("!!document.getElementById('equipe-senha-criada')"), 60))
senha = js("(document.getElementById('equipe-senha-criada') || {}).value") or ""
confere("a senha tem conteúdo", len(senha) >= 8, len(senha))
confere("o aviso de repassar a senha", no_painel("só aparece aqui uma vez"))
enviar_painel()
confere("fechou", esperar(lambda: not painel_aberto()))
confere("a pessoa entrou na lista como Vendedor da Loja 1", esperar(lambda: "\tVendedor" in linha("f6b-novo@teste.local") and "F6b Loja 1" in linha("f6b-novo@teste.local")), linha("f6b-novo@teste.local"))
confere("o Gestor aparece com a função Gestor", "\tGestor" in linha("f6b-gestor1@teste.local"), linha("f6b-gestor1@teste.local"))
confere("o servidor gravou sem chaves", equipe()["f6b-novo@teste.local"]["emporio_keys"] == [])

confere("abre o Editar da pessoa", clicar_na_linha("f6b-novo@teste.local", "Editar"))
time.sleep(1.5)
confere("liga a chave Fazer contagem de estoque", marcar("Fazer contagem de estoque") is True)
enviar_painel()
confere("fechou depois de salvar", esperar(lambda: not painel_aberto()))
confere("a chave ficou no servidor", esperar(lambda: equipe()["f6b-novo@teste.local"]["emporio_keys"] == ["contagem"]), equipe()["f6b-novo@teste.local"]["emporio_keys"])
ir("/emporio/equipe")
confere("a lista mostra a chave ligada", "Fazer contagem de estoque" in linha("f6b-novo@teste.local"))

passo("2. O Vendedor da Loja 1 só vê o Empório")
entrar("vendedor1")
ir("/emporio")
confere("abre o Empório", caminho() == "/emporio", caminho())
confere("sem o cartão Equipe", not tem("Quem trabalha nas lojas"))
abrir_grupo("Operação")
itens = menu()
confere("o menu não tem Financeiro, Rebanho nem Painel", do_menu_sem("/financeiro", "/rebanho", "/dashboard", "/maquinas", "/estoque") == [], itens)
confere("o menu tem Meu Empório e Contatos", "/emporio" in itens and "/contatos" in itens, itens)
confere("/emporio/equipe leva ao início do Empório", ir("/emporio/equipe") == "/emporio")
confere("/rebanho leva ao /emporio", ir("/rebanho") == "/emporio")
confere("/financeiro leva ao /emporio", ir("/financeiro") == "/emporio")
confere("/dashboard leva ao /emporio", ir("/dashboard") == "/emporio")
confere("a API da Equipe recusa o Vendedor", api("GET", "/api/v1/emporio/team")["status"] == 403)
confere("/calculadoras continua aberta", ir("/calculadoras") == "/calculadoras")

ir("/meu-dia")
confere("o Meu Dia não mostra a fazenda", not tem("Sua fazenda") and not tem("O que aconteceu hoje"))
confere("o Meu Dia traz a transferência com diferença?", not tem("chegou com diferença: resolva"), "o Vendedor não resolve, então a linha é só do Gestor")

venda = api("GET", "/api/v1/emporio/sales")["body"]["data"][0]["id"]
ir("/emporio/vendas/" + venda)
confere("a venda abre", caminho() == "/emporio/vendas/" + venda, caminho())
confere("sem o botão Cancelar venda", not js("Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Cancelar venda')"))
r = api("POST", "/api/v1/emporio/sales/" + venda + "/cancel", {"reason": "teste"})
confere("cancelar pela API é recusado", r["status"] == 403, r)

ir("/emporio/estoque")
confere("sem Encaminhar à Lista", not js("Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Encaminhar'))"))

ir("/emporio/transferencias")
confere("a lista mostra Aguardando o Gestor", tem("Aguardando o Gestor"))
confere("o Vendedor não tem Resolver diferença", not js("Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Resolver'))"))
confere("clica Receber", clicar("Receber"))
time.sleep(1.5)
confere("cada item mostra o enviado e o Chegou", no_painel("Enviado: 10") and no_painel("Chegou"))
confere("Chegou já vem com o enviado", preencher_aria("Chegou de F6b Ração", "10") == "10")
confere("com tudo certo, não há pergunta de diferença", not no_painel("O que aconteceu?") and not no_painel("vai para o Gestor"))
confere("diminui o que chegou", preencher_aria("Chegou de F6b Ração", "4") == "4")
confere("avisa que a diferença vai para o Gestor", no_painel("A diferença vai para o Gestor da loja resolver."))
confere("o Vendedor não escolhe a resolução", not no_painel("O que aconteceu?"))
enviar_painel()
confere("fechou", esperar(lambda: not painel_aberto(), 60))
aguardando = [t for t in transferencias() if t["status"] == "aguardando_gestor"]
confere("agora são duas aguardando o Gestor", len(aguardando) == 2, len(aguardando))

passo("3. O Gestor da Loja 1 resolve a diferença")
entrar("gestor1")
ir("/meu-dia")
confere("o Meu Dia pede a resolução", esperar(lambda: tem("chegou com diferença: resolva")))
ir("/emporio/transferencias")
confere("o Gestor vê Resolver diferença", tem("Resolver diferença"))
confere("a diferença aguardando não oferece Receber de novo", not js("Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Receber')"))
confere("abre Resolver diferença", clicar("Resolver diferença"))
time.sleep(1.5)
confere("mostra o que enviou e o que chegou", no_painel("enviados 10") and no_painel("chegaram"))
enviar_painel()
confere("sem escolher, a recusa fica em O que aconteceu?", "aconteceu" in (esperar(lambda: erro_do_campo("O que aconteceu?")) or "").lower())
confere("sem motivo, a recusa fica no Motivo", "motivo" in erro_do_campo("Motivo").lower())
confere("escolhe Perda no caminho", escolher("O que aconteceu?", "Perda no caminho") is True)
confere("preenche o motivo", preencher("Motivo", "caixa molhada no caminhão") not in ("SEM ROTULO", "SEM CAMPO"))
enviar_painel()
confere("fechou", esperar(lambda: not painel_aberto(), 60))
depois = transferencias()
confere("sobrou uma aguardando", esperar(lambda: len([t for t in transferencias() if t["status"] == "aguardando_gestor"]) == 1), len([t for t in depois if t["status"] == "aguardando_gestor"]))
resolvidas = [t for t in transferencias() if t["resolution"] == "perda_no_caminho"]
confere("uma ficou recebida como Perda no caminho", len(resolvidas) == 1 and resolvidas[0]["status"] == "recebida" and resolvidas[0]["resolution_reason"] == "caixa molhada no caminhão", resolvidas)
ir("/emporio/transferencias")
confere("a tela mostra o motivo da resolução", tem("Perda no caminho: caixa molhada no caminhão"))

passo("4. Configurações → Usuários pelo Dono")
entrar("owner")
ir("/configuracoes/usuarios")
confere("a página abre", caminho() == "/configuracoes/usuarios", caminho())
confere("tem a coluna Empório", js("Array.from(document.querySelectorAll('th')).some(x => x.innerText.trim().toLowerCase() === 'empório')"))
confere("o Gestor aparece com a função", "Gestor" in linha("f6b-gestor1@teste.local"), linha("f6b-gestor1@teste.local"))
confere("o papel de quem tem função fica travado", "Troque pela Equipe do Empório" in linha("f6b-gestor1@teste.local"), linha("f6b-gestor1@teste.local"))
confere("o papel travado não é um seletor", not js("(() => { const tr = Array.from(document.querySelectorAll('tbody tr')).find(x => x.innerText.includes('f6b-gestor1@teste.local')); return !!tr.querySelector('[role=combobox]'); })()"))
confere("desativar continua", "Desativar" in linha("f6b-gestor1@teste.local"))
confere("o link leva à Equipe", js("(() => { const tr = Array.from(document.querySelectorAll('tbody tr')).find(x => x.innerText.includes('f6b-gestor1@teste.local')); const a = tr.querySelector('a[href=\"/emporio/equipe\"]'); return !!a; })()"))

fim()
