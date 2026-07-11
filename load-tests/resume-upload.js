import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const TOKEN = __ENV.TOKEN;

export default function () {
  const pdfContent = `%PDF-1.4 test resume content for ${__VU} iteration ${__ITER}`;

  const uploadRes = http.post(`${BASE_URL}/api/resume/upload`,
    http.file(pdfContent, 'resume.pdf', 'application/pdf'),
    {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }
  );

  check(uploadRes, {
    'upload accepted': (r) => r.status === 200,
    'processing started': (r) => r.json('resume.processingStage') === 'queued',
  });

  sleep(2);
}
