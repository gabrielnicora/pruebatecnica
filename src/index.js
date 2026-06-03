const BankClient = require('./bankClient');

const BANK_URL = process.env.BANK_URL || 'http://localhost:4545';

async function main() {
  const client = new BankClient(BANK_URL);

  console.log('=== POC Mountebank - Servicios Bancarios ===\n');

  // 1. Autenticación
  console.log('1. Autenticando...');
  const auth = await client.authenticate('usuario_valido', 'password123');
  console.log(`   Token obtenido: ${auth.access_token.substring(0, 30)}...`);
  console.log(`   Expira en: ${auth.expires_in}s\n`);

  // 2. Consulta de cuenta
  console.log('2. Consultando cuenta ACC001...');
  const account = await client.getAccount('ACC001');
  console.log(`   Titular: ${account.owner.name}`);
  console.log(`   Saldo: ${account.currency} ${account.balance.toLocaleString('es-AR')}`);
  console.log(`   CBU: ${account.cbu}\n`);

  // 3. Transacciones
  console.log('3. Obteniendo transacciones de ACC001...');
  const { transactions } = await client.getTransactions('ACC001');
  transactions.forEach(t => {
    const sign = t.type === 'credit' ? '+' : '-';
    console.log(`   [${t.date.split('T')[0]}] ${sign}$${t.amount.toLocaleString('es-AR')} - ${t.description}`);
  });
  console.log();

  // 4. Transferencia
  console.log('4. Realizando transferencia...');
  const transfer = await client.transfer({
    sourceAccount: 'ACC001',
    destinationCbu: '0720461288000004610099',
    amount: 1000,
    currency: 'ARS',
    description: 'Pago alquiler',
  });
  console.log(`   ID: ${transfer.transfer_id}`);
  console.log(`   Estado: ${transfer.status}`);
  console.log(`   Monto: ${transfer.currency} ${transfer.amount}\n`);

  console.log('=== POC completada exitosamente ===');
}

main().catch(err => {
  const msg = err.response ? JSON.stringify(err.response.data) : err.message;
  console.error('Error:', msg);
  process.exit(1);
});
