import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('scenario_errors');

export const options = {
  stages: [
    { duration: '5m', target: 50 },
    { duration: '10m', target: 100 },
    { duration: '10m', target: 200 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.02'],
    scenario_errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export default function () {
  group('Full User Scenario', () => {
    const email = `user${Date.now()}@test.io`;
    const password = 'StrongPass1!';

    // Register
    const regRes = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
      name: `User ${Date.now()}`,
      email,
      password,
    }), { headers: { 'Content-Type': 'application/json' } });

    errorRate.add(regRes.status !== 201);
    check(regRes, { 'register ok': (r) => r.status === 201 });

    // Login
    const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      email,
      password,
    }), { headers: { 'Content-Type': 'application/json' } });

    errorRate.add(loginRes.status !== 200);
    check(loginRes, { 'login ok': (r) => r.status === 200 });

    if (loginRes.status !== 200) {
      sleep(1);
      return;
    }

    const token = loginRes.json('accessToken');

    // Get recommendations
    group('Recommendations', () => {
      const res = http.get(`${BASE_URL}/api/recommendations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      check(res, { 'recs ok': (r) => r.status === 200 || r.status === 404 });
    });

    // Health check (unauthenticated)
    group('Health', () => {
      const res = http.get(`${BASE_URL}/api/health`);
      check(res, { 'health ok': (r) => r.status === 200 });
    });

    // Resume upload (every 3rd iteration)
    if (__ITER % 3 === 0) {
      group('Resume Upload', () => {
        const pdfContent = `%PDF-1.4 VU ${__VU} ITER ${__ITER}`;
        const res = http.post(`${BASE_URL}/api/resume/upload`,
          http.file(pdfContent, 'resume.pdf', 'application/pdf'),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        check(res, { 'upload ok': (r) => r.status === 200 });
      });
    }
  });

  sleep(Math.random() * 2 + 0.5);
}
