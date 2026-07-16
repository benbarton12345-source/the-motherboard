// Identity Check-In — fixed, standing config.
//
// The 8 life domains and their identity descriptors are a permanent statement of
// who the user is becoming — NOT user-editable per day (only ever changed here,
// in code). Daily FOR/NEUTRAL/AGAINST votes against these domains live in the
// `identity_votes` table. Copy is verbatim from the design handoff DOMAIN_DATA.

export const IDENTITY_DOMAINS = [
  {
    name: 'Mind',
    descriptor:
      "I am decisive. I objectively draw out facts and make decisions with confidence, no matter how difficult. I see clearly where my decisions lead before I make them. I commit and I don't give up — but I'm not afraid to change course when it's right. I know when to stick and when to twist.",
  },
  {
    name: 'Body',
    descriptor:
      "I am mobile, flexible, and resilient. My body reflects who I am — disciplined, healthy, and capable across endurance, strength, and combat. This isn't a project anymore. It's the norm, and maintaining it is second nature.",
  },
  {
    name: 'Vocation',
    descriptor:
      'I am Chartered, knowledgeable, and confident delivering advice. I trust my own knowledge and strategies. Whatever the situation, I have an answer and I handle it. My clients trust me and rate me because of my actions and outcomes. I have built a loyal client base, meaningful AUM, and an asset I could retire on any time — but I keep working it, because I love it.',
  },
  {
    name: 'Spirit',
    descriptor:
      "I have meaning across every part of my life — family, career, friends, hobbies. None of them outshines the others; they're all excelling together. Everything I do, I do with passion and commitment. My purpose isn't parked in one avenue. It's my existence.",
  },
  {
    name: 'Partner',
    descriptor:
      "I have nothing but love to give Laura. I'm patient and caring with her, and she helps me think clearly rather than absorbing my negativity. We are both completely fulfilled by each other.",
  },
  {
    name: 'Family & Friends',
    descriptor:
      "I am confident in my own life — the home, the career, the family I've built — and my friendships and family relationships slot naturally into that. There's no hostility left with my sibling; I'm the centre of the relationship, the safe space everyone can come back to.",
  },
  {
    name: 'Trading',
    descriptor:
      "I trade with edge and patience, following my process without hesitation or impulse. I don't hope a setup works — I know my system, and I execute it. This is a real second income stream, built the same way everything else in my life is built: methodically, and without shortcuts.",
  },
  {
    name: 'Discipline',
    descriptor:
      "How I do anything is how I do everything. The small standards — the bed made, the space held, the tiny decisions no one's watching — are where the whole identity either holds or leaks. I don't let the small things slide because I know they're never really small.",
  },
]

export const IDENTITY_DOMAIN_NAMES = IDENTITY_DOMAINS.map(d => d.name)

// Trailing window (days) the Overview aggregate looks back over.
export const IDENTITY_WINDOW_DAYS = 14

// Vote → colour token map (Tailwind classes, matching the app's emerald/amber/red
// convention rather than the handoff's raw hexes).
export const VOTE_STYLES = {
  for: {
    label: 'FOR',
    active: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/40',
    bar: 'bg-emerald-400',
    text: 'text-emerald-400',
  },
  neutral: {
    label: 'NEUTRAL',
    active: 'bg-amber-400/10 text-amber-400 border-amber-400/40',
    bar: 'bg-amber-400',
    text: 'text-amber-400',
  },
  against: {
    label: 'AGAINST',
    active: 'bg-red-400/10 text-red-400 border-red-400/40',
    bar: 'bg-red-400',
    text: 'text-red-400',
  },
}

export const VOTE_ORDER = ['for', 'neutral', 'against']

// Badge from a domain's for/neutral/against tallies over the window.
//   for-rate ≥ 65%  → ON TRACK (green)
//   40–65%          → BALANCED (amber)
//   < 40%           → BEHIND   (red)
// No votes yet → a muted neutral state (handoff didn't specify an empty state).
export function identityBadge({ forCount = 0, neutral = 0, against = 0 }) {
  const total = forCount + neutral + against
  if (total === 0) {
    return { label: 'NO VOTES', text: 'text-gray-500', border: 'border-gray-700' }
  }
  const forRate = (forCount / total) * 100
  if (forRate >= 65) return { label: 'ON TRACK', text: 'text-emerald-400', border: 'border-emerald-400/50' }
  if (forRate >= 40) return { label: 'BALANCED', text: 'text-amber-400', border: 'border-amber-400/50' }
  return { label: 'BEHIND', text: 'text-red-400', border: 'border-red-400/50' }
}

// "N for · N neutral · N against" — the standard tally caption, or a placeholder.
export function tallyLabel({ forCount = 0, neutral = 0, against = 0 }, empty = 'no votes yet') {
  if (forCount + neutral + against === 0) return empty
  return `${forCount} for · ${neutral} neutral · ${against} against`
}
