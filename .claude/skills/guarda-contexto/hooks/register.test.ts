import { expect, mock, test } from 'claude-code/testing'

const HANDOFF = 'docs/agents/current-handoff.md'

const ferramenta = {
  tool_name: 'Bash',
  tool_input: { command: 'ls' },
  tool_response: { stdout: '' },
  tool_use_id: 't1',
}

const fimDeTurno = {
  answer: 'ok',
  durationMs: 10,
  isAborted: false,
  turnId: 'turno-1',
  reason: 'answer' as const,
}

type On = Parameters<Extract<Parameters<typeof test>[1], (...a: never[]) => unknown>>[1]

const MENSAGEM = [{ role: "user" as const, text: "oi", toolUses: [] }]

// O que o engine faria por baixo: os eventos clássicos sem hook de settings, e o uso de contexto.
function base(on: On, percent: () => number) {
  on("classic.PostToolUse", () => ({}))
  on("classic.UserPromptSubmit", () => ({}))
  on("classic.SessionStart", () => ({}))
  on("turn.complete", (_$, e) => ({ text: e.answer }))
  on("turn.start", (_$, e) => ({ turnId: e.turnId }))
  on("ui.toast", () => ({ value: undefined }))
  on("session.usage", () => ({
    value: { startedAt: 0, context: { tokens: percent() * 10_000, window: 1_000_000, percent: percent() }, rateLimits: [] },
  }))
}

test('abaixo do aviso não diz nada', async ($, on) => {
  base(on, () => 50)
  const r = await $.classic.PostToolUse(ferramenta)
  expect(r.additionalContext ?? []).toEqual([])
})

test('no aviso lembra uma vez só', async ($, on) => {
  base(on, () => 76)
  const primeiro = await $.classic.PostToolUse(ferramenta)
  expect((primeiro.additionalContext ?? []).join(' ')).toContain('Ao fechar a tarefa atual')
  const segundo = await $.classic.PostToolUse(ferramenta)
  expect(segundo.additionalContext ?? []).toEqual([])
})

test('lembrete também entra pela mensagem do usuário', async ($, on) => {
  base(on, () => 80)
  const r = await $.classic.UserPromptSubmit({ prompt: 'segue' })
  expect((r.additionalContext ?? []).join(' ')).toContain(HANDOFF)
})

test('no limiar de agir, com handoff atualizado, compacta e retoma', async ($, on) => {
  const relogio = mock.clock(on, { now: 1_000 })
  let uso = 91
  base(on, () => uso)
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 2_000, isLink: false } }))
  const compactou: string[] = []
  on('session.compact', (_$, e) => {
    compactou.push(e.instructions ?? '')
    uso = 20
    return { messages: MENSAGEM }
  })
  const enviados: string[] = []
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)
    return { text: e.text }
  })

  const r = await $.classic.PostToolUse(ferramenta)
  expect((r.additionalContext ?? []).join(' ')).toContain('Antes de qualquer outro passo')

  await $.turn.complete(fimDeTurno)
  expect(compactou.length).toBe(0)
  await relogio.advance(1_500)
  expect(compactou.length).toBe(1)
  expect(compactou[0]).toContain(HANDOFF)
  expect(enviados.join(' ')).toContain('acabou de ser compactada')
})

test('no limiar de agir, sem handoff atualizado, cobra em vez de compactar', async ($, on) => {
  const relogio = mock.clock(on, { now: 5_000 })
  base(on, () => 92)
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 1_000, isLink: false } }))
  const compactou: number[] = []
  on('session.compact', () => {
    compactou.push(1)
    return { messages: MENSAGEM }
  })
  const enviados: string[] = []
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)
    return { text: e.text }
  })

  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete(fimDeTurno)
  await relogio.advance(2_000)
  expect(compactou.length).toBe(0)
  expect(enviados.join(' ')).toContain('não foi atualizado')
})

test('o resumo automático recebe a instrução do handoff', async ($, on) => {
  base(on, () => 10)
  let recebida = ''
  on('session.compact', (_$, e) => {
    recebida = e.instructions ?? ''
    return { messages: MENSAGEM }
  })
  await $.session.compact({ trigger: 'auto', messages: MENSAGEM })
  expect(recebida).toContain(HANDOFF)
  expect(recebida).toContain('NÃO vale')
})

