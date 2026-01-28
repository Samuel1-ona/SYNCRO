const { parseSubscriptionEmail } = require('./email-parser')
const { generateProofHash, hashContent } = require('../utils/proof-hashing')

const OUTLOOK_SCOPES = ['offline_access', 'User.Read', 'Mail.Read']
const KEYWORDS = [
  'subscription',
  'renewal',
  'invoice',
  'receipt',
  'billing',
  'charged',
  'trial',
  'membership',
  'plan',
]

function getOutlookAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI || '',
    response_mode: 'query',
    scope: OUTLOOK_SCOPES.join(' '),
    prompt: 'consent',
  })

  if (state) {
    params.set('state', state)
  }

  return `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/authorize?${params.toString()}`
}

async function exchangeOutlookCodeForTokens(code) {
  return requestOutlookToken({
    code,
    grant_type: 'authorization_code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI || '',
  })
}

async function refreshOutlookToken(refreshToken) {
  return requestOutlookToken({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
}

async function requestOutlookToken(params) {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || '',
    client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
    ...params,
  })

  const response = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Outlook token exchange failed: ${error}`)
  }

  return response.json()
}

async function getOutlookProfile(accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Outlook profile fetch failed: ${error}`)
  }

  return response.json()
}

async function scanOutlookSubscriptions({
  accessToken,
  refreshToken,
  expiresAt,
  maxResults = 50,
}) {
  let token = accessToken

  if (expiresAt && refreshToken && new Date(expiresAt) <= new Date()) {
    const refreshed = await refreshOutlookToken(refreshToken)
    token = refreshed.access_token
  }

  const searchQuery = KEYWORDS.join(' OR ')
  const url = new URL('https://graph.microsoft.com/v1.0/me/messages')
  url.searchParams.set('$search', `"${searchQuery}"`)
  url.searchParams.set('$select', 'id,subject,from,receivedDateTime,body')
  url.searchParams.set('$top', String(maxResults))

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: 'eventual',
      Prefer: 'outlook.body-content-type="text"',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Outlook message scan failed: ${error}`)
  }

  const data = await response.json()
  const results = []

  for (const message of data.value || []) {
    const subject = message.subject || null
    const from = message.from?.emailAddress?.name || message.from?.emailAddress?.address || null
    const receivedAt = message.receivedDateTime || null
    let body = message.body?.content || ''

    const parsed = parseSubscriptionEmail({ subject, from, body })
    if (!parsed) {
      continue
    }

    const contentHash = hashContent(body)
    // Discard raw email content after hashing/parsing.
    body = null
    const proofHash = generateProofHash({
      provider: 'outlook',
      messageId: message.id,
      receivedAt,
      subject,
      from,
      amount: parsed.amount,
      currency: parsed.currency,
      interval: parsed.interval,
      contentHash,
    })

    results.push({
      provider: 'outlook',
      messageId: message.id,
      receivedAt,
      subject,
      from,
      ...parsed,
      proof: {
        hash: proofHash,
        contentHash,
        algorithm: 'sha256',
      },
    })
  }

  return results
}

module.exports = {
  getOutlookAuthUrl,
  exchangeOutlookCodeForTokens,
  getOutlookProfile,
  refreshOutlookToken,
  scanOutlookSubscriptions,
}
