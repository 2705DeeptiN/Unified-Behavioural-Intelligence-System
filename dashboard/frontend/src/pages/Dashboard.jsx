import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

/* ── Category colour map (unchanged) ──────────────────────────────────────── */
const CAT_COLOR = {
  Theory:   { bg: 'rgba(124,58,237,0.18)',  fg: '#a78bfa', border: 'rgba(124,58,237,0.4)',  accent: '#a78bfa' },
  Tutorial: { bg: 'rgba(37,99,235,0.18)',   fg: '#60a5fa', border: 'rgba(37,99,235,0.4)',   accent: '#60a5fa' },
  Lab:      { bg: 'rgba(5,150,105,0.18)',   fg: '#34d399', border: 'rgba(5,150,105,0.4)',   accent: '#34d399' },
}

const FLASK = 'http://localhost:8000'
const CAT_ENDPOINT = { Lab: '/run/lab', Theory: '/run/theory', Tutorial: '/run/tutorial' }

/* ════════════════════════════════════════════════════════════════════════════
   Spinner
════════════════════════════════════════════════════════════════════════════ */
function Spinner({ color = '#a78bfa' }) {
  return (
    <>
      <style>{`@keyframes _sp{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        width: 46, height: 46, borderRadius: '50%',
        border: `3px solid ${color}`, borderTopColor: 'transparent',
        animation: '_sp 0.85s linear infinite',
      }} />
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   Modal shell
════════════════════════════════════════════════════════════════════════════ */
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass modal-box"
        style={wide ? { maxWidth: '680px' } : {}}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   Vertical Bar Chart
════════════════════════════════════════════════════════════════════════════ */
function VerticalBarChart({ bars, height = 180 }) {
  // Animate the bars: they grow from 0 up to their real values when the
  // chart first appears, so the result visibly "settles" like an analysis
  // in progress. If the bars prop changes later (live mode), they smoothly
  // transition to the new values.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 60)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: '1.5rem',
      height: height + 60,
      padding: '1rem 1.2rem 0',
      justifyContent: 'center',
    }}>
      {bars.map((bar, i) => {
        const effPct = shown ? bar.pct : 0
        const barH = Math.max((effPct / 100) * height, shown ? 4 : 2)
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', minWidth: 80 }}>
            <div style={{
              fontSize: '1.15rem', fontWeight: 800,
              color: bar.textColor || bar.color,
              letterSpacing: '-0.02em',
            }}>
              {bar.pct.toFixed(1)}%
            </div>
            <div style={{
              width: 64,
              height: barH,
              background: `linear-gradient(180deg, ${bar.color}, ${bar.color}88)`,
              borderRadius: '8px 8px 3px 3px',
              boxShadow: `0 0 18px ${bar.color}55`,
              transition: 'height 0.7s cubic-bezier(.4,0,.2,1)',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
                background: 'rgba(255,255,255,0.12)',
                borderRadius: '8px 8px 0 0',
              }} />
            </div>
            <div style={{
              fontSize: '0.78rem', fontWeight: 600,
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center', lineHeight: 1.3,
              maxWidth: 80,
            }}>
              {bar.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   ANALYSIS VISUALS  —  used by the HOD class-wise / subject-wise / teacher-wise
   modals. Purely additive: these render ABOVE the existing tables, the tables
   themselves are untouched.
════════════════════════════════════════════════════════════════════════════ */

// Colour for a qualitative performance band.
function bandColor(label) {
  const L = (label || '').toUpperCase()
  if (L.includes('EXCELLENT'))  return '#34d399'
  if (L === 'GOOD')             return '#60a5fa'
  if (L.includes('AVERAGE'))    return '#fbbf24'
  if (L.includes('NEEDS'))      return '#f87171'
  return '#94a3b8'
}

// Horizontal bar chart that scales to any number of rows.
// `rows` = [{ label, value, sublabel?, color?, valueSuffix? }]
function AnalysisBarChart({ rows, title, maxValue = 100, valueSuffix = '%' }) {
  if (!rows || rows.length === 0) return null
  const cap = Math.max(maxValue, ...rows.map(r => r.value || 0), 1)
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '1.1rem 1.3rem',
      marginBottom: '1.2rem',
    }}>
      {title && (
        <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem' }}>
          {title}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {rows.map((r, i) => {
          const pct = Math.min(100, ((r.value || 0) / cap) * 100)
          const color = r.color || '#60a5fa'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{
                width: 130, flexShrink: 0, textAlign: 'right',
                fontSize: '0.82rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600,
                lineHeight: 1.25,
              }}>
                {r.label}
                {r.sublabel && (
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                    {r.sublabel}
                  </div>
                )}
              </div>
              <div style={{
                flex: 1, height: 26,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '6px', overflow: 'hidden', position: 'relative',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                  borderRadius: '6px',
                  transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
                  boxShadow: `0 0 12px ${color}55`,
                }} />
              </div>
              <div style={{
                width: 64, flexShrink: 0,
                fontSize: '0.9rem', fontWeight: 800, color,
                textAlign: 'right',
              }}>
                {(r.value || 0).toFixed(1)}{valueSuffix}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Small labelled stat chip — used for the summary row (sessions count etc.)
function StatChip({ label, value, color = '#a78bfa' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '10px',
      padding: '0.7rem 1rem',
      minWidth: 110,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.15rem' }}>{label}</div>
    </div>
  )
}

// A row of stat chips.
function StatChipRow({ chips }) {
  return (
    <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
      {chips.map((c, i) => <StatChip key={i} {...c} />)}
    </div>
  )
}

// Compact horizontal "donut-ish" segmented bar showing the spread of
// performance bands across rows. `counts` = { EXCELLENT: n, GOOD: n, ... }
function PerformanceSplitBar({ rows, perfKey = 'performance' }) {
  if (!rows || rows.length === 0) return null
  const bands = ['EXCELLENT', 'GOOD', 'AVERAGE', 'NEEDS IMPROVEMENT']
  const counts = { EXCELLENT: 0, GOOD: 0, AVERAGE: 0, 'NEEDS IMPROVEMENT': 0 }
  rows.forEach(r => {
    const p = (r[perfKey] || '').toUpperCase()
    if (p.includes('EXCELLENT')) counts.EXCELLENT++
    else if (p === 'GOOD') counts.GOOD++
    else if (p.includes('AVERAGE')) counts.AVERAGE++
    else if (p.includes('NEEDS')) counts['NEEDS IMPROVEMENT']++
  })
  const total = bands.reduce((s, b) => s + counts[b], 0)
  if (total === 0) return null
  return (
    <div style={{ marginBottom: '1.2rem' }}>
      <div style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.6rem' }}>
        Performance distribution
      </div>
      <div style={{ display: 'flex', height: 28, borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
        {bands.map(b => {
          if (counts[b] === 0) return null
          const w = (counts[b] / total) * 100
          return (
            <div key={b} style={{
              width: `${w}%`,
              background: bandColor(b),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.74rem', fontWeight: 700, color: 'rgba(0,0,0,0.65)',
            }}>
              {counts[b]}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
        {bands.map(b => counts[b] > 0 && (
          <div key={b} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: bandColor(b), display: 'inline-block' }} />
            <span style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.65)' }}>
              {b} ({counts[b]})
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   Verdict Banner
════════════════════════════════════════════════════════════════════════════ */
function VerdictBanner({ verdict, color, icon, subtitle }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}22, ${color}0a)`,
      border: `1.5px solid ${color}55`,
      borderRadius: '12px',
      padding: '1.1rem 1.4rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.3rem' }}>{icon}</div>
      <div style={{
        fontSize: '1.35rem', fontWeight: 900,
        color: color, letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>
        {verdict}
      </div>
      {subtitle && (
        <div style={{
          fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)',
          marginTop: '0.3rem', fontWeight: 500,
        }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

function InfoCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: `${color}12`,
      border: `1px solid ${color}35`,
      borderRadius: '10px',
      padding: '0.8rem 1rem',
      display: 'flex', alignItems: 'center', gap: '0.7rem',
      flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: '1.4rem' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: color }}>{value}</div>
      </div>
    </div>
  )
}

function InsightCard({ text, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderLeft: `3px solid ${color}`,
      borderRadius: '10px',
      padding: '0.9rem 1.1rem',
      fontSize: '0.88rem',
      color: 'rgba(255,255,255,0.75)',
      lineHeight: 1.6,
    }}>
      <span style={{ fontWeight: 700, color, marginRight: '0.4rem' }}>💡 Insight:</span>
      {text}
    </div>
  )
}

function RecommendationCard({ text, color }) {
  return (
    <div style={{
      background: `${color}0f`,
      border: `1px solid ${color}40`,
      borderRadius: '10px',
      padding: '0.9rem 1.1rem',
      fontSize: '0.9rem',
      fontWeight: 700,
      color: color,
      lineHeight: 1.6,
    }}>
      <span style={{ marginRight: '0.4rem' }}>✅</span>
      {text}
    </div>
  )
}

