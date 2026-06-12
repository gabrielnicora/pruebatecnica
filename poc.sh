#!/usr/bin/env bash
# =============================================================================
#  Helper de la POC de Microcks  —  ./poc.sh <comando>
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.yml"

usage() {
  cat <<EOF
Uso: ./poc.sh <comando>

  up            Levanta TODO con Keycloak (autenticación ON).
  up-noauth     Levanta TODO sin Keycloak (sin credenciales que mantener).
  test          Re-ejecuta los 3 contract tests y muestra el resultado.
  mock          Deja solo el mock server (sin IUTs ni contract-tester).
  logs [svc]    Sigue logs (de un servicio o de todos).
  ps            Estado de los contenedores.
  down          Baja el stack (conserva los datos de Mongo).
  reset         Baja el stack y BORRA los datos de Mongo (-v).

Ejemplos:
  ./poc.sh up        # demo completa con login
  ./poc.sh up-noauth # demo rápida sin login
  ./poc.sh test      # volver a correr los tests
EOF
}

wait_and_show_tests() {
  echo "⏳ Esperando a que el contract-tester termine..."
  docker wait contract-tester >/dev/null 2>&1 || true
  echo ""
  docker logs contract-tester 2>&1 | tail -40
}

cmd="${1:-}"
case "$cmd" in
  up)
    echo "🚀 Levantando POC CON Keycloak (auth ON)..."
    COMPOSE_PROFILES=auth KEYCLOAK_ENABLED=true \
      KC_CLIENT_ID=microcks-serviceaccount \
      KC_CLIENT_SECRET=ab54d329-e435-41ae-a900-ec6b3fe15c54 \
      $COMPOSE up -d --build
    wait_and_show_tests
    ;;
  up-noauth)
    echo "🚀 Levantando POC SIN Keycloak (auth OFF)..."
    COMPOSE_PROFILES= KEYCLOAK_ENABLED=false \
      KC_CLIENT_ID=foo KC_CLIENT_SECRET=bar \
      $COMPOSE up -d --build
    wait_and_show_tests
    ;;
  test)
    echo "🧪 Re-ejecutando contract tests..."
    $COMPOSE up -d --no-deps --force-recreate contract-tester
    wait_and_show_tests
    ;;
  mock)
    echo "🎭 Levantando solo el mock server (sin IUTs ni tester)..."
    $COMPOSE up -d mongo app postman async-minion kafka importer \
      $( [ "${KEYCLOAK_ENABLED:-true}" = "true" ] && echo keycloak )
    echo "Microcks UI: http://localhost:8585"
    ;;
  logs)    shift; $COMPOSE logs -f "${@:-}";;
  ps)      $COMPOSE ps;;
  down)    $COMPOSE --profile auth down;;
  reset)   $COMPOSE --profile auth down -v;;
  ""|-h|--help|help) usage;;
  *) echo "Comando desconocido: $cmd"; echo; usage; exit 1;;
esac
