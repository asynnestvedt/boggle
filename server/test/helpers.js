'use strict'

const { once } = require('node:events')
const { WebSocket } = require('ws')
const { createApplication } = require('../index')
const configuration = require('../config/config')
const Store = require('../lib/store')

async function launch(t, options = {}) {
    const mail = []
    const config = configuration({ PORT: '3000' })
    const instance = createApplication({
        config, store: new Store(':memory:'), sendResetEmail: async (email, token) => mail.push({ email, token }), ...options
    })
    instance.server.listen(0, '127.0.0.1')
    await once(instance.server, 'listening')
    config.publicUrl = `http://127.0.0.1:${instance.server.address().port}`
    t.after(() => instance.close())
    async function request(route, body, cookie, extra = {}) {
        const response = await fetch(config.publicUrl + route, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', Origin: config.publicUrl, ...(cookie ? { Cookie: cookie } : {}), ...extra },
            body: body === undefined ? undefined : JSON.stringify(body)
        })
        return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers }
    }
    async function register(email, name = 'Player') {
        const result = await request('/api/auth/register', { email, name, password: 'test password 1234' })
        if (result.status !== 201) throw new Error(JSON.stringify(result))
        return result
    }
    async function connect(roomId, cookie, query = '') {
        const ws = new WebSocket(config.publicUrl.replace('http', 'ws') + `/api/rooms/socket?room=${roomId}${query}`, { headers: { Cookie: cookie, Origin: config.publicUrl } })
        const messages = []
        const waiters = new Set()
        ws.on('message', (data, binary) => {
            const message = binary ? { action: 'audio', payload: data } : JSON.parse(data)
            messages.push(message)
            for (const waiter of waiters) waiter()
        })
        await once(ws, 'open')
        function waitFor(predicate) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { waiters.delete(check); reject(new Error('Timed out waiting for WebSocket state.')) }, 3000)
                function check() {
                    const found = messages.findIndex(predicate)
                    if (found === -1) return
                    const [message] = messages.splice(found, 1)
                    waiters.delete(check)
                    clearTimeout(timer)
                    resolve(message)
                }
                waiters.add(check)
                check()
            })
        }
        return {
            ws, messages, waitFor,
            state: async predicate => (await waitFor(message => message.action === 'state' && (!predicate || predicate(message.payload)))).payload,
            send: (action, payload = {}) => ws.send(JSON.stringify({ action, payload })),
            close: async () => { if (ws.readyState === WebSocket.CLOSED) return; const closed = once(ws, 'close'); ws.close(); await closed }
        }
    }
    return { ...instance, request, register, connect, mail }
}

module.exports = { launch }
