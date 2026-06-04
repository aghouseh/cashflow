const KNOWN_PROJECT_ID = '4511506024759296'

export async function onRequest({ request }) {
  const body = await request.text()
  const [headerLine] = body.split('\n')

  let projectId
  try {
    const envelope = JSON.parse(headerLine)
    const dsn = new URL(envelope.dsn)
    projectId = dsn.pathname.replace('/', '')
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  if (projectId !== KNOWN_PROJECT_ID) {
    return new Response('Forbidden', { status: 403 })
  }

  return fetch(`https://o4511506017615872.ingest.us.sentry.io/api/${projectId}/envelope/`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  })
}
