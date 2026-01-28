const express = require('express')
const {
  getOutlookAuthUrl,
  exchangeOutlookCodeForTokens,
  getOutlookProfile,
  scanOutlookSubscriptions,
} = require('../../services/outlook-service')
const { createState, consumeState } = require('../../utils/oauth-state')

const router = express.Router()

router.get('/auth', (_req, res) => {
  const state = createState()
  const url = getOutlookAuthUrl(state)
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

    const tokens = await exchangeOutlookCodeForTokens(code)
    const profile = await getOutlookProfile(tokens.access_token)

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    return res.json({
      provider: 'outlook',
      email: profile.mail || profile.userPrincipalName,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
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
    const { accessToken, refreshToken, expiresAt, maxResults } = req.body

    if (!accessToken) {
      return res.status(400).json({ error: 'Missing accessToken' })
    }

    const subscriptions = await scanOutlookSubscriptions({
      accessToken,
      refreshToken,
      expiresAt,
      maxResults,
    })

    return res.json({ subscriptions })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
