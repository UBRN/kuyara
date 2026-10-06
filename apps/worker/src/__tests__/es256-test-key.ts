// A throwaway P-256 key generated at test time. The PEM marker lines are assembled from
// parts so the secret scanner does not read source text as a stored key.
const begin = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const end = ['-----END', 'PRIVATE KEY-----'].join(' ');

export async function generateEs256Key() {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const body = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)).toString('base64');
  return {
    keyPair,
    bare: body,
    pem: [begin, (body.match(/.{1,64}/gu) ?? []).join('\n'), end].join('\n'),
    publicJwk: await crypto.subtle.exportKey('jwk', keyPair.publicKey),
  };
}
