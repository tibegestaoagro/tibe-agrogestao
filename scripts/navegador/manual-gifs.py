# Os quadros das animacoes (GIFs) do manual do Meu Emporio: um quadro por passo, em computador
# (1280 px), com o circulo numerado do PASSO e o contorno no elemento dele. Sai em
# .cache/manual-gifs/<id>/01.png ... (pasta ignorada pelo git); `python scripts/manual-gifs-montar.py`
# monta os GIFs em public/manual/emporio/<id>.gif e <id>.png.
#
# A lista de animacoes, com os passos, vive em src/app/(dashboard)/manual/_conteudo/animacoes.ts: os ids
# e o numero de passos aqui sao o contrato. Este roteiro acha cada elemento pelo texto que esta na tela:
# se um alvo nao e achado, o roteiro reprova, porque o texto do manual nao bate com a tela.
#
# O repositorio e PUBLICO. O banco de dev tem de tudo (dados de outros cenarios e nomes de clientes
# reais): cada quadro so mostra o que esta numa lista de permitidos (`PERMITIDOS`), e o resto da tela
# (linhas, opcoes de lista, lojas) e escondido so na captura.
#
# Precisa do cenario de demonstracao montado na conta do seed (ver manual-emporio.py) e do cenario das
# animacoes (este cabecalho o roda, e ele apaga e refaz o que as animacoes criam). Filtre com
# ANIMACOES=id1,id2 e veja o texto da tela com DUMP=1.
#
# cenario: scripts/_cenario-manual-emporio.ts
# cenario: scripts/_cenario-manual-gifs.ts
# sessao: dono owner@example.com
# sessao: gestor gestor.demo.emporio@example.com
# sessao: vendedor_centro vendedor.centro.demo.emporio@example.com
# sessao: caixa vendedor.rodovia.demo.emporio@example.com
import base64
import json
import os
import shutil

QUADROS = os.path.join(os.getcwd(), ".cache", "manual-gifs")
FILTRO = [x for x in os.environ.get("ANIMACOES", "").split(",") if x]
DUMP = os.environ.get("DUMP") == "1"
LARGURA = 1280

LOJA = "Loja Centro"
RODOVIA = "Loja da Rodovia"
CONTA_CENTRO = "PIX Loja Centro"
CONTA_SITE = "PIX Site"
CONTA_NOVA = "PIX Loja da Rodovia"
CNPJ_NOVO = "12.345.678/0001-95"
FAVORECIDO_NOVO = "Vale Verde Rodovia Ltda"
FRANQUEADO = "Ademir Santos"
FRANQUEADO_NOVO = "Marlene Rocha"
PROD_A = "Ração Poedeiras 15 kg"
PROD_B = "Farelo de Soja 40 kg"
PROD_C = "Sal Mineral Premium"
DOIS_NOMES = "Saca 40 kg / ATACADO"

# O que pode aparecer em cada quadro (regex, sem acento nos limites). Tudo o mais some na captura.
LOJAS_OK = r"Loja Centro|Loja da Rodovia"
NOSSOS = PROD_A + "|" + PROD_B + "|" + PROD_C

