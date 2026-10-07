import type { EngineInterface, Register } from 'claude-code'

// O handoff é o que sobrevive ao resumo automático (CLAUDE.md, "Retomando
// depois de um resumo de contexto"). Este mod garante que ele seja escrito
// ANTES do resumo, e não reconstruído de memória depois.
const HANDOFF = 'docs/agents/current-handoff.md'

// O additionalContext tem teto de ~10 mil caracteres por entrada.
const TETO_REINJECAO = 9000

const INSTRUCOES_DO_RESUMO = [
  `O estado verificado do trabalho está em ${HANDOFF}: o resumo aponta para ele em vez de reconstruir o estado.`,
  'Preserve a branch atual, a etapa do plano em execução e o caminho do arquivo do plano.',
  'Preserve as decisões que o usuário tomou nesta sessão, com as palavras dele.',
  'Autorização de merge, push na main ou deploy dada antes do resumo NÃO vale para nenhuma ação depois dele: registre isso explicitamente.',
].join('\n')

const PROMPT_DEPOIS_DO_RESUMO = [
  'A conversa acabou de ser compactada pelo guarda-contexto.',
  `Releia os invariantes do CLAUDE.md e ${HANDOFF}, e continue do próximo passo registrado lá.`,
  'Se a última mensagem antes do resumo era uma pergunta ao usuário, repita a pergunta e pare.',
].join(' ')

type Limiares = { aviso: number; agir: number }

// ponytail: marcas em variável do módulo. Um reload do mod (só acontece
// quando ele é editado) as esquece e pode repetir o aviso uma vez.
const marcas = {
  avisou: false,
  pediuEm: undefined as number | undefined,
  cobrou: false,
  compactando: false,
}

function zerar() {
  marcas.avisou = false
  marcas.pediuEm = undefined
  marcas.cobrou = false
}

// Devolve o lembrete a anexar ao contexto, uma vez por limiar.
async function lembrete($: EngineInterface, limiares: Limiares): Promise<string | undefined> {
  const { context } = await $.session.usage()
  const p = context.percent ?? 0
  if (p < limiares.aviso) {
    zerar()
    return undefined
  }
  if (p >= limiares.agir && marcas.pediuEm === undefined) {
    marcas.pediuEm = await $.clock.now()
    marcas.avisou = true
    $.ui.toast(`guarda-contexto: ${p}%, handoff e compactação`)
    return `Contexto em ${p}%. Antes de qualquer outro passo, atualize ${HANDOFF} (estado, branch, commit, próximo passo exato). A conversa será compactada no fim deste turno e retomada a partir dele.`
  }
  if (!marcas.avisou) {
    marcas.avisou = true
    $.ui.toast(`guarda-contexto: ${p}%, handoff ao fechar a tarefa`)
    return `Contexto em ${p}%. Ao fechar a tarefa atual, atualize ${HANDOFF} (estado, branch, commit, próximo passo) antes de seguir.`
  }
  return undefined
}

async function handoffAtualizadoDesde($: EngineInterface, desde: number): Promise<boolean> {
  try {
    const stat = await $.fs.stat(HANDOFF)
    return stat.mtimeMs >= desde
  } catch {
    return false
  }
}

async function compactar($: EngineInterface) {
  if (marcas.compactando) return
  marcas.compactando = true
  try {
    const resultado = await $.session.compact({ instructions: INSTRUCOES_DO_RESUMO })
    if (!('skip' in resultado)) {
      zerar()
      $.prompt.submit({ text: PROMPT_DEPOIS_DO_RESUMO }).catch(() => undefined)
    }
  } catch {
    // Recusa enquanto um turno roda: o próximo turn.complete tenta de novo.
  } finally {
    marcas.compactando = false
  }
}

async function reinjetarHandoff($: EngineInterface): Promise<string | undefined> {
  let texto: string
  try {
    texto = await $.fs.read(HANDOFF)
  } catch {
    return undefined
  }
  const inicio = Math.max(texto.indexOf('## Estado atual'), 0)
  const trecho = texto.slice(inicio, inicio + TETO_REINJECAO)
  return `guarda-contexto: trecho de ${HANDOFF}, reinjetado depois do resumo.\n\n${trecho}`
}

export const register: Register = (on, options) => {
  const limiares: Limiares = {
    aviso: Number(options.aviso ?? 75),
    agir: Number(options.agir ?? 90),
  }

  // Durante um turno longo de ferramentas, o lembrete entra junto do resultado.
  on('classic.PostToolUse', async ($, e, next) => {
    const resultado = await next(e)
    if (e.agent_id) return resultado
    const texto = await lembrete($, limiares)
    if (!texto) return resultado
    return { ...resultado, additionalContext: [...(resultado.additionalContext ?? []), texto] }
  })

  // Num turno que começa por mensagem, o lembrete entra junto dela.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const resultado = await next(e)
    const texto = await lembrete($, limiares)
    if (!texto) return resultado
    return { ...resultado, additionalContext: [...(resultado.additionalContext ?? []), texto] }
  })

  on('turn.complete', async ($, e, next) => {
    const resultado = await next(e)
    if (e.agentId || e.reason !== 'answer' || marcas.pediuEm === undefined) return resultado

    if (await handoffAtualizadoDesde($, marcas.pediuEm)) {
      // O turno ainda está fechando; a compactação só é aceita entre turnos.
      $.clock.after(1500, () => void compactar($))
    } else if (!marcas.cobrou) {
      marcas.cobrou = true
      $.prompt
        .submit({
          text: `O contexto passou de ${limiares.agir}% e ${HANDOFF} não foi atualizado. Atualize-o agora (estado, branch, commit, próximo passo) e responda só "handoff atualizado".`,
        })
        .catch(() => undefined)
    }
    return resultado
  })

  // Vale também para o resumo automático do próprio Claude Code e para o /compact.
  on('session.compact', ($, e, next) => {
    if (e.agentId || e.trigger === 'precompute') return next(e)
    const instructions = e.instructions?.includes(HANDOFF)
      ? e.instructions
      : [e.instructions, INSTRUCOES_DO_RESUMO].filter(Boolean).join('\n\n')
    return next({ ...e, instructions })
  })

  // Depois de qualquer resumo, o handoff volta para o contexto.
  on('classic.SessionStart', async ($, e, next) => {
    const resultado = await next(e)
    if (e.source !== 'compact') return resultado
    const texto = await reinjetarHandoff($)
    if (!texto) return resultado
    return { ...resultado, additionalContext: [...(resultado.additionalContext ?? []), texto] }
  })
}
