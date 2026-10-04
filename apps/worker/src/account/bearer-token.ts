/** The access token of an `Authorization: Bearer <token>` header, or undefined when it is absent or malformed. */
export function bearerToken(request: Request): string | undefined {
  const match = /^bearer ([^\s]+)$/iu.exec(request.headers.get('authorization') ?? '');
  return match?.[1];
}