AJUDA_JS = r"""
(() => {
  const norm = s => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const raiz = () => document.querySelector('[role=dialog]') || document.querySelector('main') || document.body;
  const todos = (sel, r) => Array.from((r || raiz()).querySelectorAll(sel)).filter(vis);
  const M = {
    norm, vis, raiz, todos,
    B(t) { const n = norm(t); return todos('button, a, [role=button]').find(e => norm(e.innerText) === n) || null; },
    L(t) { const n = norm(t); const l = todos('label').find(x => norm(x.innerText).replace(/\*$/, '').trim() === n); return l ? l.parentElement : null; },
    A(aria) { return todos('[aria-label]').find(e => e.getAttribute('aria-label') === aria) || null; },
    T(t) { const n = norm(t); let melhor = null; for (const e of todos('*')) { const x = norm(e.innerText); if (x.startsWith(n) && (!melhor || x.length < norm(melhor.innerText).length)) melhor = e; } return melhor; },
    C(t) { const n = norm(t); let melhor = null; for (const e of todos('*')) { const x = norm(e.innerText); if (x.includes(n) && (!melhor || x.length < norm(melhor.innerText).length)) melhor = e; } return melhor; },
    S(t) { const n = norm(t); const h = todos('h1,h2,h3,h4').find(x => norm(x.innerText).startsWith(n)); return h ? (h.closest('section') || h.closest('div.rounded-lg') || h.parentElement) : null; },
    H(t) { const n = norm(t); return todos('h1,h2,h3,h4,legend').find(x => norm(x.innerText).startsWith(n)) || null; },
    TH(t) { const n = norm(t); return todos('th').find(x => norm(x.innerText).startsWith(n)) || null; },
    TR(t) { const n = norm(t); return todos('tr').find(x => norm(x.innerText).includes(n)) || null; },
    CK(t) { const n = norm(t); return todos('label').find(x => norm(x.innerText).includes(n) && x.querySelector('input[type=checkbox]')) || null; },
    X(t) { const n = norm(t); return todos('*').find(e => e.children.length === 0 && norm(e.innerText) === n) || null; },
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

# Esconde, so na captura, tudo o que nao esta na lista de permitidos. `cfg`:
#   linhas: regex das linhas de tabela do main que ficam; opcoes: das opcoes de lista (Select);
#   rotulos: dos rotulos com caixa de marcar dentro do painel; cartoes: dos h3 de cartao do main.
# Um MutationObserver reaplica quando a tela muda (abrir lista, painel, linha nova).
FILTRO_JS = r"""((cfg) => {
  const re = a => (a || []).map(s => new RegExp(s));
  const linhas = re(cfg.linhas), opcoes = re(cfg.opcoes), rotulos = re(cfg.rotulos), cartoes = re(cfg.cartoes);
  const ok = (rs, t) => rs.some(r => r.test(t));
  const aplicar = () => {
    if (linhas.length) document.querySelectorAll('main tbody tr').forEach(tr => { tr.style.display = ok(linhas, tr.textContent) ? '' : 'none'; });
    if (opcoes.length) document.querySelectorAll('[role=option]').forEach(o => { o.style.display = ok(opcoes, o.textContent) ? '' : 'none'; });
    if (rotulos.length) document.querySelectorAll('[role=dialog] label').forEach(l => { if (l.querySelector('input[type=checkbox]')) l.style.display = ok(rotulos, l.textContent) ? '' : 'none'; });
    // secoes inteiras a esconder (pelo titulo): uma tabela vazia depois do filtro enganaria
    (cfg.ocultar || []).forEach(t => {
      const r = new RegExp(t);
      document.querySelectorAll('main h2, main h3').forEach(h => { if (r.test(h.textContent.trim())) { const e = h.closest('section') || h.parentElement; e.style.display = 'none'; } });
    });
    // a fileira de botoes de loja: so os permitidos ficam
    if (cfg.pilulas) {
      const p = new RegExp(cfg.pilulas);
      const ancora = Array.from(document.querySelectorAll('main a, main button')).find(b => b.textContent.trim() === 'Todas as lojas');
      if (ancora) Array.from(ancora.parentElement.children).forEach(b => { b.style.display = p.test(b.textContent.trim()) ? '' : 'none'; });
    }
    if (cartoes.length) document.querySelectorAll('main h3').forEach(h => {
      let e = h;
      while (e.parentElement && e.parentElement.tagName !== 'MAIN' && e.parentElement.querySelectorAll('h3').length === 1) e = e.parentElement;
      e.style.display = ok(cartoes, h.textContent) ? '' : 'none';
    });
  };
  window.__aplicar = aplicar;
  if (window.__obs) window.__obs.disconnect();
  window.__obs = new MutationObserver(() => { cancelAnimationFrame(window.__raf); window.__raf = requestAnimationFrame(aplicar); });
  window.__obs.observe(document.body, { childList: true, subtree: true });
  aplicar();
})("""


def inicializar_pagina(cfg=None):
    js(AJUDA_JS)
    js("(() => { if (document.getElementById('__limpeza')) return; const s = document.createElement('style'); s.id = '__limpeza'; s.textContent = " + json.dumps(CSS_LIMPEZA) + "; document.head.appendChild(s); })()")
    js(FILTRO_JS + json.dumps(cfg or {}) + ")")


def viewport(largura, altura, escala=1):
    cdp("Emulation.setDeviceMetricsOverride", width=largura, height=altura, deviceScaleFactor=escala, mobile=False)
    time.sleep(1)


def achar(expr):
    # Um alvo que nao existe pode lancar no meio da expressao (null.parentElement):
    # vira marca nao achada, e o quadro reprova sem derrubar o roteiro inteiro.
    return js("(() => { const M = window.__m; try { return M.R(" + expr + "); } catch (e) { return null; } })()")


def desenhar(marcas):
    js("""((marcas) => {
      const velho = document.getElementById('__marcas'); if (velho) velho.remove();
      const cor = getComputedStyle(document.documentElement).getPropertyValue('--acento-hover').trim() || '#ce6c0b';
      const claro = getComputedStyle(document.documentElement).getPropertyValue('--texto-invertido').trim() || '#ffffff';
      const c = document.createElement('div');
      c.id = '__marcas';
      c.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
      const naTela = r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      const obst = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.textContent.trim() || !n.parentElement || n.parentElement.closest('#__marcas')) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (naTela(r)) obst.push({ r, peso: 3 });
      }
      document.querySelectorAll('input, textarea, select').forEach(e => { const r = e.getBoundingClientRect(); if (naTela(r)) obst.push({ r, peso: 3 }); });
      document.querySelectorAll('button, [role=combobox]').forEach(e => { const r = e.getBoundingClientRect(); if (naTela(r)) obst.push({ r, peso: 1 }); });
      const colocados = [];
      const sobra = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
      for (const m of marcas) {
        const pad = 4;
        const o = document.createElement('div');
        o.style.cssText = 'position:absolute;box-sizing:border-box;border:3px solid ' + cor + ';border-radius:10px;left:' + (m.x - pad) + 'px;top:' + (m.y - pad) + 'px;width:' + (m.w + 2 * pad) + 'px;height:' + (m.h + 2 * pad) + 'px;';
        c.appendChild(o);
        // contorno extra (o segundo alvo do mesmo passo): sem circulo, so o numero do passo vale
        if (m.numero == null) continue;
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
          const cxx = Math.max(3, Math.min(innerWidth - d - 3, px)), cyy = Math.max(3, Math.min(innerHeight - d - 3, py));
          const r = { l: cxx, t: cyy, r: cxx + d, b: cyy + d };
          let custo = 0;
          for (const o of obst) custo += o.peso * sobra(r, { l: o.r.left, t: o.r.top, r: o.r.right, b: o.r.bottom });
          for (const p of colocados) custo += 1e6 * (sobra(r, p) > 0 ? 1 : 0);
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


def rolar_ate(expr, bloco="center"):
    """Rola a pagina (ou o painel) para o alvo ficar na janela. Sem efeito se ele ja esta."""
    js("(() => { const M = window.__m; try { const a = [].concat(" + expr + " || []).flat(Infinity).filter(Boolean); if (!a.length) return; const r = a[0].getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) a[0].scrollIntoView({ block: " + json.dumps(bloco) + " }); } catch (e) {} })()")
    time.sleep(0.4)


def rolar_topo(expr, folga=16):
    """Leva o alvo para o alto da janela (a secao no meio da pagina)."""
    js("(() => { const M = window.__m; try { const a = [].concat(" + expr + " || []).flat(Infinity).filter(Boolean); if (!a.length) return; a[0].scrollIntoView({ block: 'start' }); window.scrollBy(0, -" + str(folga) + "); } catch (e) {} })()")
    time.sleep(0.5)


def dump_tela():
    print("   TELA: " + (js("(() => { const r = document.querySelector('[role=dialog]') || document.querySelector('main') || document.body; return r.innerText.replace(/\\u00a0/g, ' ').replace(/\\n+/g, ' | ').slice(0, 1500); })()") or ""))
    print("   BOTOES: " + str(js("Array.from((document.querySelector('[role=dialog]') || document.querySelector('main') || document).querySelectorAll('button, a')).filter(e => e.getBoundingClientRect().width > 0).map(e => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\\n/g, ' ')).filter(x => x).slice(0, 40)")))
    print("   ROTULOS: " + str(js("Array.from((document.querySelector('[role=dialog]') || document).querySelectorAll('label, [aria-label]')).filter(e => e.getBoundingClientRect().width > 0).map(e => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\\n/g, ' ')).filter(x => x).slice(0, 40)")))


# Os quadros de cada animacao ja gravados nesta rodada: o roteiro confere no fim que cada uma tem
# o numero de passos do contrato.
GRAVADOS = {}


def quadro(aid, numero, expr, alvo, cfg=None, rolar=True, extras=()):
    """Grava o quadro `numero` da animacao `aid`: marca o alvo (expressao JS que devolve elemento ou lista)
    com o circulo do passo e o contorno, e captura a janela. Reprova se o alvo nao e achado ou se nao cabe."""
    inicializar_pagina(cfg)
    if rolar:
        rolar_ate(expr)
    time.sleep(0.6)
    if DUMP:
        print("== " + aid + " passo " + str(numero))
        dump_tela()
    r = achar(expr)
    nome = aid + " passo " + str(numero) + ": achei " + alvo
    if not r:
        confere(nome, False)
        return False
    dentro = r["y"] >= 0 and r["y"] + r["h"] <= r["vh"] and r["x"] >= 0 and r["x"] + r["w"] <= r["vw"] + 1
    confere(nome + ", dentro da janela", dentro, str(r) if not dentro else "")
    r["numero"] = numero
    marcas = [r]
    for extra in extras:
        e = achar(extra)
        confere(aid + " passo " + str(numero) + ": o contorno extra " + extra[:60] + " existe", bool(e))
        if e:
            marcas.append(e)
    desenhar(marcas)
    time.sleep(0.4)
    pasta = os.path.join(QUADROS, aid)
    os.makedirs(pasta, exist_ok=True)
    dados = base64.b64decode(cdp("Page.captureScreenshot", format="png")["data"])
    with open(os.path.join(pasta, "%02d.png" % numero), "wb") as f:
        f.write(dados)
    GRAVADOS.setdefault(aid, set()).add(numero)
    js("(() => { const m = document.getElementById('__marcas'); if (m) m.remove(); })()")
    return dentro


def comecar(aid, papel, pagina, altura=800):
    """Abre a pagina como `papel`, com a janela da altura pedida, e zera os quadros da animacao."""
    shutil.rmtree(os.path.join(QUADROS, aid), ignore_errors=True)
    viewport(LARGURA, altura, 1)
    entrar(papel)
    pg = pagina() if callable(pagina) else pagina
    r = ir(pg)
    confere(aid + ": a pagina " + pg + " abriu", r != "TIMEOUT" and r == pg.split("?")[0], r)
    js("localStorage.setItem('tibe.pwa.convite-dispensado', '1'); localStorage.setItem('tibe.push.convite-dispensado', '1')")
    # O menu lateral monta depois da hidratacao: o quadro sem ele parece pagina quebrada.
    confere(aid + ": o menu lateral montou", bool(esperar(lambda: js("document.querySelectorAll('nav a').length > 3"), 40)))
    return r


def fechar_painel():
    cdp("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    cdp("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27)
    time.sleep(0.8)


def tem_na_tela(texto):
    return texto.lower() in (js("(document.querySelector('main') || document.body).innerText.replace(/\\u00a0/g, ' ')") or "").lower()


def texto_do_painel():
    return js("((document.querySelector('[role=dialog]') || { innerText: '' }).innerText).replace(/\\s+/g, ' ').replace(/\\u00a0/g, ' ')") or ""


def texto_do_main():
    return js("(document.querySelector('main') || document.body || { innerText: '' }).innerText.replace(/\\u00a0/g, ' ')") or ""


def texto_do_campo(rotulo):
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document.querySelector('main'); const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); const el = l && document.getElementById(l.htmlFor); return el ? (el.value !== undefined && el.tagName === 'INPUT' ? el.value : el.innerText.replace(/\\u00a0/g, ' ')) : 'SEM CAMPO'; })()") or ""


