const $ = selector => document.querySelector(selector)
let state = null
let current = ''
let busy = false
let signedIn = false
const rank = { absent: 1, present: 2, correct: 3 }

async function request(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) { const error = new Error(data.error || 'Please try again.'); error.status = response.status; throw error }
  return data
}
function announce(text) { $('#message').textContent = text }
function render() {
  const guesses = state?.guesses || []
  $('#attempts').textContent = `${guesses.length} / 6 tries`
  if (state) {
    const date = new Date(`${state.day}T00:00:00Z`)
    $('#day-label').textContent = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date).toUpperCase()
  }
  const tiles = []
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 5; column++) {
      const entry = guesses[row]
      const letter = entry?.word[column] || (row === guesses.length ? current[column] : '') || ''
      const tile = document.createElement('div')
      tile.className = `tile${letter ? ' filled' : ''}${entry ? ` ${entry.result[column]}` : ''}`
      tile.textContent = letter
      tile.setAttribute('role', 'gridcell')
      tile.setAttribute('aria-label', `Guess ${row + 1}, letter ${column + 1}: ${letter || 'empty'}${entry ? `, ${entry.result[column]}` : ''}`)
      tiles.push(tile)
    }
  }
  $('#board').replaceChildren(...tiles)
  const keyStates = {}
  for (const entry of guesses) for (let i = 0; i < 5; i++) {
    const letter = entry.word[i], result = entry.result[i]
    if ((rank[result] || 0) > (rank[keyStates[letter]] || 0)) keyStates[letter] = result
  }
  const rows = ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), ['ENTER', ...'ZXCVBNM', '⌫']]
  $('#keyboard').replaceChildren(...rows.map(keys => {
    const row = document.createElement('div'); row.className = 'key-row'
    for (const key of keys) {
      const button = document.createElement('button'); button.type = 'button'
      button.className = `key${key.length > 1 || key === '⌫' ? ' wide' : ''}${keyStates[key] ? ` ${keyStates[key]}` : ''}`
      button.textContent = key; button.disabled = !signedIn || !state || state.status !== 'playing' || busy
      button.setAttribute('aria-label', key === '⌫' ? 'Delete letter' : key === 'ENTER' ? 'Submit guess' : keyStates[key] ? `${key}, ${keyStates[key]}` : key)
      button.onclick = () => handle(key); row.append(button)
    }
    return row
  }))
  const finished = state && state.status !== 'playing'
  $('#finished').hidden = !finished
  if (finished) {
    $('#result-title').textContent = state.status === 'won' ? 'A bright idea!' : 'There’s always tomorrow.'
    $('#result-detail').textContent = state.status === 'won' ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'try' : 'tries'}.` : `Today’s word was ${state.answer}.`
  }
}
async function handle(key) {
  if (!signedIn || !state || state.status !== 'playing' || busy) return
  if (key === '⌫' || key === 'BACKSPACE') { current = current.slice(0, -1); announce(''); render(); return }
  if (key === 'ENTER') {
    if (current.length !== 5) return announce('A guess needs five letters.')
    busy = true; render(); announce('Checking your word…')
    try {
      state = await request('/api/letterlight/guess', { word: current, day: state.day, guessCount: state.guesses.length })
      current = ''
      announce(state.status === 'won' ? 'Beautifully done.' : state.status === 'lost' ? 'Come back for a fresh word tomorrow.' : 'Nice guess. Keep going.')
    } catch (error) {
      announce(error.message)
      if (error.status === 409) {
        try { state = await request('/api/letterlight'); current = '' } catch { /* Keep the error visible. */ }
      }
      if (error.status === 401) { signedIn = false; $('#signin').hidden = false }
    } finally { busy = false; render() }
    return
  }
  if (/^[A-Z]$/.test(key) && current.length < 5) { current += key; announce(''); render() }
}
document.addEventListener('keydown', event => {
  if ($('#help').open || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
  if (event.target.closest('input, textarea, select') || (event.key === 'Enter' && event.target.closest('button, a'))) return
  const key = event.key.toUpperCase()
  if (/^[A-Z]$/.test(key) || key === 'ENTER' || key === 'BACKSPACE') { event.preventDefault(); handle(key) }
})
$('#help-open').onclick = () => $('#help').showModal()
$('#help-close').onclick = $('#help-done').onclick = () => $('#help').close()
$('#share').onclick = async () => {
  const symbols = { correct: '🟩', present: '🟨', absent: '⬛' }
  const text = `Letterlight ${state.day} ${state.status === 'won' ? state.guesses.length : 'X'}/6\n\n${state.guesses.map(row => row.result.map(result => symbols[result]).join('')).join('\n')}\n\n${location.origin}/letterlight/`
  try { await navigator.clipboard.writeText(text); announce('Result copied—share it with a friend.') }
  catch { announce('Could not copy the result. Check your browser clipboard permissions.') }
}
async function init() {
  render()
  try {
    const session = await request('/api/session')
    if (!session.user) { $('#signin').hidden = false; announce('Sign in to start today’s puzzle.'); return }
    signedIn = true
    state = await request('/api/letterlight')
    announce(state.status === 'playing' ? 'Type a five-letter word to begin.' : 'Your puzzle is saved. See you tomorrow!')
    render()
  } catch { announce('Could not reach the game. Refresh to try again.') }
}
init()
