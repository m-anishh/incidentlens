// Steady background traffic. Runs whenever the stack is up.
//
// maxVUs is sized for *degraded* latency, not healthy: when a scenario slows
// responses to ~2s, constant-arrival-rate needs rate × latency VUs to keep the
// rate up. Undersized, k6 drops iterations, load falls, and the scenario
// recovers on its own instead of staying broken.

import http from 'k6/http';

const BASE = __ENV.ORDERS_URL;
const HOT_IDS = parseInt(__ENV.HOT_IDS || '50'); // small set → high cache hit rate

function arrival(exec, rate) {
  return {
    executor: 'constant-arrival-rate',
    exec,
    rate,
    timeUnit: '1s',
    duration: __ENV.DURATION || '24h',
    preAllocatedVUs: 10,
    maxVUs: 60,
  };
}

export const options = {
  scenarios: {
    get_order: arrival('getOrder', parseInt(__ENV.GET_RATE || '10')),
    list_orders: arrival('listOrders', parseInt(__ENV.LIST_RATE || '3')),
    create_order: arrival('createOrder', parseInt(__ENV.CREATE_RATE || '3')),
  },
  summaryTrendStats: ['p(50)', 'p(95)', 'max'],
};

export function getOrder() {
  const id = 1 + Math.floor(Math.random() * HOT_IDS);
  http.get(`${BASE}/orders/${id}`, { tags: { name: 'GET /orders/{id}' } });
}

export function listOrders() {
  http.get(`${BASE}/orders?limit=10`, { tags: { name: 'GET /orders' } });
}

export function createOrder() {
  const body = JSON.stringify({
    sku: `SKU-${Math.floor(Math.random() * 40)}`,
    qty: 1 + Math.floor(Math.random() * 3),
    customer: `customer-${Math.floor(Math.random() * 200)}`,
  });
  http.post(`${BASE}/orders`, body, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /orders' },
  });
}
