export type AccountErrorCode = 'unauthorized' | 'apple_code_invalid' | 'unavailable';

/**
 * The only failure the account modules raise. Its message is the closed code itself, so no
 * token, code, key or upstream body can reach a log or a response through it.
 */
export class AccountError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode) {
    super(code);
    this.name = 'AccountError';
    this.code = code;
  }
}
