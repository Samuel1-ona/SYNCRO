const crypto = require('crypto')

const STATE_TTL_MS = 10 * 60 * 1000
const stateStore = new Map()

function createState() {
  const state = crypto.randomBytes(16).toString('hex')
  stateStore.set(state, Date.now() + STATE_TTL_MS)
  return state
}

function consumeState(state) {
  if (!state) {
    return false
  }

  const expiresAt = stateStore.get(state)
  stateStore.delete(state)

  if (!expiresAt) {
    return false
  }

  return Date.now() <= expiresAt
}

module.exports = {
  createState,
  consumeState,
}
