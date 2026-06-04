# POC Microcks — Virtualización bancaria (REST + SOAP + Event-Driven)

Segunda variante de la POC, usando [Microcks](https://microcks.io) en vez de mountebank.
Demuestra los **3 mundos** de virtualización + **contract testing** con una sola herramienta:

| Tipo | Servicio | Artefacto |
|---|---|---|
| **REST** | Banking API (auth, cuentas, transacciones, transferencias) | `openapi/banking-api.yaml` |
| **SOAP** | BankLegacyService (extracto de cuenta legacy) | `soap/BankLegacyService-soapui-project.xml` |
| **Event-Driven** | Banking Account Events (eventos de transacciones a Kafka) | `asyncapi/account-events-asyncapi.yaml` |

## Arquitectura

```
┌────────────────────────────────────────────────────────────────────────┐
│  Mocking                             Contract Testing                  │
│                                                                        │
│  ┌────────────────┐   importa        ┌───────────────────────────┐    │
│  │  OpenAPI YAML  │ ─────────────┐   │  bank-api-server :3000    │    │
│  │  WSDL/SoapUI  │               │   │  (REST IUT — Express)     │    │
│  │  AsyncAPI YAML │ ─────────┐   │   └───────────────────────────┘    │
│  └────────────────┘         │   │   ┌───────────────────────────┐    │
│                              │   │   │  bank-soap-server :3001   │    │
│  ┌────────────────┐          │   │   │  (SOAP IUT — Express)     │    │
│  │  microcks-uber │◀─────────┘   │   └───────────────────────────┘    │
│  │  UI :8585      │              │   ┌───────────────────────────┐    │
│  │  API :8585     │◀─────────────┘   │  kafka-producer           │    │
│  └───────┬────────┘  lanza tests     │  (Async IUT — KafkaJS)    │    │
│          │           contra IUTs     └────────────┬──────────────┘    │
│  ┌───────▼──────────────┐                        │                   │
│  │  microcks-async-     │       ┌────────────────▼──────────┐        │
│  │  minion :8586        │       │  kafka (Red Panda) :9092  │        │
│  │  (publica AsyncAPI   │──────▶│  topic: Banking Account   │        │
│  │   a Kafka)           │       │  Events-1.0.0-...         │        │
│  └──────────────────────┘       └───────────────────────────┘        │
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  contract-tester  (microcks-cli)                              │   │
│  │  1. REST:  Banking API vs bank-api-server    → HTTP           │   │
│  │  2. SOAP:  BankLegacyService vs bank-soap-server → SOAP_HTTP  │   │
│  │  3. Async: Banking Events vs kafka-producer  → ASYNC_API      │   │
│  └───────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

## Estructura de archivos

```
microcks/
├── openapi/
│   └── banking-api.yaml              OpenAPI 3.0 con x-microcks-operation
├── soap/
│   └── BankLegacyService-soapui-project.xml  WSDL + ejemplos embebidos
├── asyncapi/
│   └── account-events-asyncapi.yaml  AsyncAPI 2.6 con frecuencia de publicación
├── test/
│   ├── bank-server.js                IUT REST (Express) — BUGGY flag incluido
│   ├── bank-soap-server.js           IUT SOAP (Express + raw XML)
│   ├── kafka-producer.js             IUT Async (KafkaJS, publica c/3s)
│   ├── run-contract-tests.sh         Orquestador de los 3 contract tests
│   ├── Dockerfile                    Imagen compartida para los 3 IUTs
│   └── package.json
└── docker-compose.yml                Stack completo (infra + IUTs + tester)
```

## Cómo levantarlo

### Solo mocking (sin contract tests)

```bash
cd microcks
docker compose up microcks kafka microcks-async-minion importer -d
```

UI en `http://localhost:8585` — verás los 3 servicios importados.

### Stack completo con contract testing

```bash
cd microcks
docker compose up --build
```

Los logs del `contract-tester` muestran el resultado de cada test:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪  Contract Test: Banking REST API
    API:    Banking API:1.0.0
    IUT:    http://bank-api-server:3000
    Runner: HTTP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  PASS — Banking REST API

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪  Contract Test: BankLegacyService SOAP
...
✅  PASS — BankLegacyService SOAP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪  Contract Test: Banking Account Events (Kafka)
...
✅  PASS — Banking Account Events (Kafka)

════════════════════════════════════════════
  RESULTADOS DE CONTRACT TESTING
  ✅  PASS: 3
  ❌  FAIL: 0
════════════════════════════════════════════
```

## Demostrar una violación de contrato (bug intencional)

El `bank-server.js` tiene un flag `BUGGY` que introduce un bug en el campo
`total` del endpoint de transacciones (devuelve `99` en vez del total real).
Microcks lo detecta porque el ejemplo del OpenAPI fija ese valor.

Para verlo fallar, editá el `docker-compose.yml` y cambiá:

```yaml
bank-api-server:
  environment:
    - BUGGY=true     # ← activa el bug
```

O bien arrancá solo ese servicio con la variable sobreescrita:

```bash
docker compose up --build -d
docker compose run --rm -e BUGGY=true bank-api-server
```

El log del `contract-tester` mostrará:

```
❌  FAIL — Banking REST API

════════════════════════════════════════════
  RESULTADOS DE CONTRACT TESTING
  ✅  PASS: 2
  ❌  FAIL: 1
════════════════════════════════════════════
```

Y en la UI de Microcks (`http://localhost:8585`) podés ver el detalle del test
fallido con el diff entre el valor esperado y el recibido.

## Probar los mocks manualmente (sin contract tests)

### REST — Banking API

```bash
BASE=http://localhost:8585/rest/Banking+API/1.0.0

# Auth válida → 200 + JWT mock
curl -s -X POST $BASE/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"usuario_valido","password":"password123"}'

# Auth inválida → 401
curl -s -X POST $BASE/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"usuario_invalido","password":"x"}'

# Cuenta ARS → 200
curl -s $BASE/accounts/ACC001

# 404
curl -s $BASE/accounts/NOTFOUND

# Transacciones → 200 (3 movimientos)
curl -s $BASE/accounts/ACC001/transactions

# Transferencia OK → 201
curl -s -X POST $BASE/transfers -H 'Content-Type: application/json' \
  -d '{"source_account":"ACC001","destination_cbu":"0720461288000004610099","amount":1000,"currency":"ARS","description":"Pago alquiler"}'

# Saldo insuficiente → 422
curl -s -X POST $BASE/transfers -H 'Content-Type: application/json' \
  -d '{"source_account":"ACC001","destination_cbu":"0720461288000004610099","amount":999999999,"currency":"ARS","description":"x"}'
```

### SOAP — BankLegacyService

```bash
# Cuenta existente → extracto
curl -s -X POST "http://localhost:8585/soap/BankLegacyService/1.0" \
  -H 'Content-Type: text/xml' \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:leg="http://bank.example.com/legacy">
        <soapenv:Body>
          <leg:GetAccountStatement><accountId>ACC001</accountId></leg:GetAccountStatement>
        </soapenv:Body>
      </soapenv:Envelope>'

# Cuenta desconocida → SOAP Fault
curl -s -X POST "http://localhost:8585/soap/BankLegacyService/1.0" \
  -H 'Content-Type: text/xml' \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:leg="http://bank.example.com/legacy">
        <soapenv:Body>
          <leg:GetAccountStatement><accountId>UNKNOWN</accountId></leg:GetAccountStatement>
        </soapenv:Body>
      </soapenv:Envelope>'
```

### Event-Driven — Kafka

Consumir eventos publicados por el async-minion o el kafka-producer:

```bash
docker exec -it kafka rpk topic consume \
  BankingAccountEvents-1.0.0-banking-account-transactions \
  --brokers localhost:19092
```

WebSocket (desde el navegador o wscat):

```
ws://localhost:8586/api/ws/BankingAccountEvents/1.0.0/banking/account/transactions
```

## Conceptos clave

| Concepto | Descripción |
|---|---|
| **Artefacto** | OpenAPI / WSDL+SoapUI / AsyncAPI. Fuente de verdad del contrato. |
| **Mock** | Respuesta generada por Microcks a partir de los ejemplos del artefacto. |
| **IUT** (Implementation Under Test) | La implementación real del banco bajo prueba. |
| **Contract Test** | Microcks envía los requests de ejemplo al IUT y valida que las respuestas cumplan el contrato. |
| **Dispatcher** | Regla en el OpenAPI (`x-microcks-operation`) que define cómo Microcks elige el ejemplo según el request. |
| **async-minion** | Componente de Microcks que publica los mensajes mock de AsyncAPI al broker. |

## Bajar todo

```bash
docker compose down -v
```
