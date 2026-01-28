const SUBSCRIPTION_KEYWORDS = [
  'subscription',
  'renewal',
  'auto-renew',
  'billing',
  'billed',
  'charged',
  'invoice',
  'receipt',
  'membership',
  'trial',
  'plan',
]

const STRONG_PHRASES = [
  'your subscription',
  'subscription confirmed',
  'trial ends',
  'renews on',
  'payment received',
]

const INTERVAL_MATCHERS = [
  { pattern: /\bmonthly\b|\bper month\b|\/month\b/i, value: 'monthly' },
  { pattern: /\bannual\b|\byearly\b|\bper year\b|\/year\b/i, value: 'yearly' },
  { pattern: /\bweekly\b|\bper week\b|\/week\b/i, value: 'weekly' },
  { pattern: /\bquarterly\b|\bper quarter\b|\/quarter\b/i, value: 'quarterly' },
]

function parseSubscriptionEmail({ subject, from, body }) {
  const combined = `${subject || ''}\n${body || ''}`.trim()
  const normalized = normalizeText(combined)
  const signals = SUBSCRIPTION_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword)
  )
  const strongSignal = STRONG_PHRASES.some((phrase) => normalized.includes(phrase))

  const { amount, currency } = extractAmount(normalized)
  const interval = detectInterval(normalized)
  const name = extractSenderName(from)

  if (!signals.length && !strongSignal) {
    return null
  }

  if (!amount && !strongSignal && !interval) {
    return null
  }

  let confidence = 0.2
  if (signals.length) confidence += 0.2
  if (strongSignal) confidence += 0.2
  if (amount) confidence += 0.2
  if (interval) confidence += 0.1
  confidence = Math.min(confidence, 0.95)

  return {
    name,
    amount,
    currency,
    interval,
    signals,
    confidence,
  }
}

function normalizeText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .toLowerCase()
}

function extractSenderName(from) {
  if (!from) {
    return null
  }

  const trimmed = String(from).trim()
  const nameMatch = trimmed.match(/^(.*?)(<|$)/)
  if (nameMatch && nameMatch[1]) {
    const name = nameMatch[1].replace(/"|'/g, '').trim()
    if (name) {
      return name
    }
  }

  const emailMatch = trimmed.match(/([^\s@]+)@/)
  if (emailMatch) {
    return emailMatch[1]
  }

  return trimmed
}

function extractAmount(text) {
  const symbolMatch = text.match(/([$€£])\s?(\d{1,5}(?:[.,]\d{2})?)/i)
  if (symbolMatch) {
    return {
      amount: normalizeAmount(symbolMatch[2]),
      currency: symbolToCurrency(symbolMatch[1]),
    }
  }

  const codeBeforeMatch = text.match(
    /\b(USD|EUR|GBP|CAD|AUD)\s?(\d{1,5}(?:[.,]\d{2})?)\b/i
  )
  if (codeBeforeMatch) {
    return {
      amount: normalizeAmount(codeBeforeMatch[2]),
      currency: codeBeforeMatch[1].toUpperCase(),
    }
  }

  const codeAfterMatch = text.match(
    /(\d{1,5}(?:[.,]\d{2})?)\s?(USD|EUR|GBP|CAD|AUD)\b/i
  )
  if (codeAfterMatch) {
    return {
      amount: normalizeAmount(codeAfterMatch[1]),
      currency: codeAfterMatch[2].toUpperCase(),
    }
  }

  return { amount: null, currency: null }
}

function normalizeAmount(value) {
  if (!value) {
    return null
  }
  const normalized = String(value).replace(/,/g, '')
  const amount = Number.parseFloat(normalized)
  return Number.isFinite(amount) ? amount : null
}

function symbolToCurrency(symbol) {
  switch (symbol) {
    case '€':
      return 'EUR'
    case '£':
      return 'GBP'
    default:
      return 'USD'
  }
}

function detectInterval(text) {
  for (const matcher of INTERVAL_MATCHERS) {
    if (matcher.pattern.test(text)) {
      return matcher.value
    }
  }
  return null
}

module.exports = {
  parseSubscriptionEmail,
}
