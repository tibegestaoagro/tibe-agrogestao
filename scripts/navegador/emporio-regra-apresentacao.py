# Validacao viva: o campo Apresentacao da regra do "Vendeu, Pagou" aparece
# sempre (desabilitado sem produto) e lista as apresentacoes do produto escolhido.
# Pedido da Agromax em 10/11/2026: "nao deixa escolher por apresentacao".
#
# cenario: scripts/_cenario-emporio-relatorios.ts
# sessao: owner owner@example.com

passo("1. Nova regra: o campo Apresentacao ja aparece")
entrar("owner")
ir("/emporio/despesas")
confere("botao da nova regra", clicar("Nova regra"))
confere("painel abriu", painel_aberto())
rotulos = js("Array.from(document.querySelectorAll('[role=dialog] label')).map(l => l.innerText.replace('*','').trim())") or []
confere("campo Apresentacao visivel sem produto", "Apresentação" in rotulos or "Apresentacao" in rotulos, rotulos)
desabilitado = js("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.trim().startsWith('Apresenta')); const el = l && document.getElementById(l.htmlFor); return el ? el.disabled || el.getAttribute('data-disabled') !== null : null; })()")
confere("desabilitado enquanto o produto e qualquer", desabilitado is True, desabilitado)

passo("2. Escolhendo o produto, a lista de apresentacoes abre")
# escolhe o primeiro produto da lista abrindo o seletor (o campo fica abaixo da dobra do painel)
js("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.trim().startsWith('Apresenta')); const el = l && document.getElementById(l.htmlFor); if (el) el.scrollIntoView({block: 'center'}); return true; })()")
time.sleep(1)
xy = _centro("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.trim().startsWith('Produto vendido')); return l && document.getElementById(l.htmlFor); })()")
click_at_xy(xy[0], xy[1])
time.sleep(1)
opcoes = js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.trim())") or []
confere("ha produto para escolher", len(opcoes) > 1, opcoes)
xy = _centro("Array.from(document.querySelectorAll('[role=option]'))[1]")
click_at_xy(xy[0], xy[1])
time.sleep(1)
habilitado = js("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.trim().startsWith('Apresenta')); const el = l && document.getElementById(l.htmlFor); return el ? !(el.disabled || el.getAttribute('data-disabled') !== null) : null; })()")
confere("Apresentacao habilitada depois do produto", habilitado is True, habilitado)
xy = _centro("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.trim().startsWith('Apresenta')); return l && document.getElementById(l.htmlFor); })()")
click_at_xy(xy[0], xy[1])
time.sleep(1)
aps = js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.trim())") or []
confere("lista traz apresentacoes alem de Qualquer", len(aps) > 1, aps)
press_key("Escape")
time.sleep(1)

passo("2. Produto sem apresentacao cadastrada: campo travado com o aviso")
# Como o BRAQUIARAO /PONTOS da Agromax (10/11/2026): a lista so teria "Qualquer" e parecia defeito.
xy = _centro("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.trim().startsWith('Produto vendido')); return l && document.getElementById(l.htmlFor); })()")
click_at_xy(xy[0], xy[1])
time.sleep(1)
opcoes = js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.trim())") or []
confere("o produto sem apresentacao esta na lista", any("Palha sem apresenta" in o for o in opcoes), opcoes)
xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.includes('Palha sem apresenta'))")
click_at_xy(xy[0], xy[1])
time.sleep(1)
travado = js("(() => { const l = Array.from(document.querySelectorAll('[role=dialog] label')).find(x => x.innerText.trim().startsWith('Apresenta')); const el = l && document.getElementById(l.htmlFor); return el ? el.disabled || el.getAttribute('data-disabled') !== null : null; })()")
confere("Apresentacao travada para produto sem apresentacao", travado is True, travado)
texto = js("(document.querySelector('[role=dialog]') || { innerText: '' }).innerText") or ""
confere("aviso de produto sem apresentacoes", "não tem apresentações cadastradas" in texto, texto[-400:])
fim()