test('depois do resumo o handoff volta ao contexto', async ($, on) => {
  base(on, () => 10)
  on('fs.read', () => ({ value: '# Handoff\n\nintro\n\n## Estado atual\n\n- etapa E0 em curso\n' }))
  const r = await $.classic.SessionStart({ source: 'compact' })
  const texto = (r.additionalContext ?? []).join(' ')
  expect(texto).toContain('## Estado atual')
  expect(texto).toContain('etapa E0')
  expect(texto).not.toContain('intro')
})

test('sessão nova (não resumo) não recebe reinjeção', async ($, on) => {
  base(on, () => 10)
  on('fs.read', () => ({ value: '## Estado atual\n' }))
  const r = await $.classic.SessionStart({ source: 'startup' })
  expect(r.additionalContext ?? []).toEqual([])
})

// Os casos abaixo nasceram da revisão adversarial do Codex (2026-10-07).

test('turno que termina em pergunta ao usuário não compacta nem cobra', async ($, on) => {
  const relogio = mock.clock(on, { now: 1_000 })
  base(on, () => 91)
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 2_000, isLink: false } }))
  const compactou: number[] = []
  on('session.compact', () => {
    compactou.push(1)
    return { messages: MENSAGEM }
  })
  const enviados: string[] = []
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)
    return { text: e.text }
  })

  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete({ ...fimDeTurno, answer: 'Etapa pronta.\n\nPosso fazer o merge?' })
  await relogio.advance(2_000)
  expect(compactou.length).toBe(0)
  expect(enviados).toEqual([])
})

test('instrução que só cita o handoff ainda recebe a cláusula de autorização', async ($, on) => {
  base(on, () => 10)
  let recebida = ''
  on('session.compact', (_$, e) => {
    recebida = e.instructions ?? ''
    return { messages: MENSAGEM }
  })
  await $.session.compact({ trigger: 'manual', instructions: `foque em ${HANDOFF}`, messages: MENSAGEM })
  expect(recebida).toContain('NÃO vale')
  expect(recebida).toContain(`foque em ${HANDOFF}`)
})

test('resumo feito por fora recomeça o ciclo de aviso', async ($, on) => {
  base(on, () => 76)
  on('fs.read', () => ({ value: '## Estado atual\n' }))
  const antes = await $.classic.PostToolUse(ferramenta)
  expect((antes.additionalContext ?? []).join(' ')).toContain('Ao fechar a tarefa atual')
  await $.classic.SessionStart({ source: 'compact' })
  const depois = await $.classic.PostToolUse(ferramenta)
  expect((depois.additionalContext ?? []).join(' ')).toContain('Ao fechar a tarefa atual')
})

test('cobrança que falhou ao enviar é tentada de novo no turno seguinte', async ($, on) => {
  mock.clock(on, { now: 5_000 })
  base(on, () => 92)
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 1_000, isLink: false } }))
  let tentativas = 0
  on('prompt.submit', () => {
    tentativas += 1
    throw new Error('ocupado')
  })

  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete(fimDeTurno)
  await $.turn.complete({ ...fimDeTurno, turnId: 'turno-2' })
  expect(tentativas).toBe(2)
})

test('compactação que não baixa o contexto suspende o ciclo em vez de retomar', async ($, on) => {
  const relogio = mock.clock(on, { now: 1_000 })
  base(on, () => 91)
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 2_000, isLink: false } }))
  const compactou: number[] = []
  on('session.compact', () => {
    compactou.push(1)
    return { messages: MENSAGEM }
  })
  const enviados: string[] = []
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)
    return { text: e.text }
  })

  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete(fimDeTurno)
  await relogio.advance(1_500)
  expect(compactou.length).toBe(1)
  expect(enviados.join(' ')).not.toContain('acabou de ser compactada')

  const depois = await $.classic.PostToolUse(ferramenta)
  expect(depois.additionalContext ?? []).toEqual([])
  await $.turn.complete({ ...fimDeTurno, turnId: 'turno-2' })
  await relogio.advance(1_500)
  expect(compactou.length).toBe(1)
})

// Segunda rodada do Codex (2026-10-07).

