import { Monitor, Presentation, SquarePen, Tv, Video, type LucideIcon } from 'lucide-react'

/** Map a facility name to an icon. Matches Priya's rail iconography (Screen/TV,
 * Video conf, Projector, Whiteboard); falls back to a neutral monitor glyph so a
 * new admin-added facility still renders. */
export function facilityIcon(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (n.includes('tv') || n.includes('screen')) return Tv
  if (n.includes('video') || n.includes('conf')) return Video
  if (n.includes('project')) return Presentation
  if (n.includes('white') || n.includes('board')) return SquarePen
  return Monitor
}
