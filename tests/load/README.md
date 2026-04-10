# K6 Load Testing Suite for Psycologger

This directory contains load testing scripts for Psycologger using [k6](https://k6.io/), a modern load testing tool.

## Scripts

### k6-smoke.js
Basic smoke test that validates core functionality:
- Health endpoint (`/api/v1/health`)
- Public landing page (`/`)
- Login page (`/login`)

Configuration: 5 virtual users for 30 seconds

### k6-api.js
Comprehensive API load test with realistic ramp-up:
- GET `/api/v1/appointments` (list appointments)
- GET `/api/v1/patients` (list patients)
- GET `/api/v1/charges` (list charges)
- POST `/api/v1/appointments` (create appointment)

Configuration:
- Ramp up: 1→20 users over 1 minute
- Hold: 20 users for 2 minutes
- Ramp down: 20→1 user over 1 minute

Thresholds:
- p95 response time < 500ms
- Error rate < 1%

## Installation

### macOS (Homebrew)
```bash
brew install k6
```

### Linux (Debian/Ubuntu)
```bash
sudo apt-get install k6
```

### Docker
```bash
docker run -i grafana/k6 run /dev/stdin < tests/load/k6-smoke.js
```

### Windows or Other Systems
See [k6 installation guide](https://k6.io/docs/get-started/installation/).

## Running Tests

### Smoke Test (Quick validation)
```bash
# Against local development server
k6 run tests/load/k6-smoke.js

# Against production or custom URL
K6_BASE_URL=https://psycologger.vercel.app k6 run tests/load/k6-smoke.js
```

### API Load Test (Requires authentication token)
```bash
# Against local development server (no auth required)
k6 run tests/load/k6-api.js

# Against production with valid auth token
K6_BASE_URL=https://psycologger.vercel.app \
K6_AUTH_TOKEN=your_valid_jwt_token \
k6 run tests/load/k6-api.js
```

### Docker Usage
```bash
# Smoke test
docker run -i grafana/k6 run /dev/stdin < tests/load/k6-smoke.js

# API test with environment variables
docker run -i -e K6_BASE_URL=https://example.com \
  -e K6_AUTH_TOKEN=your_token \
  grafana/k6 run /dev/stdin < tests/load/k6-api.js
```

## Interpreting Results

K6 outputs metrics like:
- `http_req_duration`: Response time distribution
- `error_rate`: Percentage of failed requests
- `http_req_failed`: Total failed requests

Example output:
```
     data_received.................125 MB   4.2 MB/s
     data_sent.......................3.8 MB   130 kB/s
     http_req_duration...............avg=245ms  p(95)=420ms  p(99)=650ms  max=2.5s
     http_req_failed.................0%
     http_reqs........................1850
     iteration_duration...............avg=6.4s   min=4.2s    max=8.1s
     iterations.......................308
     vus_max..........................20
```

### Common Issues

1. **401 Unauthorized on API tests**
   - Provide a valid JWT token via `K6_AUTH_TOKEN`
   - For local testing without real credentials, the test still validates structure

2. **Connection refused**
   - Ensure the target server is running
   - Check that `K6_BASE_URL` is correct (default: `http://localhost:3000`)

3. **High error rates**
   - Check server logs for application errors
   - Verify database connectivity
   - Reduce load (lower `target` in stages) and retry

## Next Steps

- Integrate into CI/CD pipeline (e.g., GitHub Actions)
- Use k6 Cloud for distributed load testing: `k6 cloud tests/load/k6-api.js`
- Create custom test scenarios for specific workflows
- Monitor real production metrics alongside load tests

## References

- [K6 Documentation](https://k6.io/docs/)
- [K6 HTTP Module](https://k6.io/docs/javascript-api/k6-http/)
- [K6 Metrics](https://k6.io/docs/javascript-api/k6-metrics/)
