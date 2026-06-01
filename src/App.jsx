import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MODEL   = 'claude-sonnet-4-6'
const API_URL = 'https://api.anthropic.com/v1/messages'

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const buildSystemPrompt = (company, contact, context) => `
You are an expert sales communications assistant. Your job is to take raw, messy call notes and turn them into four polished, professional outputs.

The user has just finished a sales call. They will paste in rough bullet points or stream-of-consciousness notes — typos and shorthand included. Your job is to interpret the intent and produce clean outputs.

OUTPUT FORMAT — MANDATORY:
Your entire response must be a single raw JSON object. Start with { and end with }. No markdown. No code fences. No explanation. Just the JSON.

The JSON must have exactly these keys:

{
  "follow_up_email": {
    "subject": "string — a clear, specific email subject line. Not generic. Reference something real from the call.",
    "body": "string — a polished follow-up email. 3-4 short paragraphs. Warm but professional tone. Reference specific things discussed. End with a clear single ask (next step). Use \\n\\n to separate paragraphs. Do NOT use markdown inside the email body — plain text only."
  },
  "call_summary": "string — 3-5 sentences summarising what was discussed, what the prospect's situation is, and where the deal stands. Written for the sales rep's own CRM notes, not for the prospect.",
  "action_items": [
    {
      "task": "string — specific, actionable task",
      "owner": "string — either 'You' (the sales rep) or the contact's name or 'Both'",
      "deadline": "string — a suggested timeframe like 'By end of week', 'Within 48 hours', 'Next call', or 'ASAP'"
    }
  ],
  "next_step": {
    "recommendation": "string — one clear recommended next move. Be specific. E.g. 'Book a 30-minute demo for their technical team' not just 'Follow up'.",
    "reasoning": "string — 1-2 sentences explaining why this is the right next step based on what was discussed."
  }
}

Rules:
- If the notes mention a specific person's name, use it
- If the notes are vague on something, make a sensible inference and move on — do not ask for clarification
- Action items should be concrete and ownable — avoid vague items like "think about next steps"
- The follow-up email must feel like it was written by a human who was on the call, not a template
- Minimum 3 action items, maximum 6

Company being sold to: ${company}
${contact ? `Contact name: ${contact}` : ''}
${context ? `What the rep sells: ${context}` : ''}
`.trim()

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractJSON(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed) } catch { /* fall through */ }
  }
  const m = trimmed.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch { /* fall through */ }
  }
  const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fence && fence[1].trim().startsWith('{')) {
    try { return JSON.parse(fence[1].trim()) } catch { /* fall through */ }
  }
  throw new Error('Could not parse the output. Please try again.')
}

async function runFollowUp(apiKey, notes, company, contact, context) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: buildSystemPrompt(company, contact, context),
      messages: [
        {
          role: 'user',
          content: `Here are my call notes:\n\n${notes}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${res.status}`)
  }

  const data = await res.json()
  const textBlock = data.content?.find(b => b.type === 'text')
  if (!textBlock) throw new Error('No response from the model.')
  return extractJSON(textBlock.text)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-emerald-400 mb-2">
      {children}
    </p>
  )
}

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="text-xs px-3 py-1.5 rounded-md bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

function DeadlineBadge({ deadline }) {
  const isUrgent = /asap|48 hour|24 hour/i.test(deadline)
  const base = 'text-[10px] px-2 py-0.5 rounded-full font-medium border'
  const colour = isUrgent
    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    : 'bg-slate-700/40 text-slate-400 border-slate-700/40'
  return <span className={`${base} ${colour}`}>{deadline}</span>
}

