const express = require('express')
const {
  getGmailAuthUrl,
  exchangeGmailCodeForTokens,
  getGmailProfile,
  scanGmailSubscriptions,
} = require('../../services/gmail-service')
const { createState, consumeState } = require('../../utils/oauth-state')

const router = express.Router()

router.get('/auth', (_req, res) => {
  const state = createState()
  const url = getGmailAuthUrl(state)
  res.redirect(url)
})

router.get('/callback', async (req, res, next) => {
  try {
    const code = req.query.code
    const state = req.query.state

    if (!consumeState(state)) {
      return res.status(400).json({ error: 'Invalid OAuth state' })
    }

    if (!code) {
      return res.status(400).json({ error: 'Missing OAuth code' })
    }

    const tokens = await exchangeGmailCodeForTokens(code)
    const profile = await getGmailProfile(tokens)

    return res.json({
      provider: 'gmail',
      email: profile.emailAddress,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        scope: tokens.scope,
        token_type: tokens.token_type,
      },
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/scan', async (req, res, next) => {
  try {
    const { accessToken, refreshToken, sinceDays, maxResults } = req.body

    if (!accessToken) {
      return res.status(400).json({ error: 'Missing accessToken' })
    }

    const subscriptions = await scanGmailSubscriptions({
      accessToken,
      refreshToken,
      sinceDays,
      maxResults,
    })

    return res.json({ subscriptions })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