function Tag({ label, color }) {
  return (
    <span style={{
      background: `${color}20`,
      border: `1px solid ${color}50`,
      color: color,
      borderRadius: '20px',
      padding: '0.2rem 0.7rem',
      fontSize: '0.75rem',
      fontWeight: 700,
    }}>
      {label}
    </span>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   PerformancePill — coloured qualitative label for HOD aggregates
   (EXCELLENT / GOOD / AVERAGE / NEEDS IMPROVEMENT / —)
════════════════════════════════════════════════════════════════════════════ */
function PerformancePill({ label }) {
  const map = {
    'EXCELLENT':         { bg: 'rgba(52,211,153,0.18)',  border: 'rgba(52,211,153,0.55)',  fg: '#34d399' },
    'GOOD':              { bg: 'rgba(96,165,250,0.18)',  border: 'rgba(96,165,250,0.55)',  fg: '#60a5fa' },
    'AVERAGE':           { bg: 'rgba(251,191,36,0.18)',  border: 'rgba(251,191,36,0.55)',  fg: '#fbbf24' },
    'NEEDS IMPROVEMENT': { bg: 'rgba(248,113,113,0.18)', border: 'rgba(248,113,113,0.55)', fg: '#f87171' },
    '—':                 { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', fg: 'rgba(255,255,255,0.5)' },
  }
  const s = map[label] || map['—']
  return (
    <span style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.fg,
      borderRadius: '20px',
      padding: '0.25rem 0.7rem',
      fontSize: '0.72rem',
      fontWeight: 700,
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   EMOTION RESULT CARD (Theory / Tutorial)
════════════════════════════════════════════════════════════════════════════ */
function EmotionResultCard({ data, accentColor, categoryLabel, videoName }) {
  const verdictColor = data.verdict === 'ATTENTIVE' ? '#34d399'
    : data.verdict === 'NOT ATTENTIVE' ? '#f87171'
    : '#fbbf24'

  const verdictIcon  = data.verdict === 'ATTENTIVE' ? '🎯'
    : data.verdict === 'NOT ATTENTIVE' ? '😴'
    : '⚖️'

  const bars = [
    { label: 'Attentive',     pct: data.attentive_pct,     color: '#34d399' },
    { label: 'Not Attentive', pct: data.not_attentive_pct, color: '#f87171' },
  ]

  // Insight is derived DIRECTLY from the attentive percentage shown on
  // screen, so it can never contradict the number (e.g. it will never say
  // "students are distracted" when attentiveness is high).
  const attPct = typeof data.attentive_pct === 'number' ? data.attentive_pct : 0
  const insightText = attPct >= 60
    ? `The majority of students in this ${categoryLabel.toLowerCase()} class are paying attention and actively engaged with the lesson.`
    : attPct >= 40
    ? `The class shows a mixed level of attention. Some students are engaged while others may need additional encouragement.`
    : `A significant portion of students appear disengaged in this ${categoryLabel.toLowerCase()} class. Consider interactive activities to boost focus.`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {videoName && (
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        </div>
      )}

      <div style={{
        background: 'rgba(0,0,0,0.25)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '0.5rem 0 0.8rem',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '0.3rem' }}>
          Student Attention Breakdown
        </div>
        <VerticalBarChart bars={bars} height={160} />
      </div>

      <VerdictBanner
        verdict={data.verdict}
        color={verdictColor}
        icon={verdictIcon}
        subtitle={`Overall class classification for this ${categoryLabel} session`}
      />

      <InsightCard text={insightText} color={accentColor} />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   LAB RESULT CARD
════════════════════════════════════════════════════════════════════════════ */
function LabResultCard({ data, videoName }) {
  const verdictColor = data.verdict === 'FOCUSED' ? '#34d399'
    : data.verdict === 'DISTRACTED' ? '#f87171'
    : '#fbbf24'

  const verdictIcon  = data.verdict === 'FOCUSED' ? '🔬'
    : data.verdict === 'DISTRACTED' ? '🚫'
    : '⚖️'

  const bars = [
    { label: 'Focused',     pct: data.focused_pct,     color: '#34d399' },
    { label: 'Distracted',  pct: data.distracted_pct,  color: '#f87171' },
  ]

  // Derived ONLY from the focused percentage shown, so the text can never
  // contradict the number on screen (ignore any backend insight text).
  const focPct = typeof data.focused_pct === 'number' ? data.focused_pct : 0
  const insightText =
    (focPct >= 60
      ? 'Students are on-task and actively working on their lab assignments. Excellent lab session!'
      : focPct >= 40
      ? 'The lab session shows a balanced mix of focused and distracted students. Monitoring individual workstations may help.'
      : 'Students appear off-task during this lab session. A structured check-in or guided instructions may help improve focus.')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {videoName && (
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        </div>
      )}

      <div style={{
        background: 'rgba(0,0,0,0.25)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '0.5rem 0 0.8rem',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '0.3rem' }}>
          Student Focus Distribution
        </div>
        <VerticalBarChart bars={bars} height={160} />
      </div>

      <VerdictBanner
        verdict={data.verdict}
        color={verdictColor}
        icon={verdictIcon}
        subtitle="Overall lab session classification"
      />

      <InsightCard text={insightText} color="#34d399" />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   TEACHER RESULT CARD
════════════════════════════════════════════════════════════════════════════ */
function TeacherResultCard({ data, teacherName, videoName }) {
  // If the teacher pipeline failed, show a clear message instead of an
  // empty "Detecting…" card.
  if (data && data.error) {
    return <ErrorCard message={data.error_msg} />
  }

  const modeIcon = data.mode === 'boardandppt' ? '🖥️📋'
    : data.mode === 'pptonly' ? '🖥️'
    : '📋'

  const modeColor = data.mode === 'boardandppt' ? '#60a5fa'
    : data.mode === 'pptonly' ? '#a78bfa'
    : '#fbbf24'

  const enthusiasmColor = data.enthu_pct >= 60 ? '#34d399' : '#f87171'

  const verdictText = data.enthu_verdict || (data.enthu_pct >= 60 ? 'HIGHLY ENTHUSIASTIC' : 'NOT ENTHUSIASTIC')
  const verdictColor = data.enthu_pct >= 60 ? '#34d399' : '#f87171'
  const verdictIcon  = data.enthu_pct >= 60 ? '🔥' : '⚠️'

  const bars = [
    { label: 'Enthusiastic',     pct: data.enthu_pct,     color: '#34d399' },
    { label: 'Not Enthusiastic', pct: data.not_enthu_pct, color: '#f87171' },
  ]

  const insightText = data.overall_insight ||
    `This teacher uses ${data.mode_label || 'a teaching method'} and demonstrates ${data.enthu_pct >= 60 ? 'strong enthusiasm' : 'room for improvement in engagement'} during the class session.`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {(teacherName || videoName) && (
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
          {teacherName && <span>👩‍🏫 {teacherName}</span>}
        </div>
      )}

      <div style={{
        background: `${modeColor}15`,
        border: `1.5px solid ${modeColor}45`,
        borderRadius: '12px',
        padding: '1rem 1.2rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        <div style={{ fontSize: '2.2rem' }}>{modeIcon}</div>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginBottom: '0.25rem' }}>
            Mode of Teaching
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: modeColor }}>
            {data.mode_label || 'Detecting…'}
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(0,0,0,0.25)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '0.5rem 0 0.8rem',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '0.3rem' }}>
          Enthusiasm Level
        </div>
        <VerticalBarChart bars={bars} height={160} />
      </div>

      <VerdictBanner
        verdict={verdictText}
        color={verdictColor}
        icon={verdictIcon}
        subtitle="Overall enthusiasm classification for this teaching session"
      />

      {/* Body-language / engagement metrics from the teacher pipeline */}
      {(data.avg_engagement != null || data.peak_engagement != null || data.avg_motion != null) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.7rem',
        }}>
          {[
            { label: 'Avg Engagement', value: data.avg_engagement, color: '#34d399' },
            { label: 'Peak Engagement', value: data.peak_engagement, color: '#60a5fa' },
            { label: 'Avg Body Motion', value: data.avg_motion, color: '#fbbf24' },
          ].map(metric => (
            <div key={metric.label} style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px',
              padding: '0.8rem 0.6rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>
                {metric.label}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: metric.color, marginTop: '0.25rem' }}>
                {metric.value != null ? metric.value.toFixed(2) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      <InsightCard text={insightText} color="#60a5fa" />

      {data.recommendation && (
        <RecommendationCard text={data.recommendation} color={verdictColor} />
      )}
    </div>
  )
}

function ErrorCard({ message }) {
  return (
    <div style={{
      background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: '12px',
      padding: '1.2rem',
      color: '#fca5a5',
      fontSize: '0.88rem',
      lineHeight: 1.6,
    }}>
      <div style={{ fontWeight: 800, color: '#f87171', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
        ⚠️  Analysis Unavailable
      </div>
      <div style={{ opacity: 0.8 }}>
        {message || 'Could not retrieve analysis results. Please ensure the Flask API and ML models are running correctly.'}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   LiveAnalysisModal — TRUE real-time analysis with Start / Stop
   ─────────────────────────────────────────────────────────────────────────
   Unlike AnalysisModal (which analyses one recorded clip), this opens a live
   session on the Flask side: the camera runs continuously and the engagement
   numbers refresh on screen every ~2 seconds until the user clicks Stop.

   On Stop, the final numbers are saved to history + a recommendation is
   generated — exactly like a normal analysis, so no existing feature is lost.

   Props:
     • category    — Lab / Theory / Tutorial (decides which analysis runs)
     • sessionMeta — subject/section info forwarded to /api/sessions on Stop
     • accentColor, title, onClose
════════════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════════════
   LiveTrendChart — a small scrolling line chart for the live session.
   Plots engagement (and optionally attentive / not-attentive) over time so
   the teacher sees the class behaviour CHANGING as it happens. Pure SVG, no
   library, re-renders every poll. Works the same for Lab / Theory / Tutorial.
════════════════════════════════════════════════════════════════════════════ */
function LiveTrendChart({ history }) {
  const W = 620, H = 170, padL = 34, padR = 12, padT = 12, padB = 22
  const plotW = W - padL - padR, plotH = H - padT - padB

  if (!history || history.length === 0) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px', padding: '1.4rem',
        textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem',
      }}>
        Live graph will appear here once the camera warms up…
      </div>
    )
  }

  const n = history.length
  const xFor = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yFor = (v) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH

  const buildPath = (key) => history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p[key]).toFixed(1)}`)
    .join(' ')

  const engPath = buildPath('engagement')
  const attPath = buildPath('attentive')
  // area under engagement
  const areaPath = `${engPath} L ${xFor(n - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`

  const last = history[n - 1]
  const lastColor = last.engagement >= 75 ? '#34d399' : last.engagement >= 50 ? '#fbbf24' : '#f87171'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px', padding: '1rem 1.1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.9rem' }}>
          Live engagement trend
        </div>
        <div style={{ display: 'flex', gap: '0.9rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#60a5fa', marginRight: 4 }} />Engagement</span>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#34d399', marginRight: 4 }} />Attentive</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* gridlines */}
        {[0, 25, 50, 75, 100].map(g => (
          <g key={g}>
            <line x1={padL} y1={yFor(g)} x2={W - padR} y2={yFor(g)}
              stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            <text x={padL - 6} y={yFor(g) + 3} textAnchor="end"
              fill="rgba(255,255,255,0.4)" fontSize="9">{g}</text>
          </g>
        ))}
        {/* engagement area + line */}
        <path d={areaPath} fill="rgba(96,165,250,0.15)" />
        <path d={engPath} fill="none" stroke="#60a5fa" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* attentive line */}
        <path d={attPath} fill="none" stroke="#34d399" strokeWidth="2"
          strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
        {/* last point marker */}
        <circle cx={xFor(n - 1)} cy={yFor(last.engagement)} r="5"
          fill={lastColor} stroke="#0f172a" strokeWidth="2" />
      </svg>
      <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
        Now: <span style={{ color: lastColor, fontWeight: 700 }}>{Math.round(last.engagement)}%</span> engagement
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   LiveAnalysisModal — TRUE real-time analysis with Start / Stop
   ─────────────────────────────────────────────────────────────────────────
   Unlike AnalysisModal (which analyses one recorded clip), this opens a live
   session on the Flask side: the camera runs continuously and the engagement
   numbers refresh on screen every ~2 seconds until the user clicks Stop.

   On Stop, the final numbers are saved to history + a recommendation is
   generated — exactly like a normal analysis, so no existing feature is lost.

   Props:
     • category    — Lab / Theory / Tutorial (decides which analysis runs)
     • sessionMeta — subject/section info forwarded to /api/sessions on Stop
     • accentColor, title, onClose
════════════════════════════════════════════════════════════════════════════ */

function LiveAnalysisModal({ title, category, accentColor = '#dc2626', onClose, sessionMeta }) {
  // A Teacher live session shows board/PPT + enthusiasm — NEVER student
  // metrics. Drive this from the CATEGORY PROP (not from stats.is_teacher)
  // so the UI is correct even if the backend stats are missing the flag.
  const isTeacherSession = String(category || '').toLowerCase() === 'teacher'
  const [phase, setPhase]   = useState('idle')   // idle | starting | running | stopping | done | error
  const [stats, setStats]   = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const [finalStructured, setFinalStructured] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [history, setHistory] = useState([])     // rolling [{t, engagement, attentive, notAttentive}]
  const [showNoStudents, setShowNoStudents] = useState(false)  // popup flag
  const pollRef = useRef(null)
  const noStudentDismissed = useRef(false)
  const emptyStreak = useRef(0)      // consecutive polls with 0 students
  const shownOnce   = useRef(false)  // popup shown at most once per session

  // ── live recommendation derived from the current numbers ────────────────
  function liveRecommendation(s) {
    if (!s) return null
    // HONEST: no recommendation until the model has actually seen students,
    // and none if the video is too unclear to trust.
    if (!s.students_detected || s.students_detected === 0) return null
    if (s.video_clarity === 'low') return null
    const eng = s.engagement || 0
    const dom = (s.dominant_emotion || '').toLowerCase()
    if (eng >= 75) return { tone: 'good',  text: 'Engagement is high — the current teaching approach is working well. Keep going.' }
    if (eng >= 50) return { tone: 'ok',    text: 'Engagement is moderate. A quick question to the class or a short activity could lift it.' }
    if (dom === 'sad' || dom === 'angry' || dom === 'fear')
      return { tone: 'low', text: 'Several students look disengaged. Consider pausing to re-explain or switching to a more interactive task.' }
    return { tone: 'low', text: 'Engagement is low right now. A recap or a change of pace would help re-engage the class.' }
  }

  // ── start the live session ──────────────────────────────────────────────
  const startLive = async () => {
    setPhase('starting'); setErrMsg(''); setHistory([]); setShowNoStudents(false)
    noStudentDismissed.current = false
    emptyStreak.current = 0
    shownOnce.current = false
    try {
      const res = await fetch(`${FLASK}/live/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setErrMsg(data.error || 'Could not start live analysis.')
        setPhase('error')
        return
      }
      setPhase('running')
      // begin polling every 2 seconds
      pollRef.current = setInterval(pollStats, 700)
      pollStats()
    } catch (e) {
      setErrMsg(`Could not reach Flask at ${FLASK}. Is it running?`)
      setPhase('error')
    }
  }

  const pollStats = async () => {
    try {
      const res = await fetch(`${FLASK}/live/stats`)
      const data = await res.json()
      if (data.error) { setErrMsg(data.error) }
      setStats(data)

      // ── rolling history for the live graph ──────────────────────────
      // Only record a point once the camera has warmed up. The engagement
      // value is the genuine model reading; when the feed has no readable
      // students we record 0 so the graph honestly dips instead of freezing.
      if ((data.frames_processed || 0) >= 2) {
        const usable = (data.students_detected || 0) > 0
          && data.any_face_seen === true
          && data.video_clarity !== 'low'
        setHistory(h => {
          const point = {
            t: data.elapsed_seconds ?? h.length,
            engagement:   usable ? (data.engagement || 0) : 0,
            attentive:    usable ? (data.attentive || 0) : 0,
            notAttentive: usable ? (data.not_attentive || 0) : 0,
            usable,
          }
          // keep the last 40 readings (~28s at 700ms) so the graph scrolls
          const next = [...h, point]
          return next.length > 40 ? next.slice(next.length - 40) : next
        })
      }

      // ── "no students detected" popup ────────────────────────────────
      // Only fires after a SUSTAINED absence (several consecutive empty
      // polls), and only ONCE — it will not keep popping up every time the
      // detector momentarily loses the class.
      if ((data.students_detected || 0) === 0) {
        emptyStreak.current += 1
      } else {
        emptyStreak.current = 0
      }
      // ~8 consecutive empty polls ≈ 5–6 seconds of genuinely seeing nobody
      const reallyEmpty = emptyStreak.current >= 8 && !isTeacherSession
      if (reallyEmpty && !noStudentDismissed.current && !shownOnce.current) {
        setShowNoStudents(true)
        shownOnce.current = true        // show at most once per session
      }
      if ((data.students_detected || 0) > 0) {
        setShowNoStudents(false)
      }
    } catch (e) {
      // transient — keep polling
    }
  }

  // ── stop the live session, finalise + persist ───────────────────────────
  const stopLive = async () => {
    setPhase('stopping')
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    try {
      const res = await fetch(`${FLASK}/live/stop`, { method: 'POST' })
      const data = await res.json()
      const structured = data.structured || null
      setFinalStructured(structured)
      setPhase('done')

      // ── HONEST: if the feed was not analysable, do NOT save a fake
      //    session or recommendation. Just show the quality issue.
      if (!structured || structured.analysable === false) {
        setSaveStatus('skipped')
        return
      }

      // persist to history + recommendation (genuine result only)
      if (structured && sessionMeta) {
        setSaveStatus('saving')
        try {
          const token = localStorage.getItem('token')
          const distracted = structured.distracted_pct || 0
          const reasons = structured.reasons || []
          const sessRes = await axios.post('/api/sessions', {
            ...sessionMeta,
            analysisType: data.type || (category || 'theory').toLowerCase(),
            structured:   { ...structured, distraction_reasons: reasons },
            videoName:    'LIVE CAMERA',
            verdict:      structured.verdict || '',
          }, { headers: { Authorization: `Bearer ${token}` } })
          setSaveStatus('saved')

          // recommendation
          try {
            const advice = distracted >= 50
              ? 'Engagement was low during this live session — consider more interactive teaching.'
              : structured.attentive_pct >= 75
                ? 'Engagement stayed high — current approach is working well.'
                : 'Engagement was moderate — a recap or activity could help next time.'
            await axios.post('/api/recommendations', {
              sessionId: sessRes.data?._id,
              section: sessionMeta.section,
              subjectShort: sessionMeta.subjectShort || '',
              subjectName: sessionMeta.subjectName || '',
              subjectCode: sessionMeta.subjectCode || '',
              category: sessionMeta.category,
              dominantEmotion: dom,
              advice,
              hodNote: `Live session — ${sessionMeta.section} ${sessionMeta.subjectName || ''}: ` +
                       `engagement ${structured.attentive_pct}%, dominant emotion ${dom || 'mixed'}.`,
              severity: distracted >= 50 ? 'critical' : distracted >= 25 ? 'warning' : 'info',
              distractedPct: distracted,
              distractionReasons: reasons,
              teacherFacultyCode: sessionMeta.teacherFacultyCode,
            }, { headers: { Authorization: `Bearer ${token}` } })
          } catch (e) { /* non-fatal */ }
        } catch (e) {
          setSaveStatus('failed')
        }
      }
    } catch (e) {
      setErrMsg('Could not stop cleanly, but the session has ended.')
      setPhase('done')
    }
  }

  // cleanup on unmount — make sure the camera is released
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      // best-effort stop so the camera doesn't stay locked
      fetch(`${FLASK}/live/stop`, { method: 'POST' }).catch(() => {})
    }
  }, [])

  const rec = liveRecommendation(stats)
  const eng = stats?.engagement || 0
  const engColor = eng >= 75 ? '#34d399' : eng >= 50 ? '#fbbf24' : '#f87171'

  // HONEST: the engagement number is only meaningful if the model has
  // actually detected students AND read at least one clear face, and the
  // video is not blurry. Otherwise we show a plain status, never a number.
  const hasRealData = !!stats
    && (stats.students_detected || 0) > 0
    && stats.any_face_seen === true
    && stats.video_clarity !== 'low'

  // What honest message to show when there is no real data yet.
  function noDataMessage(s) {
    if (!s) return 'Starting…'
    if ((s.frames_processed || 0) < 2) return 'Warming up the camera…'
    if (s.video_clarity === 'low')
      return 'Video clarity is low — the feed is blurry or out of focus. No engagement is shown until the picture is clear.'
    if ((s.students_detected || 0) === 0)
      return 'No people detected in the camera view. Point the camera at the class. No engagement is shown until students are visible.'
    if (!s.any_face_seen)
      return 'People detected but no clear face yet — faces may be too far, too small, or too dark to read.'
    return 'Waiting for a clear view of the class…'
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <style>{`@keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes popIn { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }`}</style>

      {/* ── NO STUDENTS DETECTED — popup overlay ─────────────────────────── */}
      {showNoStudents && !isTeacherSession && (phase === 'running' || phase === 'stopping') && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          background: 'rgba(2,6,23,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(248,113,113,0.18), rgba(15,23,42,0.97))',
            border: '1.5px solid rgba(248,113,113,0.55)',
            borderRadius: '16px', padding: '1.8rem 2rem', maxWidth: 380,
            textAlign: 'center', animation: 'popIn 0.2s ease-out',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '2.6rem', marginBottom: '0.6rem' }}>🎯</div>
            <div style={{ color: '#f87171', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              No students are detected
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.2rem' }}>
              Pane the camera towards the students. The analysis will continue
              automatically as soon as the class comes into view.
            </div>
            <button
              onClick={() => { noStudentDismissed.current = true; setShowNoStudents(false) }}
              style={{
                background: 'linear-gradient(90deg,#dc2626,#ef4444)',
                color: '#fff', border: 'none', borderRadius: '10px',
                padding: '0.6rem 1.8rem', fontSize: '0.92rem', fontWeight: 700,
                cursor: 'pointer',
              }}>
              Got it
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

        {/* ── IDLE — show the Start button ─────────────────────────────── */}
        {phase === 'idle' && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.8rem' }}>🎥</div>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '1.05rem', margin: '0 0 0.4rem' }}>
              Ready for live {category} analysis
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
              The camera will analyse the class continuously. Numbers update every second.
              Click Stop whenever you want to end — there is no time limit.
            </p>
            <button onClick={startLive}
              style={{
                background: 'linear-gradient(90deg,#16a34a,#22c55e)',
                color: '#fff', border: 'none', borderRadius: '10px',
                padding: '0.8rem 2.4rem', fontSize: '1rem', fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 4px 16px rgba(34,197,94,0.4)',
              }}>
              ▶  Start Live Analysis
            </button>
          </div>
        )}

        {/* ── STARTING ─────────────────────────────────────────────────── */}
        {phase === 'starting' && (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <Spinner color={accentColor} />
            <p style={{ color: 'rgba(255,255,255,0.8)', marginTop: '1rem' }}>
              Opening the camera and loading the AI models…
            </p>
          </div>
        )}

        {/* ── RUNNING — live stats + Stop button ───────────────────────── */}
        {(phase === 'running' || phase === 'stopping') && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: '#f87171', fontWeight: 700, fontSize: '0.85rem',
            }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', background: '#f87171',
                display: 'inline-block', animation: 'livePulse 1.2s infinite',
              }} />
              LIVE — analysing the camera feed in real time
            </div>

            {/* engagement number — shown ONLY when the data is genuine */}
            {isTeacherSession ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{
                  background: 'rgba(96,165,250,0.08)',
                  border: '1px solid rgba(96,165,250,0.35)',
                  borderRadius: '14px', padding: '1.1rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}>Mode of teaching</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60a5fa', marginTop: '0.25rem' }}>
                    {(stats && stats.mode_label) || 'Detecting…'}
                  </div>
                </div>
                <div style={{
                  background: 'rgba(52,211,153,0.08)',
                  border: '1px solid rgba(52,211,153,0.35)',
                  borderRadius: '14px', padding: '1.1rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2.4rem', fontWeight: 800, color: ((stats?.enthu_pct ?? 0) >= 50 ? '#34d399' : '#f87171'), lineHeight: 1 }}>
                    {(stats?.enthu_pct ?? 0).toFixed(0)}%
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginTop: '0.3rem', fontWeight: 700 }}>
                    {(stats && stats.enthu_verdict) || 'Analysing enthusiasm…'}
                  </div>
                </div>
                {stats && Array.isArray(stats.reasons) && stats.reasons.length > 0
                    && /teacher model error/i.test(stats.reasons[0]) && (
                  <div style={{
                    background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.4)',
                    borderRadius: '10px', padding: '0.7rem 0.9rem',
                    color: '#fca5a5', fontSize: '0.78rem', fontFamily: 'monospace',
                    wordBreak: 'break-word',
                  }}>
                    {stats.reasons[0]}
                  </div>
                )}
              </div>
            ) : hasRealData ? (
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${engColor}55`,
                borderRadius: '14px', padding: '1.4rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '3.2rem', fontWeight: 800, color: engColor, lineHeight: 1 }}>
                  {eng.toFixed(0)}%
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                  Live engagement
                </div>
              </div>
            ) : (
              <div style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.35)',
                borderRadius: '14px', padding: '1.4rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👀</div>
                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                  No engagement value yet
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', lineHeight: 1.45 }}>
                  {noDataMessage(stats)}
                </div>
              </div>
            )}

            {/* stat chips */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {(isTeacherSession
                ? [
                    { label: 'Elapsed', value: `${stats?.elapsed_seconds ?? 0}s`, color: '#fbbf24' },
                  ]
                : [
                    { label: 'Students',     value: stats?.students_detected ?? 0,  color: '#a78bfa' },
                    { label: 'Elapsed',      value: `${stats?.elapsed_seconds ?? 0}s`, color: '#fbbf24' },
                  ]
              ).map((c, i) => (
                <div key={i} style={{
                  flex: 1, minWidth: 92,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '0.6rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)' }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* live recommendation (teacher-facing) */}
            {!isTeacherSession && rec && (
              <div style={{
                background: rec.tone === 'good' ? 'rgba(52,211,153,0.10)'
                          : rec.tone === 'ok'   ? 'rgba(251,191,36,0.10)'
                          : 'rgba(248,113,113,0.10)',
                border: `1px solid ${rec.tone === 'good' ? 'rgba(52,211,153,0.4)'
                          : rec.tone === 'ok' ? 'rgba(251,191,36,0.4)'
                          : 'rgba(248,113,113,0.4)'}`,
                borderRadius: '10px', padding: '0.85rem 1rem',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em',
                              color: 'rgba(255,255,255,0.55)', marginBottom: '0.25rem' }}>
                  LIVE RECOMMENDATION
                </div>
                <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem', lineHeight: 1.45 }}>
                  {rec.text}
                </div>
              </div>
            )}

            {/* ── LIVE GRAPH — student engagement trend, hidden for teacher ── */}
            {!isTeacherSession && <LiveTrendChart history={history} />}

            {stats?.video_clarity === 'low' && (
              <div style={{
                background: 'rgba(251,191,36,0.10)',
                border: '1px solid rgba(251,191,36,0.45)',
                borderRadius: '10px', padding: '0.7rem 0.95rem',
                color: '#fbbf24', fontSize: '0.85rem',
              }}>
                ⚠ {stats.quality_note || 'Video clarity is low — results may be unreliable.'}
              </div>
            )}

            {!isTeacherSession && stats && stats.students_detected === 0 && emptyStreak.current >= 8 && (
              <div style={{
                background: 'rgba(248,113,113,0.10)',
                border: '1px solid rgba(248,113,113,0.4)',
                borderRadius: '10px', padding: '0.7rem 0.95rem',
                color: '#f87171', fontSize: '0.85rem',
              }}>
                No students detected yet — check the camera is pointed at the class.
              </div>
            )}
            
            

            {errMsg && <div className="error-msg">{errMsg}</div>}

            <button onClick={stopLive} disabled={phase === 'stopping'}
              style={{
                background: phase === 'stopping' ? 'rgba(255,255,255,0.1)'
                          : 'linear-gradient(90deg,#dc2626,#ef4444)',
                color: '#fff', border: 'none', borderRadius: '10px',
                padding: '0.8rem', fontSize: '1rem', fontWeight: 700,
                cursor: phase === 'stopping' ? 'default' : 'pointer',
              }}>
              {phase === 'stopping' ? 'Stopping…' : '■  Stop & Save Analysis'}
            </button>
          </>
        )}

        {/* ── DONE — final summary ─────────────────────────────────────── */}
        {phase === 'done' && finalStructured && !isTeacherSession && finalStructured.analysable === false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'rgba(251,191,36,0.10)',
              border: '1px solid rgba(251,191,36,0.45)',
              borderRadius: '12px', padding: '1.3rem',
            }}>
              <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>
                ⚠ Analysis not reliable
              </div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {finalStructured.quality_issue}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '0.7rem' }}>
                No engagement percentage is shown because the live video did not give the
                model enough to measure. Nothing was saved to history — this keeps the
                records honest. Improve the camera position / lighting / focus and try again.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Students seen',   value: finalStructured.total_students ?? 0 },
                { label: 'Video clarity',   value: finalStructured.video_clarity ?? 'unknown' },
                { label: 'Frames analysed', value: finalStructured.frames_processed ?? 0 },
                { label: 'Duration',        value: `${finalStructured.elapsed_seconds ?? 0}s` },
              ].map((c, i) => (
                <div key={i} style={{
                  flex: 1, minWidth: 110,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '0.7rem', textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>{c.value}</div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)' }}>{c.label}</div>
                </div>
              ))}
            </div>
            <button onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff',
                       border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                       padding: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        )}

        {phase === 'done' && finalStructured && isTeacherSession && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.4)',
              borderRadius: '12px', padding: '1.2rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}>Mode of teaching</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#60a5fa', marginTop: '0.25rem' }}>
                {finalStructured.mode_label || '—'}
              </div>
            </div>
            <div style={{
              background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.4)',
              borderRadius: '12px', padding: '1.3rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '2.6rem', fontWeight: 800,
                            color: (finalStructured.enthu_pct >= 50 ? '#34d399' : '#f87171') }}>
                {Math.round(finalStructured.enthu_pct || 0)}%
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                {finalStructured.enthu_verdict || 'Enthusiasm'}
              </div>
            </div>
            {saveStatus === 'saved' && (
              <div style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.4)',
                            borderRadius: '8px', padding: '0.6rem 0.9rem', color: '#34d399', fontSize: '0.85rem', fontWeight: 600 }}>
                ✓ Saved to history.
              </div>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', color: '#fff',
                       border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                       padding: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        )}

        {phase === 'done' && finalStructured && !isTeacherSession && finalStructured.analysable !== false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'rgba(52,211,153,0.10)',
              border: '1px solid rgba(52,211,153,0.4)',
              borderRadius: '12px', padding: '1.3rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '2.6rem', fontWeight: 800,
                            color: (finalStructured.attentive_pct >= 75 ? '#34d399'
                                  : finalStructured.attentive_pct >= 50 ? '#fbbf24' : '#f87171') }}>
                {Math.round(finalStructured.attentive_pct)}%
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                Final engagement · {finalStructured.verdict}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {[
                /*{ label: 'Dominant emotion', value: finalStructured.dominant_emotion },*/
                { label: 'Students seen',    value: finalStructured.total_students },
                { label: 'Duration',         value: `${finalStructured.elapsed_seconds}s` },
                { label: 'Frames analysed',  value: finalStructured.frames_processed },
              ].map((c, i) => (
                <div key={i} style={{
                  flex: 1, minWidth: 110,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '0.7rem', textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>{c.value}</div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)' }}>{c.label}</div>
                </div>
              ))}
            </div>
            {saveStatus === 'saved' && (
              <div style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.4)',
                            borderRadius: '8px', padding: '0.6rem 0.9rem', color: '#34d399',
                            fontSize: '0.85rem', fontWeight: 600 }}>
                ✓ Saved to history — recommendation sent to HOD.
              </div>
            )}
            {saveStatus === 'failed' && (
              <div className="error-msg">Analysis finished but could not be saved to history.</div>
            )}
            <button onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff',
                       border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                       padding: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        )}

        {/* ── ERROR ────────────────────────────────────────────────────── */}
        {phase === 'error' && (
          <div style={{ padding: '1.5rem 1rem' }}>
            <div className="error-msg" style={{ whiteSpace: 'pre-wrap' }}>{errMsg}</div>
            <button onClick={onClose}
              style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.08)', color: '#fff',
                       border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                       padding: '0.6rem 1.2rem', fontWeight: 600, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   AnalysisModal — runs Flask + (NEW) auto-persists session to Node history
   ─────────────────────────────────────────────────────────────────────────
   New props:
     • sessionMeta  — extra fields to forward to /api/sessions when the run
                      finishes (subject info, section, runMode, etc.)
   All UI exactly preserved.
════════════════════════════════════════════════════════════════════════════ */
function AnalysisModal({ title, endpoint, body = {}, accentColor = '#a78bfa', onClose, sessionMeta }) {
  const [phase, setPhase]           = useState('loading')
  const [structured, setStructured] = useState(null)
  const [apiType, setApiType]       = useState('')
  const [meta, setMeta]             = useState({})
  const [saveStatus, setSaveStatus] = useState('idle')   // 'idle'|'saving'|'saved'|'failed'|'skipped'
  const [saveError,  setSaveError]  = useState('')

  // (Lab post-processing removed — lab analysis now shows the trained
  //  model's genuine output, the same as theory and tutorial.)

  // ── Helper: generate text-based distraction reasons (no emojis)
  //    when distracted_pct is meaningfully high.
  function buildDistractionReasons(s, category) {
    const distracted = s?.distracted_pct || (100 - (s?.attentive_pct || 0))
    if (distracted < 25) return []     // not high enough to report
    const reasons = []
    const dom = (s?.dominant_emotion || '').toLowerCase()
    if (dom === 'confused') {
      reasons.push('Students appear confused — concept may need to be re-explained at a slower pace.')
    }
    if (dom === 'neutral') {
      reasons.push('Several students show neutral expressions — the topic may not be engaging them.')
    }
    if (dom === 'disengaged') {
      reasons.push('A noticeable number of students are visibly disengaged — consider a brief interactive activity.')
    }
    if (category === 'Lab' && distracted >= 30) {
      reasons.push('Some students may be stuck on the lab task — walking around to check progress would help.')
    }
    if (category === 'Theory' && distracted >= 35) {
      reasons.push('Long uninterrupted lecture may be causing attention drift — a quick discussion or recap could re-engage the class.')
    }
    if (reasons.length === 0) {
      reasons.push(`${Math.round(distracted)}% of the class appears distracted — try a short pause or change of activity.`)
    }
    return reasons
  }

  // ── Helper: build an HOD-facing recommendation note from the result.
  function buildHodNote(s, sessMeta, dom, distracted, reasons) {
    const section = sessMeta?.section || 'this section'
    const subj = sessMeta?.subjectName || sessMeta?.subjectShort || 'this subject'
    if (distracted >= 35) {
      return `Class ${section} — ${subj}: distraction level was high (${Math.round(distracted)}%). ` +
             `Dominant student emotion: ${dom || 'mixed'}. ` +
             (reasons[0] ? reasons[0] : 'Consider following up with the teacher.')
    }
    if (s?.focused_pct >= 75 || s?.attentive_pct >= 80) {
      return `Class ${section} — ${subj}: strong engagement (focused ${s.focused_pct || s.attentive_pct}%). ` +
             `No intervention needed; teaching approach is working well.`
    }
    return `Class ${section} — ${subj}: moderate engagement. Routine review recommended.`
  }

  function severityFor(distracted) {
    if (distracted >= 45) return 'critical'
    if (distracted >= 25) return 'warning'
    return 'info'
  }

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    fetch(`${FLASK}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
      .then(async res => {
        if (cancelled) return
        let data = await res.json()

        // Lab results are now shown EXACTLY as the trained model reported
        // them (the previous random "normalisation" was removed so the
        // dashboard matches the annotated video and the model output).

        setStructured(data.structured || null)
        setApiType(data.type || '')
        setMeta({ video: data.video, teacher: data.teacher })
        setPhase(res.ok ? 'done' : 'error')

        // ── Persist to Node history if we have metadata ───────────────
        if (res.ok && sessionMeta && data.structured && !data.structured.error) {
          setSaveStatus('saving')
          try {
            const token = localStorage.getItem('token')

            // Distraction analysis
            const distracted = data.structured.distracted_pct
              || Math.max(0, 100 - (data.structured.attentive_pct || data.structured.focused_pct || 0))
            const distractionReasons = buildDistractionReasons(data.structured, sessionMeta.category)
            const dom = data.structured.dominant_emotion || data.structured.dominantEmotion || ''

            const payload = {
              ...sessionMeta,
              analysisType: data.type,
              structured:   {
                ...data.structured,
                distracted_pct: distracted,
                distraction_reasons: distractionReasons,    // text-only, no emojis
              },
              videoName:    data.video || '',
              verdict:
                data.structured.verdict
                || data.structured.enthu_verdict
                || (data.structured.enthu_pct >= 60 ? 'HIGHLY ENTHUSIASTIC' : '')
                || '',
            }
            const sessRes = await axios.post('/api/sessions', payload, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!cancelled) setSaveStatus('saved')

            // ── ALSO send a Recommendation row (for HOD + teacher's Recommendations panel) ──
            try {
              const advice =
                distracted >= 35
                  ? (distractionReasons[0] || 'Re-engage the class with an interactive activity.')
                  : (data.structured.focused_pct >= 75 || data.structured.attentive_pct >= 80)
                    ? 'Engagement is high — continue with the current teaching approach.'
                    : 'Engagement is moderate — consider a short recap or activity to sustain attention.'
              const hodNote = buildHodNote(data.structured, sessionMeta, dom, distracted, distractionReasons)
              await axios.post('/api/recommendations', {
                sessionId: sessRes.data?._id,
                section: sessionMeta.section,
                subjectShort: sessionMeta.subjectShort || '',
                subjectName: sessionMeta.subjectName || '',
                subjectCode: sessionMeta.subjectCode || '',
                category: sessionMeta.category,
                dominantEmotion: dom,
                advice,
                hodNote,
                severity: severityFor(distracted),
                distractedPct: distracted,
                distractionReasons,
                teacherFacultyCode: sessionMeta.teacherFacultyCode,
              }, { headers: { Authorization: `Bearer ${token}` } })
            } catch (e) {
              console.warn('Could not save recommendation:', e.message)
            }
          } catch (e) {
            if (!cancelled) {
              setSaveStatus('failed')
              setSaveError(e.response?.data?.message || e.message || 'Unknown error')
              console.warn('Could not persist session:', e)
            }
          }
        } else if (!sessionMeta) {
          setSaveStatus('skipped')
        } else if (data.structured && data.structured.error) {
          setSaveStatus('skipped')
        }
      })
      .catch(err => {
        if (cancelled || err.name === 'AbortError') return
        setStructured({ error: true, error_msg: `Could not reach Flask API at ${FLASK}\n\nMake sure it is running:\n  cd flask_api\n  python app.py\n\nError: ${err.message}` })
        setPhase('error')
      })
    return () => {
      cancelled = true
      // Closing the modal (X / delete) aborts the in-flight analysis
      // request so it stops instead of running on in the background.
      try { ac.abort() } catch (e) { /* ignore */ }
      // Best-effort: tell the server to stop any running analysis too.
      fetch(`${FLASK}/analysis/cancel`, { method: 'POST' }).catch(() => {})
    }
  }, [endpoint])   // eslint-disable-line

  const renderDistractionPanel = () => {
    // The "Why distraction may be high" panel has been removed entirely
    // from ALL categories (theory, tutorial, lab, teacher) per request —
    // it is never shown.
    return null
  }

  const renderResult = () => {
    if (!structured || structured.error) {
      return <ErrorCard message={structured?.error_msg} />
    }
    if (apiType === 'lab') {
      return <LabResultCard data={structured} videoName={meta.video} />
    }
    if (apiType === 'theory' || apiType === 'tutorial') {
      return <EmotionResultCard data={structured} accentColor={accentColor} categoryLabel={apiType === 'theory' ? 'Theory' : 'Tutorial'} videoName={meta.video} />
    }
    if (apiType === 'teacher') {
      return <TeacherResultCard data={structured} teacherName={meta.teacher} videoName={meta.video} />
    }
    return <ErrorCard message="Unknown analysis type returned by server." />
  }

  /* Small inline footer banner that confirms whether the result was saved
     to history.  Helps users find their past analyses immediately. */
  const renderSaveBanner = () => {
    if (saveStatus === 'idle') return null
    const map = {
      saving: { text: '💾 Saving to history…', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.4)',  color: '#60a5fa' },
      saved:  { text: '✅ Saved to history. Open “🕘 History” to revisit this analysis any time.', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.4)', color: '#34d399' },
      failed: { text: `⚠️ Could not save to history: ${saveError}`, bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.4)', color: '#f87171' },
      skipped:{ text: '⚠️ This analysis was NOT saved — the result was empty or incomplete, so there was nothing to store. Check the Flask terminal for details.', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.4)', color: '#fbbf24' },
    }
    const s = map[saveStatus]
    if (!s) return null
    return (
      <div style={{
        background: s.bg, border: `1px solid ${s.border}`, color: s.color,
        borderRadius: '8px', padding: '0.6rem 0.9rem', fontSize: '0.85rem', fontWeight: 500,
      }}>{s.text}</div>
    )
  }

  // Closing mid-analysis: tell the user it stopped, fire the cancel, then
  // close. The effect cleanup also aborts the request + calls /analysis/cancel.
  const stopAndClose = () => {
    if (phase === 'loading') {
      setPhase('stopped')
      try { fetch(`${FLASK}/analysis/cancel`, { method: 'POST' }).catch(() => {}) } catch (e) {}
      setTimeout(() => onClose(), 650)
      return
    }
    onClose()
  }

  return (
    <Modal title={title} onClose={stopAndClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {phase === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem 1rem' }}>
            <Spinner color={accentColor} />
            <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
              {body && body.source === 'camera' ? 'Capturing from camera & analysing…' : 'Analysing video…'}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', margin: 0, textAlign: 'center' }}>
              {body && body.source === 'camera'
                ? <>Recording a short clip from your live camera, then running the AI pipeline.<br />Please keep the camera steady — this may take a few minutes.</>
                : <>Running the AI pipeline — this may take a few minutes.<br />The result will be saved to history once the analysis completes.</>}
            </p>
          </div>
        )}
        {phase === 'stopped' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '2rem' }}>🛑</div>
            <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fbbf24', margin: 0 }}>
              Analysis stopped
            </p>
            <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
              The analysis was cancelled and did not complete.
            </p>
          </div>
        )}
        {phase !== 'loading' && phase !== 'stopped' && renderResult()}
        {phase !== 'loading' && phase !== 'stopped' && renderDistractionPanel()}
        {phase !== 'loading' && phase !== 'stopped' && renderSaveBanner()}
      </div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   Teacher Selection Modal (HOD)
   NEW: now pulls only REGISTERED teachers from Node, whose facultyCode
   appears in the timetable. No random / unregistered names.
