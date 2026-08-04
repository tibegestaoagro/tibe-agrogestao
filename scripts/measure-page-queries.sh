#!/usr/bin/env bash
# Conta as queries que UM render de uma página do dashboard dispara no Postgres.
#
# Por que existe (auditoria de performance, 2026-08-04): medir pelo navegador
# não serve, porque cada navegação do Next dispara 2 ou 3 renders (prefetch RSC
# + documento) e o número varia entre execuções. Um GET via curl com o cookie
# de sessão é exatamente 1 render, então antes/depois viram comparáveis.
#
# Requer: container `tibe-pg` rodando com log_statement='all', `next dev` no ar,
# e um cookie de sessão válido em $SESSION_FILE.
#
# Uso: bash scripts/measure-page-queries.sh <rota> <rotulo>
#      bash scripts/measure-page-queries.sh /dashboard antes

set -euo pipefail

ROTA="${1:-/dashboard}"
ROTULO="${2:-medicao}"
PORTA="${PORTA:-3000}"
SESSION_FILE="${SESSION_FILE:-/tmp/tibe-sess.txt}"

if [ ! -f "$SESSION_FILE" ]; then
  echo "Cookie de sessão não encontrado em $SESSION_FILE" >&2
  exit 1
fi
SESS=$(cat "$SESSION_FILE")

docker exec tibe-pg psql -U tibe -d tibe_dev -c "SELECT 'MARK_${ROTULO}_INI';" > /dev/null 2>&1
sleep 1

CODE=$(curl -s -o /tmp/medicao-pagina.html -w "%{http_code}" \
  -H "Cookie: authjs.session-token=$SESS" "http://localhost:${PORTA}${ROTA}")

sleep 2
docker exec tibe-pg psql -U tibe -d tibe_dev -c "SELECT 'MARK_${ROTULO}_FIM';" > /dev/null 2>&1

if [ "$CODE" != "200" ]; then
  echo "Rota devolveu HTTP $CODE (esperado 200): sessão expirada ou rota errada" >&2
  exit 1
fi

docker logs tibe-pg 2>&1 \
  | sed -n "/MARK_${ROTULO}_INI/,/MARK_${ROTULO}_FIM/p" \
  | grep -oP 'execute <unnamed>: \K.*' > "/tmp/queries-${ROTULO}.txt"

TOTAL=$(wc -l < "/tmp/queries-${ROTULO}.txt")
echo "[$ROTULO] $ROTA -> $TOTAL queries em 1 render"
echo ""
echo "Tabelas mais consultadas:"
grep -oP 'FROM "public"\."\K\w+' "/tmp/queries-${ROTULO}.txt" | sort | uniq -c | sort -rn | head -8
