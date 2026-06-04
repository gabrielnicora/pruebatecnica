/**
 * Implementation Under Test (IUT) — Banking Account Events (Async/Kafka)
 *
 * Publica eventos de transacciones al topic de Kafka que Microcks va a
 * monitorear durante el contract test del AsyncAPI.
 *
 * Topic: BankingAccountEvents-1.0.0-banking-account-transactions
 * (convencion de nombres de Microcks: service-version-channel_con_slashes_a_guiones)
 *
 * Rota entre 3 tipos de evento cada 3 segundos.
 */

const { Kafka, CompressionTypes, logLevel } = require('kafkajs');

const BROKER = process.env.KAFKA_BROKER || 'kafka:19092';
const TOPIC = 'BankingAccountEvents-1.0.0-banking-account-transactions';

const kafka = new Kafka({
  clientId: 'bank-event-producer',
  brokers: [BROKER],
  logLevel: logLevel.WARN,
  retry: { retries: 10, initialRetryTime: 2000 },
});

const producer = kafka.producer();

const EVENT_TYPES = [
  {
    type: 'credit',
    amount: 50000.00,
    description: 'Transferencia recibida - ACME S.A.',
  },
  {
    type: 'debit',
    amount: 12000.00,
    description: 'Pago servicios - Empresa XYZ',
  },
  {
    type: 'fraud_alert',
    amount: 999999.00,
    description: 'Movimiento inusual detectado - revisión requerida',
  },
];

function randomId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

async function run() {
  console.log(`Conectando a Kafka broker: ${BROKER}`);
  await producer.connect();
  console.log(`Publicando eventos al topic: ${TOPIC}`);

  let idx = 0;
  // Publica un evento cada 3s para que Microcks lo capture durante el test
  async function publish() {
    const eventTemplate = EVENT_TYPES[idx % EVENT_TYPES.length];
    idx++;

    const event = {
      event_id: `EVT-${randomId()}`,
      account_id: 'ACC001',
      type: eventTemplate.type,
      amount: eventTemplate.amount,
      currency: 'ARS',
      description: eventTemplate.description,
      timestamp: new Date().toISOString(),
    };

    await producer.send({
      topic: TOPIC,
      messages: [{ key: event.account_id, value: JSON.stringify(event) }],
      compression: CompressionTypes.None,
    });

    console.log(`[${new Date().toISOString()}] Publicado: ${event.type} — ${event.event_id}`);
    setTimeout(publish, 3000);
  }

  await publish();
}

run().catch(err => {
  console.error('Error en kafka-producer:', err.message);
  process.exit(1);
});