def preencher_aria(aria, valor):
    sel = '[aria-label="' + aria + '"]'
    return js("(() => { const raiz = document.querySelector('[role=dialog]') || document; const el = raiz.querySelector(" + json.dumps(sel) + "); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + json.dumps(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def preencher_ph(prefixo, valor):
    return js("(() => { const el = Array.from(document.querySelectorAll('input')).find(i => (i.placeholder || '').startsWith(" + json.dumps(prefixo) + ")); if (!el) return 'SEM CAMPO'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, " + json.dumps(valor) + "); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()")


def escolher_aria(aria, opcao):
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


def abrir_lista(rotulo):
    """Abre o Select (Radix) do campo `rotulo` e devolve o texto das opcoes. A lista fica aberta."""
    gatilho = "(() => { const raiz = document.querySelector('[role=dialog]') || document; const l = Array.from(raiz.querySelectorAll('label')).find(x => x.innerText.replace('*','').trim() === " + repr(rotulo) + "); return l && document.getElementById(l.htmlFor); })()"
    xy = _centro(gatilho)
    if not xy:
        return None
    click_at_xy(xy[0], xy[1])
    time.sleep(1)
    return js("Array.from(document.querySelectorAll('[role=option]')).map(o => o.innerText.replace(/\\u00a0/g, ' ').trim())") or []


def tocar_opcao_aberta(texto, prefixo=False):
    cond = "o.innerText.trim().startsWith(" + repr(texto) + ")" if prefixo else "o.innerText.trim() === " + repr(texto)
    xy = _centro("Array.from(document.querySelectorAll('[role=option]')).find(o => " + cond + ")")
    if not xy:
        return "SEM OPCAO"
    click_at_xy(xy[0], xy[1])
    time.sleep(0.8)
    return True


def enviar_painel():
    js("(() => { const d = document.querySelector('[role=dialog]'); const b = d && d.querySelector('button[type=submit]'); if (b) b.click(); })()")


def painel_aberto():
    return bool(js("!!document.querySelector('[role=dialog]')"))


def enviar_botao(texto):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('button[type=submit]')).find(x => x.innerText.includes(" + repr(texto) + ")); if (!b) return false; b.click(); return true; })()"))


