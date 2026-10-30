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
    esperar(lambda: "Desligado" in cartao())
confere("cartao mostra Desligado", "Desligado" in cartao(), cartao()[:80])

passo("1. Desligado: sem menu, pagina e API em 404")
entrar("owner")
ir("/meu-dia")
confere("menu sem Meu Empório", "/emporio" not in menu())
confere("API 404", status_api("/api/v1/emporio") == 404)
ir("/emporio")
confere("pagina 404", eh_404())

# Desde a F6b (Q119), quem vê o Empório sai da Equipe da conta, e não de uma
# lista escolhida aqui: o cartão só liga e desliga, e mostra a Equipe.
passo("2. Ligar pelo cartão da Plataforma")
entrar("plat")
ir(DETALHE)
clicar("Ligar")
time.sleep(1)
confere("o Empório não oferece lista de usuários", "Só estes usuários" not in cartao(), cartao()[:200])
enviar_formulario()
esperar(lambda: "Ligado para o Dono e a Equipe" in cartao())
confere("cartao: Ligado para o Dono e a Equipe", "Ligado para o Dono e a Equipe" in cartao(), cartao()[:80])
confere("cartao mostra quem vê pela Equipe", "definido pela Equipe" in cartao() and "Dono" in cartao(), cartao()[:200])

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

passo("5. Desligar volta ao 404, religar devolve o acesso")
entrar("plat")
ir(DETALHE)
clicar("Desligar")
time.sleep(1)
clicar("Sim, desligar")
esperar(lambda: "Desligado" in cartao())
confere("cartao: Desligado", "Desligado" in cartao())
entrar("owner")
ir("/meu-dia")
confere("menu sem Meu Empório", "/emporio" not in menu())
confere("API 404", status_api("/api/v1/emporio") == 404)
entrar("plat")
ir(DETALHE)
clicar("Ligar")
time.sleep(1)
enviar_formulario()
esperar(lambda: "Ligado para o Dono e a Equipe" in cartao())
confere("cartao: Ligado de novo", "Ligado para o Dono e a Equipe" in cartao())
entrar("owner")
ir("/meu-dia")
confere("religado, o Owner volta a ter o menu", "/emporio" in menu())

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