function OwnerBadge({ owner }) {
  const isYou = /^you$/i.test(owner.trim())
  const colour = isYou
    ? 'bg-emerald-600/15 text-emerald-400 border-emerald-500/20'
    : 'bg-slate-700/40 text-slate-400 border-slate-700/40'
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${colour}`}>
      {owner}
    </span>
  )
}

function EmailSection({ email }) {
  const fullText = `Subject: ${email.subject}\n\n${email.body}`
  return (
    <div className="mb-6 p-4 rounded-xl bg-emerald-950/15 border border-emerald-900/25 fade-up">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Follow-up email</SectionLabel>
        <CopyButton text={fullText} label="Copy email" />
      </div>
      <p className="text-xs font-medium text-slate-400 mb-1">Subject</p>
      <p className="text-sm text-slate-100 font-medium mb-4">{email.subject}</p>
      <p className="text-xs font-medium text-slate-400 mb-1">Body</p>
      <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
        {email.body}
      </div>
    </div>
  )
}

function SummarySection({ summary }) {
  return (
    <div className="mb-6 fade-up" style={{ animationDelay: '60ms' }}>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Call summary</SectionLabel>
        <CopyButton text={summary} label="Copy" />
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">{summary}</p>
    </div>
  )
}

function ActionItemsSection({ items }) {
  const text = items.map(i => `• ${i.task} [${i.owner}] — ${i.deadline}`).join('\n')
  return (
    <div className="mb-6 p-4 rounded-xl bg-slate-900/50 border border-slate-800/60 fade-up" style={{ animationDelay: '120ms' }}>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Action items</SectionLabel>
        <CopyButton text={text} label="Copy all" />
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-600/20 text-emerald-400 text-[11px] flex items-center justify-center font-semibold flex-shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 leading-snug mb-1.5">{item.task}</p>
              <div className="flex flex-wrap gap-1.5">
                <OwnerBadge owner={item.owner} />
                <DeadlineBadge deadline={item.deadline} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NextStepSection({ nextStep }) {
  return (
    <div className="mb-6 p-4 rounded-xl bg-slate-800/30 border border-slate-700/40 fade-up" style={{ animationDelay: '180ms' }}>
      <SectionLabel>Recommended next step</SectionLabel>
      <p className="text-sm font-semibold text-slate-100 mb-2">{nextStep.recommendation}</p>
      <p className="text-xs text-slate-400 leading-relaxed">{nextStep.reasoning}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [apiKey,   setApiKey]   = useState('')
  const [showKey,  setShowKey]  = useState(false)
  const [company,  setCompany]  = useState('')
  const [contact,  setContact]  = useState('')
  const [context,  setContext]  = useState('')
  const [notes,    setNotes]    = useState('')

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [result,   setResult]   = useState(null)

  const canRun = apiKey.trim() && company.trim() && notes.trim() && !loading

  const handleRun = async () => {
    if (!canRun) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await runFollowUp(apiKey, notes, company, contact, context)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun()
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200" onKeyDown={handleKeyDown}>

      {/* ── Header ── */}
      <header className="border-b border-slate-800/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold text-sm">
            F
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100 leading-none">Post-Call Follow-Up</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Turn rough notes into polished actions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-600/15 text-emerald-400 border border-emerald-500/20 font-medium tracking-wide">
            claude-sonnet-4-6
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-10">

        {/* ── Intro ── */}
        {!result && !loading && (
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-slate-100 mb-2">
              The call just ended. Now what?
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Paste your rough notes — bullet points, shorthand, whatever you jotted down.
              Claude will write the follow-up email, summarise the call, list action items,
              and tell you the right next move.
            </p>
          </div>
        )}

        {/* ── Workflow strip (only on empty state) ── */}
        {!result && !loading && (
          <div className="mb-8 flex items-center gap-2 text-[11px] text-slate-600">
            <span className="px-2 py-1 rounded bg-slate-800/60 text-slate-500">Find the lead</span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-slate-800/60 text-slate-500">Prep the call</span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-emerald-900/30 text-emerald-500 border border-emerald-800/40 font-medium">Follow up ←  you are here</span>
          </div>
        )}

        {/* ── Input form ── */}
        {!result && (
          <div className="space-y-4">

            {/* API key */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Anthropic API key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  {showKey ? 'hide' : 'show'}
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">Sent directly to Anthropic. Never stored.</p>
            </div>

            {/* Company + contact row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Company <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Contact name <span className="text-slate-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder="e.g. Sarah"
                  className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition"
                />
              </div>
            </div>

            {/* What you sell */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                What do you sell? <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="text"
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="e.g. AI-powered HR software for mid-market SaaS"
                className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition"
              />
              <p className="text-[11px] text-slate-600 mt-1">
                Helps Claude write action items and the email from the right angle.
              </p>
            </div>

            {/* Call notes */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Call notes <span className="text-emerald-400">*</span>
              </label>
              <textarea
                rows={8}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={`Paste your raw notes here. Shorthand, bullet points, typos — all fine. For example:\n\n- spoke to sarah, head of ops\n- they're using spreadsheets for scheduling rn, hate it\n- team of ~40, growing fast\n- budget not confirmed but not a blocker she said\n- wants to see a demo, keen on the automation side\n- mentioned their CTO needs to sign off\n- follow up fri`}
                className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition font-mono leading-relaxed"
              />
              <p className="text-[11px] text-slate-600 mt-1">
                The messier the better — Claude is built for this.
              </p>
            </div>

            {/* Run button */}
            <button
              onClick={handleRun}
              disabled={!canRun}
              className="w-full mt-2 py-3 rounded-lg font-medium text-sm transition-all
                bg-emerald-700 hover:bg-emerald-600 text-white
                disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              Generate Follow-Up
              <span className="ml-2 text-emerald-300 font-normal text-xs">⌘ Enter</span>
            </button>

            {error && (
              <div className="mt-2 p-3 rounded-lg bg-red-950/40 border border-red-800/40 text-red-300 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-28 gap-6">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-slate-800" />
              <div className="spinner absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-emerald-500" />
            </div>
            <div className="text-center">
              <p className="text-slate-200 font-medium text-sm">Writing your follow-up…</p>
              <p className="text-slate-500 text-xs mt-1">Extracting actions, drafting email, structuring output</p>
            </div>
          </div>
        )}

        {/* ── Output ── */}
        {result && !loading && (
          <div>

            {/* Output header */}
            <div className="mb-8 pb-5 border-b border-slate-800/60 flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-400 border border-emerald-500/20 font-medium">
                  Follow-up ready
                </span>
                <h2 className="text-xl font-semibold text-slate-100 mt-2">{company}</h2>
                {contact && (
                  <p className="text-slate-500 text-sm mt-0.5">Call with {contact}</p>
                )}
              </div>
            </div>

            {result.follow_up_email && <EmailSection email={result.follow_up_email} />}
            {result.call_summary && <SummarySection summary={result.call_summary} />}
            {result.action_items?.length > 0 && <ActionItemsSection items={result.action_items} />}
            {result.next_step && <NextStepSection nextStep={result.next_step} />}

            {/* Reset */}
            <button
              onClick={() => { setResult(null); setNotes(''); setError('') }}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 transition-all"
            >
              ← New follow-up
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
