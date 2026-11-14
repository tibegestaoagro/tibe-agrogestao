# As animacoes do manual do Meu Emporio aparecem nas partes certas (manual de 13/11):
# cada parte abre, cada GIF esperado esta na pagina, carregou (largura natural > 0) e tem a
# imagem parada para movimento reduzido (<source> com o .png). Os GIFs saem do roteiro
# manual-gifs (scripts/navegador/manual-gifs.py) e do montador scripts/manual-gifs-montar.py.
#
# sessao: owner owner@example.com
import json

PARTES = {
    "produtos": ["produto-fracao-gramas", "produto-converter-quilo"],
    "estoque": ["estoque-atacado-mesma-saca"],
    "vender": ["balcao-conta-pix", "balcao-credito-franqueado"],
    "caixa": ["conta-pix-cadastrar"],
    "franqueados": ["franqueado-cadastrar", "balcao-credito-franqueado", "franqueado-pagar"],
}

entrar("owner")
for parte, ids in PARTES.items():
    passo("Manual, parte " + parte)
    ir("/manual/emporio/" + parte)
    confere("a parte " + parte + " abre", not eh_404(), texto_principal(160))
    for id_ in ids:
        def carregou(i=id_):
            r = js(
                "(() => { const im = Array.from(document.images).find(x => (x.currentSrc || x.src).endsWith('/manual/emporio/"
                + i
                + ".gif')); if (!im) return null; im.scrollIntoView(); return { ok: im.complete && im.naturalWidth > 0, w: im.naturalWidth }; })()"
            )
            return r if r and r.get("ok") else None
        r = esperar(carregou, 30)
        confere(parte + ": o GIF " + id_ + " aparece e carregou", bool(r), json.dumps(r))
        fonte = js(
            "(() => !!Array.from(document.querySelectorAll('picture source')).find(s => (s.getAttribute('srcset') || '').endsWith('/manual/emporio/"
            + id_
            + ".png') && (s.getAttribute('media') || '').includes('reduce')))()"
        )
        confere(parte + ": " + id_ + " tem a imagem parada para movimento reduzido", fonte is True, str(fonte))
    confere(parte + ": nenhuma animação em preparação", "Animação em preparação" not in texto_principal(20000), "")

fim()
