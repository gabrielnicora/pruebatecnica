# pruebatecnica — POCs de virtualización bancaria

Este repo contiene **dos POCs** de virtualización/mocking de servicios bancarios,
para comparar herramientas:

| POC | Herramienta | Alcance | Carpeta |
|---|---|---|---|
| 1 | [mountebank](http://www.mbtest.org/) | REST (auth, cuentas, transacciones, transferencias) | raíz (`src/`, `mountebank/`, `test/`) |
| 2 | [Microcks](https://microcks.io) | REST + **SOAP** + **Event-Driven (Kafka)** | [`microcks/`](./microcks) |

La POC de Microcks parte de **contratos** (OpenAPI/WSDL/AsyncAPI) en vez de mocks
escritos a mano, y agrega un ejemplo SOAP y uno event-driven. Ver [`microcks/README.md`](./microcks/README.md).

---

## POC 1 — Mountebank

POC de virtualización de servicios bancarios REST usando [mountebank](http://www.mbtest.org/).

## Servicios virtualizados

| Endpoint | Método | Descripción |
|---|---|---|
| `/auth/token` | POST | Autenticación OAuth2 (token + 401 inválido) |
| `/accounts/:id` | GET | Saldo y datos de cuenta (ARS y USD) |
| `/accounts/:id/transactions` | GET | Historial de movimientos |
| `/transfers` | POST | Transferencia (éxito + 422 fondos insuficientes) |

## Estructura

```
.
├── mountebank/
│   └── imposters.json      # Definición de todos los mocks
├── src/
│   ├── bankClient.js       # Cliente HTTP para las APIs bancarias
│   └── index.js            # Script de demo
├── test/
│   └── bank.test.js        # Tests de integración con Jest
├── docker-compose.yml      # Levanta mountebank + client via Docker
└── Dockerfile
```

## Cómo correr

### Opción 1 — Local (Node.js)

```bash
npm install
npm test                  # corre los 10 tests
npm run mb:start          # levanta mountebank en :4545
node src/index.js         # demo completo contra el mock
```

### Opción 2 — Docker Compose

```bash
docker-compose up
```

Levanta mountebank en `:4545` (API bank) y `:2525` (admin) y ejecuta el demo.

## Admin de mountebank

Con mountebank corriendo, podés inspeccionar los imposters en:

```
GET http://localhost:2525/imposters
GET http://localhost:2525/imposters/4545
```

## Escenarios mockeados

- **Auth OK**: cualquier POST a `/auth/token` (salvo usuario inválido) → JWT mock
- **Auth 401**: `username: "usuario_invalido"` → error `invalid_client`
- **Cuenta ACC001**: cuenta en ARS con saldo $125.430,50
- **Cuenta ACC002**: caja de ahorro en USD
- **Cuenta NOTFOUND**: → 404 `account_not_found`
- **Transacciones ACC001**: 3 movimientos (créditos y débito)
- **Transferencia $1000**: → éxito con ID `TRF-2024-999`
- **Transferencia $999.999.999**: → 422 `insufficient_funds`
