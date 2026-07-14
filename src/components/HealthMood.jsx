// ── Mood (placeholder) ──────────────────────────────────────────────────────
// Reserves the nav slot and sets expectations. No functional logging this
// iteration — no charts, no mock data, no controls (per the brief).
import { C } from '../utils/healthHelpers'

export default function HealthMood() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 420 }}>
      <div
        className="rounded-2xl text-center"
        style={{ background: C.card, border: `1px solid ${C.border}`, padding: '40px 48px', maxWidth: 440 }}
      >
        <div
          className="mx-auto flex items-center justify-center rounded-full"
          style={{
            width: 44, height: 44, marginBottom: 18, fontSize: 18, color: C.text3,
            background: C.cardNested, border: `1px solid ${C.border}`,
          }}
        >
          ◐
        </div>
        <div className="font-semibold" style={{ fontSize: 17, color: C.text, marginBottom: 10 }}>
          Mood — coming soon
        </div>
        <div style={{ fontSize: 13, color: C.text3, lineHeight: 1.6 }}>
          This section will track State of Mind data from Apple Health, with a daily
          trend line and a monthly heatmap view. Not yet logging — check back once
          data starts flowing in.
        </div>
      </div>
    </div>
  )
}