def clicar_resultado(nome):
    return bool(js("(() => { const b = Array.from(document.querySelectorAll('main button')).find(x => x.innerText.includes(" + repr(nome) + ") && x.innerText.includes('Adicionar')); if (!b) return false; b.click(); return true; })()"))


def linha_da_tabela(trecho):
    return js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(x => x.innerText.includes(" + repr(trecho) + ")); return r ? Array.from(r.children).map(c => c.innerText.replace(/\\u00a0/g, ' ').replace(/\\n/g, ' ').trim()).join(' | ') : ''; })()") or ""


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


def adicionar_ao_balcao(busca, produto, quantidade, apresentacao=None):
    preencher_ph("Buscar por nome", busca)
    time.sleep(1.2)
    confere("balcao: adiciona " + produto, bool(esperar(lambda: clicar_resultado(produto), 20)))
    time.sleep(1)
    n = js("document.querySelectorAll('[aria-label^=\"Quantidade do item\"]').length")
    if apresentacao:
        confere("balcao: apresentacao " + apresentacao, escolher_aria("Apresentação do item " + str(n), apresentacao) is True)
    preencher_aria("Quantidade do item " + str(n), quantidade)
    time.sleep(0.5)


def escolher_prefixo(rotulo, prefixo):
    ops = abrir_lista(rotulo)
    if not ops:
        return "SEM OPCAO"
    return tocar_opcao_aberta(prefixo, prefixo=True)


def escolher_loja_do_balcao(loja):
    atual = texto_do_campo("Loja")
    if loja not in atual:
        confere("balcao: escolhe a loja " + loja, escolher("Loja", loja) is True, atual)


def venda_fechada():
    return tem_na_tela("Venda registrada")


def quer(aid):
    return not FILTRO or aid in FILTRO


# ---------------------------------------------------------------------------
# As animacoes
# ---------------------------------------------------------------------------
PASSOS = {
    "conta-pix-cadastrar": 5,
    "balcao-conta-pix": 5,
    "franqueado-cadastrar": 3,
    "balcao-credito-franqueado": 3,
    "franqueado-pagar": 3,
    "produto-converter-quilo": 4,
    "produto-fracao-gramas": 4,
    "estoque-atacado-mesma-saca": 3,
}

CFG_CONTAS = {"linhas": [CONTA_CENTRO + "|" + CONTA_SITE + "|" + CONTA_NOVA], "opcoes": [r"^(Todas as lojas|Lojas escolhidas|Não recebe PIX)"], "rotulos": [LOJAS_OK]}


def conta_pix_cadastrar():
    aid = "conta-pix-cadastrar"
    passo("Animacao " + aid)
    comecar(aid, "dono", "/emporio/caixa", 800)
    confere(aid + ": o cenario existe (as contas)", bool(esperar(lambda: linha_da_tabela(CONTA_SITE), 30)))
    inicializar_pagina(CFG_CONTAS)
    rolar_topo("M.H('Contas bancárias')")
    # passo 1: o botao, no alto da secao Contas bancarias
    quadro(aid, 1, "M.B('Nova conta')", "o botao Nova conta", CFG_CONTAS, rolar=False)
    confere(aid + ": abre Nova conta", bool(esperar(lambda: clicar("Nova conta"), 30)))
    time.sleep(1.5)
    confere(aid + ": o painel abriu", painel_aberto())
    # passo 2: identificador, banco, CNPJ e favorecido
    confere(aid + ": identificador", preencher("Identificador", CONTA_NOVA) not in ("SEM ROTULO", "SEM CAMPO"))
    confere(aid + ": banco", preencher("Banco", "Banco Exemplo") not in ("SEM ROTULO", "SEM CAMPO"))
    confere(aid + ": CNPJ", preencher("CNPJ", CNPJ_NOVO) not in ("SEM ROTULO", "SEM CAMPO"))
    confere(aid + ": favorecido", preencher("Favorecido", FAVORECIDO_NOVO) not in ("SEM ROTULO", "SEM CAMPO"))
    time.sleep(0.5)
    quadro(aid, 2, "[M.L('Identificador'), M.L('Banco'), M.L('CNPJ'), M.L('Favorecido')]", "identificador, banco, CNPJ e favorecido", CFG_CONTAS)
    # passo 3: a lista Disponivel para PIX em, aberta
    ops = abrir_lista("Disponível para PIX em")
    confere(aid + ": a lista tem Todas as lojas, Lojas escolhidas e Não recebe PIX", ops is not None and all(x in ops for x in ("Todas as lojas", "Lojas escolhidas", "Não recebe PIX")), ops)
    quadro(aid, 3, "[M.L('Disponível para PIX em'), document.querySelector('[role=listbox]')]", "o campo Disponível para PIX em com a lista aberta", CFG_CONTAS, rolar=False)
    # passo 4: Lojas escolhidas, com uma loja marcada
    confere(aid + ": escolhe Lojas escolhidas", tocar_opcao_aberta("Lojas escolhidas") is True)
    time.sleep(0.8)
    confere(aid + ": marca " + RODOVIA, marcar(RODOVIA) is True)
    time.sleep(0.5)
    quadro(aid, 4, "M.CK('" + RODOVIA + "')", "a loja marcada", CFG_CONTAS)
    # passo 5: depois de Cadastrar conta, a linha na tabela
    enviar_painel()
    confere(aid + ": o painel fechou", esperar(lambda: not painel_aberto(), 60))
    ln = esperar(lambda: linha_da_tabela(CONTA_NOVA), 30)
    confere(aid + ": a conta nova aparece com CNPJ, favorecido e " + RODOVIA, bool(ln) and CNPJ_NOVO in ln and FAVORECIDO_NOVO in ln and RODOVIA in ln, ln)
    inicializar_pagina(CFG_CONTAS)
    rolar_topo("M.H('Contas bancárias')")
    quadro(aid, 5, "M.TR('" + CONTA_NOVA + "')", "a linha da conta nova", CFG_CONTAS, rolar=False)


CFG_BALCAO_PIX = {"opcoes": ["^(" + CONTA_CENTRO + "|" + CONTA_SITE + ")"]}


