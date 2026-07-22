import type { Handle } from '@sveltejs/kit';

/**
 * The web UI intentionally has no accounts or authorization model. Keep it
 * accessible only from the machine running it so its browser and HTTP fetch
 * capabilities cannot become a network SSRF or workload service.
 */
export const handle: Handle = async ({ event, resolve }) => {
  let clientAddress: string;
  try {
    clientAddress = event.getClientAddress();
  } catch {
    return new Response('Unable to verify local client address', { status: 403 });
  }

  if (!isLoopbackAddress(clientAddress)) {
    return new Response('webpage-viz-differ is a local-only application', { status: 403 });
  }

  if (!isLoopbackHostname(event.url.hostname)) {
    return new Response('webpage-viz-differ requires a loopback hostname', { status: 403 });
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) {
    const origin = event.request.headers.get('origin');
    if (origin && origin !== event.url.origin) {
      return new Response('cross-origin requests are not allowed', { status: 403 });
    }
    if (
      event.url.pathname.startsWith('/api/') &&
      event.request.headers.get('content-type')?.split(';', 1)[0].trim() !== 'application/json'
    ) {
      return new Response('API requests require application/json', { status: 415 });
    }
  }

  return resolve(event);
};

export function isLoopbackAddress(address: string): boolean {
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;
  const ipv4 = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  return /^127(?:\.\d{1,3}){3}$/.test(ipv4);
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}
