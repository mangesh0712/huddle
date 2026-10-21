const P = 'huddle:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(P + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(P + key, JSON.stringify(value))
  } catch {
    /* storage unavailable; settings just won't persist */
  }
}

export function getIdentity(): string {
  const existing = load<string | null>('identity', null)
  if (existing) return existing
  const id = crypto.randomUUID()
  save('identity', id)
  return id
}
