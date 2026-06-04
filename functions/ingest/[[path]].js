const API_HOST = 'us.i.posthog.com'
const ASSET_HOST = 'us-assets.i.posthog.com'

async function handleRequest(request, params, waitUntil) {
  const url = new URL(request.url)
  const path = '/' + (params.path?.join('/') ?? '')
  const pathWithParams = path + url.search

  if (path.startsWith('/static/') || path.startsWith('/array/')) {
    return retrieveAsset(request, pathWithParams, waitUntil)
  }
  return forwardRequest(request, pathWithParams)
}

async function retrieveAsset(request, pathname, waitUntil) {
  const cache = caches.default
  let response = await cache.match(request)
  if (!response) {
    response = await fetch(`https://${ASSET_HOST}${pathname}`)
    waitUntil(cache.put(request, response.clone()))
  }
  return response
}

async function forwardRequest(request, pathWithSearch) {
  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  const originHeaders = new Headers(request.headers)
  originHeaders.delete('cookie')
  originHeaders.set('X-Forwarded-For', ip)

  return fetch(`https://${API_HOST}${pathWithSearch}`, {
    method: request.method,
    headers: originHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD'
      ? await request.arrayBuffer()
      : null,
    redirect: request.redirect,
  })
}

export async function onRequest({ request, params, waitUntil }) {
  return handleRequest(request, params, waitUntil)
}
