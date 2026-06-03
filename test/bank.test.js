const { spawn } = require('child_process');
const path = require('path');
const BankClient = require('../src/bankClient');

const MB_PORT = 2525;
const BANK_PORT = 4545;
const BANK_URL = `http://localhost:${BANK_PORT}`;
const IMPOSTERS_FILE = path.resolve(__dirname, '../mountebank/imposters.json');

let mbProcess;
let client;

async function waitForMb(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://localhost:${MB_PORT}/imposters`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('mountebank no levantó a tiempo');
}

beforeAll(async () => {
  const mbBin = path.resolve(__dirname, '../node_modules/.bin/mb');
  mbProcess = spawn(mbBin, [
    '--port', String(MB_PORT),
    '--configfile', IMPOSTERS_FILE,
    '--allowInjection',
  ], { stdio: 'pipe' });

  await waitForMb();
  client = new BankClient(BANK_URL);
  await client.authenticate('usuario_valido', 'password123');
}, 15000);

afterAll(() => {
  if (mbProcess) mbProcess.kill();
});

describe('Auth - /auth/token', () => {
  test('devuelve token con credenciales válidas', async () => {
    const freshClient = new BankClient(BANK_URL);
    const data = await freshClient.authenticate('usuario_valido', 'password123');
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('Bearer');
    expect(data.expires_in).toBe(3600);
    expect(data.scope).toContain('accounts');
  });

  test('retorna 401 con usuario inválido', async () => {
    const freshClient = new BankClient(BANK_URL);
    await expect(
      freshClient.authenticate('usuario_invalido', 'cualquier')
    ).rejects.toMatchObject({ response: { status: 401 } });
  });
});

describe('Cuentas - /accounts/:id', () => {
  test('retorna datos de ACC001 correctamente', async () => {
    const account = await client.getAccount('ACC001');
    expect(account.id).toBe('ACC001');
    expect(account.currency).toBe('ARS');
    expect(account.balance).toBe(125430.50);
    expect(account.owner.name).toBe('Juan Pérez');
    expect(account.status).toBe('active');
  });

  test('retorna datos de ACC002 en USD', async () => {
    const account = await client.getAccount('ACC002');
    expect(account.currency).toBe('USD');
    expect(account.type).toBe('savings');
  });

  test('retorna 404 para cuenta inexistente', async () => {
    await expect(
      client.getAccount('NOTFOUND')
    ).rejects.toMatchObject({
      response: {
        status: 404,
        data: { error: 'account_not_found' },
      },
    });
  });
});

describe('Transacciones - /accounts/:id/transactions', () => {
  test('retorna lista de transacciones de ACC001', async () => {
    const data = await client.getTransactions('ACC001');
    expect(data.account_id).toBe('ACC001');
    expect(data.transactions).toHaveLength(3);
    expect(data.total).toBe(3);
  });

  test('la primera transacción es un crédito', async () => {
    const { transactions } = await client.getTransactions('ACC001');
    expect(transactions[0].type).toBe('credit');
    expect(transactions[0].amount).toBe(50000);
    expect(transactions[0].id).toBe('TXN001');
  });

  test('contiene débitos y créditos', async () => {
    const { transactions } = await client.getTransactions('ACC001');
    const types = transactions.map(t => t.type);
    expect(types).toContain('credit');
    expect(types).toContain('debit');
  });
});

describe('Transferencias - /transfers', () => {
  test('transferencia exitosa retorna ID y estado completed', async () => {
    const result = await client.transfer({
      sourceAccount: 'ACC001',
      destinationCbu: '0720461288000004610099',
      amount: 1000,
      currency: 'ARS',
      description: 'Pago alquiler',
    });
    expect(result.transfer_id).toBe('TRF-2024-999');
    expect(result.status).toBe('completed');
    expect(result.amount).toBe(1000);
  });

  test('retorna 422 por saldo insuficiente', async () => {
    await expect(
      client.transfer({
        sourceAccount: 'ACC001',
        destinationCbu: '0720461288000004610099',
        amount: 999999999,
        currency: 'ARS',
        description: 'Compra masiva',
      })
    ).rejects.toMatchObject({
      response: {
        status: 422,
        data: { error: 'insufficient_funds' },
      },
    });
  });
});
