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
  base(on, () => 91)
  on('fs.stat', () => ({ value: { kind: 'file', size: 10, mtimeMs: 2_000, isLink: false } }))
  const compactou: string[] = []
  on('session.compact', (_$, e) => {
    compactou.push(e.instructions ?? '')
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
