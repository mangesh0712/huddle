/** Music volume (0-100) after applying the user's slider and the duck. */
export const effectiveVolume = (slider: number, someoneSpeaking: boolean, level: number, enabled: boolean) =>
  enabled && someoneSpeaking ? slider * level : slider

/** Moves a 0-1 gain toward target; full-scale in `attackMs` going down, `releaseMs` going up. */
export function stepDuck(current: number, target: number, dtMs: number, attackMs: number, releaseMs: number) {
  if (current === target) return current
  if (target < current) return Math.max(target, current - dtMs / attackMs)
  return Math.min(target, current + dtMs / releaseMs)
}

/** Ducking applies only when the user wants it and the channel isn't karaoke (singing over the track is the point). */
export const duckActive = (userEnabled: boolean, karaoke: boolean) => userEnabled && !karaoke
