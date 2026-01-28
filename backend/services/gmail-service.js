const { google } = require('googleapis')
const { parseSubscriptionEmail } = require('./email-parser')
const { generateProofHash, hashContent } = require('../utils/proof-hashing')

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
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

function createOAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing Google OAuth environment variables')
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

function getGmailAuthUrl(state) {
  const oauth2Client = createOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
  })
}

async function exchangeGmailCodeForTokens(code) {
  const oauth2Client = createOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

async function getGmailProfile(tokens) {
  const oauth2Client = createOAuthClient()
  oauth2Client.setCredentials(tokens)
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  return profile.data
}

async function scanGmailSubscriptions({ accessToken, refreshToken, sinceDays = 120, maxResults = 50 }) {
  const oauth2Client = createOAuthClient()
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const query = buildQuery(sinceDays)
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  })

  const messages = listResponse.data.messages || []
  const results = []

  for (const message of messages) {
    const details = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'full',
    })

    const payload = details.data.payload || {}
    const headers = payload.headers || []
    const subject = findHeader(headers, 'Subject')
    const from = findHeader(headers, 'From')
    const receivedAt = findHeader(headers, 'Date') || new Date(details.data.internalDate || Date.now()).toISOString()
    let body = extractTextFromPayload(payload)

    const parsed = parseSubscriptionEmail({ subject, from, body })
    if (!parsed) {
      continue
    }

    const contentHash = hashContent(body)
    // Discard raw email content after hashing/parsing.
    body = null
    const proofHash = generateProofHash({
      provider: 'gmail',
      messageId: details.data.id,
      receivedAt,
      subject,
      from,
      amount: parsed.amount,
      currency: parsed.currency,
      interval: parsed.interval,
      contentHash,
    })

    results.push({
      provider: 'gmail',
      messageId: details.data.id,
      threadId: details.data.threadId,
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

function buildQuery(sinceDays) {
  const keywordQuery = KEYWORDS.map((keyword) => `"${keyword}"`).join(' OR ')
  const baseQuery = `(${keywordQuery})`
  if (!sinceDays) {
    return baseQuery
  }
  return `${baseQuery} newer_than:${sinceDays}d`
}

function findHeader(headers, name) {
  const match = headers.find((header) => header.name.toLowerCase() === name.toLowerCase())
  return match ? match.value : null
}

function extractTextFromPayload(payload) {
  const parts = collectParts(payload)
  const plainParts = parts.filter((part) => part.mimeType === 'text/plain')
  const htmlParts = parts.filter((part) => part.mimeType === 'text/html')
  const sources = plainParts.length ? plainParts : htmlParts

  const decoded = sources
    .map((part) => decodeBase64(part.body?.data))
    .filter(Boolean)
    .join('\n')

  if (plainParts.length) {
    return decoded
  }

  return decoded.replace(/<[^>]+>/g, ' ')
}

function collectParts(payload) {
  const parts = []
  if (payload?.mimeType && payload.body?.data) {
    parts.push(payload)
  }
  if (Array.isArray(payload?.parts)) {
    for (const part of payload.parts) {
      parts.push(...collectParts(part))
    }
  }
  return parts
}

function decodeBase64(data) {
  if (!data) {
    return ''
  }
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

module.exports = {
  getGmailAuthUrl,
  exchangeGmailCodeForTokens,
  getGmailProfile,
  scanGmailSubscriptions,
}