def balcao_conta_pix():
    aid = "balcao-conta-pix"
    passo("Animacao " + aid)
    comecar(aid, "vendedor_centro", "/emporio/vender", 900)
    escolher_loja_do_balcao(LOJA)
    adicionar_ao_balcao("Sal Mineral Pr", PROD_C, "5")
    confere(aid + ": escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
    time.sleep(0.5)
    # passo 1: a venda montada e o botao + PIX
    quadro(aid, 1, "M.B('+ PIX')", "o botao + PIX", CFG_BALCAO_PIX)
    confere(aid + ": toca em + PIX", clicar("+ PIX"))
    time.sleep(1)
    confere(aid + ": o valor em PIX e 30", preencher_aria("Valor em PIX (R$)", "30") != "SEM CAMPO")
    confere(aid + ": o campo Conta do PIX aparece", bool(esperar(lambda: texto_do_campo("Conta do PIX") not in ("SEM CAMPO", ""), 20)), texto_do_campo("Conta do PIX"))
    time.sleep(0.8)
    # passo 2: a conta da loja ja vem marcada
    confere(aid + ": a conta da loja (" + CONTA_CENTRO + ") vem marcada", texto_do_campo("Conta do PIX") == CONTA_CENTRO, texto_do_campo("Conta do PIX"))
    quadro(aid, 2, "[M.L('Conta do PIX'), M.A('Valor em PIX (R$)')]", "a linha PIX com a Conta do PIX", CFG_BALCAO_PIX)
    # passo 3: a lista aberta, so com as contas liberadas
    ops = abrir_lista("Conta do PIX")
    print("   opcoes do balcao (todas, antes do filtro): " + str(ops))
    confere(aid + ": a lista tem " + CONTA_CENTRO + " e " + CONTA_SITE, ops is not None and CONTA_CENTRO in ops and CONTA_SITE in ops, ops)
    confere(aid + ": a lista nao tem a conta da Rodovia (so da Rodovia)", ops is not None and CONTA_NOVA not in ops, ops)
    quadro(aid, 3, "[M.L('Conta do PIX'), document.querySelector('[role=listbox]')]", "o campo Conta do PIX com a lista aberta", CFG_BALCAO_PIX, rolar=False)
    # passo 4: outra conta, com o favorecido e o CNPJ embaixo
    confere(aid + ": troca para " + CONTA_SITE, tocar_opcao_aberta(CONTA_SITE) is True)
    time.sleep(0.8)
    confere(aid + ": embaixo, favorecido e CNPJ do " + CONTA_SITE, "CNPJ 45.723.174/0001-10" in texto_do_main(), texto_do_main()[-400:])
    quadro(aid, 4, "[M.L('Conta do PIX'), M.C('CNPJ 45.723.174/0001-10')]", "a conta escolhida com o favorecido e o CNPJ", CFG_BALCAO_PIX)
    # passo 5: a venda registrada
    confere(aid + ": fecha a venda", enviar_botao("Fechar a venda"))
    confere(aid + ": a venda sai", bool(esperar(venda_fechada, 60)), texto_do_main()[:300])
    time.sleep(1)
    quadro(aid, 5, "M.T('Venda registrada')", "o aviso Venda registrada", CFG_BALCAO_PIX)


CFG_FRANQUEADOS = {"linhas": [FRANQUEADO + "|" + FRANQUEADO_NOVO], "opcoes": ["^(Nenhum|" + FRANQUEADO + "|" + FRANQUEADO_NOVO + ")"]}


def franqueado_cadastrar():
    aid = "franqueado-cadastrar"
    passo("Animacao " + aid)
    comecar(aid, "dono", "/emporio/franqueados", 700)
    confere(aid + ": o cenario existe (" + FRANQUEADO + ")", bool(esperar(lambda: linha_da_tabela(FRANQUEADO), 30)))
    inicializar_pagina(CFG_FRANQUEADOS)
    # passo 1: o botao Novo franqueado
    quadro(aid, 1, "M.B('Novo franqueado')", "o botao Novo franqueado", CFG_FRANQUEADOS, rolar=False)
    confere(aid + ": abre Novo franqueado", bool(esperar(lambda: clicar("Novo franqueado"), 30)))
    time.sleep(1.5)
    confere(aid + ": o painel abriu", painel_aberto())
    # passo 2: nome e telefone
    confere(aid + ": nome", preencher("Nome", FRANQUEADO_NOVO) not in ("SEM ROTULO", "SEM CAMPO"))
    confere(aid + ": telefone", preencher("Telefone", "(38) 99888-7766") not in ("SEM ROTULO", "SEM CAMPO"))
    time.sleep(0.5)
    quadro(aid, 2, "[M.L('Nome'), M.L('Telefone')]", "nome e telefone", CFG_FRANQUEADOS)
    # passo 3: o franqueado na lista, com o saldo
    enviar_painel()
    confere(aid + ": o painel fechou", esperar(lambda: not painel_aberto(), 60))
    linha = esperar(lambda: linha_da_tabela(FRANQUEADO_NOVO), 30)
    confere(aid + ": a lista tem o franqueado com o telefone e R$ 0,00", bool(linha) and "(38) 99888-7766" in linha and "R$ 0,00" in linha, linha)
    inicializar_pagina(CFG_FRANQUEADOS)
    quadro(aid, 3, "M.TR('" + FRANQUEADO_NOVO + "')", "a linha do franqueado novo", CFG_FRANQUEADOS, rolar=False)


def id_do_franqueado(nome):
    for f in api("GET", "/api/v1/emporio/franchisees")["body"]["data"]:
        if f.get("name") == nome:
            return f["id"]
    return None


def balcao_credito_franqueado():
    aid = "balcao-credito-franqueado"
    passo("Animacao " + aid)
    comecar(aid, "dono", "/emporio/vender", 900)
    escolher_loja_do_balcao(LOJA)
    adicionar_ao_balcao("Sal Mineral Pr", PROD_C, "5")
    confere(aid + ": escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
    # passo 1: o campo Franqueado escolhido
    confere(aid + ": escolhe o franqueado " + FRANQUEADO, escolher("Franqueado (opcional)", FRANQUEADO) is True)
    time.sleep(0.6)
    quadro(aid, 1, "M.L('Franqueado (opcional)')", "o campo Franqueado escolhido", CFG_FRANQUEADOS)
    # passo 2: o credito digitado e o total somando
    confere(aid + ": digita o credito 12", preencher("Crédito do franqueado (R$)", "12") not in ("SEM ROTULO", "SEM CAMPO"))
    time.sleep(0.8)
    if DUMP:
        dump_tela()
    quadro(aid, 2, "M.L('Crédito do franqueado (R$)')", "o campo Crédito do franqueado", CFG_FRANQUEADOS, extras=["M.T('Total a pagar').parentElement"])
    # passo 3: a venda registrada
    confere(aid + ": adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
    time.sleep(1)
    confere(aid + ": o valor em dinheiro e 42", preencher_aria("Valor em Dinheiro (R$)", "42") != "SEM CAMPO")
    confere(aid + ": fecha a venda", enviar_botao("Fechar a venda"))
    confere(aid + ": a venda sai", bool(esperar(venda_fechada, 60)), texto_do_main()[:300])
    time.sleep(1)
    quadro(aid, 3, "M.T('Venda registrada')", "o aviso Venda registrada, com o credito", CFG_FRANQUEADOS)


def franqueado_pagar():
    aid = "franqueado-pagar"
    passo("Animacao " + aid)
    fid = id_do_franqueado(FRANQUEADO)
    confere(aid + ": o franqueado existe", bool(fid), fid)
    comecar(aid, "dono", "/emporio/franqueados/" + str(fid), 760)
    cfg = {"opcoes": [r"^(Gaveta: " + LOJA + "|" + CONTA_CENTRO + "|" + CONTA_SITE + ")"]}
    inicializar_pagina(cfg)
    saldo = "M.T('Crédito a pagar ao franqueado').parentElement"
    confere(aid + ": o extrato tem dois creditos", texto_do_main().count("Crédito\t") + texto_do_main().count("Crédito\n") >= 2, texto_do_main()[-300:])
    # passo 1: o extrato com os creditos
    quadro(aid, 1, "M.S('Extrato')", "o extrato", cfg)
    # passo 2: o painel Pagar credito com valor e origem
    confere(aid + ": abre Pagar crédito", bool(esperar(lambda: clicar("Pagar crédito"), 30)))
    time.sleep(1.5)
    confere(aid + ": o painel abriu", painel_aberto())
    if DUMP:
        dump_tela()
    confere(aid + ": valor 20", preencher("Valor", "20") not in ("SEM ROTULO", "SEM CAMPO"))
    confere(aid + ": origem: a gaveta da " + LOJA, escolher_prefixo("De onde sai o dinheiro", "Gaveta: " + LOJA) is True)
    time.sleep(0.6)
    quadro(aid, 2, "[M.L('Valor'), M.L('De onde sai o dinheiro')]", "o valor e a origem do pagamento", cfg)
    # passo 3: o extrato com o pagamento e o saldo menor
    enviar_painel()
    confere(aid + ": o painel fechou", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:300])
    confere(aid + ": o saldo cai para R$ 4,00", bool(esperar(lambda: tem_na_tela("R$ 4,00"), 30)), texto_do_main()[:300])
    time.sleep(1)
    inicializar_pagina(cfg)
    quadro(aid, 3, "[" + saldo + ", M.S('Extrato')]", "o saldo e o extrato com o pagamento", cfg)


# A tela do produto lista todas as lojas: so as duas da demonstracao ficam, e os titulos das secoes.
CFG_PRODUTO = {
    "linhas": [r"^(Loja Centro|Loja da Rodovia|GRANEL|Saca \d+ kg|ATACADO|Quilo|\d+ g)"],
    "cartoes": [r"^(Dados comerciais|Apresentações|Composição|Estoque por loja|Preço por loja|" + LOJAS_OK + ")"],
}


def produto_converter_quilo():
    aid = "produto-converter-quilo"
    passo("Animacao " + aid)
    a = id_do_produto(PROD_A)
    confere(aid + ": o produto " + PROD_A + " existe", bool(a), a)
    comecar(aid, "dono", "/emporio/produtos/" + str(a), 900)
    inicializar_pagina(CFG_PRODUTO)
    # passo 1: o botao Converter para quilo
    quadro(aid, 1, "M.B('Converter para quilo')", "o botao Converter para quilo", CFG_PRODUTO, rolar=False)
    confere(aid + ": abre Converter para quilo", bool(esperar(lambda: clicar("Converter para quilo"), 30)))
    time.sleep(1.5)
    confere(aid + ": o painel abriu", painel_aberto())
    confere(aid + ": a previa chega", bool(esperar(lambda: "1 saca = 15 kg" in texto_do_painel(), 30)), texto_do_painel()[:300])
    time.sleep(1)
    painel = texto_do_painel()
    confere(aid + ": a previa mostra as duas lojas do estoque", LOJA in painel and RODOVIA in painel, painel[:400])
    confere(aid + ": a previa mostra o GRANEL com a marca confira", "GRANELconfira" in painel.replace(" ", "") or "GRANEL confira" in painel, painel[:600])
    # passo 2: a previa, com a tabela por loja
    tabelas = "document.querySelectorAll('[role=dialog] table')"
    quadro(aid, 2, "[M.H('Estoque e custo por loja'), " + tabelas + "[0], M.C('Custo de referência')]", "a previa com a tabela por loja", CFG_PRODUTO, rolar=False)
    # passo 3: a tabela de apresentacoes, com a marca confira
    quadro(aid, 3, "[M.H('Apresentações'), " + tabelas + "[1], M.C('O valor não fecha')]", "a tabela de apresentacoes com a marca confira", CFG_PRODUTO)
    # passo 4: o produto ja em quilo
    enviar_painel()
    confere(aid + ": o painel fechou", esperar(lambda: not painel_aberto(), 60))
    confere(aid + ": o produto passa a vendido por quilo", bool(esperar(lambda: tem_na_tela("vendido por quilo"), 30)), texto_do_main()[:200])
    confere(aid + ": o botao Converter some", not tem_na_tela("Converter para quilo"))
    time.sleep(1)
    inicializar_pagina(CFG_PRODUTO)
    rolar_topo("document.querySelector('main')", 0)
    quadro(aid, 4, "M.C('vendido por quilo')", "a linha do produto, agora vendido por quilo", CFG_PRODUTO, rolar=False, extras=["M.S('Apresentações')"])


def clicar_no_cartao_da_loja(rotulo):
    """O botao `rotulo` do cartao de estoque da Loja Centro, na tela do produto."""
    return bool(js("(() => { const h = Array.from(document.querySelectorAll('main h3')).find(x => x.innerText.trim().startsWith(" + repr(LOJA) + ")); const c = h && h.closest('div.space-y-3'); const b = c && Array.from(c.querySelectorAll('button')).find(x => x.innerText.trim() === " + repr(rotulo) + "); if (!b) return false; b.click(); return true; })()"))


def clicar_editar_preco(loja, apresentacao):
    """O Editar da linha da tabela Preco por loja cujas duas primeiras celulas sao a loja e a apresentacao."""
    return bool(js("(() => { const r = Array.from(document.querySelectorAll('main tbody tr')).find(r => r.children.length > 1 && r.children[0].innerText.trim() === " + repr(loja) + " && r.children[1].innerText.trim() === " + repr(apresentacao) + "); const b = r && Array.from(r.querySelectorAll('button')).find(x => x.innerText.trim() === 'Editar'); if (!b) return false; b.click(); return true; })()"))


CFG_ESTOQUE = {"linhas": [r"^(" + NOSSOS + ")"], "ocultar": [r"^Precisa repor"], "pilulas": r"^(Todas as lojas|Loja Centro|Loja da Rodovia)$"}
CFG_ESTOQUE_B = {"linhas": [r"^" + PROD_B], "ocultar": [r"^Precisa repor"], "pilulas": r"^(Todas as lojas|Loja Centro|Loja da Rodovia)$"}


def produto_fracao_gramas():
    aid = "produto-fracao-gramas"
    passo("Animacao " + aid)
    a = id_do_produto(PROD_A)
    confere(aid + ": o produto " + PROD_A + " existe", bool(a), a)
    comecar(aid, "dono", "/emporio/produtos/" + str(a), 900)
    if tem_na_tela("Converter para quilo"):
        # A animacao e do produto em quilo: se a de converter nao rodou antes, converte pela tela, sem quadro.
        confere(aid + ": converte o produto antes (a animacao produto-converter-quilo nao rodou)", bool(esperar(lambda: clicar("Converter para quilo"), 30)))
        time.sleep(1.5)
        esperar(lambda: "1 saca = 15 kg" in texto_do_painel(), 30)
        enviar_painel()
        confere(aid + ": a conversao fechou o painel", esperar(lambda: not painel_aberto(), 60))
        confere(aid + ": o produto passa a vendido por quilo", bool(esperar(lambda: tem_na_tela("vendido por quilo"), 30)))
    inicializar_pagina(CFG_PRODUTO)
    # passo 1: a apresentacao 300 g criada
    confere(aid + ": abre Nova apresentação", bool(esperar(lambda: clicar("Nova apresentação"), 30)))
    time.sleep(1.5)
    confere(aid + ": o painel abriu", painel_aberto())
    confere(aid + ": o campo e 'Vale quanto (kg)'", texto_do_campo("Vale quanto (kg)") != "SEM CAMPO", texto_do_painel()[:200])
    confere(aid + ": nome 300 g", preencher("Nome", "300 g") not in ("SEM ROTULO", "SEM CAMPO"))
    confere(aid + ": vale 0,3", preencher("Vale quanto (kg)", "0,3") not in ("SEM ROTULO", "SEM CAMPO"))
    enviar_painel()
    confere(aid + ": o painel fechou", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:200])
    l300 = esperar(lambda: linha_da_tabela("300 g"), 30)
    confere(aid + ": a apresentacao aparece como 0,3 kg Avulsa", bool(l300) and "0,3 kg" in l300 and "Avulsa" in l300, l300)
    time.sleep(1)
    inicializar_pagina(CFG_PRODUTO)
    quadro(aid, 1, "M.TR('300 g')", "a linha da apresentacao 300 g", CFG_PRODUTO, extras=["M.todos('table')[0]"])
    # passo 2: o preco da fracao (a Rodovia sem quadro, a Centro no quadro)
    confere(aid + ": abre o preco de 300 g na " + RODOVIA, bool(esperar(lambda: clicar_editar_preco(RODOVIA, "300 g"), 30)))
    time.sleep(1.5)
    confere(aid + ": preco 4,50 na Rodovia", preencher("Preço (R$)", "4,50") not in ("SEM ROTULO", "SEM CAMPO"))
    enviar_painel()
    confere(aid + ": o preco da Rodovia salvou", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:200])
    confere(aid + ": abre o preco de 300 g na " + LOJA, bool(esperar(lambda: clicar_editar_preco(LOJA, "300 g"), 30)))
    time.sleep(1.5)
    confere(aid + ": o painel de preco abriu", painel_aberto())
    confere(aid + ": preco 4,50 na Centro", preencher("Preço (R$)", "4,50") not in ("SEM ROTULO", "SEM CAMPO"))
    time.sleep(0.5)
    quadro(aid, 2, "M.L('Preço (R$)')", "o campo Preço da fracao", CFG_PRODUTO, rolar=False)
    enviar_painel()
    confere(aid + ": o preco da Centro salvou", esperar(lambda: not painel_aberto(), 60), texto_do_painel()[:200])
    # passo 3: no balcao, 1 x 300 g na venda
    ir("/emporio/vender")
    js("localStorage.setItem('tibe.pwa.convite-dispensado', '1'); localStorage.setItem('tibe.push.convite-dispensado', '1')")
    escolher_loja_do_balcao(LOJA)
    adicionar_ao_balcao("Ração Poedei", PROD_A, "1", apresentacao="300 g")
    confere(aid + ": escolhe Consumidor final", escolher_cliente("Consumidor final") is True)
    time.sleep(0.5)
    cartoes_do_item = "M.todos('div.rounded-lg').filter(e => e.querySelector('[aria-label^=\"Quantidade do item\"]') && !e.querySelector('div.rounded-lg'))"
    quadro(aid, 3, cartoes_do_item, "o item 1 x 300 g na venda", {}, rolar=False)
    confere(aid + ": adiciona o pagamento em dinheiro", clicar("+ Dinheiro"))
    time.sleep(1)
    confere(aid + ": o valor em dinheiro e 4,50", preencher_aria("Valor em Dinheiro (R$)", "4,50") != "SEM CAMPO")
    confere(aid + ": fecha a venda", enviar_botao("Fechar a venda"))
    confere(aid + ": a venda sai", bool(esperar(venda_fechada, 60)), texto_do_main()[:300])
    # passo 4: o estoque, com as sacas fechadas e o resto em kg
    ir("/emporio/estoque?loja=" + str(id_da_loja(LOJA)))
    inicializar_pagina(CFG_ESTOQUE)
    linha = esperar(lambda: linha_da_tabela(PROD_A), 30)
    print("   estoque A: " + str(linha))
    cel = linha.split(" | ")
    confere(aid + ": o estoque tem 149,7 kg, 9 sacas fechadas e 14,7 kg avulsos", len(cel) > 3 and cel[1] == "149,7 kg" and cel[2] == "9 × Saca 15 kg" and cel[3] == "14,7 kg", linha)
    quadro(aid, 4, "M.TR('" + PROD_A + "')", "a linha do produto no estoque", CFG_ESTOQUE, extras=["M.todos('thead')[0]"])