════════════════════════════════════════════════════════════════════════════ */
function TeacherSelectModal({ onSelect, onClose }) {
  const [teachers, setTeachers] = useState([])
  const [stats,    setStats]    = useState({})   // facultyCode → { overallScore, performance, sessions, … }
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)   // {facultyCode, name, …}
  const [error,    setError]    = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    // Pull registered teachers AND the teacher-wise aggregate in parallel.
    // The aggregate is best-effort — if it fails, the list still renders.
    Promise.all([
      axios.get('/api/timetable/registered-teachers', { headers }),
      axios.get('/api/sessions/aggregate/teacher',     { headers }).catch(() => ({ data: [] })),
    ]).then(([rTeachers, rStats]) => {
      setTeachers(rTeachers.data.teachers || [])
      const byCode = {}
      for (const row of (rStats.data || [])) {
        if (row && row.facultyCode) byCode[row.facultyCode] = row
      }
      setStats(byCode)
      setLoading(false)
    }).catch(err => {
      setError(err.response?.data?.message || 'Could not load registered teachers')
      setLoading(false)
    })
  }, [])

  return (
    <Modal title="Teacher Analysis — Select Teacher" onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: 0 }}>
          Each registered teacher is shown with their overall performance across every class they teach.
          Pick one to run a new analysis.
        </p>

        {error && <div className="error-msg">{error}</div>}

        {/* Visual summary of teacher-wise performance */}
        {!loading && !error && (() => {
          const rated = teachers
            .map(t => ({ t, st: stats[t.facultyCode] }))
            .filter(x => x.st && x.st.overallScore != null)
          if (rated.length === 0) return null
          const totalSessions = rated.reduce((s, x) => s + (x.st.sessions || 0), 0)
          const avgScore = rated.reduce((s, x) => s + x.st.overallScore, 0) / rated.length
          // Build a rows array shaped for PerformanceSplitBar
          const perfRows = rated.map(x => ({ performance: x.st.performance }))
          return (
            <div>
              <StatChipRow chips={[
                { label: 'Teachers Rated',  value: rated.length, color: '#a78bfa' },
                { label: 'Total Sessions',  value: totalSessions, color: '#60a5fa' },
                { label: 'Avg Score',       value: `${avgScore.toFixed(1)}%`, color: '#34d399' },
              ]} />
              <PerformanceSplitBar rows={perfRows} />
              <AnalysisBarChart
                title="Overall performance by teacher"
                rows={rated
                  .slice()
                  .sort((a, b) => b.st.overallScore - a.st.overallScore)
                  .map(x => ({
                    label: x.t.name,
                    sublabel: `${x.t.facultyCode} · ${x.st.sessions} session${x.st.sessions === 1 ? '' : 's'}`,
                    value: x.st.overallScore || 0,
                    color: bandColor(x.st.performance),
                  }))}
              />
            </div>
          )
        })()}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
            <Spinner color="#34d399" />
          </div>
        ) : teachers.length === 0 ? (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: '10px',
            padding: '1.2rem',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '0.88rem',
            textAlign: 'center',
          }}>
            No registered teachers found yet.<br />
            Teachers must first register with a valid faculty code from the department timetable.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '50vh', overflowY: 'auto' }}>
            {teachers.map(t => {
              const isSelected = selected && selected.facultyCode === t.facultyCode
              const st = stats[t.facultyCode]
              return (
                <button
                  key={t.facultyCode}
                  onClick={() => setSelected(t)}
                  style={{
                    background: isSelected ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.05)',
                    border: isSelected ? '1px solid rgba(52,211,153,0.55)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    color: isSelected ? '#34d399' : 'rgba(255,255,255,0.85)',
                    textAlign: 'left',
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontWeight: isSelected ? 600 : 400,
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    rowGap: '0.35rem',
                    columnGap: '0.8rem',
                    alignItems: 'center',
                  }}
                >
                  {/* Left column: name + faculty code (NO section / class) */}
                  <span>
                    {isSelected ? '✓  ' : '   '}{t.name}
                    <span style={{ marginLeft: '0.6rem', fontSize: '0.72rem', opacity: 0.55, fontWeight: 600 }}>
                      ({t.facultyCode})
                    </span>
                  </span>
                  {/* Right column: overall performance summary */}
                  <span style={{ textAlign: 'right', display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {st && st.overallScore !== null && st.overallScore !== undefined ? (
                      <>
                        <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>
                          {st.sessions} session{st.sessions === 1 ? '' : 's'} · {st.overallScore}%
                        </span>
                        <PerformancePill label={st.performance} />
                      </>
                    ) : (
                      <span style={{ fontSize: '0.72rem', opacity: 0.45 }}>No data yet</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          style={{
            background: selected ? 'linear-gradient(90deg,#059669,#34d399)' : 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            color: selected ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: selected ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          {selected ? `Analyse ${selected.name}` : 'Select a teacher first'}
        </button>
      </div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   History Modal (Teacher's own past sessions)
════════════════════════════════════════════════════════════════════════════ */
function HistoryModal({ onClose, onPick }) {
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    axios.get('/api/sessions/my', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { setRows(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <Modal title="📚 Previous Class Analyses" onClose={onClose} wide>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
      ) : rows.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: '10px',
          padding: '1.4rem',
          color: 'rgba(255,255,255,0.6)',
          fontSize: '0.9rem',
          textAlign: 'center',
        }}>
          No past analyses yet — run "Analyse" on a subject or use Real-time to build history.
        </div>
      ) : (
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th><th>Section</th><th>Subject</th>
                <th>Category</th><th>Verdict</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const d = new Date(r.createdAt)
                const c = CAT_COLOR[r.category] || CAT_COLOR.Theory
                return (
                  <tr key={r._id}>
                    <td style={{ fontSize: '0.78rem' }}>
                      {d.toLocaleDateString()}<br/>
                      <span style={{ color: 'rgba(255,255,255,0.45)' }}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td><span className="sub-code-chip">{r.section}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.subjectShort || r.subjectCode}</div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{r.subjectName}</div>
                    </td>
                    <td>
                      <span className="cat-badge" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
                        {r.runMode === 'realtime' ? `Real-time ${r.category}` : r.category}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: c.fg }}>{r.verdict || '—'}</td>
                    <td>
                      <button
                        className="btn-view-report"
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                        onClick={() => onPick(r)}
                      >View</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   Historic Session Viewer — re-renders a stored session w/out re-running ML
════════════════════════════════════════════════════════════════════════════ */
function HistoricSessionModal({ row, onClose }) {
  const c = CAT_COLOR[row.category] || CAT_COLOR.Theory
  const accentColor = c.accent
  const data = row.structured || {}

  let body
  if (row.analysisType === 'lab') {
    body = <LabResultCard data={data} videoName={row.videoName} />
  } else if (row.analysisType === 'theory' || row.analysisType === 'tutorial') {
    body = <EmotionResultCard data={data} accentColor={accentColor}
                              categoryLabel={row.analysisType === 'theory' ? 'Theory' : 'Tutorial'}
                              videoName={row.videoName} />
  } else if (row.analysisType === 'teacher') {
    body = <TeacherResultCard data={data} teacherName={row.teacherName} videoName={row.videoName} />
  } else {
    body = <ErrorCard message="This stored session has an unknown type." />
  }

  return (
    <Modal title={`${row.subjectName || row.subjectShort || 'Session'} — ${row.section} · ${new Date(row.createdAt).toLocaleString()}`}
           onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{body}</div>
    </Modal>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   SIDEBAR  —  shared between Teacher, HOD (as-teacher / as-hod) and Admin views.
   Pure presentational: takes a list of items with {key, label, icon, badge?,
   children?} and an `active` key plus an onSelect handler.
════════════════════════════════════════════════════════════════════════════ */

// Solid background style for the right-hand main pane in any sidebar layout
// (so the campus background image doesn't bleed through and make the content
// unreadable / unclickable).
const SIDEBAR_LAYOUT_STYLE = { display: 'flex', flex: 1, minHeight: 'calc(100vh - 70px)' }
const SIDEBAR_MAIN_PANE_STYLE = {
  flex: 1,
  padding: '1.5rem 2rem',
  overflowY: 'auto',
  background: 'rgba(15, 23, 42, 0.92)',
  backdropFilter: 'blur(8px)',
  position: 'relative',
  zIndex: 1,
}

// Centred placeholder shown in the main pane until the user picks
// something from the sidebar.
function SidebarPlaceholder({ icon = '👈', title = 'Pick an option', subtitle = 'Choose an item from the menu on the left to get started.' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 'calc(100vh - 200px)', textAlign: 'center', padding: '2rem',
      color: 'rgba(255,255,255,0.55)',
    }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: '0.5rem' }}>
        {title}
      </div>
      <div style={{ fontSize: '0.95rem', maxWidth: '420px', lineHeight: 1.5 }}>
        {subtitle}
      </div>
    </div>
  )
}

function Sidebar({ title, items, activeKey, onSelect }) {
  return (
    <aside style={{
      width: 250, minWidth: 220, flexShrink: 0,
      background: 'rgba(15, 23, 42, 0.92)',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(12px)',
      padding: '1rem 0.75rem',
      display: 'flex', flexDirection: 'column', gap: '0.4rem',
      maxHeight: 'calc(100vh - 70px)',
      overflowY: 'auto',
      position: 'relative',
      zIndex: 2,
    }}>
      {title && (
        <div style={{
          color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem',
          fontWeight: 700, letterSpacing: '0.08em',
          padding: '0.4rem 0.8rem', textTransform: 'uppercase',
        }}>
          {title}
        </div>
      )}
      {items.map(it => {
        if (it.kind === 'separator') {
          return <div key={it.key} style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0.45rem 0.5rem' }} />
        }
        const isActive = it.key === activeKey
        return (
          <button
            key={it.key}
            onClick={() => onSelect(it.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.6rem 0.85rem',
              background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent',
              border: isActive ? '1px solid rgba(99,102,241,0.45)' : '1px solid transparent',
              borderRadius: '8px',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.78)',
              fontSize: '0.92rem', fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontSize: '1.05rem' }}>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.badge != null && it.badge > 0 && (
              <span style={{
                background: 'rgba(248,113,113,0.25)', color: '#f87171',
                fontSize: '0.7rem', fontWeight: 700,
                padding: '0.1rem 0.45rem', borderRadius: '10px',
                border: '1px solid rgba(248,113,113,0.4)',
              }}>{it.badge}</span>
            )}
          </button>
        )
      })}
    </aside>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   RECOMMENDATIONS  —  for teachers: see their own; for HOD: see all.
   Pure list view rendered in the right pane.
════════════════════════════════════════════════════════════════════════════ */
function RecommendationsPanel({ scope = 'my', highlightUnread = false }) {
  // scope: 'my' (teacher view) | 'all' (HOD view)
  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  const [rows, setRows]   = useState(null)
  const [error, setError] = useState('')

  const fetchRows = () => {
    const url = scope === 'all' ? '/api/recommendations' : '/api/recommendations/my'
    axios.get(url, { headers })
      .then(r => setRows(r.data))
      .catch(e => setError(e.response?.data?.message || 'Could not load recommendations'))
  }
  useEffect(() => { fetchRows() }, [scope])

  const ack = async (id) => {
    try {
      await axios.patch(`/api/recommendations/${id}/ack`, {}, { headers })
      setRows(rows.map(r => r._id === id ? { ...r, acknowledged: true } : r))
    } catch (e) { console.warn('ack failed', e.message) }
  }

  const severityStyle = (sev) => {
    if (sev === 'critical') return { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.5)', fg: '#f87171', label: 'CRITICAL' }
    if (sev === 'warning')  return { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.5)',  fg: '#fbbf24', label: 'NEEDS ATTENTION' }
    return                     { bg: 'rgba(96,165,250,0.10)',     border: 'rgba(96,165,250,0.5)',  fg: '#60a5fa', label: 'INFO' }
  }

  return (
    <div className="dashboard-content" style={{ width: '100%' }}>
      <div className="welcome-section">
        <h2>📋 Recommendations</h2>
        <p>
          {scope === 'my'
            ? 'These are the recommendations generated from your class analyses. They are also visible to your HOD.'
            : 'Recommendations generated across all sessions in the department. Acknowledge each one once reviewed.'}
        </p>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {rows === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
      ) : rows.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: '10px', padding: '1.6rem', textAlign: 'center',
          color: 'rgba(255,255,255,0.55)',
        }}>
          No recommendations yet. Once a class is analysed, the system will generate one here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {rows.map(r => {
            const s = severityStyle(r.severity)
            return (
              <div key={r._id} style={{
                background: s.bg, border: `1px solid ${s.border}`,
                borderRadius: '12px', padding: '1rem 1.1rem',
                opacity: r.acknowledged ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
                      <span style={{
                        background: s.fg + '22', color: s.fg,
                        fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.05em',
                        padding: '0.18rem 0.55rem', borderRadius: '6px',
                        border: `1px solid ${s.border}`,
                      }}>{s.label}</span>
                      <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                      {r.acknowledged && (
                        <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 600 }}>✓ ACKNOWLEDGED</span>
                      )}
                    </div>
                    <div style={{ color: '#fff', fontWeight: 600, marginBottom: '0.3rem' }}>
                      {r.teacherName} ({r.facultyCode}) · {r.section} · {r.subjectName || r.subjectShort}
                      {r.category ? ` (${r.category})` : ''}
                    </div>
                    {scope === 'my' && (
                      <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.92rem', lineHeight: 1.5, marginBottom: '0.45rem' }}>
                        <strong style={{ color: s.fg }}>Advice: </strong>{r.advice}
                      </div>
                    )}
                    <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.88rem', lineHeight: 1.5 }}>
                      <strong style={{ color: s.fg }}>{scope === 'all' ? 'For HOD: ' : 'Sent to HOD: '}</strong>{r.hodNote}
                    </div>
                    {r.distractionReasons && r.distractionReasons.length > 0 && (
                      <ul style={{ margin: '0.45rem 0 0 1.1rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.83rem' }}>
                        {r.distractionReasons.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    )}
                  </div>
                  {scope === 'all' && !r.acknowledged && (
                    <button
                      onClick={() => ack(r._id)}
                      style={{
                        background: 'rgba(52,211,153,0.18)', color: '#34d399',
                        border: '1px solid rgba(52,211,153,0.45)',
                        borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >Acknowledge</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   HOD LANDING SCREEN  —  two cards, "View as Teacher" / "View as HOD".
   Shown once at HOD login so they can pick which side they want to use.
════════════════════════════════════════════════════════════════════════════ */
function HodLandingScreen({ name, onPick }) {
  return (
    <div className="dashboard-content" style={{ width: '100%', background: 'rgba(15, 23, 42, 0.55)', minHeight: 'calc(100vh - 70px)', padding: '2rem' }}>
      <div className="welcome-section">
        <h2>Welcome back, {name} 👋</h2>
        <p>You're logged in as HOD. Choose how you'd like to continue.</p>
      </div>
      <div className="cards-grid">
        <div
          className="glass dash-card purple"
          onClick={() => onPick('teacher')}
          style={{ cursor: 'pointer' }}
        >
          <div className="card-icon">👩‍🏫</div>
          <h3>View as Teacher</h3>
          <p>Manage and analyse the classes you personally handle, just like any other faculty member.</p>
          <span className="card-arrow">→</span>
        </div>
        <div
          className="glass dash-card blue"
          onClick={() => onPick('hod')}
          style={{ cursor: 'pointer' }}
        >
          <div className="card-icon">🏢</div>
          <h3>View as HOD</h3>
          <p>Department-wide analytics: class-wise, subject-wise, and teacher-wise performance.</p>
          <span className="card-arrow">→</span>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   ADMIN DASHBOARD  —  add classes, edit timetable, manage teacher & HOD records.
   Sidebar-navigated with three views.
════════════════════════════════════════════════════════════════════════════ */
function AdminDashboard({ name }) {
  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  const [activeView, setActiveView] = useState(null)   // null = show placeholder

  return (
    <div style={SIDEBAR_LAYOUT_STYLE}>
      <Sidebar
        title="Admin Menu"
        activeKey={activeView}
        onSelect={setActiveView}
        items={[
          { key: 'timetable', icon: '🗓️',  label: 'Manage Timetable' },
          { key: 'teachers',  icon: '👩‍🏫', label: 'Teacher Records' },
          { key: 'hods',      icon: '🏢',   label: 'HOD Records'      },
        ]}
      />
      <div style={SIDEBAR_MAIN_PANE_STYLE}>
        {activeView === null && (
          <SidebarPlaceholder
            icon="🛠️"
            title={`Welcome, ${name}`}
            subtitle="Pick an item from the Admin Menu on the left to manage the timetable or edit faculty records."
          />
        )}
        {activeView === 'timetable' && <AdminTimetableView />}
        {activeView === 'teachers'  && <AdminUsersView role="teacher" />}
        {activeView === 'hods'      && <AdminUsersView role="hod" />}
      </div>
    </div>
  )
}

function AdminTimetableView() {
  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  const [classes, setClasses]   = useState([])
  const [entries, setEntries]   = useState([])
  const [meta, setMeta]         = useState({ days: [], slots: [], subjects: [] })
  const [activeSection, setActiveSection] = useState('')
  const [adding, setAdding]     = useState(false)
  const [newClass, setNewClass] = useState('')
  const [newRoom,  setNewRoom]  = useState('')
  const [classErr, setClassErr] = useState('')
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [entryForm, setEntryForm] = useState({
    day: 'MONDAY', slotIdx: 0,
    subjectShort: '', subjectCode: '', subjectName: '',
    category: 'Theory', facultyCodes: '',
  })
  const [entryErr, setEntryErr] = useState('')

  const loadClasses = () => axios.get('/api/admin/classes', { headers }).then(r => setClasses(r.data))
  const loadMeta = () => axios.get('/api/admin/timetable-meta', { headers }).then(r => setMeta(r.data))
  const loadEntries = (section) => {
    if (!section) return setEntries([])
    axios.get(`/api/admin/timetable-entries?section=${section}`, { headers })
      .then(r => setEntries(r.data))
  }
  useEffect(() => { loadClasses(); loadMeta() }, [])
  useEffect(() => { loadEntries(activeSection) }, [activeSection])

  const addClass = async () => {
    if (!newClass.trim()) { setClassErr('Section is required (e.g. 6E, 7A)'); return }
    setClassErr('')
    try {
      await axios.post('/api/admin/classes',
        { section: newClass.trim(), room: newRoom.trim() },
        { headers })
      setNewClass(''); setNewRoom(''); setAdding(false); loadClasses()
    } catch (e) {
      setClassErr(e.response?.data?.message || 'Could not add class')
    }
  }

  const deleteClass = async (section) => {
    if (!confirm(`Delete section ${section}? This will also remove all its timetable entries.`)) return
    try {
      await axios.delete(`/api/admin/classes/${section}`, { headers })
      loadClasses()
      if (activeSection === section) setActiveSection('')
    } catch (e) {
      alert(e.response?.data?.message || 'Could not delete')
    }
  }

  const submitEntry = async () => {
    setEntryErr('')
    if (!entryForm.subjectShort) { setEntryErr('Subject short name is required'); return }
    if (!entryForm.facultyCodes) { setEntryErr('At least one faculty code is required'); return }
    try {
      await axios.post('/api/admin/timetable-entries', {
        section: activeSection,
        day:     entryForm.day,
        slotIdx: Number(entryForm.slotIdx),
        subjectShort: entryForm.subjectShort,
        subjectCode:  entryForm.subjectCode,
        subjectName:  entryForm.subjectName,
        category:     entryForm.category,
        facultyCodes: entryForm.facultyCodes.split(',').map(s => s.trim()).filter(Boolean),
      }, { headers })
      setShowAddEntry(false)
      setEntryForm({ day: 'MONDAY', slotIdx: 0, subjectShort: '', subjectCode: '', subjectName: '', category: 'Theory', facultyCodes: '' })
      loadEntries(activeSection)
    } catch (e) {
      setEntryErr(e.response?.data?.message || 'Could not save entry')
    }
  }

  const deleteEntry = async (id) => {
    try {
      await axios.delete(`/api/admin/timetable-entries/${id}`, { headers })
      loadEntries(activeSection)
    } catch {}
  }

  return (
    <div>
      <div className="welcome-section">
        <h2>🗓️ Manage Timetable</h2>
        <p>Add new classes and assign subjects + faculty codes to specific time slots.</p>
      </div>

      {/* Class management */}
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '1.2rem 1.4rem', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <h3 style={{ color: '#fff', margin: 0 }}>Sections</h3>
          {!adding && (
            <button className="btn-add-sub" onClick={() => setAdding(true)}>+ Add New Class</button>
          )}
        </div>
        {adding && (
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            <input
              placeholder="Section (e.g. 6E)"
              value={newClass}
              onChange={e => setNewClass(e.target.value)}
              style={{ padding: '0.5rem 0.8rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            />
            <input
              placeholder="Room (e.g. LHC-220)"
              value={newRoom}
              onChange={e => setNewRoom(e.target.value)}
              style={{ padding: '0.5rem 0.8rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            />
            <button className="btn-add-sub" onClick={addClass}>Save</button>
            <button className="btn-add-sub" style={{ background: 'rgba(255,255,255,0.06)' }} onClick={() => { setAdding(false); setClassErr(''); setNewClass(''); setNewRoom('') }}>Cancel</button>
            {classErr && <div style={{ color: '#f87171', fontSize: '0.8rem', width: '100%' }}>{classErr}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {classes.map(c => (
            <div key={c.section}
                 onClick={() => setActiveSection(c.section)}
                 style={{
                   padding: '0.55rem 0.95rem',
                   borderRadius: '8px',
                   border: activeSection === c.section ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.15)',
                   background: activeSection === c.section ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
                   color: '#fff', fontSize: '0.85rem',
                   cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                 }}>
              <span style={{ fontWeight: 700 }}>{c.section}</span>
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>{c.room || '—'}</span>
              {c.seeded && <span style={{ fontSize: '0.62rem', color: '#34d399' }}>(seed)</span>}
              {!c.seeded && (
                <span onClick={e => { e.stopPropagation(); deleteClass(c.section) }}
                      style={{ color: '#f87171', cursor: 'pointer', fontSize: '0.75rem', marginLeft: '0.3rem' }}>✕</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Per-section timetable entries */}
      {activeSection && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '1.2rem 1.4rem', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
            <h3 style={{ color: '#fff', margin: 0 }}>Timetable entries · {activeSection}</h3>
            {!showAddEntry && (
              <button className="btn-add-sub" onClick={() => setShowAddEntry(true)}>+ Add Slot</button>
            )}
          </div>
          {showAddEntry && (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.6rem' }}>
                <select value={entryForm.day} onChange={e => setEntryForm({...entryForm, day: e.target.value})}
                        style={{ padding: '0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
                  {meta.days.map(d => <option key={d} value={d} style={{ color: '#333' }}>{d}</option>)}
                </select>
                <select value={entryForm.slotIdx} onChange={e => setEntryForm({...entryForm, slotIdx: e.target.value})}
                        style={{ padding: '0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
                  {meta.slots.map((s, i) => <option key={i} value={i} style={{ color: '#333' }}>Slot {i+1} · {typeof s === 'string' ? s : (s?.label || `${s?.start}-${s?.end}`)}</option>)}
                </select>
                <input placeholder="Subject short (e.g. DL)" value={entryForm.subjectShort}
                       onChange={e => setEntryForm({...entryForm, subjectShort: e.target.value})}
                       style={{ padding: '0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }} />
                <input placeholder="Subject code (e.g. CSE631)" value={entryForm.subjectCode}
                       onChange={e => setEntryForm({...entryForm, subjectCode: e.target.value})}
                       style={{ padding: '0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }} />
                <input placeholder="Full subject name" value={entryForm.subjectName}
                       onChange={e => setEntryForm({...entryForm, subjectName: e.target.value})}
                       style={{ padding: '0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }} />
                <select value={entryForm.category} onChange={e => setEntryForm({...entryForm, category: e.target.value})}
                        style={{ padding: '0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
                  {['Theory', 'Tutorial', 'Lab'].map(c => <option key={c} value={c} style={{ color: '#333' }}>{c}</option>)}
                </select>
                <input placeholder="Faculty codes (comma-sep, e.g. SM,US)" value={entryForm.facultyCodes}
                       onChange={e => setEntryForm({...entryForm, facultyCodes: e.target.value})}
                       style={{ gridColumn: 'span 2', padding: '0.45rem', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-add-sub" onClick={submitEntry}>Save</button>
                <button className="btn-add-sub" style={{ background: 'rgba(255,255,255,0.06)' }} onClick={() => { setShowAddEntry(false); setEntryErr('') }}>Cancel</button>
              </div>
              {entryErr && <div style={{ color: '#f87171', marginTop: '0.5rem', fontSize: '0.82rem' }}>{entryErr}</div>}
            </div>
          )}
          {entries.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', padding: '1rem 0' }}>
              No admin-added entries for {activeSection} yet. (The seeded timetable for the original sections still applies.)
            </div>
          ) : (
            <table className="data-table">
              <thead><tr>
                <th>Day</th><th>Slot</th><th>Subject</th><th>Category</th><th>Faculty</th><th></th>
              </tr></thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e._id}>
                    <td>{e.day}</td>
                    <td>{e.slotIdx + 1} · {(() => { const s = meta.slots[e.slotIdx]; return typeof s === 'string' ? s : (s?.label || `${s?.start}-${s?.end}`) })()}</td>
                    <td><span className="sub-code-chip">{e.subjectShort}</span> {e.subjectName}</td>
                    <td>{e.category}</td>
                    <td style={{ fontSize: '0.78rem' }}>{e.facultyCodes.join(', ')}</td>
                    <td>
                      <button className="btn-view-report"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: 'rgba(248,113,113,0.18)', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)' }}
                              onClick={() => deleteEntry(e._id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function AdminUsersView({ role }) {
  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const load = () => {
    setLoading(true)
    axios.get(`/api/admin/users?role=${role}`, { headers })
      .then(r => setUsers(r.data))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [role])

  const delUser = async (id, name) => {
    if (!confirm(`Delete ${role.toUpperCase()} "${name}"? This cannot be undone.`)) return
    try {
      await axios.delete(`/api/admin/users/${id}`, { headers })
      load()
    } catch (e) {
      alert(e.response?.data?.message || 'Could not delete')
    }
  }

  const startEdit = (u) => {
    setEditingId(u._id)
    setEditForm({ name: u.name, email: u.email, department: u.department, facultyCode: u.facultyCode || '' })
  }
  const saveEdit = async () => {
    try {
      await axios.put(`/api/admin/users/${editingId}`, editForm, { headers })
      setEditingId(null); load()
    } catch (e) {
      alert(e.response?.data?.message || 'Could not save')
    }
  }

  return (
    <div>
      <div className="welcome-section">
        <h2>{role === 'hod' ? '🏢 HOD Records' : '👩‍🏫 Teacher Records'}</h2>
        <p>Edit or remove {role === 'hod' ? 'HOD' : 'teacher'} accounts. Useful when faculty changes or leaves the department.</p>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
      ) : users.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.55)', padding: '1rem' }}>No {role}s registered yet.</div>
      ) : (
        <table className="data-table">
          <thead><tr>
            <th>Name</th><th>Email</th><th>Department</th><th>Faculty Code</th><th>Subjects</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {users.map(u => editingId === u._id ? (
              <tr key={u._id}>
                <td><input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '0.3rem', borderRadius: '4px' }} /></td>
                <td><input value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '0.3rem', borderRadius: '4px' }} /></td>
                <td><input value={editForm.department} onChange={e => setEditForm({...editForm, department: e.target.value})} style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '0.3rem', borderRadius: '4px' }} /></td>
                <td><input value={editForm.facultyCode} onChange={e => setEditForm({...editForm, facultyCode: e.target.value})} style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '0.3rem', borderRadius: '4px', width: 80 }} /></td>
                <td style={{ fontSize: '0.78rem' }}>{u.subjects?.length || 0}</td>
                <td>
                  <button className="btn-view-report" style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', marginRight: 4 }} onClick={saveEdit}>Save</button>
                  <button className="btn-view-report" style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)' }} onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={u._id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>{u.email}</td>
                <td>{u.department}</td>
                <td><span className="sub-code-chip">{u.facultyCode || '—'}</span></td>
                <td style={{ fontSize: '0.78rem' }}>{u.subjects?.length || 0}</td>
                <td>
                  <button className="btn-view-report" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', marginRight: 4 }} onClick={() => startEdit(u)}>Edit</button>
                  <button className="btn-view-report" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: 'rgba(248,113,113,0.18)', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)' }} onClick={() => delUser(u._id, u.name)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   TEACHER DASHBOARD  (UI preserved, data sources now driven by timetable)
════════════════════════════════════════════════════════════════════════════ */
function TeacherDashboard({ name, activeView = 'subjects', onMenuAction }) {
  const token   = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  const [subjects,    setSubjects]    = useState([])
  const [fetching,    setFetching]    = useState(true)
  const [adding,      setAdding]      = useState(false)
  const [allowed,     setAllowed]     = useState([])   // NEW: timetable whitelist
  const [allowedCode, setAllowedCode] = useState('')
  const [allowedLoaded, setAllowedLoaded] = useState(false)
  const [newRow,      setNewRow]      = useState({ code: '', section: '' })
  const [rowErr,      setRowErr]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [activeModal, setActiveModal] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historicRow, setHistoricRow] = useState(null)
  const [realtime,    setRealtime]    = useState(null)  // 'loading' | {slot} | 'none' | 'error'
  const [realtimeMsg, setRealtimeMsg] = useState('')

  useEffect(() => {
    axios.get('/api/subjects', { headers })
      .then(r => setSubjects(r.data))
      .catch(err => console.error(err))
      .finally(() => setFetching(false))

    // Pull timetable whitelist so the Add-Subject row can be a dropdown
    axios.get('/api/subjects/allowed', { headers })
      .then(r => {
        setAllowed(r.data.allowed || [])
        setAllowedCode(r.data.facultyCode || '')
      })
      .catch(() => {})
      .finally(() => setAllowedLoaded(true))
  }, [])

  const startAdd  = () => {
    // Don't warn until the timetable whitelist has actually finished
    // loading — otherwise the warning flashes on an empty (not-yet-loaded)
    // list even when the teacher does have timetable entries.
    setRowErr('')
    setNewRow({ code: '', section: '' })
    setAdding(true)
  }
  const cancelAdd = () => { setAdding(false); setRowErr('') }

  // ── Re-check the timetable ────────────────────────────────────────────
  // If the Admin adds a new class / slot for this teacher AFTER the page
  // was opened, this re-fetches the timetable whitelist so the newly
  // added subjects become available without a full page reload.
  const [recheckMsg, setRecheckMsg] = useState('')
  const recheckTimetable = async () => {
    setRecheckMsg('Checking timetable…')
    try {
      const r = await axios.get('/api/subjects/allowed', { headers })
      const list = r.data.allowed || []
      setAllowed(list)
      setAllowedCode(r.data.facultyCode || '')
      setAllowedLoaded(true)
      setRecheckMsg(list.length
        ? `Timetable synced — ${list.length} subject${list.length === 1 ? '' : 's'} available.`
        : 'Timetable synced — still no entries for your faculty code.')
      setTimeout(() => setRecheckMsg(''), 4000)
    } catch {
      setRecheckMsg('Could not reach the server. Try again.')
      setTimeout(() => setRecheckMsg(''), 4000)
    }
  }

  // Re-evaluate the "no timetable" warning whenever the whitelist loads or
  // the add-row opens. Only show it once loading is genuinely complete.
  useEffect(() => {
    if (!adding) return
    if (allowedLoaded && allowed.length === 0) {
      setRowErr('No timetable entries found for your faculty code. Contact your Admin/HOD.')
    } else {
      setRowErr('')
    }
  }, [adding, allowedLoaded, allowed])

  // When user picks a subject in the dropdown, auto-restrict section options to
  // sections the timetable says they teach this subject in.
  const selectedSubject = useMemo(
    () => allowed.find(a => a.code === newRow.code) || null,
    [allowed, newRow.code]
  )
  const availableSections = selectedSubject ? selectedSubject.sections : []

  // Sections-already-added (so the dropdown can hide duplicates)
  const alreadyAdded = useMemo(() => {
    const set = new Set()
    subjects.forEach(s => set.add(`${s.code}::${s.section}`))
    return set
  }, [subjects])

  const saveRow = async () => {
    if (!newRow.code || !newRow.section) {
      setRowErr('Pick a subject and a section.'); return
    }
    if (alreadyAdded.has(`${newRow.code}::${newRow.section}`)) {
      setRowErr('You have already added this subject for this section.'); return
    }
    setSaving(true); setRowErr('')
    try {
      const subj = allowed.find(a => a.code === newRow.code)
      const res = await axios.post('/api/subjects',
        {
          code: subj.code,
          name: subj.fullName,
          category: subj.category,
          section: newRow.section,
        },
        { headers })
      setSubjects(p => [...p, res.data])
      // Keep the add row OPEN so the teacher can immediately add another
      // subject in the same session. Just clear the inputs for the next
      // entry (the subject dropdown stays available).
      setNewRow({ code: '', section: '' })
      setRowErr('')
    } catch (err) { setRowErr(err.response?.data?.message || 'Save failed.') }
    finally { setSaving(false) }
  }

  const deleteSub = async id => {
    try { await axios.delete(`/api/subjects/${id}`, { headers }); setSubjects(p => p.filter(s => s._id !== id)) }
    catch { alert('Delete failed.') }
  }

  // ── Realtime: check what's on right now, then launch the matching analysis
  const runRealtime = async () => {
    setRealtime('loading'); setRealtimeMsg('')
    try {
      const r = await axios.get('/api/timetable/current', { headers })
      if (!r.data.slot) {
        // No class scheduled for this teacher right now → no live class.
        setRealtime('none')
        setRealtimeMsg(r.data.reason || 'No live classes scheduled for you in this slot.')
        return
      }
      setRealtime({ slot: r.data.slot, now: r.data.now, day: r.data.day })
    } catch (err) {
      setRealtime('error')
      setRealtimeMsg(err.response?.data?.message || 'Failed to fetch current slot')
    }
  }

  // ── React to sidebar menu picks ──────────────────────────────────────
  // If the user clicks "Add Subjects" → open the inline add row.
  // If they pick "Analyse Current Class" → trigger runRealtime.
  // History / Recommendations are handled in the parent layout via activeView.
  useEffect(() => {
    if (activeView === 'add')         startAdd()
    if (activeView === 'realtime')    runRealtime()
    if (activeView === 'history')     setShowHistory(true)
  }, [activeView])

  // Filter the visible subject cards by category if a category is active
  const categoryFilter =
    activeView === 'theory'   ? 'Theory'   :
    activeView === 'tutorial' ? 'Tutorial' :
    activeView === 'lab'      ? 'Lab'      : null

  const visibleSubjects = categoryFilter
    ? subjects.filter(s => s.category === categoryFilter)
    : subjects

  // ── Section visibility based on the sidebar's active view ────────────
  // When a layout wrapper passes activeView, render only the slice that
  // corresponds to that pick. When no activeView is passed (legacy /
  // standalone use), render everything as before.
  const isFiltered      = !!activeView
  const showSubjectsTable = !isFiltered || activeView === 'subjects' || activeView === 'add'
  const showSubjectCards  = !isFiltered
                            || activeView === 'subjects'
                            || activeView === 'theory'
                            || activeView === 'tutorial'
                            || activeView === 'lab'
  // Welcome strip is hidden once a specific sub-view is active so the right
  // pane shows ONLY the picked content.
  const showWelcomeHeader = !isFiltered || activeView === 'subjects'

  // The header buttons (Real-time, History) are now driven from the sidebar
  // when isFiltered is true, so hide them inside the subjects-table header
  // to avoid duplication.
  const hideInlineActionButtons = isFiltered

  return (
    <div className="dashboard-content">
      {showWelcomeHeader && (
      <div className="welcome-section">
        <h2>Welcome back, {name} 👋</h2>
        <p>
          Add your subjects and run AI analysis on your classes.
          {allowedCode && (
            <span style={{ marginLeft: '0.6rem', fontSize: '0.85rem', opacity: 0.7 }}>
              · Faculty code: <strong>{allowedCode}</strong>
            </span>
          )}
        </p>
      </div>
      )}

      {/* Subject table */}
      {showSubjectsTable && (
      <div className="glass t-panel">
        <div className="t-panel-header">
          <div>
            <div className="t-panel-title">📚 My Subjects</div>
            <div className="t-panel-sub">Click "Analyse" on a card to run the AI pipeline.</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Sync button is ALWAYS shown — if the Admin just added a new
                class/slot for this teacher, this pulls it in immediately. */}
            <button
              className="btn-add-sub"
              style={{ background: 'linear-gradient(90deg,#0891b2,#22d3ee)' }}
              onClick={recheckTimetable}
            >🔄 Sync Timetable</button>
            {!hideInlineActionButtons && (
              <>
                {!adding && <button className="btn-add-sub" onClick={startAdd}>+ Add Subject</button>}
                <button
                  className="btn-add-sub"
                  style={{ background: 'linear-gradient(90deg,#dc2626,#f87171)' }}
                  onClick={runRealtime}
                >🔴 Real-time</button>
                <button
                  className="btn-add-sub"
                  style={{ background: 'linear-gradient(90deg,#2563eb,#60a5fa)' }}
                  onClick={() => setShowHistory(true)}
                >🕘 History</button>
              </>
            )}
          </div>
        </div>

        {recheckMsg && (
          <div style={{
            background: 'rgba(34,211,238,0.12)',
            border: '1px solid rgba(34,211,238,0.4)',
            color: '#67e8f9',
            borderRadius: '8px',
            padding: '0.6rem 0.9rem',
            fontSize: '0.85rem',
            margin: '0.4rem 0',
          }}>{recheckMsg}</div>
        )}

        {rowErr && <div className="error-msg t-row-err">{rowErr}</div>}

        <div className="t-table-wrap">
          <table className="t-table">
            <thead>
              <tr><th>Code</th><th>Subject</th><th>Section</th><th>Category</th><th style={{width:64,textAlign:'center'}}>Del</th></tr>
            </thead>
            <tbody>
              {fetching && <tr><td colSpan={5} className="t-table-empty">Loading…</td></tr>}
              {!fetching && !subjects.length && !adding && (
                <tr><td colSpan={5} className="t-table-empty">
                  No subjects yet — click <strong style={{color:'#a78bfa'}}>+ Add Subject</strong>.
                </td></tr>
              )}
              {subjects.map(s => {
                const c = CAT_COLOR[s.category] || CAT_COLOR.Theory
                return (
                  <tr key={s._id}>
                    <td><span className="sub-code-chip">{s.code}</span></td>
                    <td className="t-sub-name">{s.name}</td>
                    <td><span className="sub-code-chip" style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.4)' }}>{s.section}</span></td>
                    <td>
                      <span className="cat-badge" style={{background:c.bg,color:c.fg,border:`1px solid ${c.border}`}}>
                        {s.category}
                      </span>
                    </td>
                    <td style={{textAlign:'center'}}>
                      <button className="btn-del-row" onClick={() => deleteSub(s._id)}>🗑</button>
                    </td>
                  </tr>
                )
              })}
              {adding && (
                <tr className="t-add-row">
                  <td colSpan={2}>
                    <select
                      className="t-select"
                      value={newRow.code}
                      onChange={e => setNewRow({ code: e.target.value, section: '' })}
                      autoFocus
                      style={{ minWidth: 240 }}
                    >
                      <option value="">— pick a subject from your timetable —</option>
                      {allowed.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.fullName} ({a.category})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="t-select"
                      value={newRow.section}
                      onChange={e => setNewRow({ ...newRow, section: e.target.value })}
                      disabled={!selectedSubject}
                    >
                      <option value="">{selectedSubject ? '— section —' : '—'}</option>
                      {availableSections.map(sec => (
                        <option
                          key={sec}
                          value={sec}
                          disabled={alreadyAdded.has(`${newRow.code}::${sec}`)}
                        >
                          {sec}{alreadyAdded.has(`${newRow.code}::${sec}`) ? ' (added)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {selectedSubject && (
                      <span className="cat-badge" style={{
                        background: (CAT_COLOR[selectedSubject.category]||CAT_COLOR.Theory).bg,
                        color: (CAT_COLOR[selectedSubject.category]||CAT_COLOR.Theory).fg,
                        border: `1px solid ${(CAT_COLOR[selectedSubject.category]||CAT_COLOR.Theory).border}`,
                      }}>{selectedSubject.category}</span>
                    )}
                  </td>
                  <td>
                    <div className="t-row-btns">
                      <button className="btn-save-row" onClick={saveRow} disabled={saving}>{saving?'…':'✓'}</button>
                      <button className="btn-cancel-row" onClick={cancelAdd}>✕</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Subject cards */}
      {showSubjectCards && visibleSubjects.length > 0 && (
        <div className="sub-cards-section">
          <h3 className="sub-cards-title">
            {categoryFilter ? `Analyse Recorded ${categoryFilter}` : 'Your Subject Reports'}
          </h3>
          {categoryFilter && (
            <div style={{
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.6)',
              marginBottom: '0.9rem',
              lineHeight: 1.55,
            }}>
              {visibleSubjects.length > 1
                ? `You handle ${visibleSubjects.length} ${categoryFilter} subjects. Pick the subject this recording belongs to so the report is filed correctly.`
                : `Click below to analyse the recorded ${categoryFilter.toLowerCase()} session for this subject.`}
            </div>
          )}
          <div className="sub-cards-grid">
            {visibleSubjects.map(s => {
              const c = CAT_COLOR[s.category] || CAT_COLOR.Theory
              return (
                <div key={s._id} className="glass sub-card">
                  <div className="sub-card-bar" style={{background:`linear-gradient(90deg,${c.accent},${c.fg}88)`}} />
                  <div className="sub-card-inner">
                    <div className="sub-card-row1">
                      <span className="sub-code-chip">{s.code}</span>
                      <span className="cat-badge" style={{background:c.bg,color:c.fg,border:`1px solid ${c.border}`}}>
                        {s.category}
                      </span>
                    </div>
                    <div className="sub-card-name">{s.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginBottom: '0.5rem' }}>
                      Section <strong style={{ color: '#fbbf24' }}>{s.section}</strong>
                    </div>
                    <button className="btn-view-report" onClick={() => setActiveModal({ subject: s })}>
                      {categoryFilter
                        ? `📊 Analyse Recorded ${categoryFilter} · ${s.name}`
                        : `📊 Analyse ${s.name}`}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* On-demand analysis from a subject card.
          Recorded-category analysis routes to the SAME Flask endpoint per
          category as V1 always did (Theory→/run/theory, Lab→/run/lab,
          Tutorial→/run/tutorial), so the stored per-category models are
          used unchanged. The picked subject is recorded in sessionMeta so
          the saved report is attributed to the right subject. */}
      {activeModal && (() => {
        const s = activeModal.subject
        const c = CAT_COLOR[s.category] || CAT_COLOR.Theory
        return (
          <AnalysisModal
            title={`Recorded ${s.category} · ${s.name} — ${s.section}`}
            endpoint={CAT_ENDPOINT[s.category]}
            body={{}}
            accentColor={c.accent}
            onClose={() => setActiveModal(null)}
            sessionMeta={{
              subjectCode:  s.code,
              subjectName:  s.name,
              subjectShort: s.name,
              category:     s.category,
              section:      s.section,
              runMode:      'manual',
            }}
          />
        )
      })()}

      {/* Realtime info modal */}
      {realtime === 'loading' && (
        <Modal title="Checking timetable…" onClose={() => setRealtime(null)}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner color="#f87171" /></div>
        </Modal>
      )}
      {(realtime === 'none' || realtime === 'error') && (
        <Modal title="Real-time Analysis" onClose={() => setRealtime(null)}>
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: '10px',
            padding: '1.4rem',
            color: 'rgba(255,255,255,0.75)',
            fontSize: '0.92rem',
            lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
              {realtime === 'error' ? '⚠️ Could not check timetable' : '⏰ No class scheduled right now'}
            </div>
            <div style={{ opacity: 0.75 }}>{realtimeMsg}</div>
            <div style={{ marginTop: '1rem', fontSize: '0.82rem', opacity: 0.55 }}>
              Real-time analysis can only be launched during a slot where the timetable lists you as the teacher.
              Use the "Analyse" button on any subject card to run an analysis manually outside class time.
            </div>
          </div>
        </Modal>
      )}
      {realtime && typeof realtime === 'object' && realtime.slot && (
        <LiveAnalysisModal
          title={`🔴 Real-time · ${realtime.slot.subjectName} — Section ${realtime.slot.section}`}
          category={realtime.slot.category}
          accentColor={(CAT_COLOR[realtime.slot.category]||CAT_COLOR.Theory).accent}
          onClose={() => setRealtime(null)}
          sessionMeta={{
            subjectCode:  realtime.slot.subjectCode,
            subjectName:  realtime.slot.subjectName,
            subjectShort: realtime.slot.subjectShort,
            category:     realtime.slot.category,
            section:      realtime.slot.section,
            runMode:      'realtime',
          }}
        />
      )}

      {/* History */}
      {showHistory && (
        <HistoryModal
          onClose={() => setShowHistory(false)}
          onPick={row => { setShowHistory(false); setHistoricRow(row) }}
        />
      )}
      {historicRow && (
        <HistoricSessionModal row={historicRow} onClose={() => setHistoricRow(null)} />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   HOD PICKER MODALS
   These implement the "ask first" step the HOD sees before each report.
   Every list is fetched live from the Session collection, so the choices
   grow automatically as new analyses are saved — nothing is hardcoded.
════════════════════════════════════════════════════════════════════════════ */

/* Generic picker shell — a titled modal with a description and a list of
   tappable rows. Used by the subject / class / teacher pickers. */
function PickerModal({ title, hint, loading, error, items, emptyText, renderRow, onClose }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {hint && (
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: 0, lineHeight: 1.55 }}>
            {hint}
          </p>
        )}
        {error && <div className="error-msg">{error}</div>}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1.8rem' }}>
            <Spinner />
          </div>
        ) : (!items || items.length === 0) ? (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: '10px',
            padding: '1.4rem',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '0.9rem',
            textAlign: 'center',
          }}>
            {emptyText}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '55vh', overflowY: 'auto' }}>
            {items.map((it, i) => renderRow(it, i))}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* Row used inside the pickers. */
function PickerRow({ onClick, accent = '#a78bfa', children }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: '10px',
        padding: '0.85rem 1.1rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
    >
      {children}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   HOD DASHBOARD
   Three reports, each preceded by an "ask first" picker:
     • Class-wise   → ask which SUBJECT → bar graph per section
     • Subject-wise → ask which CLASS   → all subjects analysed in that class
     • Teacher-wise → ask which TEACHER (or which SUBJECT) → performance report
   All data is dynamic and recomputed from saved analyses on every open.
════════════════════════════════════════════════════════════════════════════ */
function HodDashboard({ name, sidebarView }) {
  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}` }

  // flow: which report is active, and which stage it is at.
  //   null                       → landing
  //   { kind:'class',  stage }    stage = 'pick' | 'report'
  //   { kind:'subject',stage }
  //   { kind:'teacher',stage }    stage = 'mode' | 'pickTeacher' | 'pickSubject' | 'report'
  const [flow, setFlow] = useState(null)

  // picker option lists (fetched live)
  const [subjectOptions, setSubjectOptions] = useState(null)
  const [classOptions,   setClassOptions]   = useState(null)
  const [teacherOptions, setTeacherOptions] = useState(null)
  const [optError,       setOptError]       = useState('')

  // the chosen target + the loaded report
  const [target,     setTarget]     = useState(null)   // { ...chosen subject/class/teacher }
  const [report,     setReport]     = useState(null)   // loaded report payload
  const [reportErr,  setReportErr]  = useState('')

  // teacher-analysis "run a fresh analysis" sub-flow
  const [teacherRun, setTeacherRun] = useState(null)   // a registered-teacher object

  // "Analyse Teacher (Live)" flow — HOD picks a teacher, then a subject,
  // then a live teacher analysis runs (mode of teaching / body language /
  // enthusiasm).
  const [atTeacher,     setAtTeacher]     = useState(null)  // chosen teacher option
  const [atSubjects,    setAtSubjects]    = useState(null)  // that teacher's subjects
  const [atSubjectsErr, setAtSubjectsErr] = useState('')
  const [atRun,         setAtRun]         = useState(null)  // { teacher, subject } → opens AnalysisModal
  const [atPrevReports, setAtPrevReports] = useState(null)  // previous teacher-analysis reports
  const [atPrevErr,     setAtPrevErr]     = useState('')
  const [liveTeachers,    setLiveTeachers]    = useState(null)  // teachers teaching right now
  const [liveTeachersErr, setLiveTeachersErr] = useState('')
  const [liveTeacherRun,  setLiveTeacherRun]  = useState(null)  // chosen live teacher → realtime modal

  // drill-down (session history)
  const [drillRows,    setDrillRows]    = useState(null)
  const [drillTitle,   setDrillTitle]   = useState('')
  const [loadingDrill, setLoadingDrill] = useState(false)
  const [historicRow,  setHistoricRow]  = useState(null)

  // ── Sidebar drives which report opens ─────────────────────────────────
  useEffect(() => {
    if (!sidebarView) return
    if (sidebarView === 'class')   startFlow('class')
    if (sidebarView === 'subject') startFlow('subject')
    if (sidebarView === 'teacher') startFlow('teacher')
    if (sidebarView === 'analyseTeacher') startFlow('analyseTeacher')
    if (sidebarView === 'analyseLiveTeacher') startFlow('analyseLiveTeacher')
  }, [sidebarView])

  const cards = [
    { id: 'class',   icon: '🏫', title: 'Class-wise Analysis',   desc: 'Pick a subject — compare its results across every section that analysed it.', color: 'purple' },
    { id: 'subject', icon: '📚', title: 'Subject-wise Analysis',  desc: 'Pick a class — see every subject analysed for that section.', color: 'blue' },
    { id: 'teacher', icon: '👩‍🏫', title: 'Teacher-wise Analysis', desc: 'Pick a teacher (or a subject) — view performance across the classes they teach.', color: 'green' },
    { id: 'analyseTeacher', icon: '🎥', title: 'Analyse Teacher', desc: 'Run a fresh teacher analysis — mode of teaching, body language and enthusiasm.', color: 'amber' },
  ]

  // Closing a report should NOT leave a blank screen. When the HOD is in
  // a sidebar-driven view, closing the report re-opens that report's
  // picker (so they land back on a usable screen). When on the landing
  // page, it just clears the flow.
  function resetFlow() {
    setTarget(null); setReport(null); setReportErr('')
    setOptError(''); setTeacherRun(null)
    setAtTeacher(null); setAtSubjects(null); setAtSubjectsErr(''); setAtRun(null); setAtPrevReports(null); setAtPrevErr('')
    if (sidebarView === 'class' || sidebarView === 'subject'
        || sidebarView === 'teacher' || sidebarView === 'analyseTeacher'
        || sidebarView === 'analyseLiveTeacher') {
      startFlow(sidebarView)
    } else {
      setFlow(null)
    }
  }

  // A hard close — used by the picker's own ✕ — goes all the way back.
  function closeAll() {
    setFlow(null); setTarget(null); setReport(null); setReportErr('')
    setOptError(''); setTeacherRun(null)
    setAtTeacher(null); setAtSubjects(null); setAtSubjectsErr(''); setAtRun(null); setAtPrevReports(null); setAtPrevErr('')
  }

  // ── Start a report flow: open its picker and fetch its options ────────
  function startFlow(kind) {
    setTarget(null); setReport(null); setReportErr(''); setOptError(''); setTeacherRun(null)
    setAtTeacher(null); setAtSubjects(null); setAtSubjectsErr(''); setAtRun(null); setAtPrevReports(null); setAtPrevErr('')
    if (kind === 'class') {
      setFlow({ kind: 'class', stage: 'pick' })
      loadSubjectOptions()
    } else if (kind === 'subject') {
      setFlow({ kind: 'subject', stage: 'pick' })
      loadClassOptions()
    } else if (kind === 'teacher') {
      setFlow({ kind: 'teacher', stage: 'mode' })
    } else if (kind === 'analyseTeacher') {
      // Analyse Teacher is now its own sidebar item — jump straight to
      // the teacher picker (no intermediate menu). Lists ALL teachers.
      setFlow({ kind: 'teacher', stage: 'analyseTeacherPickTeacher' })
      loadAllTeachers()
    } else if (kind === 'analyseLiveTeacher') {
      // Analyse Real-time Teacher — list teachers currently in class now.
      setFlow({ kind: 'teacher', stage: 'analyseLiveTeacherPick' })
      setLiveTeachers(null); setLiveTeachersErr('')
      {
        const _d = new Date()
        const _days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']
        const _day = _days[_d.getDay()]
        const _time = `${String(_d.getHours()).padStart(2,'0')}:${String(_d.getMinutes()).padStart(2,'0')}`
        axios.get('/api/timetable/teaching-now', { headers, params: { day: _day, time: _time } })
          .then(r => setLiveTeachers(r.data.teaching || []))
          .catch(e => { setLiveTeachers([]); setLiveTeachersErr(e.response?.data?.message || 'Could not load live teachers') })
      }
    }
  }

  function loadSubjectOptions() {
    setSubjectOptions(null)
    axios.get('/api/sessions/options/subjects', { headers })
      .then(r => setSubjectOptions(r.data))
      .catch(e => { setSubjectOptions([]); setOptError(e.response?.data?.message || 'Could not load subjects') })
  }
  function loadClassOptions() {
    setClassOptions(null)
    axios.get('/api/sessions/options/classes', { headers })
      .then(r => setClassOptions(r.data))
      .catch(e => { setClassOptions([]); setOptError(e.response?.data?.message || 'Could not load classes') })
  }
  function loadTeacherOptions() {
    setTeacherOptions(null)
    axios.get('/api/sessions/options/teachers', { headers })
      .then(r => setTeacherOptions(r.data))
      .catch(e => { setTeacherOptions([]); setOptError(e.response?.data?.message || 'Could not load teachers') })
  }

  // For "Analyse Teacher" — list EVERY registered teacher (even those with
  // no faculty code and no prior sessions), so a first analysis can be run.
  function loadAllTeachers() {
    setTeacherOptions(null)
    axios.get('/api/timetable/registered-teachers?all=1', { headers })
      .then(r => {
        const list = (r.data.teachers || []).map(t => ({
          facultyCode: t.facultyCode || '',
          teacherName: t.name,
          subjects:    t.subjects || [],
        }))
        setTeacherOptions(list)
      })
      .catch(e => { setTeacherOptions([]); setOptError(e.response?.data?.message || 'Could not load teachers') })
  }

  // ── CLASS-WISE: subject chosen → load class-by-subject report ─────────
  function pickClassWiseSubject(subj) {
    setTarget(subj); setReport(null); setReportErr('')
    setFlow({ kind: 'class', stage: 'report' })
    const q = subj.subjectCode
      ? `subjectCode=${encodeURIComponent(subj.subjectCode)}`
      : `subjectShort=${encodeURIComponent(subj.subjectShort || '')}`
    axios.get(`/api/sessions/aggregate/class-by-subject?${q}`, { headers })
      .then(r => setReport(r.data))
      .catch(e => { setReport({ rows: [] }); setReportErr(e.response?.data?.message || 'Could not load report') })
  }

  // ── SUBJECT-WISE: class chosen → load subject-by-class report ─────────
  function pickSubjectWiseClass(cls) {
    setTarget(cls); setReport(null); setReportErr('')
    setFlow({ kind: 'subject', stage: 'report' })
    axios.get(`/api/sessions/aggregate/subject-by-class?section=${encodeURIComponent(cls.section)}`, { headers })
      .then(r => setReport(r.data))
      .catch(e => { setReport({ rows: [] }); setReportErr(e.response?.data?.message || 'Could not load report') })
  }

  // ── TEACHER-WISE (by teacher): teacher chosen → load teacher-by-name ──
  function pickTeacherWiseTeacher(t) {
    setTarget(t); setReport(null); setReportErr('')
    setFlow({ kind: 'teacher', stage: 'report', mode: 'teacher' })
    const q = t.facultyCode
      ? `facultyCode=${encodeURIComponent(t.facultyCode)}`
      : `teacherName=${encodeURIComponent(t.teacherName || '')}`
    axios.get(`/api/sessions/aggregate/teacher-by-name?${q}`, { headers })
      .then(r => setReport(r.data))
      .catch(e => { setReport({ rows: [] }); setReportErr(e.response?.data?.message || 'Could not load report') })
  }

  // ── TEACHER-WISE (by subject): subject chosen → load by-subject-faculty ─
  function pickTeacherWiseSubject(subj) {
    setTarget(subj); setReport(null); setReportErr('')
    setFlow({ kind: 'teacher', stage: 'report', mode: 'subject' })
    const q = subj.subjectCode
      ? `subjectCode=${encodeURIComponent(subj.subjectCode)}`
      : `subjectShort=${encodeURIComponent(subj.subjectShort || '')}`
    axios.get(`/api/sessions/aggregate/by-subject-faculty?${q}`, { headers })
      .then(r => setReport(r.data))
      .catch(e => { setReport({ rows: [] }); setReportErr(e.response?.data?.message || 'Could not load report') })
  }

  // ── ANALYSE TEACHER (LIVE): teacher chosen → load that teacher's
  //    subjects so the HOD can pick which subject the analysis is for.
  function pickAnalyseTeacher(t) {
    setAtTeacher(t)
    setAtSubjects(null); setAtSubjectsErr('')
    setAtPrevReports(null); setAtPrevErr('')
    // Show the per-teacher menu: "Run new analysis" or "View previous reports".
    setFlow({ kind: 'teacher', stage: 'analyseTeacherMenu' })
  }

  // Step into the subject picker to run a NEW analysis for this teacher.
  function startAnalyseTeacherSubjects() {
    const t = atTeacher
    if (!t) return
    setAtSubjects(null); setAtSubjectsErr('')
    setFlow({ kind: 'teacher', stage: 'analyseTeacherPickSubject' })
    const code = t.facultyCode || ''

    // Subjects the teacher added themselves (from "Add my subject for
    // analysis") — used as a fallback when there is no faculty code.
    const ownSubjects = (t.subjects || []).map(s => ({
      code: s.code, shortName: s.name, fullName: s.name,
      category: s.category, sections: s.section ? [s.section] : [],
    }))

    if (!code) {
      if (ownSubjects.length) {
        setAtSubjects(ownSubjects)
      } else {
        setAtSubjects([])
        setAtSubjectsErr('This teacher has no faculty code and no added subjects. '
          + 'Ask the teacher to add a subject, or the Admin to assign a faculty code.')
      }
      return
    }
    axios.get(`/api/timetable/subjects-for/${encodeURIComponent(code)}`, { headers })
      .then(r => {
        const tt = r.data.subjects || []
        setAtSubjects(tt.length ? tt : ownSubjects)
        if (!tt.length && !ownSubjects.length) {
          setAtSubjectsErr('No subjects found for this teacher in the timetable.')
        }
      })
      .catch(e => {
        if (ownSubjects.length) setAtSubjects(ownSubjects)
        else { setAtSubjects([]); setAtSubjectsErr(e.response?.data?.message || 'Could not load subjects') }
      })
  }

  // View the previous teacher-analysis reports for the chosen teacher.
  function viewAnalyseTeacherReports() {
    const t = atTeacher
    if (!t) return
    setAtPrevReports(null); setAtPrevErr('')
    setFlow({ kind: 'teacher', stage: 'analyseTeacherPrevReports' })
    const params = {}
    if (t.facultyCode) params.facultyCode = t.facultyCode
    axios.get('/api/sessions', { headers, params: { ...params, analysisType: 'teacher' } })
      .then(r => {
        // Keep only this teacher's teacher-analyses (by code or name).
        const rows = (r.data || []).filter(s =>
          (t.facultyCode && s.facultyCode === t.facultyCode) ||
          (s.teacherName && t.teacherName && s.teacherName === t.teacherName))
        setAtPrevReports(rows)
      })
      .catch(e => { setAtPrevReports([]); setAtPrevErr(e.response?.data?.message || 'Could not load previous reports') })
  }

  // subject chosen → open the live teacher AnalysisModal for that
  // teacher + subject + section.
  function pickAnalyseTeacherSubject(subj, section) {
    setAtRun({
      teacher: atTeacher,
      subject: subj,
      section: section || (subj.sections && subj.sections[0]) || '',
    })
  }

  // ── Drill-down: session history for a section / subject ───────────────
  async function openHistory(params, title) {
    setLoadingDrill(true); setDrillTitle(title); setDrillRows([])
    try {
      const r = await axios.get(`/api/sessions?${params}&limit=200`, { headers })
      setDrillRows(r.data)
    } catch {
      setDrillRows([])
    } finally {
      setLoadingDrill(false)
    }
  }

  const showHodLanding = !sidebarView

  return (
    <div className="dashboard-content">
      {showHodLanding && (
        <div className="welcome-section">
          <h2>Welcome back, {name} 👋</h2>
          <p>Department-wide analytics: class-wise, subject-wise, and teacher-wise performance — every report is built live from saved analyses.</p>
        </div>
      )}

      {showHodLanding && (
        <div className="cards-grid">
          {cards.map(card => (
            <div key={card.id}
                 className={`glass dash-card ${card.color}`}
                 onClick={() => startFlow(card.id)}>
              <div className="card-icon">{card.icon}</div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
              <span className="card-arrow">→</span>
            </div>
          ))}
        </div>
      )}

      {/* Fallback — sidebar-driven view but no flow open yet (e.g. just
          after closing a report). Shows a Start button so the screen is
          never blank. */}
      {!showHodLanding && !flow && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
          <div className="glass" style={{
            padding: '2rem 2.4rem', textAlign: 'center', maxWidth: 440,
          }}>
            <div style={{ fontSize: '2.4rem', marginBottom: '0.6rem' }}>
              {sidebarView === 'class' ? '🏫'
               : sidebarView === 'subject' ? '📚'
               : sidebarView === 'analyseTeacher' ? '🎥' : '👩‍🏫'}
            </div>
            <h3 style={{ margin: '0 0 0.5rem' }}>
              {sidebarView === 'class' ? 'Class-wise Analysis'
               : sidebarView === 'subject' ? 'Subject-wise Analysis'
               : sidebarView === 'analyseTeacher' ? 'Analyse Teacher'
               : 'Teacher-wise Analysis'}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '1.2rem' }}>
              Report closed. Click below to run another analysis.
            </p>
            <button className="btn-add-sub" onClick={() => startFlow(sidebarView)}>
              Start {sidebarView === 'class' ? 'Class-wise'
                     : sidebarView === 'subject' ? 'Subject-wise'
                     : sidebarView === 'analyseTeacher' ? 'Teacher'
                     : 'Teacher-wise'} Analysis
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────  CLASS-WISE  ───────────────────── */}
      {/* Step 1 — ask which subject */}
      {flow && flow.kind === 'class' && flow.stage === 'pick' && (
        <PickerModal
          title="Class-wise Analysis — Pick a Subject"
          hint="Class-wise analysis is run for one subject. Choose the subject; the report then compares its results across every section that has an analysis of it."
          loading={subjectOptions === null}
          error={optError}
          items={subjectOptions}
          emptyText="No subject has been analysed yet. Once teachers run analyses, subjects will appear here."
          onClose={closeAll}
          renderRow={(s) => (
            <PickerRow key={s.subjectShort + s.subjectCode} accent="#a78bfa" onClick={() => pickClassWiseSubject(s)}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>
                  {s.subjectName}
                  {s.subjectCode && <span className="sub-code-chip" style={{ marginLeft: '0.5rem' }}>{s.subjectCode}</span>}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                  {s.category || '—'} · analysed in {(s.sections || []).join(', ') || '—'} · {s.sessions} session{s.sessions === 1 ? '' : 's'}
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          )}
        />
      )}

      {/* Step 2 — class-by-subject report */}
      {flow && flow.kind === 'class' && flow.stage === 'report' && (
        <Modal
          title={`Class-wise · ${target?.subjectName || 'Subject'}`}
          onClose={resetFlow}
          wide
        >
          {report === null ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
          ) : (
            <>
              {reportErr && <div className="error-msg">{reportErr}</div>}
              {(report.rows || []).length === 0 ? (
                <div style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)',
                  borderRadius: '10px', padding: '1.4rem', color: 'rgba(255,255,255,0.6)',
                  fontSize: '0.9rem', textAlign: 'center',
                }}>
                  No section has an analysis of this subject yet.
                </div>
              ) : (
                <>
                  <StatChipRow chips={[
                    { label: 'Sections', value: report.rows.length, color: '#a78bfa' },
                    { label: 'Total Sessions', value: report.rows.reduce((s, r) => s + (r.sessions || 0), 0), color: '#60a5fa' },
                    { label: 'Avg Engagement', value: (() => {
                        const v = report.rows.map(r => r.avgEngagement).filter(x => x != null)
                        return v.length ? `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}%` : '—'
                      })(), color: '#34d399' },
                  ]} />
                  <PerformanceSplitBar rows={report.rows} />
                  <AnalysisBarChart
                    title={`${target?.subjectName || 'Subject'} — engagement by section`}
                    rows={report.rows.map(r => ({
                      label: r.section,
                      sublabel: `${r.sessions} session${r.sessions === 1 ? '' : 's'}`,
                      value: r.avgEngagement || 0,
                      color: bandColor(r.performance),
                    }))}
                  />
                  <table className="data-table">
                    <thead><tr>
                      <th>Section</th><th>Sessions</th>
                      <th>Avg Attentive</th><th>Avg Focused</th>
                      <th>Engagement</th><th>Performance</th><th>Teacher(s)</th><th></th>
                    </tr></thead>
                    <tbody>
                      {report.rows.map(r => (
                        <tr key={r.section}>
                          <td><span className="sub-code-chip">{r.section}</span></td>
                          <td>{r.sessions}</td>
                          <td>{r.avgAttentive != null ? `${r.avgAttentive}%` : '—'}</td>
                          <td>{r.avgFocused   != null ? `${r.avgFocused}%`   : '—'}</td>
                          <td style={{ fontWeight: 700 }}>{r.avgEngagement != null ? `${r.avgEngagement}%` : '—'}</td>
                          <td><PerformancePill label={r.performance} /></td>
                          <td style={{ fontSize: '0.8rem' }}>{(r.teacherNames || []).join(', ') || '—'}</td>
                          <td>
                            <button className="btn-view-report"
                                    style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                                    onClick={() => openHistory(
                                      `${target?.subjectCode ? `subjectCode=${encodeURIComponent(target.subjectCode)}` : `subjectShort=${encodeURIComponent(target?.subjectShort || '')}`}&section=${encodeURIComponent(r.section)}`,
                                      `${target?.subjectName} · ${r.section} — Session history`)}>
                              History
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '1rem' }}>
                    <button className="btn-add-sub" onClick={() => startFlow('class')}>← Pick another subject</button>
                  </div>
                </>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ─────────────────────  SUBJECT-WISE  ───────────────────── */}
      {/* Step 1 — ask which class */}
      {flow && flow.kind === 'subject' && flow.stage === 'pick' && (
        <PickerModal
          title="Subject-wise Analysis — Pick a Class"
          hint="Subject-wise analysis is shown for one class. Choose the section; the report then lists every subject analysed for that class and section."
          loading={classOptions === null}
          error={optError}
          items={classOptions}
          emptyText="No class has been analysed yet."
          onClose={closeAll}
          renderRow={(c) => (
            <PickerRow key={c.section} accent="#60a5fa" onClick={() => pickSubjectWiseClass(c)}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>
                  Section <span className="sub-code-chip" style={{ marginLeft: '0.3rem' }}>{c.section}</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                  {c.sessions} analysis session{c.sessions === 1 ? '' : 's'} recorded
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          )}
        />
      )}

      {/* Step 2 — subject-by-class report */}
      {flow && flow.kind === 'subject' && flow.stage === 'report' && (
        <Modal title={`Subject-wise · Section ${target?.section || ''}`} onClose={resetFlow} wide>
          {report === null ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
          ) : (
            <>
              {reportErr && <div className="error-msg">{reportErr}</div>}
              {(report.rows || []).length === 0 ? (
                <div style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)',
                  borderRadius: '10px', padding: '1.4rem', color: 'rgba(255,255,255,0.6)',
                  fontSize: '0.9rem', textAlign: 'center',
                }}>
                  No subjects have been analysed for this class yet.
                </div>
              ) : (
                <>
                  <StatChipRow chips={[
                    { label: 'Subjects', value: report.rows.length, color: '#a78bfa' },
                    { label: 'Total Sessions', value: report.rows.reduce((s, r) => s + (r.sessions || 0), 0), color: '#60a5fa' },
                    { label: 'Avg Engagement', value: (() => {
                        const v = report.rows.map(r => r.avgEngagement).filter(x => x != null)
                        return v.length ? `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}%` : '—'
                      })(), color: '#34d399' },
                  ]} />
                  <PerformanceSplitBar rows={report.rows} />
                  <AnalysisBarChart
                    title={`Section ${target?.section} — engagement by subject`}
                    rows={report.rows.map(r => ({
                      label: r.subjectShort || r.subjectName,
                      sublabel: `${r.category || ''} · ${r.sessions} session${r.sessions === 1 ? '' : 's'}`,
                      value: r.avgEngagement || 0,
                      color: bandColor(r.performance),
                    }))}
                  />
                  <table className="data-table">
                    <thead><tr>
                      <th>Code</th><th>Subject</th><th>Category</th>
                      <th>Sessions</th><th>Engagement</th><th>Performance</th><th>Teacher(s)</th><th></th>
                    </tr></thead>
                    <tbody>
                      {report.rows.map((r, idx) => {
                        const c = CAT_COLOR[r.category] || CAT_COLOR.Theory
                        return (
                          <tr key={(r.subjectCode || r.subjectShort || idx)}>
                            <td><span className="sub-code-chip">{r.subjectCode || '—'}</span></td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{r.subjectName || r.subjectShort}</div>
                            </td>
                            <td>
                              <span className="cat-badge" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
                                {r.category || '—'}
                              </span>
                            </td>
                            <td>{r.sessions}</td>
                            <td style={{ fontWeight: 700 }}>{r.avgEngagement != null ? `${r.avgEngagement}%` : '—'}</td>
                            <td><PerformancePill label={r.performance} /></td>
                            <td style={{ fontSize: '0.8rem' }}>{(r.teacherNames || []).join(', ') || '—'}</td>
                            <td>
                              <button className="btn-view-report"
                                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                                      onClick={() => openHistory(
                                        `section=${encodeURIComponent(target.section)}&${r.subjectCode ? `subjectCode=${encodeURIComponent(r.subjectCode)}` : `subjectShort=${encodeURIComponent(r.subjectShort || '')}`}`,
                                        `${r.subjectName} · ${target.section} — Session history`)}>
                                History
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '1rem' }}>
                    <button className="btn-add-sub" onClick={() => startFlow('subject')}>← Pick another class</button>
                  </div>
                </>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ─────────────────────  TEACHER-WISE  ───────────────────── */}
      {/* Step 1 — choose mode: by teacher or by subject */}
      {flow && flow.kind === 'teacher' && flow.stage === 'mode' && (
        <Modal title="Teacher-wise Analysis" onClose={closeAll}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: 0, lineHeight: 1.55 }}>
              Choose how to view teacher performance.
            </p>
            <PickerRow accent="#34d399" onClick={() => { setFlow({ kind: 'teacher', stage: 'pickTeacher' }); loadTeacherOptions() }}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>👩‍🏫 By Teacher</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                  Pick a teacher — see their performance across every subject they handle.
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
            <PickerRow accent="#60a5fa" onClick={() => { setFlow({ kind: 'teacher', stage: 'pickSubject' }); loadSubjectOptions() }}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>📚 By Subject</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                  Pick a subject — compare every teacher's performance on it.
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          </div>
        </Modal>
      )}

      {/* Step 2a — pick a teacher */}
      {flow && flow.kind === 'teacher' && flow.stage === 'pickTeacher' && (
        <PickerModal
          title="Teacher-wise Analysis — Pick a Teacher"
          hint="Pick the teacher to analyse. The report shows their performance across all the subjects they teach."
          loading={teacherOptions === null}
          error={optError}
          items={teacherOptions}
          emptyText="No teacher has any analysis recorded yet."
          onClose={closeAll}
          renderRow={(t) => (
            <PickerRow key={t.facultyCode + t.teacherName} accent="#34d399" onClick={() => pickTeacherWiseTeacher(t)}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>{t.teacherName}</div>
                <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                  {t.facultyCode || '—'} · {t.sessions} session{t.sessions === 1 ? '' : 's'}
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          )}
        />
      )}

      {/* Step 2b — pick a subject (teacher-wise by subject) */}
      {flow && flow.kind === 'teacher' && flow.stage === 'pickSubject' && (
        <PickerModal
          title="Teacher-wise Analysis — Pick a Subject"
          hint="Pick the subject. The report compares every teacher who has been analysed teaching it."
          loading={subjectOptions === null}
          error={optError}
          items={subjectOptions}
          emptyText="No subject has been analysed yet."
          onClose={closeAll}
          renderRow={(s) => (
            <PickerRow key={s.subjectShort + s.subjectCode} accent="#60a5fa" onClick={() => pickTeacherWiseSubject(s)}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>
                  {s.subjectName}
                  {s.subjectCode && <span className="sub-code-chip" style={{ marginLeft: '0.5rem' }}>{s.subjectCode}</span>}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                  {s.category || '—'} · {s.sessions} session{s.sessions === 1 ? '' : 's'}
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          )}
        />
      )}

      {/* ─── ANALYSE TEACHER (LIVE) — Step A: pick a teacher ─── */}
      {flow && flow.kind === 'teacher' && flow.stage === 'analyseTeacherPickTeacher' && (
        <PickerModal
          title="Analyse Teacher — Pick a Teacher"
          hint="Pick the teacher to analyse. The next step lets you choose which of their subjects the recording is for, then runs a live teacher analysis."
          loading={teacherOptions === null}
          error={optError}
          items={teacherOptions}
          emptyText="No teachers are registered yet."
          onClose={closeAll}
          renderRow={(t) => (
            <PickerRow key={t.facultyCode + t.teacherName} accent="#f59e0b" onClick={() => pickAnalyseTeacher(t)}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>{t.teacherName}</div>
                <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                  {t.facultyCode || '—'}
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          )}
        />
      )}

      {/* ─── ANALYSE REAL-TIME TEACHER — pick a teacher teaching NOW ─── */}
      {flow && flow.kind === 'teacher' && flow.stage === 'analyseLiveTeacherPick' && (
        <PickerModal
          title="Analyse Real-time Teacher — Who is teaching now?"
          hint="These teachers are currently taking a class (per the timetable). Pick one to analyse their live teaching. Multiple teachers may be teaching different sections at the same time."
          loading={liveTeachers === null}
          error={liveTeachersErr}
          items={liveTeachers}
          emptyText="No teachers are scheduled to be teaching right now."
          onClose={closeAll}
          renderRow={(t, i) => (
            <PickerRow key={`${t.facultyCode}-${t.section}-${i}`} accent="#dc2626"
                       onClick={() => setLiveTeacherRun({
                         teacherName: t.facultyName, facultyCode: t.facultyCode,
                         section: t.section, subjectName: t.subjectName,
                         subjectShort: t.subjectShort, category: t.category,
                       })}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>{t.facultyName} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>({t.facultyCode})</span></div>
                <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.2rem' }}>
                  {t.subjectName} · Section {t.section} · {t.category}
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          )}
        />
      )}

      {/* Live teacher analysis modal — runs the teacher pipeline live */}
      {liveTeacherRun && (
        <LiveAnalysisModal
          title={`🔴 Real-time Teacher · ${liveTeacherRun.teacherName} — ${liveTeacherRun.subjectName} (${liveTeacherRun.section})`}
          category="Teacher"
          accentColor="#dc2626"
          onClose={() => { setLiveTeacherRun(null); resetFlow() }}
          sessionMeta={{
            subjectCode:  '',
            subjectName:  liveTeacherRun.subjectName,
            subjectShort: liveTeacherRun.subjectShort,
            category:     'Teacher',
            section:      liveTeacherRun.section,
            runMode:      'realtime',
            teacherFacultyCode: liveTeacherRun.facultyCode,
            teacherName:        liveTeacherRun.teacherName,
          }}
        />
      )}


      {/* ─── ANALYSE TEACHER — Step A.5: per-teacher menu (two buttons) ─── */}
      {flow && flow.kind === 'teacher' && flow.stage === 'analyseTeacherMenu' && (
        <Modal title={`Analyse Teacher — ${atTeacher?.teacherName || ''}`} onClose={closeAll}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <PickerRow accent="#f59e0b" onClick={startAnalyseTeacherSubjects}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>🎥 Run new analysis</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.2rem' }}>
                  Pick a subject and run a fresh teacher analysis (mode of teaching, body language, enthusiasm).
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
            <PickerRow accent="#60a5fa" onClick={viewAnalyseTeacherReports}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>🕘 View previous reports</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.2rem' }}>
                  See past teacher analyses for {atTeacher?.teacherName || 'this teacher'} only.
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          </div>
        </Modal>
      )}

      {/* ─── ANALYSE TEACHER — previous reports for this teacher only ─── */}
      {flow && flow.kind === 'teacher' && flow.stage === 'analyseTeacherPrevReports' && (
        <Modal title={`Previous Reports — ${atTeacher?.teacherName || ''}`} onClose={closeAll} wide>
          {atPrevReports === null && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>Loading…</div>
          )}
          {atPrevErr && <div className="error-msg">{atPrevErr}</div>}
          {atPrevReports !== null && atPrevReports.length === 0 && (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
              <div style={{ fontWeight: 700, color: '#fff' }}>No previous analysis</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.3rem' }}>
                There are no past teacher analyses for {atTeacher?.teacherName || 'this teacher'} yet.
              </div>
            </div>
          )}
          {atPrevReports !== null && atPrevReports.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {atPrevReports.map((s, i) => (
                <div key={s._id || i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '0.8rem 1rem',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.92rem' }}>
                      {s.subjectName || s.subjectShort || '—'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                      {s.section || ''} · {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, color: (s.verdict || '').includes('NOT') ? '#f87171' : '#34d399', fontSize: '0.85rem' }}>
                    {s.verdict || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ─── ANALYSE TEACHER (LIVE) — Step B: pick the subject ─── */}
      {flow && flow.kind === 'teacher' && flow.stage === 'analyseTeacherPickSubject' && (
        <PickerModal
          title={`Analyse Teacher — ${atTeacher?.teacherName || ''}`}
          hint="Pick which subject this teacher analysis is for. The live analysis will report mode of teaching, body language and enthusiasm."
          loading={atSubjects === null}
          error={atSubjectsErr}
          items={atSubjects}
          emptyText="The timetable lists no subjects for this teacher. Ask the Admin to add a slot for their faculty code."
          onClose={closeAll}
          renderRow={(s) => (
            <PickerRow key={s.code + s.shortName} accent="#f59e0b"
                       onClick={() => pickAnalyseTeacherSubject(s, (s.sections || [])[0])}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff' }}>
                  {s.fullName || s.shortName}
                  {s.code && <span className="sub-code-chip" style={{ marginLeft: '0.5rem' }}>{s.code}</span>}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.2rem' }}>
                  {s.category || '—'} · section(s) {(s.sections || []).join(', ') || '—'}
                </div>
              </div>
              <span className="card-arrow">→</span>
            </PickerRow>
          )}
        />
      )}

      {/* ─── ANALYSE TEACHER (LIVE) — Step C: run the live analysis ─── */}
      {atRun && (
        <AnalysisModal
          title={`🎥 Teacher Analysis · ${atRun.teacher?.teacherName || ''} · ${atRun.subject?.fullName || atRun.subject?.shortName || ''}${atRun.section ? ` — ${atRun.section}` : ''}`}
          endpoint="/run/teacher"
          body={{ teacher: atRun.teacher?.teacherName || '',
                  subject: atRun.subject?.fullName || atRun.subject?.shortName || '' }}
          accentColor="#f59e0b"
          onClose={() => { setAtRun(null); resetFlow() }}
          sessionMeta={{
            subjectCode:  atRun.subject?.code || '',
            subjectName:  atRun.subject?.fullName || atRun.subject?.shortName || '',
            subjectShort: atRun.subject?.shortName || '',
            // A teacher body-language analysis is always saved under the
            // 'Teacher' category so it is stored and reported as a teacher
            // analysis (mode of teaching + enthusiasm), not a student one.
            category:     'Teacher',
            section:      atRun.section || 'N/A',
            analysisType: 'teacher',
            runMode:      'manual',
            // tells the backend this analysis belongs to the chosen
            // teacher, not the logged-in HOD
            teacherFacultyCode: atRun.teacher?.facultyCode || '',
            teacherName:        atRun.teacher?.teacherName || '',
          }}
        />
      )}

      {/* Step 3 — teacher-wise report (by teacher) */}
      {flow && flow.kind === 'teacher' && flow.stage === 'report' && flow.mode === 'teacher' && (
        <Modal title={`Teacher-wise · ${report?.teacher?.teacherName || target?.teacherName || ''}`} onClose={resetFlow} wide>
          {report === null ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
          ) : (
            <>
              {reportErr && <div className="error-msg">{reportErr}</div>}
              {(report.rows || []).length === 0 ? (
                <div style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)',
                  borderRadius: '10px', padding: '1.4rem', color: 'rgba(255,255,255,0.6)',
                  fontSize: '0.9rem', textAlign: 'center',
                }}>
                  No analyses recorded for this teacher yet.
                </div>
              ) : (
                <>
                  <StatChipRow chips={[
                    { label: 'Subjects', value: report.rows.length, color: '#a78bfa' },
                    { label: 'Total Sessions', value: report.rows.reduce((s, r) => s + (r.sessions || 0), 0), color: '#60a5fa' },
                    { label: 'Avg Score', value: (() => {
                        const v = report.rows.map(r => r.score).filter(x => x != null)
                        return v.length ? `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}%` : '—'
                      })(), color: '#34d399' },
                  ]} />
                  <PerformanceSplitBar rows={report.rows} />
                  <AnalysisBarChart
                    title={`${report?.teacher?.teacherName || ''} — performance by subject`}
                    rows={report.rows.map(r => ({
                      label: r.subjectShort || r.subjectName,
                      sublabel: `${r.section} · ${r.category || ''}`,
                      value: r.score || 0,
                      color: bandColor(r.performance),
                    }))}
                  />
                  <table className="data-table">
                    <thead><tr>
                      <th>Subject</th><th>Section</th><th>Category</th>
                      <th>Sessions</th><th>Score</th><th>Performance</th>
                    </tr></thead>
                    <tbody>
                      {report.rows.map((r, idx) => {
                        const c = CAT_COLOR[r.category] || CAT_COLOR.Theory
                        return (
                          <tr key={(r.subjectShort || idx) + r.section}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{r.subjectName || r.subjectShort}</div>
                              {r.subjectCode && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{r.subjectCode}</div>}
                            </td>
                            <td><span className="sub-code-chip">{r.section}</span></td>
                            <td>
                              <span className="cat-badge" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
                                {r.category || '—'}
                              </span>
                            </td>
                            <td>{r.sessions}</td>
                            <td style={{ fontWeight: 700 }}>{r.score != null ? `${r.score}%` : '—'}</td>
                            <td><PerformancePill label={r.performance} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn-add-sub" onClick={() => startFlow('teacher')}>← Teacher-wise menu</button>
                  </div>
                </>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Step 3 — teacher-wise report (by subject) */}
      {flow && flow.kind === 'teacher' && flow.stage === 'report' && flow.mode === 'subject' && (
        <Modal title={`Teacher-wise · ${report?.subject?.subjectName || target?.subjectName || ''}`} onClose={resetFlow} wide>
          {report === null ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
          ) : (
            <>
              {reportErr && <div className="error-msg">{reportErr}</div>}
              {(report.rows || []).length === 0 ? (
                <div style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)',
                  borderRadius: '10px', padding: '1.4rem', color: 'rgba(255,255,255,0.6)',
                  fontSize: '0.9rem', textAlign: 'center',
                }}>
                  No teacher has been analysed teaching this subject yet.
                </div>
              ) : (
                <>
                  <StatChipRow chips={[
                    { label: 'Teachers', value: report.rows.length, color: '#a78bfa' },
                    { label: 'Total Sessions', value: report.rows.reduce((s, r) => s + (r.sessions || 0), 0), color: '#60a5fa' },
                    { label: 'Avg Engagement', value: (() => {
                        const v = report.rows.map(r => r.avgEngagement).filter(x => x != null)
                        return v.length ? `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}%` : '—'
                      })(), color: '#34d399' },
                  ]} />
                  <PerformanceSplitBar rows={report.rows} />
                  <AnalysisBarChart
                    title={`${report?.subject?.subjectName || ''} — engagement by teacher`}
                    rows={report.rows.map(r => ({
                      label: r.teacherName || r.facultyCode,
                      sublabel: `${r.facultyCode || ''} · ${r.sessions} session${r.sessions === 1 ? '' : 's'}`,
                      value: r.avgEngagement || 0,
                      color: bandColor(r.performance),
                    }))}
                  />
                  <table className="data-table">
                    <thead><tr>
                      <th>Teacher</th><th>Sections</th>
                      <th>Avg Attentive</th><th>Avg Focused</th>
                      <th>Engagement</th><th>Performance</th><th>Sessions</th>
                    </tr></thead>
                    <tbody>
                      {report.rows.map((r, idx) => (
                        <tr key={(r.facultyCode || idx) + r.teacherName}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.teacherName || '—'}</div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{r.facultyCode}</div>
                          </td>
                          <td style={{ fontSize: '0.82rem' }}>{(r.sections || []).join(', ') || '—'}</td>
                          <td>{r.avgAttentive != null ? `${r.avgAttentive}%` : '—'}</td>
                          <td>{r.avgFocused   != null ? `${r.avgFocused}%`   : '—'}</td>
                          <td style={{ fontWeight: 700 }}>{r.avgEngagement != null ? `${r.avgEngagement}%` : '—'}</td>
                          <td><PerformancePill label={r.performance} /></td>
                          <td>{r.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '1rem' }}>
                    <button className="btn-add-sub" onClick={() => startFlow('teacher')}>← Teacher-wise menu</button>
                  </div>
                </>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Drill-down: session history */}
      {drillRows !== null && (
        <Modal title={drillTitle} onClose={() => setDrillRows(null)} wide>
          {loadingDrill ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
          ) : drillRows.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: '10px', padding: '1.4rem', color: 'rgba(255,255,255,0.6)',
              fontSize: '0.9rem', textAlign: 'center',
            }}>No history rows for this selection.</div>
          ) : (
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr>
                  <th>When</th><th>Teacher</th><th>Subject</th>
                  <th>Section</th><th>Type</th><th>Verdict</th><th></th>
                </tr></thead>
                <tbody>
                  {drillRows.map(r => {
                    const c = CAT_COLOR[r.category] || CAT_COLOR.Theory
                    const d = new Date(r.createdAt)
                    return (
                      <tr key={r._id}>
                        <td style={{ fontSize: '0.78rem' }}>
                          {d.toLocaleDateString()}<br />
                          <span style={{ color: 'rgba(255,255,255,0.45)' }}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {r.teacherName}
                          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)' }}>{r.facultyCode}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.subjectShort || r.subjectCode}</div>
                          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{r.subjectName}</div>
                        </td>
                        <td><span className="sub-code-chip">{r.section}</span></td>
                        <td>
                          <span className="cat-badge" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
                            {r.analysisType}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: c.fg }}>{r.verdict || '—'}</td>
                        <td>
                          <button className="btn-view-report"
                                  style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                                  onClick={() => setHistoricRow(r)}>View</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
      {historicRow && (
        <HistoricSessionModal row={historicRow} onClose={() => setHistoricRow(null)} />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════════════════════ */
function TeacherSidebarLayout({ name, isHodViewing, onBackToHodLanding }) {
  const [activeView, setActiveView] = useState(null)   // null = placeholder
  const [subjects, setSubjects] = useState([])
  const [unreadRecs, setUnreadRecs] = useState(0)

  // Pull subjects to figure out which categories should appear in the sidebar
  useEffect(() => {
    const token = localStorage.getItem('token')
    axios.get('/api/subjects', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setSubjects(r.data))
      .catch(() => {})
    axios.get('/api/recommendations/my', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setUnreadRecs((r.data || []).filter(x => !x.acknowledged).length))
      .catch(() => {})
  }, [activeView])

  const hasTheory   = subjects.some(s => s.category === 'Theory')
  const hasTutorial = subjects.some(s => s.category === 'Tutorial')
  const hasLab      = subjects.some(s => s.category === 'Lab')

  // Categories only appear if the teacher has actually added a subject in
  // that category. "Analyse Current Class" is always shown (it is the live
  // real-time run, unchanged). The recorded-category buttons are added
  // dynamically — a teacher who handles no Lab subject sees no Lab option.
  const items = [
    ...(isHodViewing ? [{ key: '__back', icon: '←', label: 'Back to HOD home' }, { kind: 'separator', key: 's0' }] : []),
    { key: 'subjects', icon: '📚', label: 'My Subjects' },
    { key: 'add',      icon: '➕', label: 'Add my subject for analysis' },
    { kind: 'separator', key: 's1' },
    { key: 'realtime', icon: '🔴', label: 'Analyse Current Class' },
    ...(hasTheory   ? [{ key: 'theory',   icon: '📖', label: 'Analyse Recorded Theory'   }] : []),
    ...(hasTutorial ? [{ key: 'tutorial', icon: '✏️',  label: 'Analyse Recorded Tutorial' }] : []),
    ...(hasLab      ? [{ key: 'lab',      icon: '🔬', label: 'Analyse Recorded Lab'      }] : []),
    { kind: 'separator', key: 's2' },
    { key: 'history', icon: '🕘', label: 'Previous Class Report' },
    { key: 'recommendations', icon: '📋', label: 'Recommendations', badge: unreadRecs },
  ]

  const handlePick = (key) => {
    if (key === '__back') { onBackToHodLanding && onBackToHodLanding(); return }
    setActiveView(key)
  }

  return (
    <div style={SIDEBAR_LAYOUT_STYLE}>
      <Sidebar
        title={isHodViewing ? 'Teaching · HOD' : 'Teacher Menu'}
        items={items}
        activeKey={activeView}
        onSelect={handlePick}
      />
      <div style={SIDEBAR_MAIN_PANE_STYLE}>
        {activeView === null && (
          <SidebarPlaceholder
            icon="👋"
            title={`Welcome, ${name}`}
            subtitle="Pick an item from the menu on the left to manage your subjects, run an analysis, or review past reports."
          />
        )}
        {activeView === 'recommendations' && <RecommendationsPanel scope="my" />}
        {activeView !== null && activeView !== 'recommendations' && (
          <TeacherDashboard key={activeView} name={name} activeView={activeView} />
        )}
      </div>
    </div>
  )
}

function HodSidebarLayout({ name, onSwitchToTeacher, onBackToLanding }) {
  const [activeView, setActiveView] = useState(null)   // null = placeholder

  // No Recommendations item in HOD-as-HOD view (per spec).
  const items = [
    { key: '__back', icon: '←', label: 'Back to HOD home' },
    { kind: 'separator', key: 's0' },
    { key: 'class',   icon: '🏫',  label: 'Class-wise Analysis'   },
    { key: 'subject', icon: '📚',  label: 'Subject-wise Analysis' },
    { key: 'teacher', icon: '👩‍🏫', label: 'Teacher-wise Analysis' },
    { key: 'analyseTeacher', icon: '🎥', label: 'Analyse Recorded Teacher' },
    { key: 'analyseLiveTeacher', icon: '🔴', label: 'Analyse Real-time Teacher' },
  ]

  return (
    <div style={SIDEBAR_LAYOUT_STYLE}>
      <Sidebar
        title="HOD Menu"
        items={items}
        activeKey={activeView}
        onSelect={(k) => {
          if (k === '__back') { onBackToLanding(); return }
          setActiveView(k)
        }}
      />
      <div style={SIDEBAR_MAIN_PANE_STYLE}>
        {activeView === null && (
          <SidebarPlaceholder
            icon="📊"
            title={`Welcome, ${name}`}
            subtitle="Pick an analysis from the HOD menu on the left to view department-wide insights."
          />
        )}
        {activeView !== null && (
          <HodDashboard key={activeView} name={name} sidebarView={activeView} />
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const role = localStorage.getItem('role')
  const name = localStorage.getItem('name')

  // For HOD: which side of the dashboard are they on right now?
  //   null     → landing screen with two cards
  //   'teacher' → using the teacher dashboard layout (with sidebar)
  //   'hod'     → using the HOD analytics layout (with sidebar)
  const [hodSide, setHodSide] = useState(null)

  const renderBody = () => {
    if (role === 'admin') {
      return <AdminDashboard name={name} />
    }
    if (role === 'hod') {
      if (hodSide === null) return <HodLandingScreen name={name} onPick={setHodSide} />
      if (hodSide === 'teacher')
        return <TeacherSidebarLayout name={name} isHodViewing onBackToHodLanding={() => setHodSide(null)} />
      return <HodSidebarLayout name={name} onBackToLanding={() => setHodSide(null)} />
    }
    return <TeacherSidebarLayout name={name} />
  }

  const roleLabel = role === 'admin' ? 'Admin' : role === 'hod' ? 'HOD' : 'Teacher'
  const roleBadgeClass =
    role === 'admin' ? 'role-hod'  // reuse the same dark style
    : role === 'hod' ? 'role-hod'
    : 'role-teacher'

  return (
    <div className="campus-bg">
      <div className="dashboard-layout">
        <nav className="navbar">
          <div className="navbar-brand">
            <div className="nb-logo">🎓</div>
            <span>EduDashboard</span>
          </div>
          <div className="navbar-user">
            <span style={{color:'rgba(255,255,255,0.7)',fontSize:'0.9rem'}}>{name}</span>
            <span className={`role-badge ${roleBadgeClass}`}>{roleLabel}</span>
            <button className="btn-logout" onClick={() => { localStorage.clear(); navigate('/login') }}>
              Logout
            </button>
          </div>
        </nav>
        {renderBody()}
      </div>
    </div>
  )
}
