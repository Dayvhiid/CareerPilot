import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const registerErrorRate = new Rate('registration_errors');
const loginDuration = new Trend('login_duration');

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '3m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    registration_errors: ['rate<0.05'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export default function () {
  group('Authentication Flow', () => {
    const email = `test${Date.now()}@example.com`;
    const password = 'TestPass123';

    const registerPayload = JSON.stringify({
      name: `Test User ${Date.now()}`,
      email,
      password,
    });

    const registerRes = http.post(`${BASE_URL}/api/auth/register`, registerPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    registerErrorRate.add(registerRes.status !== 201);
    check(registerRes, {
      'register success': (r) => r.status === 201,
    });

    const loginStart = Date.now();
    const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      email,
      password,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    loginDuration.add(Date.now() - loginStart);

    check(loginRes, {
      'login success': (r) => r.status === 200,
      'has access token': (r) => r.json('accessToken') !== undefined,
    });

    if (loginRes.status === 200) {
      const token = loginRes.json('accessToken');

      group('Authenticated Requests', () => {
        const recRes = http.get(`${BASE_URL}/api/recommendations`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        check(recRes, {
          'recommendations ok': (r) => r.status === 200 || r.status === 404,
          'recommendations fast': (r) => r.timings.duration < 1000,
        });
      });
    }
  });

  sleep(1);
}
