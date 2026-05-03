// Typed errors. The SDK never throws raw strings or plain Errors — every
// failure mode the caller might branch on gets its own class.

export class StrataError extends Error {
  readonly code: string
  readonly statusCode?: number

  constructor(message: string, code: string, statusCode?: number) {
    super(message)
    this.name = 'StrataError'
    this.code = code
    this.statusCode = statusCode
    Object.setPrototypeOf(this, StrataError.prototype)
  }
}

export class StrataAuthError extends StrataError {
  constructor(message = 'Invalid or missing API key') {
    super(message, 'auth_error', 401)
    this.name = 'StrataAuthError'
    Object.setPrototypeOf(this, StrataAuthError.prototype)
  }
}

export class StrataRateLimitError extends StrataError {
  readonly resetAt: Date | null
  readonly remaining: number

  constructor(message: string, resetAt: Date | null, remaining = 0) {
    super(message, 'rate_limited', 429)
    this.name = 'StrataRateLimitError'
    this.resetAt = resetAt
    this.remaining = remaining
    Object.setPrototypeOf(this, StrataRateLimitError.prototype)
  }
}

export class StrataNetworkError extends StrataError {
  override readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message, 'network_error')
    this.name = 'StrataNetworkError'
    this.cause = cause
    Object.setPrototypeOf(this, StrataNetworkError.prototype)
  }
}

export class StrataValidationError extends StrataError {
  constructor(message: string) {
    super(message, 'validation_error', 400)
    this.name = 'StrataValidationError'
    Object.setPrototypeOf(this, StrataValidationError.prototype)
  }
}
