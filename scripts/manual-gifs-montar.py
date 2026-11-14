"""Monta os GIFs do manual do Meu Emporio a partir dos quadros que o roteiro
`scripts/navegador/manual-gifs.py` grava em .cache/manual-gifs/<id>/01.png ...

Para cada id: redimensiona para 960 px de largura, monta o GIF (1800 ms por quadro, 3500 ms no
ultimo, laco infinito, paleta adaptativa de ate 128 cores, optimize) e salva
public/manual/emporio/<id>.gif e <id>.png (o ultimo quadro, para quem prefere movimento reduzido).
Cada GIF deve ficar em ate 800 KB: passando, reduz as cores e depois a largura (900).

Uso: python scripts/manual-gifs-montar.py [id ...]   (sem argumento, todos os ids da pasta)
Precisa do Pillow.
"""
import os
import sys

from PIL import Image

RAIZ = os.getcwd()
QUADROS = os.path.join(RAIZ, ".cache", "manual-gifs")
SAIDA = os.path.join(RAIZ, "public", "manual", "emporio")
LIMITE_KB = 800
TENTATIVAS = [(960, 128), (960, 96), (960, 64), (900, 128), (900, 96), (900, 64), (900, 48)]


def carregar(pasta):
    arquivos = sorted(f for f in os.listdir(pasta) if f.lower().endswith(".png"))
    return [Image.open(os.path.join(pasta, f)).convert("RGB") for f in arquivos]


def redimensionar(img, largura):
    altura = round(img.height * largura / img.width)
    return img.resize((largura, altura), Image.LANCZOS)


def paleta_global(quadros, cores):
    """Uma paleta so para todos os quadros: o GIF fica menor e as cores nao pulam entre um quadro e outro."""
    largura, altura = quadros[0].size
    faixa = Image.new("RGB", (largura, altura * len(quadros)))
    for i, q in enumerate(quadros):
        faixa.paste(q, (0, altura * i))
    return faixa.quantize(colors=cores, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def gravar_gif(quadros, destino, cores):
    base = paleta_global(quadros, cores)
    pq = [q.quantize(palette=base, dither=Image.Dither.NONE) for q in quadros]
    duracoes = [1800] * (len(pq) - 1) + [3500]
    pq[0].save(destino, save_all=True, append_images=pq[1:], duration=duracoes, loop=0, optimize=True, disposal=1)


def montar(aid):
    pasta = os.path.join(QUADROS, aid)
    originais = carregar(pasta)
    if not originais:
        print(aid + ": sem quadros em " + pasta)
        return False
    tamanhos = {q.size for q in originais}
    if len(tamanhos) != 1:
        print(aid + ": os quadros tem tamanhos diferentes: " + str(tamanhos))
        return False
    destino = os.path.join(SAIDA, aid + ".gif")
    os.makedirs(SAIDA, exist_ok=True)
    for largura, cores in TENTATIVAS:
        quadros = [redimensionar(q, largura) for q in originais]
        gravar_gif(quadros, destino, cores)
        kb = os.path.getsize(destino) / 1024
        if kb <= LIMITE_KB:
            break
    redimensionar(originais[-1], largura).save(os.path.join(SAIDA, aid + ".png"), optimize=True)
    print("%-28s %2d quadros  %4d x %-4d  %3d cores  GIF %4.0f KB  PNG %4.0f KB%s" % (
        aid, len(quadros), quadros[0].width, quadros[0].height, cores, kb,
        os.path.getsize(os.path.join(SAIDA, aid + ".png")) / 1024,
        "" if kb <= LIMITE_KB else "   ACIMA DE %d KB" % LIMITE_KB))
    return kb <= LIMITE_KB


def main():
    ids = sys.argv[1:] or sorted(d for d in os.listdir(QUADROS) if os.path.isdir(os.path.join(QUADROS, d)))
    ok = [montar(i) for i in ids]
    sys.exit(0 if all(ok) else 1)


main()
