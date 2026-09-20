import test from 'node:test';
import assert from 'node:assert/strict';

class WalletPpobSandbox {
  constructor({ balance = 100000, providerScript = ['SUCCESS'] } = {}) {
    this.balance = balance;
    this.providerScript = [...providerScript];
    this.order = null;
    this.walletLedger = [];
    this.webhooks = new Set();
  }
  pay({ price = 10000, target = '08123456789', idempotencyKey = 'idem-1234567890' }) {
    if (this.order?.idempotencyKey === idempotencyKey) return this.order;
    if (!target || target.length < 3) throw new Error('TARGET_REQUIRED');
    if (this.balance < price) throw new Error('INSUFFICIENT_BALANCE');
    this.balance -= price;
    this.walletLedger.push({ type: 'DEBIT', amount: price });
    this.order = { id: 'ORD-SANDBOX-1', idempotencyKey, price, target, status: 'PROCESSING', txStatus: 'PROCESSING', attempt: 0, refunded: false };
    return this.order;
  }
  fulfill() {
    if (!this.order || this.order.txStatus === 'SUCCESS' || this.order.txStatus === 'FAILED') return;
    this.order.attempt++;
    const status = this.providerScript.shift() ?? 'PROCESSING';
    this.order.txStatus = status;
    if (status === 'SUCCESS') this.order.status = 'COMPLETED';
    if (status === 'FAILED') this.order.status = 'FAILED';
  }
  webhook({ eventId = 'evt-1', status }) {
    if (this.webhooks.has(eventId)) return 'IGNORED_DUPLICATE';
    this.webhooks.add(eventId);
    if (!this.order) throw new Error('ORDER_NOT_FOUND');
    this.order.txStatus = status;
    if (status === 'SUCCESS') this.order.status = 'COMPLETED';
    if (status === 'FAILED') this.order.status = 'FAILED';
    return 'PROCESSED';
  }
  refund() {
    if (!this.order || this.order.txStatus !== 'FAILED' || this.order.refunded) return false;
    this.balance += this.order.price;
    this.walletLedger.push({ type: 'REFUND', amount: this.order.price });
    this.order.refunded = true;
    this.order.status = 'REFUNDED';
    return true;
  }
}

test('happy path: wallet -> provider -> webhook success -> completed', () => {
  const s = new WalletPpobSandbox({ balance: 50000, providerScript: ['PROCESSING'] });
  s.pay({ price: 12000 });
  s.fulfill();
  assert.equal(s.order.txStatus, 'PROCESSING');
  assert.equal(s.webhook({ eventId: 'evt-success', status: 'SUCCESS' }), 'PROCESSED');
  assert.equal(s.order.status, 'COMPLETED');
  assert.equal(s.balance, 38000);
});

test('failed provider -> exactly one refund', () => {
  const s = new WalletPpobSandbox({ balance: 20000, providerScript: ['FAILED'] });
  s.pay({ price: 10000 });
  s.fulfill();
  assert.equal(s.order.status, 'FAILED');
  assert.equal(s.refund(), true);
  assert.equal(s.refund(), false);
  assert.equal(s.balance, 20000);
  assert.equal(s.walletLedger.filter(x => x.type === 'REFUND').length, 1);
});

test('duplicate webhook is ignored', () => {
  const s = new WalletPpobSandbox({ balance: 20000 });
  s.pay({ price: 5000 });
  assert.equal(s.webhook({ eventId: 'evt-1', status: 'SUCCESS' }), 'PROCESSED');
  assert.equal(s.webhook({ eventId: 'evt-1', status: 'SUCCESS' }), 'IGNORED_DUPLICATE');
  assert.equal(s.walletLedger.filter(x => x.type === 'DEBIT').length, 1);
});

test('double click with same idempotency key does not debit twice', () => {
  const s = new WalletPpobSandbox({ balance: 30000 });
  const a = s.pay({ price: 7000, idempotencyKey: 'same-key-123456' });
  const b = s.pay({ price: 7000, idempotencyKey: 'same-key-123456' });
  assert.equal(a.id, b.id);
  assert.equal(s.balance, 23000);
  assert.equal(s.walletLedger.filter(x => x.type === 'DEBIT').length, 1);
});

test('insufficient balance does not create debit', () => {
  const s = new WalletPpobSandbox({ balance: 5000 });
  assert.throws(() => s.pay({ price: 10000 }), /INSUFFICIENT_BALANCE/);
  assert.equal(s.balance, 5000);
  assert.equal(s.walletLedger.length, 0);
});

test('webhook can finish a provider-pending transaction without another debit', () => {
  const s = new WalletPpobSandbox({ balance: 25000, providerScript: ['PROCESSING'] });
  s.pay({ price: 8000 });
  s.fulfill();
  s.webhook({ eventId: 'evt-final', status: 'SUCCESS' });
  assert.equal(s.order.status, 'COMPLETED');
  assert.equal(s.balance, 17000);
  assert.equal(s.walletLedger.filter(x => x.type === 'DEBIT').length, 1);
});
