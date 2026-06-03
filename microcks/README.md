# POC Microcks — Virtualización bancaria (REST + SOAP + Event-Driven)

Segunda variante de la POC, usando [Microcks](https://microcks.io) en vez de mountebank.
Demuestra los **3 mundos** de virtualización con una sola herramienta:

| Tipo | Servicio | Artefacto |
|---|---|---|
| **REST** | Banking API (auth, cuentas, transacciones, transferencias) | `openapi/banking-api.yaml` |
| **SOAP** | BankLegacyService (extracto de cuenta legacy) | `soap/BankLegacyService-soapui-project.xml` |
| **Event-Driven** | Banking Account Events (eventos de transacciones a Kafka) | `asyncapi/account-events-asyncapi.yaml` |

## Arquitectura

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  microcks-uber  │────▶│ microcks-async-minion│────▶│ kafka        │
│  REST + SOAP    │     │  publica eventos      │     │ (Red Panda)  │
│  UI :8585       │     │  AsyncAPI             │     │ :9092        │
└─────────────────┘     └──────────────────────┘     └──────────────┘
        ▲
        │ importa los 3 artefactos al arrancar
   ┌──────────┐
   │ importer │ (microcks-cli)
   └──────────┘
```

- **Microcks uber**: imagen all-in-one (MongoDB embebido, sin Keycloak).
- **Red Panda**: broker compatible Kafka, liviano, para los eventos.
- **async-minion**: publica los mensajes mock del AsyncAPI a Kafka/WebSocket.
- **importer**: carga los artefactos automáticamente vía `microcks-cli`.

## Cómo levantarlo

```bash
cd microcks
docker compose up -d
```

Esperá ~30-40s a que Microcks arranque e importe los artefactos. Luego abrí la UI:

```
http://localhost:8585
```

Vas a ver 3 APIs/servicios cargados: **Banking API 1.0.0**, **BankLegacyService 1.0**
y **Banking Account Events 1.0.0**.

> Si el contenedor `importer` corrió antes de que Microcks estuviera listo,
> tiene `restart: on-failure` y reintenta solo. Podés forzar la importación con
> `docker compose up importer`.

## Probar los mocks

### 1. REST — Banking API

Microcks expone los mocks bajo `/rest/{servicio}/{version}/...`:

```bash
BASE=http://localhost:8585/rest/Banking+API/1.0.0

# Auth válida -> 200 + token
curl -s -X POST $BASE/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"usuario_valido","password":"password123"}'

# Auth inválida -> 401 (despacho por body: username = usuario_invalido)
curl -s -X POST $BASE/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"usuario_invalido","password":"x"}'

# Cuenta ARS -> 200
curl -s $BASE/accounts/ACC001

# Cuenta USD -> 200
curl -s $BASE/accounts/ACC002

# Cuenta inexistente -> 404
curl -s $BASE/accounts/NOTFOUND

# Transacciones -> 200
curl -s $BASE/accounts/ACC001/transactions

# Transferencia OK -> 201
curl -s -X POST $BASE/transfers -H 'Content-Type: application/json' \
  -d '{"source_account":"ACC001","destination_cbu":"0720461288000004610099","amount":1000,"currency":"ARS","description":"Pago alquiler"}'

# Saldo insuficiente -> 422 (despacho por body: amount = 999999999)
curl -s -X POST $BASE/transfers -H 'Content-Type: application/json' \
  -d '{"source_account":"ACC001","destination_cbu":"0720461288000004610099","amount":999999999,"currency":"ARS","description":"Compra masiva"}'
```

> El espacio en `Banking API` se codifica como `+` o `%20` en la URL.

### 2. SOAP — BankLegacyService

Microcks expone los servicios SOAP bajo `/soap/{servicio}/{version}`:

```bash
# Cuenta existente -> extracto
curl -s -X POST "http://localhost:8585/soap/BankLegacyService/1.0" \
  -H 'Content-Type: text/xml' \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:leg="http://bank.example.com/legacy">
        <soapenv:Body>
          <leg:GetAccountStatement><accountId>ACC001</accountId></leg:GetAccountStatement>
        </soapenv:Body>
      </soapenv:Envelope>'

# Cuenta desconocida -> SOAP Fault account_not_found
curl -s -X POST "http://localhost:8585/soap/BankLegacyService/1.0" \
  -H 'Content-Type: text/xml' \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:leg="http://bank.example.com/legacy">
        <soapenv:Body>
          <leg:GetAccountStatement><accountId>UNKNOWN</accountId></leg:GetAccountStatement>
        </soapenv:Body>
      </soapenv:Envelope>'
```

El despacho de la respuesta se hace por el contenido de `<accountId>` (script de dispatch).

### 3. Event-Driven — Banking Account Events

El `async-minion` publica un evento de transacción **cada 10 segundos** al topic Kafka:

```
BankingAccountEvents-1.0.0-banking-account-transactions
```

Consumir desde el contenedor de Red Panda:

```bash
docker exec -it kafka rpk topic consume \
  BankingAccountEvents-1.0.0-banking-account-transactions --brokers localhost:19092
```

También disponible vía WebSocket:

```
ws://localhost:8586/api/ws/BankingAccountEvents/1.0.0/banking/account/transactions
```

Rota entre los 3 ejemplos: `credit_event`, `debit_event` y `fraud_alert_event`,
con campos dinámicos (`event_id` aleatorio, `timestamp` actual) gracias a las
funciones de templating de Microcks.

## Bajar todo

```bash
docker compose down -v
```

## Notas

- Las imágenes usan el tag `latest` por simplicidad de POC. Para reproducibilidad,
  pineá a una versión concreta (ej. `quay.io/microcks/microcks-uber:1.10.0-native`).
- A diferencia de la POC con mountebank (mocks escritos a mano en JSON), acá los
  mocks se **generan a partir del contrato** (OpenAPI/WSDL/AsyncAPI). El contrato
  es la fuente de verdad y sirve además para contract testing.