def estoque_atacado_mesma_saca():
    aid = "estoque-atacado-mesma-saca"
    passo("Animacao " + aid)
    loja = id_da_loja(LOJA)
    comecar(aid, "gestor", "/emporio/estoque?loja=" + str(loja), 560)
    inicializar_pagina(CFG_ESTOQUE_B)
    linha = esperar(lambda: linha_da_tabela(PROD_B), 30)
    cel = linha.split(" | ")
    confere(aid + ": uma linha so, 10 sacas de 400 kg com os dois nomes", len(cel) > 3 and cel[1] == "400 kg" and cel[2] == "10 × " + DOIS_NOMES, linha)
    # passo 1: a linha unica
    quadro(aid, 1, "M.TR('" + PROD_B + "')", "a linha unica Saca 40 kg / ATACADO", CFG_ESTOQUE_B, rolar=False, extras=["M.todos('thead')[M.todos('thead').length - 1]"])
    # passo 2: vende 1 em ATACADO (pela API, sem quadro: o roteiro de validacao do granel ja passa a venda pela tela)
    pid = id_do_produto(PROD_B)
    prod = api("GET", "/api/v1/emporio/products/" + pid)["body"]["data"]
    atac = next(p for p in prod["presentations"] if p["name"] == "ATACADO")
    consumidor = [c["id"] for c in api("GET", "/api/v1/emporio/customers?q=Consumidor")["body"]["data"] if c["name"] == "Consumidor final"][0]
    res = api("POST", "/api/v1/emporio/sales", {
        "operation_key": "manual-gifs-atacado-" + str(int(time.time())),
        "establishment_id": loja,
        "customer_id": consumidor,
        "items": [{"emporio_product_id": pid, "presentation_id": atac["id"], "quantity": 1, "unit_price": 110}],
        "payments": [{"kind": "dinheiro", "amount": 110}],
    })
    confere(aid + ": a venda de 1 ATACADO saiu", res["status"] in (200, 201), str(res["status"]) + " " + json.dumps(res["body"], ensure_ascii=False)[:200])
    ir("/emporio/estoque?loja=" + str(loja))
    inicializar_pagina(CFG_ESTOQUE_B)
    linha = esperar(lambda: linha_da_tabela(PROD_B), 30)
    cel = linha.split(" | ")
    confere(aid + ": a mesma linha, com 9 sacas (360 kg)", len(cel) > 3 and cel[1] == "360 kg" and cel[2] == "9 × " + DOIS_NOMES, linha)
    quadro(aid, 2, "M.TR('" + PROD_B + "')", "a mesma linha com uma saca a menos", CFG_ESTOQUE_B, rolar=False, extras=["M.todos('thead')[M.todos('thead').length - 1]"])
    # passo 3: a contagem, com um campo so para o tamanho
    ir("/emporio/produtos/" + str(pid))
    js("(() => { window.__antes = 1; })()")
    confere(aid + ": abre Contar estoque da " + LOJA, bool(esperar(lambda: clicar_no_cartao_da_loja("Contar estoque"), 30)))
    time.sleep(1.5)
    confere(aid + ": o painel abriu", painel_aberto())
    campos = js("Array.from(document.querySelectorAll('[role=dialog] input')).map(x => x.getAttribute('aria-label') || '').filter(x => x.startsWith('Embalagens de'))") or []
    confere(aid + ": um campo so para o tamanho de 40 kg, com os dois nomes", campos == ["Embalagens de " + DOIS_NOMES], campos)
    inicializar_pagina(CFG_PRODUTO)
    quadro(aid, 3, "M.A('Embalagens de " + DOIS_NOMES + "').parentElement", "o campo unico do tamanho de 40 kg", CFG_PRODUTO, rolar=False)
    fechar_painel()


