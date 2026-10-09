#!/usr/bin/env bash
# Induce or clear one of the four failure scenarios. Run on the host, from the
# repo root. See target-system/README.md for what each one does.
#
#   scripts/scenario.sh status
#   scripts/scenario.sh 1 on|off     DB pool exhaustion (burst load)
#   scripts/scenario.sh 2 on|off     slow inventory-service (800ms)
#   scripts/scenario.sh 3 on|off     Redis down
#   scripts/scenario.sh 4 on|off     GET /orders/{order_id} broken
set -euo pipefail
cd "$(dirname "$0")/.."

ORDERS=http://localhost:8000
INVENTORY=http://localhost:8001

warmup_check() {
  # The baseline needs ~10 min of healthy traffic after the last restart.
  local started age
  started=$(docker inspect -f '{{.State.StartedAt}}' "$(docker compose ps -q orders-api)")
  age=$(( $(date +%s) - $(date -d "$started" +%s) ))
  if (( age < 900 )); then
    echo "warning: orders-api started $((age / 60)) min ago; <15 min means the agent will flag a weak baseline"
  fi
}

case "${1:-status}" in
  status)
    echo "inventory delay: $(curl -s $INVENTORY/admin/state)"
    echo "broken routes:   $(curl -s $ORDERS/admin/state)"
    echo "redis:           $(docker compose ps --format '{{.Status}}' redis 2>/dev/null || echo stopped)"
    echo "burst loadgen:   $(docker ps --filter name=loadgen-burst --format '{{.Status}}' | head -1 || true)"
    echo "firing alerts:   $(curl -s localhost:9093/api/v2/alerts?active=true | python3 -c 'import json,sys; print([a["labels"]["alertname"]+" "+a["labels"].get("route","") for a in json.load(sys.stdin)] or "none")')"
    ;;
  1)
    if [[ "${2:-}" == on ]]; then
      warmup_check
      docker compose --profile burst run -d --rm --name loadgen-burst loadgen-burst >/dev/null
      echo "scenario 1 on: 60 req/s extra on GET /orders for 15 min (scripts/scenario.sh 1 off to stop)"
    else
      docker rm -f loadgen-burst >/dev/null 2>&1 || true
      echo "scenario 1 off"
    fi ;;
  2)
    if [[ "${2:-}" == on ]]; then
      warmup_check
      curl -s -X POST "$INVENTORY/admin/delay?ms=800"; echo
    else
      curl -s -X POST "$INVENTORY/admin/delay?ms=0"; echo
    fi ;;
  3)
    if [[ "${2:-}" == on ]]; then
      warmup_check
      docker compose stop redis
    else
      docker compose start redis
    fi ;;
  4)
    if [[ "${2:-}" == on ]]; then
      warmup_check
      curl -s -X POST "$ORDERS/admin/break?route=get_order&enabled=true"; echo
    else
      curl -s -X POST "$ORDERS/admin/break?route=get_order&enabled=false"; echo
    fi ;;
  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
