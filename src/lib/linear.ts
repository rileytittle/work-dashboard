const LINEAR_API = "https://api.linear.app/graphql"

function getKey(): string | null {
  const key = process.env.LINEAR_API_KEY?.trim()
  return key ? key : null
}

export function hasLinearKey(): boolean {
  return !!getKey()
}

/**
 * Personal API keys (lin_api_...) go in the Authorization header as-is,
 * OAuth access tokens need the Bearer prefix.
 */
function authHeader(key: string): string {
  return key.startsWith("lin_api_") ? key : `Bearer ${key}`
}

export async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const key = getKey()
  if (!key) throw new Error("LINEAR_API_KEY is not set")

  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: authHeader(key) },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })

  if (!res.ok) throw new Error(`Linear API ${res.status}: ${await res.text()}`)

  const json = await res.json()
  if (json.errors?.length) throw new Error(`Linear API error: ${json.errors[0].message}`)

  return json.data as T
}
