// Scenario 1: extra load on GET /orders, run *alongside* steady.js.
//
// Capacity is pool_size / hold = 5 / 0.1s = 50 req/s of DB work. Steady
// traffic uses ~7 req/s of it; the default 60 req/s burst pushes past the
// ceiling so requests queue on the pool and start hitting the 2s acquire
// timeout. maxVUs covers rate × 2s degraded latency with headroom.

import http from 'k6/http';

const BASE = __ENV.ORDERS_URL;
const RATE = parseInt(__ENV.BURST_RATE || '60');

export const options = {
  scenarios: {
    burst: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: __ENV.DURATION || '15m',
      preAllocatedVUs: RATE,
      maxVUs: RATE * 3,
    },
  },
  summaryTrendStats: ['p(50)', 'p(95)', 'max'],
};

export default function () {
  http.get(`${BASE}/orders?limit=10`, { tags: { name: 'GET /orders' } });
}
