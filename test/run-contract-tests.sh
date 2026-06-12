#!/bin/sh
# Script de contract testing ejecutado por microcks-cli.
# Espera a que Microcks importe los 3 artefactos y luego corre los tests.

MICROCKS_URL="http://microcks:8080/api"
# /api/health es PÚBLICO (no requiere token). /api/services está protegido
# cuando Keycloak está activo, así que NO sirve para el readiness check.
HEALTH_URL="http://microcks:8080/api/health"
REST_IUT="http://bank-api-server:3000"
SOAP_IUT="http://bank-soap-server:3001"
KAFKA_IUT="kafka://kafka:19092/BankingAccountEvents-1.0.0-banking-account-transactions"

# Modo no-auth (KEYCLOAK_ENABLED=false): el compose no define estas vars, así que
#   caen a foo/bar (el CLI detecta keycloak deshabilitado y omite el token).
# Modo auth (KEYCLOAK_ENABLED=true): el compose pasa las credenciales reales del
#   service account del realm.
KC_CLIENT_ID="${KC_CLIENT_ID:-foo}"
KC_CLIENT_SECRET="${KC_CLIENT_SECRET:-bar}"

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Nota: la importación de artefactos la garantiza el importer (el contract-tester
# depende de que termine con éxito vía depends_on:service_completed_successfully).
# No chequeamos /api/services acá porque está protegido cuando Keycloak está
# activo y no tenemos token en el script.
wait_for_artifact() {
  echo "✅  '$1' (importación garantizada por el importer)."
}

run_test() {
  label="$1"
  api="$2"
  endpoint="$3"
  runner="$4"
  wait_sec="${5:-8sec}"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🧪  Contract Test: $label"
  echo "    API:      $api"
  echo "    IUT:      $endpoint"
  echo "    Runner:   $runner"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  microcks test "$api" "$endpoint" "$runner" \
    --microcksURL="$MICROCKS_URL" \
    --insecure-tls \
    --keycloakClientId="$KC_CLIENT_ID" \
    --keycloakClientSecret="$KC_CLIENT_SECRET" \
    --waitFor="$wait_sec" \
    --verbose

  if [ $? -eq 0 ]; then
    echo "✅  PASS — $label"
    PASS=$((PASS + 1))
  else
    echo "❌  FAIL — $label"
    FAIL=$((FAIL + 1))
  fi
}

# ---------------------------------------------------------------------------
# Esperar que Microcks esté vivo
# ---------------------------------------------------------------------------
echo ""
echo "🔄  Esperando que Microcks esté disponible..."
until curl -fsS "$HEALTH_URL" > /dev/null 2>&1; do
  sleep 5
done
echo "✅  Microcks listo."

# ---------------------------------------------------------------------------
# Esperar imports
# ---------------------------------------------------------------------------
wait_for_artifact "Banking API"
wait_for_artifact "BankLegacyService"
wait_for_artifact "Banking Account Events"

# Dar tiempo extra al kafka-producer para conectarse y empezar a publicar
echo ""
echo "⏳  Esperando 10s para que el kafka-producer esté publicando..."
sleep 10

# ---------------------------------------------------------------------------
# Contract Tests
# ---------------------------------------------------------------------------

run_test \
  "Banking REST API" \
  "Banking API:1.0.0" \
  "$REST_IUT" \
  "OPEN_API_SCHEMA" \
  "10sec"

run_test \
  "BankLegacyService SOAP" \
  "BankLegacyService Mock:1.0" \
  "$SOAP_IUT" \
  "SOAP_HTTP" \
  "8sec"

run_test \
  "Banking Account Events (Kafka)" \
  "Banking Account Events:1.0.0" \
  "$KAFKA_IUT" \
  "ASYNC_API_SCHEMA" \
  "15sec"

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  RESULTADOS DE CONTRACT TESTING"
echo "  ✅  PASS: $PASS"
echo "  ❌  FAIL: $FAIL"
echo "════════════════════════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
