# Os prints do manual do Meu Empório (Q138): 42 figuras, em computador (1280 px)
# e em celular (390 px, escala 2), com as marcações numeradas desenhadas sobre a
# própria tela. Sai em public/manual/emporio/<id>.png e <id>-celular.png.
# docs/specs/module-39-meu-emporio.md, "Cenário de demonstração e manual (Q137, Q138)".
#
# A lista de figuras, com as marcas, vive em
# src/app/(dashboard)/manual/_conteudo/figuras.ts. Este roteiro acha cada
# elemento pelo texto que está na tela: se um alvo não é achado, a figura
# reprova, porque o texto do manual não bate com a tela.
#
# Precisa do cenário de demonstração montado na conta do seed:
#   npm run cenario:emporio-demo -- --conta <id do tenant> --confirmar
# (com a URL do Docker inline, ver CLAUDE.md). Nada aqui grava dado que mude o
# cenário, exceto o preparo da seção 0 (o que o cenário não traz e as figuras
# exigem: uma compra pendente, um mínimo de estoque, uma transferência em
# trânsito para a Loja Centro, o Caixa 2 fechado na Rodovia, um logo e um
# orçamento com aviso na Rodovia) e o orçamento salvo de 'orcamento-salvo'.
# Toda escrita tem chave fixa ou confere antes: rodar de novo não duplica.
# Filtre com FIGURAS=id1,id2 e veja o texto da tela com DUMP=1. No fim, o
# roteiro confere que o guia para imprimir sai em uma folha A4 (com filtro,
# so se a lista tiver guia-a4).
#
# Os cenarios da F6b e do turno desativam a equipe da demonstracao (assentos);
# o cenario abaixo a reativa antes das sessoes. A sessao 'caixa' e a Juliana,
# Caixa da Loja da Rodovia (antes Vendedora): o Caixa nao abre estoque,
# transferencias nem a lista de orcamentos.
#
# cenario: scripts/_cenario-manual-emporio.ts
# sessao: dono owner@damata.com.br
# sessao: gestor gestor.demo.emporio@example.com
# sessao: vendedor_centro vendedor.centro.demo.emporio@example.com
# sessao: caixa vendedor.rodovia.demo.emporio@example.com
import base64
import json
import os

SAIDA = os.path.join(os.getcwd(), "public", "manual", "emporio")
FILTRO = [x for x in os.environ.get("FIGURAS", "").split(",") if x]
DUMP = os.environ.get("DUMP") == "1"
os.makedirs(SAIDA, exist_ok=True)

AJUDA_JS = r"""
(() => {
  const norm = s => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const raiz = () => document.querySelector('[role=dialog]') || document.querySelector('main') || document.body;
  const todos = (sel, r) => Array.from((r || raiz()).querySelectorAll(sel)).filter(vis);
  const M = {
    norm, vis, raiz, todos,
    B(t) { const n = norm(t); return todos('button, a, [role=button]').find(e => norm(e.innerText) === n) || null; },
    Bs(t) { const n = norm(t); return todos('button, a, [role=button]').filter(e => norm(e.innerText) === n); },
    L(t) { const n = norm(t); const l = todos('label').find(x => norm(x.innerText).replace(/\*$/, '').trim() === n); return l ? l.parentElement : null; },
    A(aria) { return todos('[aria-label]').find(e => e.getAttribute('aria-label') === aria) || null; },
    T(t) { const n = norm(t); let melhor = null; for (const e of todos('*')) { const x = norm(e.innerText); if (x.startsWith(n) && (!melhor || x.length < norm(melhor.innerText).length)) melhor = e; } return melhor; },
    // o menor elemento que CONTEM o texto (quando o comeco muda com o dado)
    C(t) { const n = norm(t); let melhor = null; for (const e of todos('*')) { const x = norm(e.innerText); if (x.includes(n) && (!melhor || x.length < norm(melhor.innerText).length)) melhor = e; } return melhor; },
    S(t) { const n = norm(t); const h = todos('h1,h2,h3,h4').find(x => norm(x.innerText).startsWith(n)); return h ? (h.closest('section') || h.closest('div.rounded-lg') || h.parentElement) : null; },
    H(t) { const n = norm(t); return todos('h1,h2,h3,h4,legend').find(x => norm(x.innerText).startsWith(n)) || null; },
    TH(t) { const n = norm(t); return todos('th').find(x => norm(x.innerText).startsWith(n)) || null; },
    TR(t) { const n = norm(t); return todos('tr').find(x => norm(x.innerText).includes(n)) || null; },
    // o rotulo e o controle de uma linha de checkbox
    CK(t) { const n = norm(t); return todos('label').find(x => norm(x.innerText).includes(n) && x.querySelector('input[type=checkbox]')) || null; },
    trazer(els) {
      const a = [].concat(els || []).filter(Boolean); if (!a.length) return;
      const e = a[a.length - 1]; let p = e.parentElement;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (p.scrollWidth > p.clientWidth + 2 && (ox === 'auto' || ox === 'scroll')) {
          const r = e.getBoundingClientRect(); const pr = p.getBoundingClientRect();
          if (r.right > pr.right - 8) p.scrollLeft += r.right - pr.right + 16;
          break;
        }
        p = p.parentElement;
      }
    },
    // texto exato, de um elemento sem filhos (selos e valores)
    X(t) { const n = norm(t); return todos('*').find(e => e.children.length === 0 && norm(e.innerText) === n) || null; },
    // a linha da tabela com o texto (a primeira celula, se a linha nao cabe na tela)
    LIN(t) { const tr = M.TR(t); if (!tr) return null; return tr.getBoundingClientRect().right > innerWidth ? tr.querySelector('td') : tr; },
    // a linha de valor do Resultado (Linha de resultado-mes)
    LN(t) { const e = M.T(t); return e ? e.closest('div[class*="py-2"]') : null; },
    R(els) {
      const a = [].concat(els || []).flat(Infinity).filter(Boolean);
      if (!a.length) return null;
      let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
      for (const e of a) { const r = e.getBoundingClientRect(); x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top); x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom); }
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, vw: innerWidth, vh: innerHeight };
    },
  };
  window.__m = M;
  return true;
})()
"""

CSS_LIMPEZA = """
nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], [data-next-badge-root], #__next-build-watcher { display: none !important; }
::-webkit-scrollbar { display: none !important; }
html { scrollbar-width: none !important; }
"""


def inicializar_pagina():
    js(AJUDA_JS)
    js("(() => { const s = document.createElement('style'); s.textContent = " + json.dumps(CSS_LIMPEZA) + "; document.head.appendChild(s); })()")


def ocultar_fixtures():
    """Esconde, so na captura, o que sobrou de roteiros de teste antigos na conta
    (lojas e produtos F1.., F2a.., F6b.., Orc Loja, Turno Loja, Vend Loja).
    Nao grava nada."""
    js(r"""(() => {
      const f = s => /^(f\d|orc loja|orc cliente|orc vencido|turno loja|vend loja|cli |escolha |t6 |t6r |cliente antigo|cliente balcao|empresa nova)/i.test((s || '').trim());
      document.querySelectorAll('tbody tr').forEach(tr => { const c = tr.querySelector('td'); if (c && f(c.innerText)) tr.style.display = 'none'; });
      document.querySelectorAll('main h3').forEach(h => {
        if (!f(h.innerText)) return;
        let e = h;
        while (e.parentElement && e.parentElement.tagName !== 'MAIN' && e.parentElement.querySelectorAll('h3').length === 1) e = e.parentElement;
        e.style.display = 'none';
      });
      document.querySelectorAll('main ul > li').forEach(li => { if (/(^|\s)F\d[a-z]?(\s|$)/.test(li.innerText)) li.style.display = 'none'; });
      document.querySelectorAll('[role=dialog] label').forEach(l => { if (f(l.innerText)) l.style.display = 'none'; });
      document.querySelectorAll('main a, main button').forEach(b => { if (f(b.innerText)) b.style.display = 'none'; });
      document.querySelectorAll('[data-escolha] [data-opcao]:not([data-fixo])').forEach(b => { if (f(b.dataset.nome)) b.style.display = 'none'; });
      document.querySelectorAll('main option, [role=option]').forEach(o => { if (f(o.innerText)) o.style.display = 'none'; });
    })()""")


def manter_so_o_primeiro_bloco():
    """No cartao Primeiros passos, mostra so a primeira loja (recorte da figura)."""
    js(r"""(() => {
      const hs = Array.from(document.querySelectorAll('main h3')).filter(h => h.parentElement && h.getBoundingClientRect().width > 0);
      hs.slice(1).forEach(h => { let e = h; while (e.parentElement && e.parentElement.tagName !== 'MAIN' && e.parentElement.querySelectorAll('h3').length === 1) e = e.parentElement; e.style.display = 'none'; });
    })()""")


