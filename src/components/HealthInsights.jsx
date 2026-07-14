// ── Insights ────────────────────────────────────────────────────────────────
// Cross-metric analysis over Daily Metrics + Nutrition (+ Training sessions),
// in the same 2-column analytics grid the Finance section uses. Every card has
// a real low-data state that trips below its minimum sample size.
import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip,
  ComposedChart, Bar, Cell,
} from 'recharts'
import { supabase } from '../supabase'
import { C, macroTargets, fmtSignedHm } from '../utils/healthHelpers'
import {
  maintenanceEstimate, readinessScore, trainingRecovery, sleepDebt,
  adherenceWeightOverlay, weeklyScorecard,
} from '../utils/healthInsights'
import { HCard, CardTitle, CardSub, StatTile, Dot } from './HealthUI'

const STATUS = { good: C.emerald, warn: C.amber, bad: C.red, none: '#2a3242' }

function Card({ title, sub, children }) {
  return (
    <HCard style={{ padding: 20 }}>
      <CardTitle>{title}</CardTitle>
      <CardSub className="mt-1" style={{ marginBottom: 16 }}>{sub}</CardSub>
      {children}
    </HCard>
  )
}

// Muted low-data treatment shared by the guarded cards.
function LowData({ children }) {
  return <div style={{ fontSize: 12.5, color: C.amber, marginTop: 4 }}>{children}</div>
}

