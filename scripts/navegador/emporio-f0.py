# Validacao viva da F0 do Meu Empório (Modulo 39, docs/specs/module-39-meu-emporio.md).
# Aprovado nos seis passos em 27/10/2026, e foi este roteiro que achou a sidebar
# ignorando o show do link de topo e o Painel rotulando emporio como Prestador.
#
# cenario: scripts/_cenario-emporio-f0.ts
# sessao: owner owner@damata.com.br
# sessao: so so-emporio@teste.local
# sessao-plataforma: plat

DETALHE = "/plataforma/tenants/" + tenant("owner")


def cartao():
    return (js("(() => { const h = Array.from(document.querySelectorAll('h2')).find(x => x.innerText.includes('Recursos em teste')); return h ? h.parentElement.innerText : 'SEM CARTAO'; })()") or "").replace("\n", " | ")


passo("0. Ponto de partida: recurso desligado na conta do seed")
entrar("plat")
ir(DETALHE)
if "Ligado" in cartao():
    clicar("Desligar")
    time.sleep(1)
    clicar("Sim, desligar")
    time.sleep(8)
confere("cartao mostra Desligado", "Desligado" in cartao(), cartao()[:80])

passo("1. Desligado: sem menu, pagina e API em 404")
entrar("owner")
ir("/meu-dia")
confere("menu sem Meu Empório", "/emporio" not in menu())
confere("API 404", status_api("/api/v1/emporio") == 404)
ir("/emporio")
confere("pagina 404", eh_404())

passo("2. Ligar só para o Owner, pelo cartão da Plataforma")
entrar("plat")
ir(DETALHE)
clicar("Ligar")
time.sleep(1)
marcar("Só estes usuários")
time.sleep(0.5)
marcar("owner@damata.com.br", False)
enviar_formulario()
time.sleep(1.5)
confere("lista vazia recusada embaixo da lista", "Marque ao menos um usuário" in cartao())
marcar("owner@damata.com.br")
time.sleep(0.5)
enviar_formulario()
time.sleep(8)
confere("cartao: Ligado só para o Owner", "Ligado só para: Owner Da Mata" in cartao(), cartao()[:80])

passo("3. Owner com o recurso: menu, pagina e API")
entrar("owner")
ir("/meu-dia")
confere("menu com Meu Empório", "/emporio" in menu())
confere("API 200", status_api("/api/v1/emporio") == 200)
ir("/emporio")
confere("pagina abre", not eh_404() and "Meu Empório" in texto_principal(), texto_principal(80))

passo("4. Estoque da fazenda continua abrindo")
ir("/estoque")
confere("estoque abre", not eh_404() and "Estoque" in texto_principal(), texto_principal(80))

passo("5. Desligar volta ao 404, religar preserva a lista")
entrar("plat")
ir(DETALHE)
clicar("Desligar")
time.sleep(1)
clicar("Sim, desligar")
time.sleep(8)
confere("cartao: Desligado", "Desligado" in cartao())
entrar("owner")
ir("/meu-dia")
confere("menu sem Meu Empório", "/emporio" not in menu())
confere("API 404", status_api("/api/v1/emporio") == 404)
entrar("plat")
ir(DETALHE)
clicar("Ligar")
time.sleep(1)
confere("religar já traz o Owner marcado", marcar("owner@damata.com.br") is True)
enviar_formulario()
time.sleep(8)
confere("cartao: Ligado só para o Owner", "Ligado só para: Owner Da Mata" in cartao())

passo("6. Conta só de Empório")
entrar("so")
ir("/meu-dia")
abrir_grupo("Opera")
links = menu()
for href in ["/emporio", "/contatos", "/lista-de-compra", "/financeiro"]:
    confere("menu tem " + href, href in links)
for href in ["/minha-fazenda", "/rebanho", "/estoque"]:
    confere("menu sem " + href, href not in links)
for p in ["/meu-dia", "/dashboard", "/emporio", "/contatos", "/lista-de-compra", "/financeiro"]:
    destino = ir(p)
    confere("abre " + p, destino == p and not eh_404(), destino)
for p in ["/estoque", "/minha-fazenda", "/rebanho"]:
    confere(p + " leva ao Painel", ir(p) == "/dashboard")
ir("/dashboard")
confere("Painel rotula o perfil como Empório", "Perfis ativos: Empório" in texto_principal(300))