def cartoes_sem_fixtures():
    """Os cartoes Estabelecimentos e Produtos do inicio contam as lojas e os
    produtos de roteiros de teste antigos; o print mostra a contagem do cenario."""
    import re
    fx = r"F\d|Orc Loja|Turno Loja|Vend Loja"
    lojas = [l for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"] if not re.match(fx, l["name"])]
    produtos = [p for p in api("GET", "/api/v1/emporio/products")["body"]["data"] if not re.match(fx, p["name"])]
    compras = [c for c in api("GET", "/api/v1/emporio/purchases")["body"]["data"] if c.get("status") == "pendente" and not re.match(fx, c.get("establishment_name") or "")]
    repor = [x for x in api("GET", "/api/v1/emporio/stock/restock")["body"]["data"] if not re.match(fx, x["establishment_name"]) and not re.match(fx, x["product_name"])]
    for href, n, um, varios in (
        ("/emporio/estabelecimentos", len(lojas), "estabelecimento", "estabelecimentos"),
        ("/emporio/produtos", len(produtos), "produto", "produtos"),
        ("/emporio/compras", len(compras), "compra a receber", "compras a receber"),
        ("/emporio/estoque", len(repor), "produto precisa repor", "produtos precisam repor"),
    ):
        js("(() => { const p = document.querySelector('main a[href=\"" + href + "\"] p'); if (p) p.textContent = " + json.dumps(str(n) + " " + (um if n == 1 else varios)) + "; })()")


def ajustar_inicio():
    manter_so_o_primeiro_bloco()
    cartoes_sem_fixtures()


def tabelas_sem_rolagem():
    """No celular a tabela rola para o lado; o print quebra o texto das celulas
    para a tabela caber na largura, senao as marcas ficam fora da tela."""
    js("(() => { const s = document.createElement('style'); s.textContent = 'td, th { white-space: normal !important; padding-left: 6px !important; padding-right: 6px !important; } td .flex { flex-wrap: wrap !important; } table { min-width: 0 !important; width: 100% !important; }'; document.head.appendChild(s); })()")
    # O que ainda passar da largura encolhe (zoom) em vez de rolar para o lado.
    js(r"""(() => {
      document.querySelectorAll('table').forEach(t => {
        let w = t.parentElement;
        while (w && w !== document.body && !/(auto|scroll)/.test(getComputedStyle(w).overflowX)) w = w.parentElement;
        if (!w || w === document.body) return;
        if (w.scrollWidth > w.clientWidth + 2) t.style.zoom = String(Math.max(0.5, (w.clientWidth - 2) / w.scrollWidth));
      });
    })()""")


def limitar_linhas(n, ignorar_primeira_tabela=False):
    """Recorta cada tabela da pagina em n linhas visiveis, para a figura mostrar
    a secao inteira sem uma rolagem de 40 linhas."""
    js("""(() => { document.querySelectorAll('tbody').forEach(tb => { let k = 0; Array.from(tb.querySelectorAll(':scope > tr')).forEach(tr => { if (tr.style.display === 'none') return; k++; if (k > %d) tr.style.display = 'none'; }); }); })()""" % n)


def viewport(largura, altura, escala):
    cdp("Emulation.setDeviceMetricsOverride", width=largura, height=altura, deviceScaleFactor=escala, mobile=False)
    time.sleep(1)


def achar(expr):
    # Um alvo que nao existe pode lancar no meio da expressao (null.parentElement):
    # vira marca nao achada, e a figura reprova sem derrubar o roteiro inteiro.
    return js("(() => { const M = window.__m; try { return M.R(" + expr + "); } catch (e) { return null; } })()")


def desenhar(marcas):
    js("""((marcas) => {
      const velho = document.getElementById('__marcas'); if (velho) velho.remove();
      const cor = getComputedStyle(document.documentElement).getPropertyValue('--acento-hover').trim() || '#ce6c0b';
      const claro = getComputedStyle(document.documentElement).getPropertyValue('--texto-invertido').trim() || '#ffffff';
      const c = document.createElement('div');
      c.id = '__marcas';
      c.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
      // Onde o numero cai: o canto de fora que menos cobre texto, campo, botao e
      // outro numero. O texto vem de cada no de texto, e nao so dos elementos sem
      // filhos: o texto solto de uma celula com um <span> dentro ("Sangria do
      // Caixa 1, Loja da Rodovia") ficava de fora, e o numero caia em cima dele.
      const naTela = r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      const obst = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.textContent.trim() || !n.parentElement || n.parentElement.closest('#__marcas')) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (naTela(r)) obst.push({ r, peso: 3 });
      }
      // Cobrir a borda vazia de um botao pesa menos que cobrir um valor escrito
      // ou um campo preenchido.
      document.querySelectorAll('input, textarea, select').forEach(e => { const r = e.getBoundingClientRect(); if (naTela(r)) obst.push({ r, peso: 3 }); });
      document.querySelectorAll('button, [role=combobox]').forEach(e => { const r = e.getBoundingClientRect(); if (naTela(r)) obst.push({ r, peso: 1 }); });
      const colocados = [];
      const sobra = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
      for (const m of marcas) {
        const pad = 4;
        const o = document.createElement('div');
        o.style.cssText = 'position:absolute;box-sizing:border-box;border:3px solid ' + cor + ';border-radius:10px;left:' + (m.x - pad) + 'px;top:' + (m.y - pad) + 'px;width:' + (m.w + 2 * pad) + 'px;height:' + (m.h + 2 * pad) + 'px;';
        c.appendChild(o);
        const d = 28;
        const bx = m.x - pad, by = m.y - pad, bw = m.w + 2 * pad, bh = m.h + 2 * pad;
        const candidatos = [
          [bx - d + 4, by - d + 6],
          [bx, by - d - 1],
          [bx + bw - d, by - d - 1],
          [bx - d - 2, by + bh / 2 - d / 2],
          [bx + bw + 2, by + bh / 2 - d / 2],
          [bx, by + bh + 1],
          [bx + bw - d, by + bh + 1],
        ];
        let melhor = null, pior = Infinity;
        for (const [px, py] of candidatos) {
          // Nunca abaixo do fim da janela: o numero sairia cortado na captura
          // (o 3 de 'caixa-sangria' no celular, embaixo do botao do painel).
          const cxx = Math.max(3, Math.min(innerWidth - d - 3, px)), cyy = Math.max(3, Math.min(innerHeight - d - 3, py));
          const r = { l: cxx, t: cyy, r: cxx + d, b: cyy + d };
          let custo = 0;
          for (const o of obst) custo += o.peso * sobra(r, { l: o.r.left, t: o.r.top, r: o.r.right, b: o.r.bottom });
          for (const p of colocados) custo += 1e6 * (sobra(r, p) > 0 ? 1 : 0);
          // O numero em cima da borda de OUTRA marca parece ser dela. Conta so a
          // faixa da borda: dentro de um quadro grande (a secao inteira) todo
          // canto custaria o mesmo, e o texto deixava de pesar na escolha.
          for (const q of marcas) {
            if (q === m) continue;
            const fora = { l: q.x - pad - 3, t: q.y - pad - 3, r: q.x + q.w + pad + 3, b: q.y + q.h + pad + 3 };
            const dentro = { l: q.x - pad + 6, t: q.y - pad + 6, r: q.x + q.w + pad - 6, b: q.y + q.h + pad - 6 };
            custo += 50 * (sobra(r, fora) - (dentro.r > dentro.l && dentro.b > dentro.t ? sobra(r, dentro) : 0));
          }
          if (custo < pior) { pior = custo; melhor = [cxx, cyy]; }
        }
        const cx = melhor[0], cy = melhor[1];
        colocados.push({ l: cx, t: cy, r: cx + d, b: cy + d });
        const n = document.createElement('div');
        n.textContent = String(m.numero);
        n.style.cssText = 'position:absolute;box-sizing:border-box;width:' + d + 'px;height:' + d + 'px;border-radius:50%;background:' + cor + ';color:' + claro + ';font:700 16px/' + d + 'px Inter,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff;left:' + cx + 'px;top:' + cy + 'px;';
        c.appendChild(n);
      }
      document.body.appendChild(c);
    })(""" + json.dumps(marcas) + ")")


def capturar(arquivo, recorte=None):
    if recorte:
        r = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=False, clip={"x": 0, "y": recorte[1], "width": recorte[0], "height": recorte[2], "scale": 1})
    else:
        r = cdp("Page.captureScreenshot", format="png")
    dados = base64.b64decode(r["data"])
    caminho_arquivo = os.path.join(SAIDA, arquivo)
    with open(caminho_arquivo, "wb") as f:
        f.write(dados)
    return len(dados)


def dump_tela():
    print("   TELA: " + (js("(() => { const r = document.querySelector('[role=dialog]') || document.querySelector('main') || document.body; return r.innerText.replace(/\\u00a0/g, ' ').replace(/\\n+/g, ' | ').slice(0, 1800); })()") or ""))
    print("   BOTOES: " + str(js("Array.from((document.querySelector('[role=dialog]') || document.querySelector('main') || document).querySelectorAll('button, a')).filter(e => e.getBoundingClientRect().width > 0).map(e => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\\n/g, ' ')).filter(x => x).slice(0, 40)")))
    print("   ROTULOS: " + str(js("Array.from((document.querySelector('[role=dialog]') || document).querySelectorAll('label, [aria-label]')).filter(e => e.getBoundingClientRect().width > 0).map(e => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\\n/g, ' ')).filter(x => x).slice(0, 40)")))


