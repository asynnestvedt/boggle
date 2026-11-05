'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, readdir, readFile, rm } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const configuration = require('../config/config')
const createMailer = require('../lib/mailer')

test('development reset emails are written outside public files, using the configured origin', async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'boggle-mail-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const config = configuration({ APP_URL: 'http://localhost:3000', DATA_DIR: directory })
    await createMailer(config)('player@example.com', 'a'.repeat(64))
    const files = await readdir(path.join(directory, 'outbox'))
    assert.equal(files.length, 1)
    const message = JSON.parse(await readFile(path.join(directory, 'outbox', files[0]), 'utf8'))
    assert.equal(message.to, 'player@example.com')
    assert.ok(message.text.includes(`http://localhost:3000/woggle/#reset=${'a'.repeat(64)}`))
    assert.ok(!config.dataDir.startsWith(config.publicDir))
})
