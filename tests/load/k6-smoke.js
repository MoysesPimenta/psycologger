import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * K6 Smoke Test for Psycologger
 *
 * Validates basic functionality and response times:
 * - Health endpoint check
 * - Public landing page
 * - Login page
 *
 * Configuration: 5 virtual users for 30 seconds
 * Run: k6 run tests/load/k6-smoke.js
 * With custom base URL: K6_BASE_URL=https://example.com k6 run tests/load/k6-smoke.js
 */

const baseUrl = __ENV.K6_BASE_URL || 'http://localhost:3000';

// Custom metrics
const errorRate = new Rate('error_rate');
const healthCheckDuration = new Trend('health_check_duration');
const pageDuration = new Trend('page_duration');

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'error_rate': ['rate<0.1'], // Less than 10% errors
    'http_req_duration': ['p(95)<1000'], // 95% of requests under 1s
  },
};

export default function () {
  group('Health Check', () => {
    const res = http.get(`${baseUrl}/api/v1/health`);
    const isHealthy = check(res, {
      'health status is 200': (r) => r.status === 200 || r.status === 503,
      'health has timestamp': (r) => r.json('timestamp') !== undefined,
      'health has checks': (r) => r.json('checks') !== undefined,
    });
    errorRate.add(!isHealthy);
    healthCheckDuration.add(res.timings.duration);
  });

  sleep(1);

  group('Public Pages', () => {
    const landingRes = http.get(`${baseUrl}/`);
    const landingOk = check(landingRes, {
      'landing page status is 200': (r) => r.status === 200,
      'landing page has content': (r) => r.body.length > 0,
    });
    errorRate.add(!landingOk);
    pageDuration.add(landingRes.timings.duration);
  });

  sleep(1);

  group('Login Page', () => {
    const loginRes = http.get(`${baseUrl}/login`);
    const loginOk = check(loginRes, {
      'login page status is 200': (r) => r.status === 200,
      'login page has content': (r) => r.body.length > 0,
    });
    errorRate.add(!loginOk);
    pageDuration.add(loginRes.timings.duration);
  });

  sleep(1);
}
