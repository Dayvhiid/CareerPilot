import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 25 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const TOKEN = __ENV.TOKEN;

export default function () {
  const res = http.post(`${BASE_URL}/api/chatbot/generate`, JSON.stringify({
    sessionId: `load-test-${__VU}-${__ITER}`,
  }), {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  check(res, {
    'pdf generation initiated': (r) => r.status === 200,
    'response time acceptable': (r) => r.timings.duration < 8000,
  });

  sleep(3);
}
