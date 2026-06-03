const axios = require('axios');

class BankClient {
  constructor(baseURL) {
    this.http = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json' },
    });
    this.token = null;
  }

  async authenticate(username, password) {
    const response = await this.http.post('/auth/token', { username, password });
    this.token = response.data.access_token;
    this.http.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    return response.data;
  }

  async getAccount(accountId) {
    const response = await this.http.get(`/accounts/${accountId}`);
    return response.data;
  }

  async getTransactions(accountId) {
    const response = await this.http.get(`/accounts/${accountId}/transactions`);
    return response.data;
  }

  async transfer({ sourceAccount, destinationCbu, amount, currency, description }) {
    const response = await this.http.post('/transfers', {
      source_account: sourceAccount,
      destination_cbu: destinationCbu,
      amount,
      currency,
      description,
    });
    return response.data;
  }
}

module.exports = BankClient;