def id_do_produto(nome):
    r = api("GET", "/api/v1/emporio/products?q=" + nome.replace(" ", "%20"))
    for p in r["body"]["data"]:
        if p["name"] == nome:
            return p["id"]
    return None


def id_da_loja(nome):
    for l in api("GET", "/api/v1/emporio/establishments")["body"]["data"]:
        if l["name"] == nome:
            return l["id"]
    return None


def id_da_venda_com_cliente():
    """Uma venda concluida, com cliente, que nao nasceu de troca (a venda da troca
    nao tem Cancelar venda). De preferencia registrada pelo Caixa em nome de
    outro vendedor, para a tela mostrar 'Registrada por'."""
    r = api("GET", "/api/v1/emporio/sales")
    boas = [v for v in r["body"]["data"] if v.get("status") == "concluida" and v.get("customer_id") and not v.get("exchange_return_id") and not v.get("quote") and all(not i.get("returned_qty") for i in v.get("items", []))]
    pelo_caixa = [v for v in boas if v.get("sold_by_user_id") != v.get("seller_user_id")]
    escolhida = (pelo_caixa or boas or r["body"]["data"])[0]
    return escolhida["id"]


def tem_na_tela(texto):
    return texto.lower() in (js("(document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' ')") or "").lower()


def preencher_aria(aria, valor):
    """Preenche o campo pelo aria-label (o MoneyInput e a quantidade nao tem <label> proprio)."""
    sel = '[aria-label="' + aria + '"]'
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const el = raiz.querySelector(" + json.dumps(sel) + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + json.dumps(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def preencher_ph(prefixo, valor):
    """Preenche o campo pelo placeholder (a busca do balcao)."""
    return js("(() => { const el = Array.from(document.querySelectorAll('input')).find(i => (i.placeholder || '').startsWith(" + json.dumps(prefixo) + ")); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + json.dumps(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def escolher_aria(aria, opcao):
    """Abre o Select (Radix) pelo aria-label do gatilho e escolhe a opcao."""
    sel = '[aria-label="' + aria + '"]'
    xy = _centro("(document.querySelector('[role=dialog]') || document).querySelector(" + json.dumps(sel) + ")")
    if not xy:
        return "SEM CAMPO"
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => o.innerText.trim().startsWith(" + json.dumps(opcao) + "))")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def clicar_no_texto(trecho, seletor="button"):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll(" + json.dumps(seletor) + ")).filter(e => e.getBoundingClientRect().width > 0).find(x => x.innerText.replace(/\\u00a0/g, ' ').includes(" + json.dumps(trecho) + ")); if (!b) return false; b.click(); return true; })()"))


