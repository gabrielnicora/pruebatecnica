#!/bin/sh
# Script de contract testing ejecutado por microcks-cli.
# Espera a que Microcks importe los 3 artefactos y luego corre los tests.

MICROCKS_URL="http://microcks:8080/api"
REST_IUT="http://bank-api-server:3000"
SOAP_IUT="http://bank-soap-server:3001"
KAFKA_IUT="kafka://kafka:19092"

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

wait_for_artifact() {
  name="$1"
  echo ""
  echo "⏳  Esperando a que '$name' esté importado en Microcks..."
  attempts=0
  while [ $attempts -lt 30 ]; do
    if wget -qO- "$MICROCKS_URL/services" 2>/dev/null | grep -q "$name"; then
      echo "✅  '$name' importado."
      return 0
    fi
    sleep 5
    attempts=$((attempts + 1))
  done
  echo "❌  Timeout esperando '$name'. Continuando de todos modos..."
  return 1
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

  microcks-cli test "$api" "$endpoint" "$runner" \
    --microcksURL="$MICROCKS_URL" \
    --insecure \
    --keycloakClientId=foo \
    --keycloakClientSecret=bar \
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
until wget -qO- "$MICROCKS_URL/services" > /dev/null 2>&1; do
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
  "HTTP" \
  "10sec"

run_test \
  "BankLegacyService SOAP" \
  "BankLegacyService:1.0" \
  "$SOAP_IUT" \
  "SOAP_HTTP" \
  "8sec"

run_test \
  "Banking Account Events (Kafka)" \
  "Banking Account Events:1.0.0" \
  "$KAFKA_IUT" \
  "ASYNC_API" \
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
