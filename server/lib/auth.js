'use strict'

const { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } = require('node:crypto')
const { promisify } = require('node:util')
const derive = promisify(scrypt)
const SESSION_MS = 7 * 24 * 60 * 60 * 1000
const RESET_MS = 30 * 60 * 1000
const COOKIE = 'boggle_session'
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }

class AppError extends Error {
    constructor(message, status = 400) { super(message); this.status = status }
}
function digest(value) { return createHash('sha256').update(value).digest('hex') }
function emailAddress(value) {
    if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        throw new AppError('Enter a valid email address.')
    }
    return value.trim().toLowerCase()
}
function validPassword(value) {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
        throw new AppError('Use a password between 12 and 128 characters.')
    }
    return value
}
async function hashPassword(password) {
    const salt = randomBytes(16).toString('hex')
    const key = await derive(password, salt, 64, SCRYPT)
    return `scrypt$${salt}$${key.toString('hex')}`
}
async function verifyPassword(password, encoded) {
    if (typeof password !== 'string' || password.length > 128) return false
    const [, salt, hex] = encoded.split('$')
    const actual = await derive(password, salt, 64, SCRYPT)
    return timingSafeEqual(actual, Buffer.from(hex, 'hex'))
}
function publicUser(user) { return { id: user.id, email: user.email, name: user.name } }
function sessionToken(request) {
    const match = (request.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))
    const token = match ? match.slice(COOKIE.length + 1) : ''
    return /^[a-f0-9]{64}$/.test(token) ? token : null
}
class Auth {
    constructor(store, sendResetEmail) {
        this.store = store
        this.sendResetEmail = sendResetEmail
        this.dummyHash = hashPassword(randomBytes(32).toString('hex'))
    }
    async register(input) {
        const email = emailAddress(input.email)
        const password = validPassword(input.password)
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        if (!name || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw new AppError('Enter a display name of 1–40 characters.')
        const password_hash = await hashPassword(password)
        const user = { id: randomUUID(), email, name, password_hash }
        try { this.store.createUser(user) } catch (error) {
            if (this.store.userByEmail(email)) throw new AppError('Unable to create this account. Try signing in or resetting your password.', 409)
            throw error
        }
        return user
    }
    async login(input) {
        const email = emailAddress(input.email)
        const user = this.store.userByEmail(email)
        const valid = await verifyPassword(input.password, user ? user.password_hash : await this.dummyHash)
        if (!user || !valid || this.store.userById(user.id).password_hash !== user.password_hash) {
            throw new AppError('Email or password is incorrect.', 401)
        }
        return user
    }
    createSession(user) {
        const token = randomBytes(32).toString('hex')
        this.store.addSession(digest(token), user.id, Date.now() + SESSION_MS)
        return token
    }
    fromRequest(request) {
        const token = sessionToken(request)
        return token ? this.store.session(digest(token)) : undefined
    }
    logout(request) {
        const token = sessionToken(request)
        if (token) this.store.deleteSession(digest(token))
        return token
    }
    async forgotPassword(input) {
        const email = emailAddress(input.email)
        const user = this.store.userByEmail(email)
        if (!user) return
        const token = randomBytes(32).toString('hex')
        this.store.addReset(digest(token), user.id, Date.now() + RESET_MS)
        try { await this.sendResetEmail(user.email, token) } catch (error) {
            this.store.deleteReset(digest(token))
            throw error
        }
    }
    async resetPassword(input) {
        const password = validPassword(input.password)
        if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) throw new AppError('This reset link is invalid or expired.')
        const hash = digest(input.token)
        if (!this.store.reset(hash)) throw new AppError('This reset link is invalid or expired.')
        const encoded = await hashPassword(password)
        return this.store.transaction(() => {
            const reset = this.store.reset(hash)
            if (!reset) throw new AppError('This reset link is invalid or expired.')
            this.store.setPassword(reset.user_id, encoded)
            return reset.user_id
        })
    }
    async changePassword(user, input) {
        validPassword(input.password)
        if (!await verifyPassword(input.currentPassword, user.password_hash)) throw new AppError('Current password is incorrect.', 401)
        const encoded = await hashPassword(input.password)
        this.store.transaction(() => {
            if (this.store.userById(user.id).password_hash !== user.password_hash) throw new AppError('Please sign in again.', 401)
            this.store.setPassword(user.id, encoded)
        })
    }
}

module.exports = { Auth, AppError, publicUser, sessionToken, digest, COOKIE, SESSION_MS }
