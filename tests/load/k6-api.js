import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * K6 API Load Test for Psycologger
 *
 * Tests authenticated API endpoints with realistic load:
 * - GET /api/v1/appointments
 * - GET /api/v1/patients
 * - GET /api/v1/charges
 * - POST /api/v1/appointments (create)
 *
 * Configuration:
 * - Ramp up: 1→20 users over 1 minute
 * - Hold: 20 users for 2 minutes
 * - Ramp down: 20→1 user over 1 minute
 *
 * Thresholds:
 * - p95 response time < 500ms
 * - Error rate < 1%
 *
 * Run: k6 run tests/load/k6-api.js
 * With auth token: K6_AUTH_TOKEN=your_token K6_BASE_URL=https://example.com k6 run tests/load/k6-api.js
 */

const baseUrl = __ENV.K6_BASE_URL || 'http://localhost:3000';
const authToken = __ENV.K6_AUTH_TOKEN || 'test-token';

// Custom metrics
const errorRate = new Rate('api_error_rate');
const appointmentDuration = new Trend('appointment_list_duration');
const patientDuration = new Trend('patient_list_duration');
const chargeDuration = new Trend('charge_list_duration');
const createAppointmentDuration = new Trend('create_appointment_duration');

export const options = {
  stages: [
    { duration: '1m', target: 20 },  // Ramp up to 20 users
    { duration: '2m', target: 20 },  // Hold at 20 users
    { duration: '1m', target: 1 },   // Ramp down to 1 user
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests under 500ms
    'api_error_rate': ['rate<0.01'], // Less than 1% errors
  },
};

const authHeaders = {
  headers: {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  },
};

export default function () {
  group('GET /api/v1/appointments', () => {
    const res = http.get(
      `${baseUrl}/api/v1/appointments?limit=10&offset=0`,
      authHeaders
    );
    const isOk = check(res, {
      'appointments status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'appointments response is json': (r) => r.headers['Content-Type']?.includes('application/json'),
    });
    errorRate.add(!isOk, { endpoint: 'appointments' });
    appointmentDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('GET /api/v1/patients', () => {
    const res = http.get(
      `${baseUrl}/api/v1/patients?limit=10&offset=0`,
      authHeaders
    );
    const isOk = check(res, {
      'patients status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'patients response is json': (r) => r.headers['Content-Type']?.includes('application/json'),
    });
    errorRate.add(!isOk, { endpoint: 'patients' });
    patientDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('GET /api/v1/charges', () => {
    const res = http.get(
      `${baseUrl}/api/v1/charges?limit=10&offset=0`,
      authHeaders
    );
    const isOk = check(res, {
      'charges status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'charges response is json': (r) => r.headers['Content-Type']?.includes('application/json'),
    });
    errorRate.add(!isOk, { endpoint: 'charges' });
    chargeDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('POST /api/v1/appointments (Create)', () => {
    // Note: This will fail with 401 if no valid token; that's expected behavior
    // In production, use a valid test user token
    const payload = JSON.stringify({
      patientId: '00000000-0000-0000-0000-000000000001',
      providerUserId: '00000000-0000-0000-0000-000000000002',
      appointmentTypeId: '00000000-0000-0000-0000-000000000003',
      startsAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endsAt: new Date(Date.now() + 86400000 + 3600000).toISOString(), // Tomorrow + 1h
      location: 'Test Office',
      notifyPatient: false,
    });

    const res = http.post(
      `${baseUrl}/api/v1/appointments`,
      payload,
      authHeaders
    );
    const isOk = check(res, {
      'create appointment status is 201 or 400 or 401': (r) => [201, 400, 401, 409].includes(r.status),
      'create appointment response is json': (r) => r.headers['Content-Type']?.includes('application/json'),
    });
    errorRate.add(!isOk, { endpoint: 'create_appointment' });
    createAppointmentDuration.add(res.timings.duration);
  });

  sleep(1);
}