def executar():
    # As consultas de id usam fetch relativo: precisam de uma pagina do app aberta, com a sessao do Dono.
    entrar("dono")
    ir("/emporio")
    for aid, fn in ANIMACOES_FN:
        if not quer(aid):
            continue
        try:
            fn()
        except Exception as e:  # um erro de uma animacao nao derruba as outras
            confere(aid + ": terminou sem erro", False, repr(e)[:300])


ANIMACOES_FN = [
    ("conta-pix-cadastrar", conta_pix_cadastrar),
    ("balcao-conta-pix", balcao_conta_pix),
    ("franqueado-cadastrar", franqueado_cadastrar),
    ("balcao-credito-franqueado", balcao_credito_franqueado),
    ("franqueado-pagar", franqueado_pagar),
    ("produto-converter-quilo", produto_converter_quilo),
    ("produto-fracao-gramas", produto_fracao_gramas),
    ("estoque-atacado-mesma-saca", estoque_atacado_mesma_saca),
]

executar()

passo("Conferencia final: o numero de quadros de cada animacao e o do contrato")
for aid, n in PASSOS.items():
    if not quer(aid) or aid not in [a for a, _ in ANIMACOES_FN]:
        continue
    gravados = sorted(GRAVADOS.get(aid, []))
    confere(aid + ": " + str(n) + " quadros", gravados == list(range(1, n + 1)), gravados)

fim()
