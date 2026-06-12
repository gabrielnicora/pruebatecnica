# POC Microcks — Virtualización bancaria (REST + SOAP + Event-Driven)

POC de [Microcks](https://microcks.io) que demuestra los **3 mundos** de
virtualización + **contract testing** con una sola herramienta, sobre la
**configuración oficial** de `microcks/microcks` (componentes separados, igual
que producción).

| Tipo | Servicio | Artefacto (contrato) |
|---|---|---|
| **REST** | Banking API (auth, cuentas, transacciones, transferencias) | `openapi/banking-api.yaml` |
| **SOAP** | BankLegacyService (extracto de cuenta legacy) | `soap/BankLegacyService-soapui-project.xml` |
| **Event-Driven** | Banking Account Events (transacciones a Kafka) | `asyncapi/account-events-asyncapi.yaml` |

---

## TL;DR

```bash
./poc.sh up         # Todo CON Keycloak (login admin/microcks123) → 3/3 PASS
./poc.sh up-noauth  # Todo SIN Keycloak (sin credenciales que mantener) → 3/3 PASS
./poc.sh test       # Re-correr los 3 contract tests
./poc.sh mock       # Solo el mock server (sin IUTs ni tester)
./poc.sh down       # Bajar (conserva los datos de Mongo)
./poc.sh reset      # Bajar y BORRAR los datos
```

Ambos modos terminan con **PASS: 3 / FAIL: 0**.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────┐
│  INFRAESTRUCTURA MICROCKS                  IMPLEMENTATIONS UNDER TEST (IUT) │
│                                                                            │
│  ┌──────────────┐   ┌───────────────┐      ┌────────────────────────────┐  │
│  │  MongoDB     │   │  Keycloak     │      │  bank-api-server  :3000    │  │
│  │  (persiste)  │   │  (opcional)   │      │  (REST IUT — Express)      │  │
│  └──────┬───────┘   └───────┬───────┘      └────────────────────────────┘  │
│         │                   │              ┌────────────────────────────┐  │
│  ┌──────▼───────────────────▼───────┐      │  bank-soap-server :3001    │  │
│  │  microcks (app)  UI/API :8585    │─test→│  (SOAP IUT — Express)      │  │
│  └──────┬───────────────────────────┘      └────────────────────────────┘  │
│         │                                  ┌────────────────────────────┐  │
│  ┌──────▼───────────────┐   ┌───────────┐  │  kafka-producer            │  │
│  │  microcks-async-     │──▶│  Kafka    │◀─│  (Async IUT — KafkaJS)     │  │
│  │  minion :8586        │   │ (RedPanda)│  └────────────────────────────┘  │
│  └──────────────────────┘   └───────────┘                                  │
│  ┌────────────────────────┐                                                │
│  │  postman-runtime       │   ┌──────────────────────────────────────────┐ │
│  │  (tests Postman)       │   │  importer + contract-tester (microcks-cli)│ │
│  └────────────────────────┘   └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Mocking**: Microcks sirve respuestas fake desde los contratos (para que el
front desarrolle sin esperar al backend).
**Contract testing**: Microcks manda los ejemplos del contrato a la
implementación real (el IUT) y valida que la respuesta cumpla el schema.

---

## Componentes

| Servicio | Imagen | Rol |
|---|---|---|
| `microcks-db` | mongo:4.4.29 | **Persistencia** (sobrevive reinicios) |
| `microcks-sso` | keycloak:26.0.0 | **Autenticación** (solo modo auth) |
| `microcks-postman-runtime` | postman-runtime:0.7.2 | Runtime de tests Postman |
| `microcks` | microcks:1.11.1 | Core (UI + API) |
| `microcks-async-minion` | microcks-async-minion:1.11.1 | Mocking async (WS + Kafka) |
| `microcks-kafka` | redpanda:v24.3.1 | Broker Kafka |
| `bank-api-server` | node | IUT REST |
| `bank-soap-server` | node | IUT SOAP |
| `kafka-producer` | node | IUT Async (publica eventos) |
| `microcks-importer` | microcks-cli:1.0.2 | Sube los 3 artefactos |
| `contract-tester` | microcks-cli:1.0.2 | Corre los 3 contract tests |

---

## El toggle de Keycloak

Requisito: **tener todo listo**, pero poder **desactivar Keycloak** si no hay
quién mantenga las credenciales. Se controla con dos variables (en `.env` o vía
el helper):

| | Keycloak ON (default) | Keycloak OFF |
|---|---|---|
| `COMPOSE_PROFILES` | `auth` | *(vacío)* |
| `KEYCLOAK_ENABLED` | `true` | `false` |
| Contenedor keycloak | arranca | no arranca |
| API de Microcks | protegida (OAuth2) | abierta (`permitAll`) |
| UI | pide login | entra directo |
| CLI (import/test) | usa service account | usa credenciales dummy |

`KEYCLOAK_ENABLED=false` hace que Microcks ejecute `http.permitAll()`. El CLI y
el async-minion detectan que Keycloak está deshabilitado (vía
`/api/keycloak/config`) y omiten la autenticación.

---

## URLs

| Servicio | URL | Credenciales |
|---|---|---|
| **Microcks UI** | http://localhost:8585 | `admin` / `microcks123` (solo auth) |
| **Keycloak Admin** | http://localhost:18080 | `admin` / `admin` (solo auth) |
| **MongoDB** | `localhost:27017` | sin auth |
| **Kafka (host)** | `localhost:9092` | — |
| REST mock | `http://localhost:8585/rest/Banking+API/1.0.0` | — |
| SOAP mock | `http://localhost:8585/soap/BankLegacyService+Mock/1.0` | — |
| WS async | `ws://localhost:8586/api/ws/BankingAccountEvents/1.0.0/banking/account/transactions` | — |

> **`keycloak.localtest.me`**: en modo auth, Keycloak se expone con ese hostname
> (resuelve a 127.0.0.1 por DNS público) para que la **misma URL** funcione desde
> el navegador, la app y el CLI a la vez. En AWS/on-prem se reemplaza por el DNS
> real del banco (ej. `https://sso.banco.internal`).

---

## Probar el mock a mano (curl)

```bash
BASE=http://localhost:8585/rest/Banking+API/1.0.0

curl -s -X POST $BASE/auth/token -H 'Content-Type: application/json' \
  -d '{"username":"usuario_valido","password":"x"}'        # 200 token
curl -s -X POST $BASE/auth/token -H 'Content-Type: application/json' \
  -d '{"username":"usuario_invalido","password":"x"}'      # 401
curl -s $BASE/accounts/ACC001                               # cuenta
curl -s $BASE/accounts/NOTFOUND                             # 404
curl -s $BASE/accounts/ACC001/transactions                 # movimientos
curl -s -X POST $BASE/transfers -H 'Content-Type: application/json' \
  -d '{"source_account":"ACC001","destination_cbu":"0720461288000004610099","amount":1000,"currency":"ARS"}'  # 201
```

SOAP:
```bash
curl -s -X POST "http://localhost:8585/soap/BankLegacyService+Mock/1.0" \
  -H 'Content-Type: text/xml' \
  -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:leg="http://bank.example.com/legacy">
        <soapenv:Body><leg:GetAccountStatement><accountId>ACC001</accountId></leg:GetAccountStatement></soapenv:Body>
      </soapenv:Envelope>'
```

Eventos async en Kafka:
```bash
docker exec -it microcks-kafka rpk topic consume \
  BankingAccountEvents-1.0.0-banking-account-transactions --brokers localhost:19092
```

---

## Demostrar detección de violación de contrato

El IUT REST tiene un bug intencional (`BUGGY=true` → devuelve `total: 99` en vez
de 3), para mostrar cómo Microcks **detecta** que el backend rompió el contrato:

```bash
BUGGY=true docker compose up -d --force-recreate bank-api-server
./poc.sh test
# → ❌ FAIL — Banking REST API  (el contrato dice total=3, el IUT devuelve 99)

# volver a la normalidad
docker compose up -d --force-recreate bank-api-server
```

---

## Estructura del repo

```
microcks/
├── docker-compose.yml      Stack completo (oficial + IUTs + tests)
├── .env                    Toggle de Keycloak (defaults)
├── poc.sh                  Helper: up / up-noauth / test / mock / down / reset
├── config/                 Config del async-minion (release 1.11.1)
├── keycloak/
│   └── microcks-realm.json Realm oficial + service account para el CLI
├── openapi/
│   └── banking-api.yaml              OpenAPI 3.0 con x-microcks-operation
├── soap/
│   └── BankLegacyService-soapui-project.xml   WSDL + ejemplos
├── asyncapi/
│   └── account-events-asyncapi.yaml  AsyncAPI 2.6
└── test/
    ├── bank-server.js                IUT REST (Express) — flag BUGGY
    ├── bank-soap-server.js           IUT SOAP (Express + raw XML)
    ├── kafka-producer.js             IUT Async (KafkaJS, publica c/3s)
    ├── run-contract-tests.sh         Orquesta los 3 contract tests
    └── Dockerfile / package*.json    Build de los IUTs
```

---

## Despliegue en AWS / On-Prem

La POC usa los componentes separados igual que producción. Para AWS/on-prem solo
cambian las piezas de infraestructura:

| POC (local) | Producción |
|---|---|
| mongo:4.4.29 (contenedor) | DocumentDB / MongoDB Atlas / replicaset |
| keycloak (contenedor) | Keycloak HA federado con AD/LDAP del banco |
| redpanda (contenedor) | MSK / Confluent existente |
| `keycloak.localtest.me` | DNS real (`sso.banco.internal`) + TLS |
| volumen local | EBS/EFS o storage gestionado |

El resto (artefactos, contract tests, CLI en CI/CD) es idéntico.
