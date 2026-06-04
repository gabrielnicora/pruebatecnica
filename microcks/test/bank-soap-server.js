/**
 * Implementation Under Test (IUT) — BankLegacyService SOAP
 *
 * Implementación real del servicio SOAP legacy que Microcks va a someter
 * a contract testing contra el SoapUI project de ../soap/.
 *
 * Responde a GetAccountStatement con el extracto de la cuenta (ACC001)
 * o con un SOAP Fault para cuentas desconocidas.
 */

const express = require('express');

const PORT = process.env.SOAP_PORT || 3001;
const app = express();

app.use(express.text({ type: ['text/xml', 'application/soap+xml', 'application/xml'] }));
app.use(express.raw({ type: '*/*' }));

function extractAccountId(body) {
  const str = body ? body.toString() : '';
  const m = str.match(/<(?:[^:]+:)?accountId[^>]*>(.*?)<\/(?:[^:]+:)?accountId>/s);
  return m ? m[1].trim() : null;
}

function accountStatementResponse(accountId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:leg="http://bank.example.com/legacy">
  <soapenv:Header/>
  <soapenv:Body>
    <leg:GetAccountStatementResponse>
      <accountId>${accountId}</accountId>
      <holder>Juan Pérez</holder>
      <balance>125430.50</balance>
      <currency>ARS</currency>
      <status>active</status>
    </leg:GetAccountStatementResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function soapFaultResponse(accountId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:leg="http://bank.example.com/legacy">
  <soapenv:Header/>
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>soapenv:Client</faultcode>
      <faultstring>account_not_found</faultstring>
      <detail>
        <leg:error>
          <message>La cuenta no existe o no pertenece al usuario</message>
        </leg:error>
      </detail>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function handleSoap(req, res) {
  const accountId = extractAccountId(req.body);
  res.set('Content-Type', 'text/xml;charset=UTF-8');

  if (accountId === 'ACC001') {
    return res.status(200).send(accountStatementResponse('ACC001'));
  }
  res.status(500).send(soapFaultResponse(accountId));
}

// Microcks puede postear al path raíz o al path completo del WSDL.
app.post('/', handleSoap);
app.post('/services/BankLegacyService', handleSoap);

app.listen(PORT, () => {
  console.log(`Bank SOAP IUT escuchando en :${PORT}`);
});
