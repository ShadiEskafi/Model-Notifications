/**
 * Circuit Breaker Engine for Moodle Poller
 * Specification Reference: specs/02-moodle-integration-spec.md Section 4.2
 * 
 * Prevents cascade failures and university firewall blocks by halting
 * execution when 3 consecutive server errors or timeouts are encountered.
 */

export type CircuitState = 'CLOSED' | 'TRIPPED'

export interface CircuitBreakerConfig {
  maxConsecutiveFailures: number
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private consecutiveFailures = 0
  private maxFailures: number
  private lastIncidentSummary: string | null = null

  constructor(config: CircuitBreakerConfig = { maxConsecutiveFailures: 3 }) {
    this.maxFailures = config.maxConsecutiveFailures
  }

  /**
   * Evaluates if circuit allows continued polling execution.
   */
  public canExecute(): boolean {
    return this.state === 'CLOSED'
  }

  /**
   * Records a successful course request. Resets consecutive failure counter.
   */
  public recordSuccess(): void {
    this.consecutiveFailures = 0
    this.state = 'CLOSED'
    this.lastIncidentSummary = null
  }

  /**
   * Records a failed request. If consecutive failures reach threshold, trips circuit.
   */
  public recordFailure(error: Error | unknown): boolean {
    this.consecutiveFailures += 1
    const errMsg = error instanceof Error ? error.message : String(error)
    this.lastIncidentSummary = errMsg

    if (this.consecutiveFailures >= this.maxFailures) {
      this.state = 'TRIPPED'
      return true // Circuit has tripped
    }

    return false
  }

  public getState(): CircuitState {
    return this.state
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures
  }

  public getLastIncidentSummary(): string | null {
    return this.lastIncidentSummary
  }

  /**
   * Manual reset for test or scheduled cycle restarts.
   */
  public reset(): void {
    this.state = 'CLOSED'
    this.consecutiveFailures = 0
    this.lastIncidentSummary = null
  }
}