def clicar_na_linha(texto_da_linha, rotulo):
    return bool(js("(() => { const tr = Array.from(document.querySelectorAll('tbody tr')).find(x => x.innerText.includes(" + json.dumps(texto_da_linha) + ") && x.style.display !== 'none'); if (!tr) return false; const b = Array.from(tr.querySelectorAll('button, a')).find(x => x.innerText.trim() === " + json.dumps(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def fechar_painel():
    cdp("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    cdp("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    time.sleep(0.8)


# ---------------------------------------------------------------------------
# 0. Preparo: o que o cenario nao traz e as figuras exigem.
# ---------------------------------------------------------------------------

def preparar():
    passo("0. Preparo: uma compra pendente e um minimo de estoque")
    entrar("gestor")
    ir("/emporio")
    # Os convites de instalar o app e de ligar avisos cobrem o rodape de toda
    # figura num perfil de Chrome novo. Dispensados como a pessoa faria (a
    # escolha mora no localStorage), e a pagina relida sem eles.
    js("localStorage.setItem('tibe.pwa.convite-dispensado', '1'); localStorage.setItem('tibe.push.convite-dispensado', '1')")
    ir("/emporio")
    esperar(lambda: api("GET", "/api/v1/emporio/purchases")["status"] == 200, 90)
    lojas = api("GET", "/api/v1/emporio/establishments")["body"]["data"]
    centro = next(l for l in lojas if l["name"] == "Loja Centro")
    compras = api("GET", "/api/v1/emporio/purchases")["body"]["data"]
    print("   compras pendentes hoje: " + str([(c.get("establishment_name"), c["items"][0].get("product_name") if c.get("items") else None) for c in compras if c.get("status") == "pendente"]))
    if not any(c.get("status") == "pendente" for c in compras):
        milho = api("GET", "/api/v1/emporio/products/" + id_do_produto("Milho em Grão"))["body"]["data"]
        apr = next(a for a in milho["presentations"] if not a.get("archived_at"))
        r = api("POST", "/api/v1/emporio/purchases", {
            "operation_key": "manual-emporio-compra-pendente",
            "establishment_id": centro["id"],
            "purchased_at": time.strftime("%Y-%m-%d"),
            "received": False,
            "freight": 0,
            "items": [{"emporio_product_id": milho["id"], "presentation_id": apr["id"], "quantity": 20, "item_total": 1200}],
            "payment": {"kind": "a_prazo", "due_date": "2026-11-15"},
        })
        print("   compra pendente: " + str(r["status"]) + " " + json.dumps(r["body"], ensure_ascii=False)[:300])
    # Dois produtos abaixo do minimo na Loja Centro, para a lista Precisa repor.
    # So grava se ainda nao esta assim: cada gravacao vira uma linha no Historico.
    repor = api("GET", "/api/v1/emporio/stock/restock?establishment_id=" + centro["id"])["body"]["data"]
    ja = {x["product_name"] for x in repor}
    for nome, minimo, maximo in (("Arame Liso Galvanizado 1000 m", 8, 20), ("Carrapaticida Pour-on 1 L", 10, 24)):
        if nome in ja:
            print("   limites de " + nome + ": ja estavam")
            continue
        r = api("PUT", "/api/v1/emporio/stock/limits", {"establishment_id": centro["id"], "emporio_product_id": id_do_produto(nome), "min_qty": minimo, "max_qty": maximo})
        print("   limites de " + nome + ": " + str(r["status"]))
    rodovia = next(l for l in lojas if l["name"] == "Loja da Rodovia")
    # Uma transferencia em transito PARA a Loja Centro: o Vendedor dela recebe
    # ('transferencia-receber'). A do cenario vai para a Rodovia, onde so o
    # Caixa e o Gestor trabalham, e o Caixa nao recebe transferencia.
    r = api("POST", "/api/v1/emporio/transfers", {
        "operation_key": "manual-emporio-transferencia-centro",
        "origin_establishment_id": rodovia["id"],
        "destination_establishment_id": centro["id"],
        "items": [
            {"emporio_product_id": id_do_produto("Ferradura nº 4"), "quantity": 6},
            {"emporio_product_id": id_do_produto("Carrapaticida Pour-on 1 L"), "quantity": 4},
        ],
        "notes": None,
    })
    print("   transferencia para a Centro: " + str(r["status"]) + " " + str((r["body"] or {}).get("data", {}).get("status", (r["body"] or {}).get("error"))))
    # O Caixa 2 da Rodovia, fechado: o Caixa abre o painel Abrir ('caixa-abrir').
    caixas = api("GET", "/api/v1/emporio/cash/registers?establishment_id=" + rodovia["id"])["body"]["data"]
    if len(caixas) < 2:
        r = api("POST", "/api/v1/emporio/cash/registers", {"establishment_id": rodovia["id"]})
        print("   Caixa 2 da Rodovia: " + str(r["status"]))
    else:
        print("   caixas da Rodovia: " + str([c["nome"] for c in caixas]))
    # O orcamento da Rodovia com aviso na faixa ('orcamento-faturar').
    global NUMERO_ORCAMENTO_FATURAR
    NUMERO_ORCAMENTO_FATURAR = orcamento_com_aviso(rodovia)
    print("   orcamento para faturar: " + str(NUMERO_ORCAMENTO_FATURAR))
    # O logo da conta: o papel A4 e Configuracoes mostram onde ele aparece.
    entrar("dono")
    ir("/emporio")
    cfg = api("GET", "/api/v1/emporio/settings")["body"]["data"]
    if not cfg.get("has_logo"):
        r = api("PUT", "/api/v1/emporio/settings/logo", {"data_base64": base64.b64encode(logo_png()).decode(), "mime": "image/png"})
        print("   logo: " + str(r["status"]))
    else:
        print("   logo: ja estava")


def logo_png(lado=160):
    """Um logo fictício (folha branca num círculo verde), gerado aqui: nada de
    marca de verdade no repositório público."""
    import math
    import struct
    import zlib
    c = lado / 2
    linhas = []
    for y in range(lado):
        px = bytearray([0])
        for x in range(lado):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            if dx * dx + dy * dy > (c - 2) ** 2:
                px += bytes((0, 0, 0, 0))
                continue
            # a folha: elipse girada 45 graus, com a nervura no meio
            u = (dx + dy) / math.sqrt(2)
            v = (dx - dy) / math.sqrt(2)
            folha = (u / (c * 0.62)) ** 2 + (v / (c * 0.3)) ** 2 <= 1
            nervura = abs(v) < lado * 0.012 and abs(u) < c * 0.55
            px += bytes((255, 255, 255, 255)) if folha and not nervura else bytes((47, 107, 58, 255))
        linhas.append(bytes(px))

    def bloco(tipo, dados):
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", lado, lado, 8, 6, 0, 0, 0)) + bloco(b"IDAT", zlib.compress(b"".join(linhas), 9)) + bloco(b"IEND", b"")


NUMERO_ORCAMENTO_FATURAR = None


def orcamento_com_aviso(rodovia):
    """O numero do orcamento aberto da Rodovia que o Caixa fatura. Feito pelo
    roteiro (chave fixa), com mais do que a loja tem de um produto: a faixa
    sempre mostra 'Falta estoque', em qualquer mes. Vencido, mostra tambem
    'Orcamento vencido'."""
    do_cenario = [o for o in api("GET", "/api/v1/emporio/quotes?situacao=todos&q=Haras")["body"]["data"] if o["loja"] == "Loja da Rodovia"]
    if not do_cenario:
        print("   nenhum orcamento do Haras Santa Clara na Rodovia: rode o cenario de demonstracao")
        return None
    contato = api("GET", "/api/v1/emporio/quotes/" + do_cenario[-1]["id"])["body"]["data"]["customer"]["id"]
    ferradura = api("GET", "/api/v1/emporio/products/" + id_do_produto("Ferradura nº 4"))["body"]["data"]
    apr = next(a for a in ferradura["presentations"] if not a.get("archived_at"))
    saldo = api("GET", "/api/v1/emporio/products/" + ferradura["id"] + "/stock")["body"]["data"]
    na_loja = next((s["total_qty"] for s in saldo["stores"] if s["establishment_id"] == rodovia["id"]), 0)
    # A chave fixa faz o POST repetido devolver o MESMO orcamento: a quantidade
    # so vale na primeira vez, e o saldo da loja so cai depois disso.
    r = api("POST", "/api/v1/emporio/quotes", {
        "operation_key": "manual-emporio-orcamento-faturar",
        "establishment_id": rodovia["id"],
        "customer_id": contato,
        "items": [{"emporio_product_id": ferradura["id"], "presentation_id": apr["id"], "quantity": int(na_loja) + 40}],
        "notes": "Ferraduras para a tropa inteira.",
    })
    if r["status"] not in (200, 201):
        print("   orcamento para faturar: " + str(r["status"]) + " " + json.dumps(r["body"], ensure_ascii=False)[:300])
        return None
    return r["body"]["data"]["numero"]


# ---------------------------------------------------------------------------
# As figuras: o estado da tela, e as marcas (numero, expressao, alvo).
# ---------------------------------------------------------------------------
F = {}


def figura(id, papel, pagina, marcas, estado=None, rolar=None, hd=800, hc=900, limite=None, antes=None, depois=None, lc=390):
    """lc: a largura do celular. 390 em quase todas; a folha A4 pede mais."""
    F[id] = dict(id=id, papel=papel, pagina=pagina, marcas=marcas, estado=estado, rolar=rolar, hd=hd, hc=hc, limite=limite, antes=antes, depois=depois, lc=lc)


figura("inicio-primeiros-passos", "dono", "/emporio", [
    (1, "M.S('Primeiros passos')", "o cartao Primeiros passos"),
    (2, "M.X('Pendente')", "a marca Pendente de um item"),
    (3, "Array.from(M.T('Estabelecimentos').closest('a').parentElement.children).slice(0, 4)", "os cartoes das areas (Estabelecimentos, Produtos, Estoque e outros)"),
], antes=ajustar_inicio, hd=1050, hc=1500)

figura("equipe-lista", "dono", "/emporio/equipe", [
    (1, "M.B('Cadastrar pessoa')", "o botao Cadastrar pessoa"),
    (2, "M.TH('Função')", "a coluna Função na lista"),
    (3, "M.TH('Lojas')", "a coluna das lojas"),
    # O numero muda com a equipe: acha pelo fim da frase. Desde a Q190 a
    # equipe tem 50 vagas proprias, e o Cadastrar nao depende mais de liberar
    # assento do plano antes da captura.
    (4, "M.C('na equipe do Empório')", "o aviso de quantas pessoas estao na equipe"),
], hd=800, hc=740)


def estado_equipe_cadastrar():
    clicar("Cadastrar pessoa")
    time.sleep(1.5)
    preencher("Nome", "Paulo Ferreira")
    preencher("Email", "paulo.ferreira@example.com")
    escolher("Função", "Vendedor")
    marcar("Loja Centro")


figura("equipe-cadastrar", "dono", "/emporio/equipe", [
    (1, "M.L('Função')", "o campo Função"),
    (2, "M.T('Lojas').parentElement", "a lista de lojas"),
    (3, "M.T('Chaves').parentElement", "as chaves de permissão"),
    (4, "document.querySelector('[role=dialog] button[type=submit]')", "o botao Cadastrar"),
], estado=estado_equipe_cadastrar, hd=1000, hc=1400)


def estado_equipe_caixa():
    clicar("Cadastrar pessoa")
    time.sleep(1.5)
    preencher("Nome", "Carla Mendes")
    preencher("Email", "carla.mendes@example.com")
    escolher("Função", "Caixa")
    marcar("Loja da Rodovia")


figura("equipe-caixa", "dono", "/emporio/equipe", [
    (1, "M.L('Função')", "o campo Funcao, com Caixa escolhido"),
    (2, "M.T('Lojas').parentElement", "o campo Lojas"),
    (3, "document.querySelector('[role=dialog] button[type=submit]')", "o botao Cadastrar"),
], estado=estado_equipe_caixa, hd=900, hc=1200)

figura("estabelecimentos-lista", "dono", "/emporio/estabelecimentos", [
    (1, "M.B('Novo estabelecimento')", "o botao Novo estabelecimento"),
    (2, "M.TR('Loja Centro').querySelector('td')", "o nome de uma loja"),
    (3, "Array.from(M.TR('Loja Centro').querySelectorAll('button')).find(b => b.innerText.trim() === 'Quem trabalha aqui')", "o botao Quem trabalha aqui"),
], hd=700, hc=900)

SECAO_IMPRESSAO = "M.H('Impressão e orçamento').closest('section')"
figura("configuracoes-impressao", "dono", "/emporio/configuracoes", [
    (1, SECAO_IMPRESSAO + ".querySelector('dl')", "a secao Impressao e orcamento, com a validade, a bobina e os rodapes"),
    (2, "Array.from(" + SECAO_IMPRESSAO + ".querySelectorAll('button')).find(b => b.innerText.trim() === 'Editar')", "o botao Editar da secao"),
    (3, "M.H('Logo').parentElement", "o logo e o botao Trocar logo"),
], hd=760, hc=1250)

CARTAO_RODOVIA = "M.H('Loja da Rodovia').closest('article')"
figura("configuracoes-loja", "dono", "/emporio/configuracoes", [
    (1, CARTAO_RODOVIA + ".querySelector('dl')", "o cartao da loja, com CNPJ, Endereco, Telefone e WhatsApp"),
    (2, "Array.from(" + CARTAO_RODOVIA + ".querySelectorAll('button')).find(b => b.innerText.trim() === 'Editar')", "o botao Editar do cartao"),
    (3, CARTAO_RODOVIA + ".querySelector('ul')", "a lista Caixas"),
    (4, "Array.from(" + CARTAO_RODOVIA + ".querySelectorAll('button')).find(b => b.innerText.trim() === 'Novo caixa')", "o botao Novo caixa"),
], rolar="M.H('Loja da Rodovia')", hd=520, hc=760)


def estado_produto_novo():
    clicar("Novo produto")
    time.sleep(1.5)
    preencher("Nome", "Ração Postura Premium")
    escolher("Categoria", "Alimentação animal")
    escolher("Unidade-base", "Saca")
    preencher("Quanto pesa ou quanto cabe em uma saca", "25")
    clicar("Mais dados")
    time.sleep(0.8)
    preencher("Marca", "Safra Cheia")
    preencher("Código interno", "RP-0025")
    time.sleep(0.5)


figura("produto-novo", "gestor", "/emporio/produtos", [
    (1, "M.L('Nome')", "o campo Nome"),
    (2, "M.L('Unidade-base')", "o campo Unidade-base"),
    (3, "M.L('Quanto pesa ou quanto cabe em uma saca')", "o campo de conteudo da saca"),
    (4, "[M.L('Marca'), M.L('Código interno'), M.L('Espécie')]", "Marca, Codigo interno e Especie"),
], estado=estado_produto_novo, hd=1100, hc=1500)

figura("produto-apresentacoes", "gestor", lambda: "/emporio/produtos/" + id_do_produto("Milho em Grão"), [
    (1, "M.S('Apresentações')", "a secao Apresentacoes"),
    (2, "M.LIN('Saca 50 kg')", "a apresentacao da saca fechada"),
    (3, "M.LIN('Quilo')", "a apresentacao a granel (1 kg)"),
    (4, "M.B('Nova apresentação')", "o botao Nova apresentação"),
], rolar="M.H('Apresentações')", hd=400, hc=520)

# O Custo e o Sugerido saem do custo de referencia do produto, que o cenario de
# demonstracao grava em todos. Sem ele, a coluna Custo diria "sem custo".
def custo_preenchido():
    confere("produto-preco-por-loja: a coluna Custo tem valor (o cenario grava o custo de referencia)", not tem_na_tela("sem custo"))


figura("produto-preco-por-loja", "gestor", lambda: "/emporio/produtos/" + id_do_produto("Ração Bovinos Engorda"), [
    (1, "M.S('Preço por loja')", "a secao Preço por loja"),
    (2, "M.TH('Sugerido')", "a coluna Sugerido"),
    (3, "M.TH('Preço')", "a coluna Preço"),
], rolar="M.H('Preço por loja')", limite=6, antes=custo_preenchido, hd=400, hc=500)

def estado_compra_nova():
    clicar("Nova compra")
    time.sleep(1.5)
    escolher("Loja", "Loja Centro")
    escolher_fornecedor("Agropecuária Central")
    escolher_aria("Produto do item 1", "Milho em Grão")
    time.sleep(0.8)
    preencher_aria("Quantidade do item 1", "20")
    preencher_aria("Valor total do item 1", "1.200,00")
    preencher("Frete (R$)", "80,00")
    time.sleep(0.5)


figura("compra-nova", "gestor", "/emporio/compras", [
    (1, "M.L('Fornecedor')", "o campo Fornecedor"),
    (2, "M.L('Itens')", "a lista de itens"),
    (3, "M.L('Frete (R$)')", "o campo Frete"),
    (4, "M.T('Já recebi a mercadoria')", "a escolha entre ja recebi e vai chegar"),
], estado=estado_compra_nova, hd=1300, hc=1700)

figura("compra-receber", "vendedor_centro", "/emporio/compras", [
    (1, "M.TR('Pendente').children[6]", "a situacao Pendente da compra"),
    (2, "M.B('Receber')", "o botao Receber"),
], hd=600, hc=800)

figura("fornecedores-lista", "gestor", "/emporio/fornecedores", [
    (1, "M.B('Novo fornecedor')", "o botao Novo fornecedor"),
    (2, "M.A('Buscar fornecedor')", "a busca por nome, documento ou telefone"),
    (3, "M.TH('Tipo')", "a coluna Tipo (Propriedade ou De fora)"),
    (4, "M.LIN('Nutrisul')", "um fornecedor da lista"),
], limite=6, hd=640, hc=900)

figura("clientes-lista", "gestor", "/emporio/clientes", [
    (1, "M.B('Cadastrar novo cliente')", "o botao Cadastrar novo cliente"),
    (2, "M.A('Buscar cliente')", "a busca por nome, documento ou telefone"),
    (3, "M.TH('Situação')", "a coluna Situacao (Cliente padrao, Cadastro incompleto, Arquivado)"),
    (4, "M.LIN('Maria das Dores')", "um cliente da lista"),
], limite=7, hd=700, hc=1000)

BLOCO_LOJA = "M.H('Loja Centro').closest('div.rounded-lg')"
figura("estoque-por-loja", "gestor", lambda: "/emporio/produtos/" + id_do_produto("Milho em Grão"), [
    (1, BLOCO_LOJA, "o cartao da Loja Centro, com o saldo"),
    (2, "Array.from(" + BLOCO_LOJA + ".querySelector('dl').children).slice(0, 2)", "Lacrado e Avulso"),
    (3, "Array.from(" + BLOCO_LOJA + ".querySelectorAll('button')).find(b => b.innerText.trim() === 'Contar estoque')", "o botao Contar estoque"),
    (4, "Array.from(" + BLOCO_LOJA + ".querySelectorAll('button')).find(b => b.innerText.trim() === 'Registrar perda')", "o botao Registrar perda"),
], rolar=BLOCO_LOJA, hd=340, hc=520)

figura("estoque-precisa-repor", "dono", lambda: "/emporio/estoque?loja=" + id_da_loja("Loja Centro"), [
    (1, "M.S('Precisa repor')", "a secao Precisa repor"),
    (2, "M.TH('Sugestão')", "a coluna Sugestão"),
    (3, "M.B('Encaminhar à Lista')", "o botao Encaminhar à Lista"),
], limite=5, hd=700, hc=900)


def estado_transferencia_nova():
    clicar("Nova transferência")
    time.sleep(1.5)
    escolher("Loja de origem", "Loja Centro")
    escolher("Loja de destino", "Loja da Rodovia")
    escolher_aria("Produto do item 1", "Ferradura nº 4")
    time.sleep(0.8)
    preencher_aria("Quantidade do item 1", "5")
    time.sleep(0.5)


figura("transferencia-nova", "gestor", "/emporio/transferencias", [
    (1, "M.L('Loja de destino')", "o campo Loja de destino"),
    (2, "M.L('Itens')", "a lista de itens"),
    (3, "document.querySelector('[role=dialog] button[type=submit]')", "o botao de enviar"),
], estado=estado_transferencia_nova, hd=900, hc=1300)


def estado_transferencia_receber():
    # A transferencia que o preparo manda da Rodovia para a Centro.
    clicar_na_linha("Em trânsito", "Receber")
    time.sleep(1.5)
    preencher_aria("Chegou de Ferradura nº 4", "6")
    preencher_aria("Chegou de Carrapaticida Pour-on 1 L", "3")


figura("transferencia-receber", "vendedor_centro", "/emporio/transferencias", [
    (1, "M.T('Veio de')", "a origem da transferencia, no alto do painel"),
    (2, "M.todos('input[aria-label^=\"Chegou de\"]')", "o campo Chegou, em cada item"),
    (3, "M.B('Confirmar recebimento')", "o botao Confirmar recebimento"),
], estado=estado_transferencia_receber, hd=700, hc=900)


def estado_aguardando():
    clicar("Resolver diferença")
    time.sleep(1.5)
    escolher("O que aconteceu?", "Perda no caminho")
    preencher("Motivo", "Caixa molhada no caminhão")
    time.sleep(0.5)


figura("transferencia-aguardando-gestor", "gestor", "/emporio/transferencias", [
    (1, "M.T('Milho em Grão: enviados')", "o resumo do que saiu e do que chegou"),
    (2, "M.L('O que aconteceu?')", "o campo O que aconteceu?"),
    (3, "M.L('Motivo')", "o campo Motivo"),
], estado=estado_aguardando, hd=800, hc=1000)

def adicionar_ao_balcao(busca, produto, quantidade):
    preencher_ph("Buscar por nome", busca)
    time.sleep(1.2)
    clicar_no_texto(produto)
    time.sleep(1)
    n = js("document.querySelectorAll('[aria-label^=\"Quantidade do item\"]').length")
    preencher_aria("Quantidade do item " + str(n), quantidade)
    time.sleep(0.5)


def estado_balcao():
    adicionar_ao_balcao("Milho", "Milho em Grão", "2")
    escolher_aria("Apresentação do item 1", "Saca 50 kg")
    adicionar_ao_balcao("Sal Mineral Bovinos Cria", "Sal Mineral Bovinos Cria", "1")
    # Baixar o preco sugerido do primeiro item mostra o desconto.
    sugerido = js("(() => { const t = Array.from(document.querySelectorAll('span')).find(s => s.innerText.startsWith('Preço sugerido')); return t ? t.innerText : ''; })()") or ""
    print("   " + sugerido)
    preencher_aria("Preço do item 1 (R$)", "80,00")
    time.sleep(0.8)


CARTOES_DO_ITEM = "M.todos('div.rounded-lg').filter(e => e.querySelector('[aria-label^=\"Quantidade do item\"]') && !e.querySelector('div.rounded-lg'))"

figura("balcao-venda", "vendedor_centro", "/emporio/vender", [
    (1, "M.A('Buscar produto')", "o campo de busca de produto"),
    (2, CARTOES_DO_ITEM, "a lista de itens da venda"),
    (3, "M.A('Preço do item 1 (R$)')", "o campo Preço do item"),
    (4, "M.T('Total da venda').parentElement", "o total da venda"),
], estado=estado_balcao, hd=1100, hc=1500)


def estado_pagamento():
    adicionar_ao_balcao("Milho", "Milho em Grão", "2")
    escolher_aria("Apresentação do item 1", "Saca 50 kg")
    clicar("+ Dinheiro")
    time.sleep(0.5)
    clicar("+ PIX")
    time.sleep(0.5)
    preencher_aria("Valor em Dinheiro (R$)", "100,00")
    time.sleep(0.8)


figura("balcao-pagamento", "vendedor_centro", "/emporio/vender", [
    (1, "M.L('Cliente')", "o campo Cliente"),
    (2, "M.todos('button').filter(b => /^\\+ /.test(b.innerText.trim()))", "os botoes de forma de pagamento"),
    (3, "[M.todos('[aria-label^=\"Valor em\"]'), M.C('Falta') || M.C('Troco') || M.C('Pagamento fechado')]", "o valor em cada forma e a linha Falta, Troco ou Pagamento fechado"),
    (4, "M.B('Fechar a venda')", "o botao Fechar a venda"),
], estado=estado_pagamento, hd=1250, hc=1500)


def estado_balcao_caixa():
    adicionar_ao_balcao("Ferradura", "Ferradura nº 4", "4")
    time.sleep(0.5)


figura("balcao-cliente-vendedor", "caixa", "/emporio/vender", [
    (1, "M.L('Cliente')", "o campo Cliente"),
    (2, "M.B('Cadastrar novo cliente')", "o botao Cadastrar novo cliente"),
    (3, "M.L('Vendedor')", "o campo Vendedor"),
    (4, "M.B('Fechar a venda')", "o botao Fechar a venda"),
], estado=estado_balcao_caixa, hd=1100, hc=1500)


def estado_escolher_cliente():
    clicar("Escolher cliente")
    esperar(lambda: js("!!document.querySelector('[data-escolha=cliente]')"), 30)
    preencher_aria("Buscar cliente", "maria")
    # O Buscando... some e a lista do termo digitado aparece.
    esperar(lambda: js("document.querySelectorAll('[data-escolha=cliente] [data-opcao]:not([data-fixo])').length > 0"), 30)
    time.sleep(1)


figura("balcao-escolher-cliente", "vendedor_centro", "/emporio/vender", [
    (1, "M.A('Buscar cliente')", "o campo de busca"),
    (2, "M.todos('[data-fixo]')[0]", "o Consumidor final, no alto da janela"),
    (3, "M.todos('[data-opcao]:not([data-fixo])')[0]", "um cliente achado"),
    (4, "M.B('Não achou? Cadastrar novo')", "o botao Nao achou? Cadastrar novo"),
], estado=estado_escolher_cliente, hd=800, hc=1000)


def estado_orcamento():
    clicar("Orçamento")
    time.sleep(1)
    adicionar_ao_balcao("Arame", "Arame Liso Galvanizado 1000 m", "3")
    adicionar_ao_balcao("Ferradura", "Ferradura nº 4", "10")
    escolher_cliente("Haras Santa Clara")
    preencher("Observação", "Entrega na fazenda, na sexta de manhã.")
    time.sleep(0.6)


figura("orcamento-balcao", "vendedor_centro", "/emporio/vender", [
    (1, "M.B('Orçamento')", "o botao Orcamento, no alto da tela"),
    (2, "M.L('Cliente')", "o campo Cliente"),
    (3, "M.L('Observação')", "o campo Observacao"),
    (4, "[M.B('Faturar'), M.B('Salvar orçamento')]", "os botoes Faturar e Salvar orcamento"),
], estado=estado_orcamento, hd=1200, hc=1700)


def estado_orcamento_salvo():
    estado_orcamento()
    # Chave fixa: na primeira vez salva, nas seguintes o servidor devolve o
    # MESMO orcamento (repeticao pela chave de operacao), e o roteiro nao enche
    # a lista de orcamentos a cada rodada.
    js("crypto.randomUUID = () => 'manual-emporio-orcamento-salvo'")
    clicar("Salvar orçamento")
    esperar(lambda: tem_na_tela("salvo, válido até"), 60)
    time.sleep(1)


figura("orcamento-salvo", "vendedor_centro", "/emporio/vender", [
    (1, "M.T('Orçamento nº')", "a linha Orcamento no ... salvo, valido ate ..."),
    (2, "[M.B('Imprimir A4'), M.B('Imprimir cupom')]", "Imprimir A4 e Imprimir cupom"),
    (3, "M.B('Faturar agora')", "o botao Faturar agora"),
    (4, "M.B('Novo atendimento')", "o botao Novo atendimento"),
], estado=estado_orcamento_salvo, hd=700, hc=900)

figura("orcamentos-lista", "gestor", "/emporio/orcamentos", [
    (1, "M.A('Filtrar por situação')", "o filtro de situacao"),
    (2, "[M.A('Buscar orçamento'), M.B('Buscar')]", "a busca e o botao Buscar"),
    (3, "M.TH('Situação')", "a coluna Situacao"),
    (4, "M.B('Ver')", "o botao Ver de uma linha"),
], limite=6, hd=760, hc=1100)


def estado_orcamento_faturar():
    preencher("Orçamento nº", str(NUMERO_ORCAMENTO_FATURAR))
    clicar("Carregar")
    esperar(lambda: tem_na_tela("Faturando o orçamento nº"), 60)
    time.sleep(1)


FAIXA = "M.T('Faturando o orçamento nº').closest('[tabindex]')"
figura("orcamento-faturar", "caixa", "/emporio/vender", [
    (1, "M.T('Faturando o orçamento nº').parentElement", "a faixa Faturando o orcamento no ..., com o cliente, o vendedor e Valido ate"),
    (2, "Array.from(" + FAIXA + ".querySelectorAll('p.rounded-md, ul.rounded-md'))", "os avisos da faixa"),
    (3, "M.L('Vendedor')", "o campo Vendedor, com O vendedor do orcamento."),
    (4, "M.B('Tirar orçamento')", "o botao Tirar orcamento"),
], estado=estado_orcamento_faturar, hd=1400, hc=2000)

figura("venda-detalhe", "gestor", lambda: "/emporio/vendas/" + id_da_venda_com_cliente(), [
    (1, "[M.H('Venda nº'), M.T('Vendedor:')]", "o titulo Venda no e a linha Vendedor"),
    (2, "[M.B('Imprimir A4'), M.B('Imprimir cupom')]", "os botoes Imprimir A4 e Imprimir cupom"),
    (3, "[M.S('Itens'), M.S('Pagamentos')]", "as secoes Itens e Pagamentos"),
    (4, "M.B('Devolver')", "o botao Devolver"),
    (5, "M.B('Trocar')", "o botao Trocar"),
    (6, "M.B('Cancelar venda')", "o botao Cancelar venda"),
], hd=900, hc=1200)

figura("venda-impressa", "vendedor_centro", lambda: "/emporio/imprimir/venda/" + id_da_venda_com_cliente() + "?formato=a4", [
    (1, "document.querySelector('.a4 .marca')", "o logo e os dados da loja, no alto a esquerda"),
    (2, "document.querySelector('.a4 .doc')", "o titulo VENDA, com o numero e a data"),
    (3, "document.querySelector('.a4 .rodape')", "o rodape, com Vendedor e Documento sem valor fiscal."),
    (4, "M.B('Imprimir')", "o botao Imprimir"),
# Celular com 600 px: em 390 a folha A4 quebra o dinheiro ("R$ 159,9 / 0").
], hd=900, hc=1300, lc=600)

figura("fiado-lista", "vendedor_centro", "/emporio/fiado", [
    (1, "M.LIN('Chácara Três Irmãos')", "a linha de um cliente"),
    # A marca Vencido depende do dia: a coluna Vencimento esta sempre la.
    (2, "M.TH('Vencimento')", "a coluna Vencimento"),
    (3, "M.B('Receber')", "o botao Receber"),
], hd=600, hc=800)

figura("fiado-receber", "vendedor_centro", "/emporio/fiado", [
    (1, "M.L('Valor recebido (R$)')", "o campo Valor"),
    (2, "M.L('Como o cliente pagou')", "a forma de pagamento"),
    (3, "document.querySelector('[role=dialog] button[type=submit]')", "o botao Registrar recebimento"),
], estado=lambda: (clicar_na_linha("Chácara Três Irmãos", "Receber"), time.sleep(1.5), preencher("Valor recebido (R$)", "500,00"), time.sleep(0.5)), hd=700, hc=900)

LINHA_DO_CAIXA_ABERTO = "M.B('Conferir').closest('li')"
figura("caixa-gaveta", "vendedor_centro", "/emporio/caixa", [
    # Q153: a gaveta virou os caixas numerados de cada loja.
    (1, LINHA_DO_CAIXA_ABERTO + ".firstElementChild", "a linha de um caixa, com o saldo e a marca Aberto ou Fechado"),
    (2, "Array.from(" + LINHA_DO_CAIXA_ABERTO + ".querySelectorAll('button')).filter(b => ['Sangria', 'Conferir', 'Encerrar'].includes(b.innerText.trim()))", "os botoes Sangria, Conferir e Encerrar"),
    (3, "M.S('Movimentos')", "a secao Movimentos"),
], limite=4, hd=1060, hc=1500)


def estado_abrir():
    # O Caixa 2 da Rodovia, que o preparo cria fechado: o Abrir da linha dele, e
    # nao o primeiro Abrir da tela.
    ok = js(r"""(() => {
      const li = Array.from(document.querySelectorAll('main li')).find(l => /^Caixa 2\b/.test(l.innerText.trim()));
      const b = li && Array.from(li.querySelectorAll('button')).find(x => x.innerText.trim() === 'Abrir');
      if (!b) return false; b.click(); return true;
    })()""")
    confere("caixa-abrir: achei o Abrir na linha do Caixa 2", bool(ok))
    time.sleep(1.5)
    preencher("Reforço da gerência (R$)", "100,00")
    preencher("Troco contado (R$)", "100,00")
    time.sleep(0.6)


figura("caixa-abrir", "caixa", "/emporio/caixa", [
    (1, "M.L('Reforço da gerência (R$)')", "o campo Reforco da gerencia (R$)"),
    (2, "M.T('O sistema espera')", "a frase O sistema espera R$ ... no caixa"),
    (3, "M.L('Troco contado (R$)')", "o campo Troco contado (R$)"),
    (4, "M.L('Motivo da diferença')", "o campo Motivo da diferenca"),
], estado=estado_abrir, hd=700, hc=900)


def estado_sangria():
    clicar("Sangria")
    time.sleep(1.5)
    preencher("Valor retirado (R$)", "200,00")
    preencher("Observação", "Notas de 50 e de 100")
    time.sleep(0.6)


figura("caixa-sangria", "caixa", "/emporio/caixa", [
    (1, "M.L('Valor retirado (R$)')", "o campo Valor retirado (R$)"),
    (2, "M.L('Observação')", "o campo Observacao"),
    (3, "document.querySelector('[role=dialog] button[type=submit]')", "o botao Registrar sangria"),
], estado=estado_sangria, hd=700, hc=900)


def estado_encerrar():
    clicar("Encerrar")
    time.sleep(1.5)
    # Contado igual ao esperado; o malote leva tudo menos R$ 300 de troco.
    centavos = esperado_do_painel()
    malote = max(0, centavos - 30000)
    preencher("Valor contado (R$)", reais(centavos))
    time.sleep(0.5)
    preencher("Malote (R$)", reais(malote))
    time.sleep(0.6)


figura("caixa-encerrar", "caixa", "/emporio/caixa", [
    (1, "M.L('Valor contado (R$)')", "o campo Valor contado (R$)"),
    (2, "M.L('Malote (R$)')", "o campo Malote (R$)"),
    (3, "M.T('Troco que fica no caixa')", "a frase Troco que fica no caixa"),
    (4, "document.querySelector('[role=dialog] button[type=submit]')", "o botao Encerrar o turno"),
], estado=estado_encerrar, hd=800, hc=1000)


def so_caixas_e_entregas():
    """Esconde, so na captura, as secoes entre os caixas e Aguardando o gerente:
    a figura mostra as entregas junto da linha Com a gerencia."""
    js(r"""(() => {
      const M = window.__m;
      for (const t of ['Contas bancárias', 'A receber do cartão', 'Cheques', 'Transferir dinheiro', 'Taxas de cartão', 'Movimentos']) {
        const h = M.H(t); const s = h && h.closest('section'); if (s) s.style.display = 'none';
      }
      const c = M.H('Loja Centro'); const d = c && c.closest('div.rounded-lg'); if (d && d.parentElement && d.parentElement.children.length > 1) d.style.display = 'none';
    })()""")


ENTREGA = "M.S('Aguardando o gerente').querySelector('tbody tr')"
figura("caixa-entregas", "gestor", "/emporio/caixa", [
    (1, ENTREGA + ".querySelector('td')", "uma linha da secao Aguardando o gerente"),
    (2, "Array.from(" + ENTREGA + ".querySelectorAll('button')).find(b => b.innerText.trim() === 'Confirmar')", "o botao Confirmar"),
    (3, "Array.from(" + ENTREGA + ".querySelectorAll('a')).find(b => b.innerText.trim() === 'Relatório do turno')", "o botao Relatorio do turno"),
    (4, "Array.from(M.H('Loja da Rodovia').closest('div.rounded-lg').querySelectorAll('p')).find(p => p.innerText.startsWith('Com a gerência'))", "a linha Com a gerencia, no cartao da loja"),
], antes=so_caixas_e_entregas, limite=4, hd=1000, hc=1500)


def esperado_do_painel():
    """O valor da frase 'O sistema espera R$ ...' do painel aberto, em centavos."""
    t = js("(() => { const p = Array.from(document.querySelectorAll('[role=dialog] p')).find(x => x.innerText.startsWith('O sistema espera')); return p ? p.querySelector('strong').innerText : ''; })()") or ""
    return int("".join(ch for ch in t if ch.isdigit()) or "0")


def reais(c):
    return "{:,}".format(c // 100).replace(",", ".") + "," + "{:02d}".format(c % 100)


def estado_conferir():
    clicar("Conferir")
    time.sleep(1.5)
    # Uma falta pequena, qualquer que seja o saldo do dia: o Motivo fica obrigatorio.
    preencher("Valor contado (R$)", reais(max(0, esperado_do_painel() - 1250)))
    preencher("Motivo da diferença", "Troco dado a maior")
    time.sleep(0.6)


figura("caixa-conferir", "vendedor_centro", "/emporio/caixa", [
    (1, "M.T('O sistema espera')", "o valor esperado"),
    (2, "M.L('Valor contado (R$)')", "o campo Valor contado"),
    (3, "M.L('Motivo da diferença')", "o campo Motivo da diferença"),
    (4, "document.querySelector('[role=dialog] button[type=submit]')", "o botao Registrar conferencia"),
], estado=estado_conferir, hd=700, hc=900)

figura("caixa-cartao-cheques", "gestor", "/emporio/caixa", [
    (1, "M.S('A receber do cartão')", "a secao A receber do cartao"),
    (2, "M.S('Cheques')", "a secao Cheques"),
    # Q163: a gaveta vai ao gerente; a transferencia sai da gerencia para o banco.
    (3, "M.B('Transferir dinheiro')", "o botao Transferir dinheiro"),
], rolar="M.H('A receber do cartão')", limite=3, hd=1100, hc=1500)

figura("despesas-fixas", "gestor", "/emporio/despesas", [
    (1, "M.B('Nova despesa fixa')", "o botao Nova despesa fixa"),
    (2, "M.TH('Rateio')", "a coluna Rateio"),
    (3, "M.S('Vendeu, Pagou')", "a secao Vendeu, Pagou"),
    (4, "M.S('Contas a pagar')", "a secao Contas a pagar"),
], limite=4, hd=1400, hc=1900)

figura("resultado-loja", "gestor", "/emporio/resultado", [
    (1, "M.todos('select, [role=combobox]').slice(0, 2)", "o seletor de loja e de mes"),
    (2, "[M.LN('Vendas'), M.LN('(-) Custo das mercadorias'), M.LN('= Margem')]", "as linhas de vendas, custo e margem"),
    (3, "M.LN('(-) Perdas e quebras')", "a linha de perdas e quebras"),
    # O aviso vem, entre outros motivos, das contas fixas do mes ainda nao pagas.
    # O cenario cria as despesas fixas com 12 meses de contas e paga so as do mes
    # anterior: no mes corrente o aviso aparece por 11 meses depois de montado.
    (4, "M.T('Este resultado é uma estimativa').parentElement", "o aviso Este resultado e uma estimativa"),
], hd=900, hc=1200)


def esconder_acompanhamento():
    js("(() => { const M = window.__m; const s = M.S('Acompanhamento do mês'); if (s) s.style.display = 'none'; })()")


figura("resultado-equilibrio", "gestor", "/emporio/resultado", [
    (1, "M.S('Ponto de equilíbrio')", "o ponto de equilibrio"),
    # Batido ou nao depende do mes: serve uma das duas frases de resultado-mes.tsx,
    # e so dentro da secao (um "Faltam" de outra parte da tela nao conta).
    (2, "Array.from(M.S('Ponto de equilíbrio').querySelectorAll('p')).find(p => { const t = M.norm(p.innerText); return t === 'o ponto de equilíbrio do mês já foi batido.' || (t.startsWith('faltam r$') && t.endsWith(' em vendas.')); })", "a frase que diz se o ponto foi batido ou quanto falta"),
    (3, "M.H('Mais dão margem').parentElement", "a lista Mais dão margem"),
    (4, "M.S('Vendas com margem negativa')", "a lista Vendas com margem negativa"),
], antes=esconder_acompanhamento, rolar="M.H('Ponto de equilíbrio')", limite=4, hd=1250, hc=1900)


def periodo_do_relatorio():
    """Os ultimos 30 dias, para o print ter as vendas do cenario em qualquer
    dia do mes (o padrao da tela comeca no dia 1)."""
    import datetime
    hoje = datetime.date.today()
    return "/emporio/relatorios?de=" + (hoje - datetime.timedelta(days=30)).isoformat() + "&ate=" + hoje.isoformat()


figura("relatorios-periodo", "gestor", periodo_do_relatorio, [
    (1, "[M.L('De'), M.L('Até')]", "os campos De e Ate"),
    (2, "M.L('Loja')", "o campo Loja"),
    (3, "[M.B('Ver relatório'), M.B('Mês atual')]", "os botoes Ver relatorio e Mes atual"),
    (4, "M.S('Vendas por vendedor')", "o bloco Vendas por vendedor"),
], limite=5, hd=900, hc=1500)


def estado_historico():
    # O filtro de verdade: escolhe uma acao, filtra e abre o "O que mudou".
    js(r"""(() => {
      const s = document.getElementById('hist-action');
      const o = Array.from(s.options).find(x => x.text.trim() === 'Mudou um preço');
      if (!o) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value);
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })()""")
    js("Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Filtrar').click()")
    time.sleep(2)
    esperar(lambda: js("document.readyState === 'complete' && location.search.includes('action=')"), 60)
    time.sleep(3)
    inicializar_pagina()
    ocultar_fixtures()
    js("(() => { const d = document.querySelector('main ul details'); if (d) d.open = true; })()")
    time.sleep(0.5)


figura("historico-filtros", "dono", "/emporio/historico", [
    (1, "M.B('Filtrar').closest('form')", "os filtros de pessoa, loja, periodo e acao"),
    (2, "Array.from(document.querySelectorAll('main ul > li')).find(l => l.getBoundingClientRect().height > 0 && l.style.display !== 'none')", "uma linha da lista"),
    (3, "document.querySelector('main ul details[open] ul')", "o antes e o depois de uma edicao"),
], estado=estado_historico, hd=900, hc=1300)

fim_das_figuras = None


FIM_DO_CONTEUDO_JS = r"""(() => {
  // O fundo do que a pagina desenha, sem contar o que so se estica ate o fim da
  // janela (a casca do painel tem altura minima de tela cheia). Se algum texto
  // ou campo passa do fim da janela, a pagina enche a janela: devolve a altura dela.
  const H = innerHeight;
  let fundo = 0;
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('#__marcas')) continue;
    const r = e.getBoundingClientRect();
    // Fora da janela pelo lado: o menu do celular fica recolhido a esquerda, e
    // a lista dele, mais alta que a janela, impedia o recorte.
    if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const folha = e.children.length === 0 || /^(INPUT|TEXTAREA|SELECT|BUTTON|IMG|svg)$/.test(e.tagName);
    if (folha) { if (r.bottom > H - 2) return H; fundo = Math.max(fundo, r.bottom); }
    else if (r.bottom < H - 2) fundo = Math.max(fundo, r.bottom);
  }
  return Math.ceil(fundo);
})()"""


def executar(fig):
    for modo, largura, altura, escala, sufixo in (
        ("computador", 1280, fig["hd"], 1, ""),
        ("celular", fig["lc"], fig["hc"], 2, "-celular"),
    ):
        try:
            executar_modo(fig, modo, largura, altura, escala, sufixo)
        finally:
            if fig["depois"]:
                fig["depois"]()


def executar_modo(fig, modo, largura, altura, escala, sufixo):
    r_altura = altura
    viewport(largura, 3200 if fig["rolar"] else altura, escala)
    entrar(fig["papel"])
    pagina = fig["pagina"]() if callable(fig["pagina"]) else fig["pagina"]
    r = ir(pagina)
    if r == "TIMEOUT":
        confere(fig["id"] + " (" + modo + "): a pagina abriu", False, pagina)
        return
    inicializar_pagina()
    if modo == "celular":
        tabelas_sem_rolagem()
    ocultar_fixtures()
    if fig["limite"]:
        limitar_linhas(fig["limite"])
    if fig["antes"]:
        fig["antes"]()
    if fig["estado"]:
        fig["estado"]()
        time.sleep(1)
        inicializar_pagina()
        ocultar_fixtures()
    if DUMP:
        print("== " + fig["id"] + " (" + modo + ")")
        dump_tela()
    # Painel aberto: a janela tem a altura do conteudo do painel (cabecalho,
    # corpo inteiro e rodape), senao o celular sai com um vazio embaixo.
    if js("!!document.querySelector('[role=dialog] form')"):
        necessario = js("(() => { const f = document.querySelector('[role=dialog] form'); const corpo = f.children[1]; const ultimo = corpo.lastElementChild; return f.children[0].offsetHeight + (ultimo.getBoundingClientRect().bottom - corpo.getBoundingClientRect().top) + 16 + f.children[2].offsetHeight; })()") or r_altura
        r_altura = int(max(necessario + 8, 560 if modo == "computador" else 0))
        viewport(largura, r_altura, escala)
        time.sleep(0.6)
    # Figura de uma secao no meio da pagina: a janela fica alta (a pagina
    # nao rola) e a captura recorta a partir do titulo da secao.
    y0, janela = 0, r_altura
    if fig["rolar"]:
        ro = achar(fig["rolar"])
        if ro:
            y0 = max(0, int(ro["y"]) - 40)
        # O recorte nao passa do fim da pagina: abaixo dele a captura sai
        # em branco (era o vazio do celular de 'produto-preco-por-loja').
        fim_da_pagina = js("Math.max(...Array.from(document.body.children).filter(e => e.id !== '__marcas').map(e => e.getBoundingClientRect().bottom))") or (y0 + janela)
        janela = max(200, min(janela, int(fim_da_pagina) - y0))
    marcas = []
    tudo_certo = True
    for numero, expr, alvo in fig["marcas"]:
        js("(() => { const M = window.__m; try { M.trazer(" + expr + "); } catch (e) {} })()")
    # Preencher um campo rola a pagina ate ele, e o alto da tela saia cortado
    # ('balcao-venda', uns 30 px). Volta ao topo quando todas as marcas cabem la.
    if not fig["rolar"] and js("scrollY") > 0:
        antes_y = js("scrollY")
        js("scrollTo(0, 0)")
        time.sleep(0.4)
        cabem = True
        for numero, expr, alvo in fig["marcas"]:
            r = achar(expr)
            if r and (r["y"] < 0 or r["y"] + r["h"] > r["vh"]):
                cabem = False
        if not cabem:
            js("scrollTo(0, " + str(antes_y) + ")")
            time.sleep(0.4)
    for numero, expr, alvo in fig["marcas"]:
        r = achar(expr)
        if not r:
            confere(fig["id"] + " (" + modo + "), marca " + str(numero) + ": achei " + alvo, False)
            tudo_certo = False
            continue
        dentro = r["y"] >= y0 and r["y"] + r["h"] <= y0 + janela and r["x"] >= 0 and r["x"] + r["w"] <= r["vw"] + 1
        if not dentro:
            confere(fig["id"] + " (" + modo + "), marca " + str(numero) + " (" + alvo + ") dentro da tela", False, str(r))
            tudo_certo = False
        r["numero"] = numero
        marcas.append(r)
    if not marcas:
        return
    # Secao no fim da pagina: o recorte termina logo abaixo da ultima marca,
    # sem a faixa vazia que sobra embaixo.
    if fig["rolar"] and tudo_certo:
        janela = max(200, min(janela, int(max(m["y"] + m["h"] for m in marcas)) - y0 + 40))
    # Pagina inteira mais baixa que a janela: o recorte termina no fim do
    # conteudo, e nao no fim da janela (o vazio embaixo de 'orcamento-faturar',
    # 'venda-impressa' e 'caixa-entregas' no celular). Com a pagina rolada ou
    # com painel aberto, a pagina ja enche a janela: sem recorte.
    recorte = (largura, y0, janela) if fig["rolar"] else None
    if not fig["rolar"] and js("scrollY") == 0 and not js("!!document.querySelector('[role=dialog]')"):
        fundo = js(FIM_DO_CONTEUDO_JS) or r_altura
        # O numero pode cair logo abaixo do quadro da ultima marca.
        fundo = max(fundo + 16, max(m["y"] + m["h"] for m in marcas) + 40)
        if fundo < r_altura - 8:
            recorte = (largura, 0, int(fundo))
    desenhar(marcas)
    time.sleep(0.4)
    tamanho = capturar(fig["id"] + sufixo + ".png", recorte)
    confere(fig["id"] + " (" + modo + "): imagem gravada", tamanho > 5000, str(tamanho // 1024) + " KB")
    if modo == "celular" or True:
        js("(() => { const m = document.getElementById('__marcas'); if (m) m.remove(); })()")
    if js("!!document.querySelector('[role=dialog]')"):
        fechar_painel()


preparar()
passo("1. As figuras")
for fid, fig in F.items():
    if FILTRO and fid not in FILTRO:
        continue
    print("-- " + fid)
    executar(fig)


def guia_em_uma_folha():
    """O guia do Vendedor diz "O essencial do balcao, em uma folha." O PDF da
    impressao, em A4, tem de sair com uma folha so: com o @page da pagina e com
    o A4 forcado (o dialogo de impressao pode usar qualquer um dos dois)."""
    import re
    passo("2. O guia para imprimir cabe em uma folha A4")
    viewport(1280, 900, 1)
    entrar("dono")
    ir("/manual/emporio/vendedor-imprimir")
    for nome, opcoes in (
        ("com o @page da pagina", dict(preferCSSPageSize=True, printBackground=True)),
        ("em A4 forcado", dict(paperWidth=8.27, paperHeight=11.69, printBackground=True)),
    ):
        pdf = base64.b64decode(cdp("Page.printToPDF", **opcoes)["data"])
        folhas = len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", pdf))
        confere("guia do Vendedor, " + nome + ": uma folha", folhas == 1, str(folhas) + " folha(s)")


if not FILTRO or "guia-a4" in FILTRO:
    guia_em_uma_folha()
