# Conferência local do formulário de conta avulsa.
# sessao: owner owner@example.com

passo("Conta avulsa em Despesas")
entrar("owner")
caminho = ir("/emporio/despesas")
confere("Despesas abriu", caminho == "/emporio/despesas", caminho)
confere("Adicionar conta está visível", clicar("Adicionar conta"))
confere("Painel de cadastro abriu", painel_aberto())

campos = js("Array.from(document.querySelectorAll('[role=dialog] label')).map(l => l.innerText.replace('*', '').trim())") or []
for campo in ["Loja", "Descrição", "Valor", "Vencimento", "Status", "Destinatário"]:
    confere("Campo " + campo, campo in campos, campos)

time.sleep(2)
escolha_paga = escolher("Status", "Paga")
confere("Paga selecionável", escolha_paga is True)
campos_paga = js("Array.from(document.querySelectorAll('[role=dialog] label')).map(l => l.innerText.replace('*', '').trim())") or []
confere("Pagamento pede data e origem", "Data do pagamento" in campos_paga and "De onde sai o dinheiro" in campos_paga, campos_paga)

confere("Outros selecionável", escolher("Destinatário", "Outros") is True)
campos_outros = js("Array.from(document.querySelectorAll('[role=dialog] label')).map(l => l.innerText.replace('*', '').trim())") or []
confere("Outros pede nome", "Nome de Outros" in campos_outros, campos_outros)

confere("Fornecedor selecionável", escolher("Destinatário", "Fornecedor") is True)
confere("Fornecedor usa seletor existente", bool(js("!!document.querySelector('[role=dialog] button') && document.querySelector('[role=dialog]').innerText.includes('Escolher fornecedor')")))

confere("Pendente selecionável", escolher("Status", "Pendente") is True)
campos_pendente = js("Array.from(document.querySelectorAll('[role=dialog] label')).map(l => l.innerText.replace('*', '').trim())") or []
confere("Pendente não mostra origem de pagamento", "De onde sai o dinheiro" not in campos_pendente)
