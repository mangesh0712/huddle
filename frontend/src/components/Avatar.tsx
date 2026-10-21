import { motion } from 'framer-motion'
import { avatarHue } from '../lib/format'

export function Avatar({ identity, emoji, size = 36, speaking = false }: { identity: string; emoji: string; size?: number; speaking?: boolean }) {
  const hue = avatarHue(identity)
  return (
    <motion.span
      className="grid shrink-0 place-items-center rounded-full select-none"
      style={{ width: size, height: size, fontSize: size * 0.52, background: `hsl(${hue} 38% 24%)` }}
      animate={{
        boxShadow: speaking
          ? '0 0 0 2px var(--accent), 0 0 18px 2px var(--accent)'
          : '0 0 0 0px rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0)',
      }}
      transition={{ duration: 0.18 }}
    >
      <span aria-hidden="true">{emoji}</span>
    </motion.span>
  )
}
