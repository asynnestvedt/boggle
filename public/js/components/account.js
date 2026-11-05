import { api } from '../lib/http.js'

export class Account {
    constructor(root, onChange) {
        this.root = root
        this.onChange = onChange
        this.menu = document.getElementById('account-menu')
        this.user = null
        this.mode = 'login'
        this.readResetLink()
        window.addEventListener('hashchange', () => {
            if (!this.readResetLink()) return
            this.render()
            this.onChange(null)
        })
    }
    readResetLink() {
        const parameters = new URLSearchParams(location.hash.slice(1))
        const token = parameters.get('reset')
        if (token) {
            this.resetToken = token
            this.mode = 'reset'
            history.replaceState(null, '', location.pathname + location.search)
            return true
        }
        return false
    }
    async init() {
        try {
            this.user = (await api('/api/session')).user
            this.render()
            this.onChange(this.mode === 'reset' ? null : this.user)
        } catch (error) {
            this.render()
            this.message(error.message)
        }
    }
    message(text) { this.root.querySelector('[role="status"]').textContent = text }
    signedOut(message = '') {
        this.user = null
        this.mode = 'login'
        this.render()
        this.message(message)
        this.onChange(null)
    }
    render() {
        const signedIn = this.user && this.mode !== 'reset' && this.mode !== 'change'
        this.menu.replaceChildren()
        if (signedIn) {
            this.root.innerHTML = '<p role="status" aria-live="polite"></p>'
            this.menu.innerHTML = `<details class="account-dropdown"><summary aria-label="Account menu"><span class="avatar" aria-hidden="true"></span><span id="account-name"></span><span aria-hidden="true">⌄</span></summary><div class="account-popover"><strong class="menu-name"></strong><span class="menu-email"></span><button type="button" data-mode="change">Change password</button><button type="button" id="logout">Sign out</button></div></details>`
            this.menu.querySelector('#account-name').textContent = this.user.name
            this.menu.querySelector('.avatar').textContent = this.user.name.slice(0, 1).toUpperCase()
            this.menu.querySelector('.menu-name').textContent = this.user.name
            this.menu.querySelector('.menu-email').textContent = this.user.email
            this.menu.querySelector('#logout').onclick = async () => {
                try { await api('/api/auth/logout', {}); this.signedOut() } catch (error) { this.message(error.message) }
            }
        } else {
            const mode = this.mode
            const titles = { login: 'Sign in to play', register: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password', change: 'Change your password' }
            const buttons = { login: 'Sign in', register: 'Create account', forgot: 'Send reset link', reset: 'Set new password', change: 'Change password' }
            this.root.innerHTML = `<h2>${titles[mode]}</h2><form id="account-form">
                ${mode === 'register' ? '<label>Display name<input name="name" autocomplete="off" maxlength="40" required></label>' : ''}
                ${['login', 'register', 'forgot'].includes(mode) ? '<label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label>' : ''}
                ${mode === 'change' ? '<label>Current password<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>' : ''}
                ${mode !== 'forgot' ? `<label>${mode === 'login' ? 'Password' : 'New password (12–128 characters)'}<input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" ${mode === 'login' ? '' : 'minlength="12"'} maxlength="128" required></label>` : ''}
                <button type="submit">${buttons[mode]}</button></form>
                <div class="account-links">${mode === 'login' ? '<button type="button" data-mode="register">Create account</button><button type="button" data-mode="forgot">Forgot password?</button>' : '<button type="button" data-mode="login">Back</button>'}</div>
                <p role="status" aria-live="polite"></p>`
            this.root.querySelector('form').onsubmit = event => this.submit(event)
        }
        ;[...this.root.querySelectorAll('[data-mode]'), ...this.menu.querySelectorAll('[data-mode]')].forEach(button => {
            button.onclick = () => { this.mode = button.dataset.mode; this.render() }
        })
    }
    async submit(event) {
        event.preventDefault()
        const button = event.target.querySelector('[type="submit"]')
        button.disabled = true
        const body = Object.fromEntries(new FormData(event.target))
        const endpoint = { login: 'login', register: 'register', forgot: 'forgot-password', reset: 'reset-password', change: 'change-password' }[this.mode]
        if (this.mode === 'reset') body.token = this.resetToken
        try {
            const result = await api(`/api/auth/${endpoint}`, body)
            if (result.user) {
                this.user = result.user
                this.mode = 'login'
                this.render()
                this.onChange(this.user)
            } else if (this.mode === 'forgot') {
                this.message(result.message)
            } else {
                this.resetToken = null
                this.signedOut(result.message)
            }
        } catch (error) { this.message(error.message) }
        finally { button.disabled = false }
    }
}
