'use strict'

const nodemailer = require('nodemailer')
const { mkdir, writeFile } = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const path = require('node:path')

function createMailer(config) {
    const transport = config.smtp.host ? nodemailer.createTransport({
        ...config.smtp, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        disableFileAccess: true, disableUrlAccess: true
    }) : null
    return async (email, token) => {
        const link = new URL(config.publicUrl)
        link.pathname = '/woggle/'
        link.hash = `reset=${token}`
        const message = {
            from: config.mailFrom, to: email, subject: 'Reset your Woggle password',
            text: `Reset your password using this link:\n\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.`
        }
        if (transport) return transport.sendMail(message)
        const directory = path.join(config.dataDir, 'outbox')
        await mkdir(directory, { recursive: true })
        await writeFile(path.join(directory, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(message, null, 2), { mode: 0o600 })
    }
}

module.exports = createMailer
