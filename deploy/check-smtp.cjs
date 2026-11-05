'use strict'
const { readFileSync } = require('node:fs')
const nodemailer = require('/opt/woggle/node_modules/nodemailer')
const values = Object.fromEntries(readFileSync('/etc/woggle-smtp.env', 'utf8').trim().split(/\r?\n/).map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
}))
const transport = nodemailer.createTransport({ host: values.SMTP_HOST, port: Number(values.SMTP_PORT), secure: true,
    auth: { user: values.SMTP_USER, pass: values.SMTP_PASSWORD }, connectionTimeout: 10000 })
transport.verify().then(() => { console.log('SMTP TLS and authentication succeeded.'); transport.close() })
    .catch(error => { console.error('SMTP verification failed:', error.code || error.name); transport.close(); process.exitCode = 1 })
