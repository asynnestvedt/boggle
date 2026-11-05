'use strict'
// Exercise the actual API and mailer with an isolated in-memory account and Resend's test mailbox.
const { readFileSync } = require('node:fs')
const { once } = require('node:events')
const { createApplication } = require('/opt/woggle/server')
const configuration = require('/opt/woggle/server/config/config')
const Store = require('/opt/woggle/server/lib/store')
const createMailer = require('/opt/woggle/server/lib/mailer')
function envFile(filename) {
    return Object.fromEntries(readFileSync(filename, 'utf8').trim().split(/\r?\n/).map(line => {
        const i = line.indexOf('=')
        return [line.slice(0, i), line.slice(i + 1)]
    }))
}
async function main() {
    const config = configuration({ ...envFile('/etc/woggle.env'), ...envFile('/etc/woggle-smtp.env') })
    const mailer = createMailer(config)
    let sent = false
    const instance = createApplication({ config, store: new Store(':memory:'), sendResetEmail: async (...args) => {
        const result = await mailer(...args)
        sent = true
        console.log('Resend accepted test message:', result.response)
    } })
    try {
        instance.server.listen(0, '127.0.0.1')
        await once(instance.server, 'listening')
        const base = `http://127.0.0.1:${instance.server.address().port}`
        const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const register = await post('/api/auth/register', { name: 'Delivery test', email: 'delivered@resend.dev', password: 'temporary test password' })
        if (register.status !== 201) throw new Error(`Registration test failed: ${register.status}`)
        const reset = await post('/api/auth/forgot-password', { email: 'delivered@resend.dev' })
        if (reset.status !== 200 || !sent) throw new Error('Reset email was not accepted by SMTP.')
        console.log('Isolated password-reset API flow passed.')
    } finally { await instance.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
