const crypto = require('crypto')

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function hashContent(content) {
  if (!content) {
    return null
  }
  return sha256(String(content))
}

function generateProofHash({
  provider,
  messageId,
  receivedAt,
  subject,
  from,
  amount,
  currency,
  interval,
  contentHash,
}) {
  const parts = [
    provider || '',
    messageId || '',
    receivedAt || '',
    subject || '',
    from || '',
    amount != null ? String(amount) : '',
    currency || '',
    interval || '',
    contentHash || '',
  ]

  return sha256(parts.join('|'))
}

module.exports = {
  hashContent,
  generateProofHash,
}
