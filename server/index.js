'use strict'

const express = require('express')
const helmet = require('helmet')
const { rateLimit } = require('express-rate-limit')
const http = require('node:http')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { WebSocketServer, WebSocket } = require('ws')
const configuration = require('./config/config')
const Store = require('./lib/store')
const Rooms = require('./lib/rooms')
const { Letterlight } = require('./lib/letterlight')
const createMailer = require('./lib/mailer')
const { Auth, AppError, publicUser, sessionToken, digest, COOKIE, SESSION_MS } = require('./lib/auth')

function createApplication(options = {}) {
    const config = options.config || configuration()
    const store = options.store || new Store(path.join(config.dataDir, 'boggle.sqlite'))
    const auth = new Auth(store, options.sendResetEmail || createMailer(config))
    const rooms = new Rooms(store, options.roomOptions)
    const letterlight = new Letterlight(store, options.letterlightOptions)
    const app = express()
    const server = http.createServer(app)
    const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false })
    app.disable('x-powered-by')
    if (config.trustProxy) app.set('trust proxy', config.trustProxy)
    app.use(helmet({
        strictTransportSecurity: config.production ? undefined : false,
        contentSecurityPolicy: { directives: {
            'script-src': ["'self'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'connect-src': ["'self'", config.publicUrl.replace(/^http/, 'ws')],
            'upgrade-insecure-requests': config.production ? [] : null
        } }
    }))
    app.use('/api', (req, res, next) => {
        res.set('Cache-Control', 'no-store')
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            if (req.headers.origin && req.headers.origin !== config.publicUrl) return next(new AppError('Origin is not allowed.', 403))
            if (!req.is('application/json')) return next(new AppError('Send application/json.', 415))
        }
        next()
    })
    app.use(express.json({ limit: '8kb' }))
    app.use('/api', (req, res, next) => {
        if (req.method === 'POST' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
            return next(new AppError('Send a JSON object.'))
        }
        next()
    })
    const limit = (windowMs, count) => rateLimit({
        windowMs, limit: count, standardHeaders: 'draft-8', legacyHeaders: false,
        message: { error: 'Too many requests. Please try again later.' }
    })
    const authLimit = limit(15 * 60 * 1000, 30)
    const resetLimit = limit(60 * 60 * 1000, 5)
    const roomLimit = limit(60 * 1000, 30)
    const requireUser = (req, res, next) => {
        req.user = auth.fromRequest(req)
        if (!req.user) return next(new AppError('Please sign in.', 401))
        next()
    }
    const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/' }
    function signIn(req, res, user) {
        if (store.userById(user.id).password_hash !== user.password_hash) throw new AppError('Please sign in again.', 401)
        const oldToken = auth.logout(req)
        if (oldToken) revokeSockets(ws => ws.token === oldToken)
        res.cookie(COOKIE, auth.createSession(user), { ...cookieOptions, maxAge: SESSION_MS })
        return publicUser(user)
    }
    function revokeSockets(predicate) {
        for (const ws of wss.clients) if (predicate(ws)) ws.close(4001, 'Please sign in again.')
    }

    app.get('/api/health', (req, res) => res.json({ ok: true }))
    app.get('/api/session', (req, res) => {
        const user = auth.fromRequest(req)
        res.json({ user: user ? publicUser(user) : null })
    })
    app.post('/api/auth/register', authLimit, async (req, res) => {
        const user = await auth.register(req.body)
        res.status(201).json({ user: signIn(req, res, user) })
    })
    app.post('/api/auth/login', authLimit, async (req, res) => {
        const user = await auth.login(req.body)
        res.json({ user: signIn(req, res, user) })
    })
    app.post('/api/auth/logout', (req, res) => {
        const token = auth.logout(req)
        revokeSockets(ws => ws.token === token)
        res.clearCookie(COOKIE, cookieOptions).json({ ok: true })
    })
    app.post('/api/auth/forgot-password', resetLimit, async (req, res) => {
        if (config.resetEmailDisabled) throw new AppError('Password reset email is not configured. Contact the server administrator.', 503)
        try { await auth.forgotPassword(req.body) } catch (error) {
            if (error instanceof AppError) throw error
            // Keep the same response for known and unknown accounts, including mail failures.
            console.error('Password reset email delivery failed. Check SMTP configuration.')
        }
        res.json({ message: 'If an account exists for that email, a password reset link has been sent.' })
    })
    app.post('/api/auth/reset-password', authLimit, async (req, res) => {
        const userId = await auth.resetPassword(req.body)
        revokeSockets(ws => ws.userId === userId)
        res.clearCookie(COOKIE, cookieOptions).json({ message: 'Password reset. Sign in with your new password.' })
    })
    app.post('/api/auth/change-password', authLimit, requireUser, async (req, res) => {
        await auth.changePassword(req.user, req.body)
        revokeSockets(ws => ws.userId === req.user.id)
        res.clearCookie(COOKIE, cookieOptions).json({ message: 'Password changed. Please sign in again.' })
    })
    app.post('/api/rooms', roomLimit, requireUser, (req, res) => {
        const room = rooms.create(req.user)
        res.status(201).json({ roomId: room.id })
    })
    app.get('/api/recent-groups', requireUser, (req, res) => res.json({ groups: store.recentGroups(req.user.id) }))
    app.get('/api/letterlight', requireUser, (req, res) => res.json(letterlight.state(req.user.id)))
    app.post('/api/letterlight/guess', roomLimit, requireUser, (req, res) => res.json(letterlight.guess(req.user.id, req.body)))
    app.get('/api/rooms/:id', requireUser, (req, res) => res.json({ roomId: rooms.get(req.params.id).id }))
    app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }))
    app.use(express.static(config.publicDir))
    app.use((req, res) => res.status(404).send('Page not found.'))
    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error)
        const status = error instanceof AppError ? error.status : error.status === 413 ? 413 : error.type === 'entity.parse.failed' ? 400 : 500
        if (status === 500) console.error('Request failed:', error.message)
        res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' :
            error instanceof AppError ? error.message : status === 413 ? 'Request is too large.' : 'Invalid JSON.' })
    })

    function send(ws, message) {
        if (ws.readyState !== WebSocket.OPEN) return
        if (ws.bufferedAmount > 512 * 1024) return ws.terminate()
        ws.send(JSON.stringify(message))
    }
    function sendState(ws, room) { send(ws, { action: 'state', payload: rooms.snapshot(room, ws.userId) }) }
    function voicePresence(roomId) {
        const sockets = [...(rooms.connections.get(roomId) || [])].filter(ws => ws.voice && ws.readyState === WebSocket.OPEN)
        const users = sockets.map(ws => ({ id: ws.voiceId, name: ws.voiceName }))
        for (const ws of sockets) send(ws, { action: 'voicePresence', payload: { users } })
    }
    function leaveVoice(ws, roomId) {
        if (!ws.voice) return
        ws.voice = false
        voicePresence(roomId)
    }
    rooms.onChange = room => {
        for (const ws of rooms.connections.get(room.id) || []) sendState(ws, room)
    }
    server.on('upgrade', (req, socket, head) => {
        socket.on('error', () => {})
        try {
            const url = new URL(req.url, config.publicUrl)
            if (url.pathname !== '/api/rooms/socket') throw new AppError('Not found.', 404)
            if (req.headers.origin !== config.publicUrl) throw new AppError('Origin is not allowed.', 403)
            const user = auth.fromRequest(req)
            if (!user) throw new AppError('Please sign in.', 401)
            const roomId = url.searchParams.get('room')
            const room = rooms.get(roomId)
            if (!room.members.some(member => member.id === user.id) && room.members.length >= 32) throw new AppError('Room full.', 409)
            const existing = [...(rooms.connections.get(roomId) || [])].filter(ws => ws.userId === user.id)
            if (existing.length >= 5) throw new AppError('Too many connections.', 429)
            wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, user, roomId))
        } catch (error) {
            const status = error instanceof AppError ? error.status : 500
            socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`)
        }
    })
    wss.on('connection', (ws, req, user, roomId) => {
        ws.userId = user.id
        ws.voiceId = randomUUID()
        ws.voiceName = user.name
        ws.token = sessionToken(req)
        ws.alive = true
        let count = 0
        let windowStart = Date.now()
        let audioCount = 0
        let audioWindow = Date.now()
        ws.on('error', () => {})
        ws.on('pong', () => { ws.alive = true })
        ws.on('close', () => { leaveVoice(ws, roomId); rooms.disconnect(roomId, ws) })
        ws.on('message', (raw, binary) => {
            try {
                if (!auth.fromRequest(req)) return ws.close(4001, 'Please sign in again.')
                const now = Date.now()
                const room = rooms.get(roomId)
                rooms.requireMember(room, user.id)
                if (binary) {
                    if (!ws.voice || raw.length !== 3200) return
                    if (now - audioWindow >= 10000) { audioCount = 0; audioWindow = now }
                    if (++audioCount > 120) return ws.close(1008, 'Too much audio.')
                    const frame = Buffer.concat([Buffer.from(ws.voiceId, 'ascii'), raw])
                    for (const peer of rooms.connections.get(roomId) || []) {
                        if (peer !== ws && peer.voice && peer.readyState === WebSocket.OPEN && peer.bufferedAmount < 128 * 1024) peer.send(frame, { binary: true })
                    }
                    return
                }
                if (now - windowStart >= 10000) { count = 0; windowStart = now }
                if (++count > 60) return ws.close(1008, 'Too many commands.')
                const message = JSON.parse(raw.toString())
                if (!message || typeof message !== 'object' || !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) {
                    throw new AppError('Invalid command.')
                }
                switch (message.action) {
                    case 'startRound': rooms.start(room, user.id, message.payload); break
                    case 'submitWord': rooms.submit(room, user.id, message.payload); sendState(ws, room); break
                    case 'reviewWord': rooms.reviewWord(room, user.id, message.payload); break
                    case 'claimHost': rooms.claimHost(room, user.id); break
                    case 'voiceJoin':
                        if ([...(rooms.connections.get(roomId) || [])].filter(peer => peer.voice).length >= 8 && !ws.voice) throw new AppError('Voice chat is full (8 connections).', 409)
                        ws.voice = true
                        voicePresence(roomId)
                        break
                    case 'voiceLeave': leaveVoice(ws, roomId); break
                    case 'sync': rooms.finishIfDue(room); sendState(ws, room); break
                    case 'leaveRoom':
                        leaveVoice(ws, roomId)
                        rooms.leave(room, user.id)
                        for (const connection of rooms.connections.get(roomId) || []) {
                            if (connection.userId === user.id) connection.close(4002, 'Left room.')
                        }
                        break
                    default: throw new AppError('Unknown command.')
                }
            } catch (error) {
                send(ws, { action: 'error', payload: { message: error instanceof AppError ? error.message : 'Invalid command.' } })
            }
        })
        rooms.join(roomId, user, ws)
    })
    const tick = setInterval(() => rooms.tick(), 250)
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (!ws.alive) { ws.terminate(); continue }
            if (!store.session(digest(ws.token))) { ws.close(4001, 'Please sign in again.'); continue }
            ws.alive = false
            ws.ping()
        }
    }, 15000)
    tick.unref()
    heartbeat.unref()

    async function close() {
        clearInterval(tick)
        clearInterval(heartbeat)
        const socketsClosed = new Promise(resolve => wss.close(resolve))
        for (const ws of wss.clients) ws.terminate()
        await socketsClosed
        if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        store.close()
    }
    return { app, server, store, auth, rooms, close, config }
}

if (require.main === module) {
    const instance = createApplication()
    instance.server.listen(instance.config.port, () => {
        console.log(`Woggle listening at ${instance.config.publicUrl}`)
        if (!instance.config.smtp.host) console.log(`Development reset emails are written to ${path.join(instance.config.dataDir, 'outbox')}`)
    })
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => instance.close().then(() => process.exit(0)))
}

module.exports = { createApplication }
