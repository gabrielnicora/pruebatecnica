/**
 * Implementation Under Test (IUT) — Banking REST API
 *
 * Esta es la "implementación real" del banco que Microcks va a someter
 * a contract testing contra el OpenAPI definido en ../openapi/banking-api.yaml.
 *
 * Tiene un bug intencional en el endpoint de transacciones (devuelve `total: 99`
 * en vez de 3) para demostrar cómo Microcks detecta una violación del contrato.
 * Descomenta el flag BUGGY para verlo.
 */

const express = require('express');

const BUGGY = process.env.BUGGY === 'true';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// --- Auth -------------------------------------------------------------------

app.post('/auth/token', (req, res) => {
  const { username } = req.body || {};
  if (username === 'usuario_invalido') {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Credenciales inválidas',
    });
  }
  res.status(200).json({
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real-impl',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'accounts transactions transfers',
  });
});

// --- Cuentas ----------------------------------------------------------------

const ACCOUNTS = {
  ACC001: {
    id: 'ACC001',
    alias: 'Cuenta Principal',
    type: 'checking',
    currency: 'ARS',
    balance: 125430.50,
    available: 120000.00,
    cbu: '0720461288000004610012',
    owner: { name: 'Juan Pérez', cuit: '20-12345678-9' },
    status: 'active',
  },
  ACC002: {
    id: 'ACC002',
    alias: 'Caja de Ahorro USD',
    type: 'savings',
    currency: 'USD',
    balance: 5000.00,
    available: 5000.00,
    cbu: '0720461288000004610099',
    owner: { name: 'Juan Pérez', cuit: '20-12345678-9' },
    status: 'active',
  },
};

app.get('/accounts/:accountId', (req, res) => {
  const account = ACCOUNTS[req.params.accountId];
  if (!account) {
    return res.status(404).json({
      error: 'account_not_found',
      message: 'La cuenta no existe o no pertenece al usuario',
    });
  }
  res.json(account);
});

// --- Transacciones ----------------------------------------------------------

app.get('/accounts/:accountId/transactions', (req, res) => {
  if (!ACCOUNTS[req.params.accountId]) {
    return res.status(404).json({ error: 'account_not_found', message: 'Cuenta no encontrada' });
  }

  const transactions = [
    {
      id: 'TXN001', date: '2024-01-15T10:30:00Z', type: 'credit',
      amount: 50000.00, currency: 'ARS',
      description: 'Transferencia recibida - ACME S.A.',
      balance_after: 125430.50, reference: 'REF-2024-001',
    },
    {
      id: 'TXN002', date: '2024-01-14T15:00:00Z', type: 'debit',
      amount: 12000.00, currency: 'ARS',
      description: 'Pago servicios - Empresa XYZ',
      balance_after: 75430.50, reference: 'REF-2024-002',
    },
    {
      id: 'TXN003', date: '2024-01-13T09:00:00Z', type: 'credit',
      amount: 87430.50, currency: 'ARS',
      description: 'Depósito inicial',
      balance_after: 87430.50, reference: 'REF-2024-003',
    },
  ];

  res.json({
    account_id: req.params.accountId,
    page: 1,
    // BUG intencional: cuando BUGGY=true devuelve total incorrecto
    // para demostrar la detección de violación de contrato en Microcks.
    total: BUGGY ? 99 : transactions.length,
    transactions,
  });
});

// --- Transferencias ---------------------------------------------------------

app.post('/transfers', (req, res) => {
  const { amount } = req.body || {};
  if (amount === 999999999) {
    return res.status(422).json({
      error: 'insufficient_funds',
      message: 'Saldo insuficiente para realizar la transferencia',
      available_balance: 120000.00,
    });
  }
  res.status(201).json({
    transfer_id: `TRF-${Date.now()}`,
    status: 'completed',
    source_account: req.body.source_account,
    destination_cbu: req.body.destination_cbu,
    amount: req.body.amount,
    currency: req.body.currency,
    description: req.body.description,
    timestamp: new Date().toISOString(),
    commission: 0,
  });
});

app.listen(PORT, () => {
  console.log(`Bank REST API (IUT) escuchando en :${PORT} — BUGGY=${BUGGY}`);
});
