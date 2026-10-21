export function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function avatarHue(identity: string) {
  let h = 5381
  for (let i = 0; i < identity.length; i++) h = ((h << 5) + h + identity.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}
