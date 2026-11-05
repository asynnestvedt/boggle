// Room links and reset emails issued before the games hub lived at the root.
function followLegacyLink() {
  const url = new URL(location.href)
  if (url.searchParams.has('room') || url.searchParams.has('return') || new URLSearchParams(url.hash.slice(1)).has('reset')) {
    location.replace(`/woggle/${url.search}${url.hash}`)
  }
}
window.addEventListener('hashchange', followLegacyLink)
followLegacyLink()

import { api } from '../js/lib/http.js'

const account = document.querySelector('#hub-account')
const dialog = document.querySelector('#account-dialog')
const form = document.querySelector('#hub-login')
const status = document.querySelector('#hub-login-status')

function showSignedOut() {
  account.innerHTML = '<button class="hub-signin" type="button" id="hub-sign-in">Sign in</button>'
  account.querySelector('button').onclick = () => { status.textContent = ''; dialog.showModal() }
}

function showUser(user) {
  account.innerHTML = '<details class="hub-menu"><summary aria-label="Account menu"><span class="hub-avatar" aria-hidden="true"></span><span class="hub-name"></span><span aria-hidden="true">⌄</span></summary><div class="hub-popover"><strong></strong><span class="hub-email"></span><a href="/woggle/?account=change">Change password</a><button type="button">Sign out</button><p role="status"></p></div></details>'
  account.querySelector('.hub-avatar').textContent = user.name.slice(0, 1).toUpperCase()
  account.querySelector('.hub-name').textContent = user.name
  account.querySelector('strong').textContent = user.name
  account.querySelector('.hub-email').textContent = user.email
  account.querySelector('button').onclick = async () => {
    try { await api('/api/auth/logout', {}); showSignedOut() }
    catch (error) { account.querySelector('[role="status"]').textContent = error.message }
  }
}

showSignedOut()
api('/api/session').then(({ user }) => { if (user) showUser(user) }).catch(() => {})
document.querySelector('#account-close').onclick = () => dialog.close()
form.onsubmit = async event => {
  event.preventDefault()
  const button = form.querySelector('[type="submit"]')
  button.disabled = true
  status.textContent = ''
  try {
    const { user } = await api('/api/auth/login', Object.fromEntries(new FormData(form)))
    showUser(user)
    form.reset()
    dialog.close()
  } catch (error) { status.textContent = error.message }
  finally { button.disabled = false }
}