function cenarioAgir(on: On, uso: () => number, aoCompactar: () => void = () => undefined) {
  const relogio = mock.clock(on, { now: 1_000 })
  base(on, uso)
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 2_000, isLink: false } }))
  const compactou: number[] = []
  on('session.compact', () => {
    compactou.push(1)
    aoCompactar()
    return { messages: MENSAGEM }
  })
  const enviados: string[] = []
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)
    return { text: e.text }
  })
  return { relogio, compactou, enviados }
}

test('pergunta seguida de texto ainda conta como espera pelo usuário', async ($, on) => {
  const { relogio, compactou, enviados } = cenarioAgir(on, () => 91)
  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete({ ...fimDeTurno, answer: 'Posso fazer o merge?\nAguardo sua confirmação.' })
  await relogio.advance(2_000)
  expect(compactou.length).toBe(0)
  expect(enviados).toEqual([])
})

test('pergunta seguida de lista e despedida ainda conta como espera', async ($, on) => {
  const { relogio, compactou, enviados } = cenarioAgir(on, () => 91)
  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete({
    ...fimDeTurno,
    answer: 'Posso fazer o merge?\n\nO que entra:\n- o mod\n- os testes\n\nAguardo sua resposta.',
  })
  await relogio.advance(2_000)
  expect(compactou.length).toBe(0)
  expect(enviados).toEqual([])
})

test('turno que termina em pergunta durante a leitura do handoff anula a decisão antiga', async ($, on) => {
  const relogio = mock.clock(on, { now: 1_000 })
  base(on, () => 91)
  let liberar: (() => void) | undefined
  on('fs.stat', () =>
    new Promise((resolve) => {
      liberar = () => resolve({ value: { kind: 'file', size: 10, mtimeMs: 2_000, isLink: false } })
    }),
  )
  const compactou: number[] = []
  on('session.compact', () => {
    compactou.push(1)
    return { messages: MENSAGEM }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))

  await $.classic.PostToolUse(ferramenta)
  const antigo = $.turn.complete(fimDeTurno)
  for (let i = 0; i < 200 && !liberar; i++) await relogio.advance(0)
  expect(liberar).toBeDefined()
  await $.turn.start({ text: 'espera', turnId: 'turno-2' })
  await $.turn.complete({ ...fimDeTurno, turnId: 'turno-2', answer: 'Quer que eu pare?' })
  liberar?.()
  await antigo
  await relogio.advance(2_000)
  expect(compactou.length).toBe(0)
})

test('interrogação dentro de bloco de código não segura a compactação', async ($, on) => {
  let uso = 91
  const { relogio, compactou } = cenarioAgir(on, () => uso, () => {
    uso = 20
  })
  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete({ ...fimDeTurno, answer: 'Feito.\n```\nconst x = a ? b : c\n```' })
  await relogio.advance(1_500)
  expect(compactou.length).toBe(1)
})

test('turno novo que termina em pergunta cancela a compactação já agendada', async ($, on) => {
  const { relogio, compactou } = cenarioAgir(on, () => 91)
  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete(fimDeTurno)
  await $.turn.start({ text: 'espera', turnId: 'turno-2' })
  await $.turn.complete({ ...fimDeTurno, turnId: 'turno-2', answer: 'Quer que eu pare?' })
  await relogio.advance(2_000)
  expect(compactou.length).toBe(0)
})

test('resumo feito por fora desfaz a suspensão', async ($, on) => {
  let uso = 91
  const { relogio, compactou } = cenarioAgir(on, () => uso)
  on('fs.read', () => ({ value: '## Estado atual\n' }))
  await $.classic.PostToolUse(ferramenta)
  await $.turn.complete(fimDeTurno)
  await relogio.advance(1_500)
  expect(compactou.length).toBe(1)
  // O SessionStart do próprio resumo (logo em seguida) não desfaz a suspensão.
  await $.classic.SessionStart({ source: 'compact' })
  const logoDepois = await $.classic.PostToolUse(ferramenta)
  expect(logoDepois.additionalContext ?? []).toEqual([])
  // Minutos depois, um /compact do usuário baixa para 80: o ciclo recomeça.
  await relogio.advance(60_000)
  uso = 80
  await $.classic.SessionStart({ source: 'compact' })
  uso = 92
  const depois = await $.classic.PostToolUse(ferramenta)
  expect((depois.additionalContext ?? []).join(' ')).toContain('Antes de qualquer outro passo')
})
