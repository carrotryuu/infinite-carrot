export type HealthStatus = 'ok' | 'down';
export interface HealthReport {
  status: HealthStatus;
  checks: { database: HealthStatus; redis: HealthStatus; nas: HealthStatus };
}
export function overallStatus(checks: HealthReport['checks']): HealthStatus {
  return Object.values(checks).every((status) => status === 'ok')
    ? 'ok'
    : 'down';
}
