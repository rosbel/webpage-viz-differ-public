/** Parse a credential-free HTTP(S) URL, optionally relative to another URL. */
export function parseHttpUrl(value: string, label: string, base?: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value, base);
  } catch {
    throw new Error(`${label} must be an absolute http(s) URL`);
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    throw new Error(`${label} must be an http(s) URL without embedded credentials`);
  }
  return parsed;
}

export function isHttpUrlWithoutCredentials(value: string): boolean {
  try {
    parseHttpUrl(value, 'URL');
    return true;
  } catch {
    return false;
  }
}