export default function HealthInsights({ appleHealthLogs, weightLogs, meals, settings }) {
  const targets = macroTargets(settings)
  const sleepTargetH = settings.sleep_target_hours || 8
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('performed_sessions')
        .select('performed_date, session_rating, energy_rating')
        .order('performed_date', { ascending: false })
      if (data) setSessions(data)
    })()
  }, [])

  const maint = useMemo(() => maintenanceEstimate(meals, weightLogs, appleHealthLogs), [meals, weightLogs, appleHealthLogs])
  const ready = useMemo(() => readinessScore(appleHealthLogs), [appleHealthLogs])
  const corr = useMemo(() => trainingRecovery(sessions, appleHealthLogs), [sessions, appleHealthLogs])
  const debt = useMemo(() => sleepDebt(appleHealthLogs, sleepTargetH), [appleHealthLogs, sleepTargetH])
  const overlay = useMemo(() => adherenceWeightOverlay(meals, weightLogs, targets), [meals, weightLogs, targets])
  const scorecard = useMemo(() => weeklyScorecard(sessions, meals, appleHealthLogs, targets, sleepTargetH), [sessions, meals, appleHealthLogs, targets, sleepTargetH])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. Maintenance calorie estimator */}
      <Card title="Maintenance calorie estimator" sub="Triangulated from calories-in, active calories, and weight trend — 21-day rolling window">
        {maint.available ? (
          <>
            <div className="font-bold" style={{ fontSize: 30, color: C.emerald, marginBottom: 14 }}>
              {maint.maintenance.toLocaleString()} kcal<span style={{ fontSize: 14, color: C.label, fontWeight: 500 }}>/day</span>
            </div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
              <StatTile label="Cal-in avg" value={maint.calInAvg.toLocaleString()} />
              <StatTile label="Active-cal avg" value={maint.activeAvg != null ? maint.activeAvg.toLocaleString() : '—'} />
              <StatTile label="Weight trend" value={`${maint.weightTrendPerWeek > 0 ? '+' : ''}${maint.weightTrendPerWeek} kg/wk`} />
            </div>
            <div style={{ fontSize: 11, color: maint.confidence === 'high' ? C.emerald : C.amber, marginTop: 12 }}>
              Confidence: {maint.confidence} — {maint.daysLogged} days logged
            </div>
          </>
        ) : (
          <LowData>
            Need at least 14 days of calorie + weight logging for a maintenance estimate.
            Currently: {maint.daysLogged} day{maint.daysLogged === 1 ? '' : 's'} of meals
            {maint.weightDays != null && `, ${maint.weightDays} weight entr${maint.weightDays === 1 ? 'y' : 'ies'}`}.
          </LowData>
        )}
      </Card>

      {/* 2. Recovery readiness score */}
      <Card title="Recovery readiness score" sub="Composite of HRV, RHR, and sleep vs your rolling baseline">
        {ready.available ? (
          <>
            <div className="flex items-center" style={{ gap: 18, marginBottom: 16 }}>
              <div className="font-bold" style={{ fontSize: 40, color: STATUS[ready.status] }}>{ready.score}</div>
              <div style={{ flex: 1, height: 8, background: '#1c2432', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${ready.score}%`, background: STATUS[ready.status] }} />
              </div>
              <div className="font-bold uppercase" style={{ fontSize: 12, color: STATUS[ready.status] }}>{ready.label}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ready.factors.map(f => (
                <div key={f.label} className="flex justify-between" style={{ fontSize: 12.5 }}>
                  <span style={{ color: C.text3 }}>{f.label}</span>
                  <span className="font-semibold" style={{ color: f.favorable ? C.emerald : C.amber }}>{f.value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <LowData>Need at least 14 days of HRV, resting HR and sleep data for a reliable score. Currently: {ready.daysWithData} days.</LowData>
        )}
      </Card>

      {/* 3. Training load vs recovery correlation (usually low-data) */}
      <HCard style={{ padding: 20, opacity: corr.available ? 1 : 0.85 }}>
        <CardTitle>Training load vs recovery correlation</CardTitle>
        <CardSub className="mt-1" style={{ marginBottom: 16 }}>Overlays session intensity against next-day HRV/RHR movement</CardSub>
        {corr.available ? (
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={corr.series} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" hide /><YAxis hide domain={['dataMin - 4', 'dataMax + 4']} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
              <Line type="monotone" dataKey="v" stroke={C.emerald} strokeWidth={2} dot={false} isAnimationActive={false} name="Next-day HRV" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <>
            <svg viewBox="0 0 460 90" width="100%" height="90" preserveAspectRatio="none" style={{ opacity: 0.3 }}>
              <path d="M0,60 L60,50 L120,58 L180,40 L240,52 L300,35 L360,48 L420,44 L460,50" fill="none" stroke={C.label} strokeWidth="2" strokeDasharray="4,4" />
            </svg>
            <LowData>Need at least 2 weeks of paired training + recovery data. Currently: {corr.sessionsCount} session{corr.sessionsCount === 1 ? '' : 's'} logged.</LowData>
          </>
        )}
      </HCard>

      {/* 4. Sleep debt tracker */}
      <Card title="Sleep debt tracker" sub={`Cumulative deficit against ${sleepTargetH}h/night target — 14-day rolling`}>
        {debt.available ? (
          <>
            <div className="font-bold" style={{ fontSize: 26, color: debt.netMinutes < 0 ? C.red : C.emerald, marginBottom: 12 }}>
              {fmtSignedHm(debt.netMinutes)}
            </div>
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={debt.series} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" hide /><YAxis hide />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} formatter={v => fmtSignedHm(v)} />
                <ReferenceLine y={0} stroke="#2a3242" />
                <Line type="monotone" dataKey="cum" stroke={C.red} strokeWidth={2.5} dot={false} isAnimationActive={false} name="Sleep debt" />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <LowData>Need at least 14 nights of sleep data. Currently: {debt.nights} night{debt.nights === 1 ? '' : 's'}.</LowData>
        )}
      </Card>

      {/* 5. Macro adherence vs weight trend overlay */}
      <Card title="Macro adherence vs weight trend" sub="Daily adherence bars against weight moving average">
        {overlay.available ? (
          <>
            <ResponsiveContainer width="100%" height={100}>
              <ComposedChart data={overlay.bars.map((b, i) => ({ ...b, w: overlay.weightLine[i].w, one: 1 }))} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="label" hide />
                <YAxis yAxisId="bar" hide domain={[0, 1]} />
                <YAxis yAxisId="w" hide domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                <Bar yAxisId="bar" dataKey="one" barSize={16} radius={2} isAnimationActive={false}>
                  {overlay.bars.map((b, i) => <Cell key={i} fill={STATUS[b.status]} fillOpacity={0.55} />)}
                </Bar>
                <Line yAxisId="w" type="monotone" dataKey="w" stroke={C.emerald} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11.5, color: C.label, marginTop: 8 }}>{overlay.takeaway}</div>
          </>
        ) : (
          <LowData>Need at least 14 days of meal + weight logging to overlay adherence against weight. Currently: {overlay.loggedDays} days.</LowData>
        )}
      </Card>

      {/* 6. Weekly consistency scorecard */}
      <Card title="Weekly consistency scorecard" sub="This week's discipline at a glance">
        {scorecard.anyData ? (
          <div className="grid items-center" style={{ gridTemplateColumns: '70px repeat(7, 1fr)', rowGap: 10 }}>
            <span />
            {scorecard.dayLabels.map(d => <span key={d} className="text-center" style={{ fontSize: 10.5, color: C.label }}>{d}</span>)}
            {scorecard.rows.map(row => (
              <Row key={row.label} row={row} />
            ))}
          </div>
        ) : (
          <LowData>No training, meal or sleep data yet this week.</LowData>
        )}
      </Card>
    </div>
  )
}

function Row({ row }) {
  return (
    <>
      <span style={{ fontSize: 11, color: C.text3 }}>{row.label}</span>
      {row.cells.map((cell, i) => (
        <span key={i} className="flex justify-center">
          <Dot size={9} color={cell.hit ? C.emerald : cell.future ? '#141a25' : '#2a3242'} />
        </span>
      ))}
    </>
  )
}
