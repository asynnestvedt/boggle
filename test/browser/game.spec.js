const { test: base, expect } = require('@playwright/test')
const { once } = require('node:events')
const { fork } = require('node:child_process')
const path = require('node:path')

const test = base.extend({
    game: async ({}, use) => {
        const mail = []
        const child = fork(path.join(__dirname, 'server.cjs'), [], { execArgv: [] })
        const pending = new Map()
        let sequence = 0
        let ready
        const started = new Promise(resolve => { ready = resolve })
        child.on('message', message => {
            if (message.mail) mail.push(message.mail)
            if (message.url) ready(message.url)
            if (message.id) { pending.get(message.id)?.(); pending.delete(message.id) }
        })
        const command = (action, values = {}) => new Promise(resolve => {
            const id = ++sequence
            pending.set(id, resolve)
            child.send({ id, action, ...values })
        })
        try {
            await use({ url: await started, mail, advance: milliseconds => command('advance', { milliseconds }), dropConnections: () => command('dropConnections') })
        } finally {
            const closed = once(child, 'exit')
            child.send({ action: 'close' })
            await closed
        }
    }
})

async function register(page, url, name, email) {
    await page.goto(url)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await page.getByLabel('Display name').fill(name)
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('New password').fill('browser password 1234')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.locator('#connection-status')).toHaveText('Connected')
}

test('typing a display name keeps the signup form responsive', async ({ page, game }) => {
    const errors = []
    let crashed = false
    page.on('pageerror', error => errors.push(error.message))
    page.on('crash', () => { crashed = true })
    await page.goto(game.url)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await page.evaluate(() => {
        window.clockMutations = 0
        new MutationObserver(records => { window.clockMutations += records.length })
            .observe(document.querySelector('#round-clock'), { childList: true, subtree: true, characterData: true })
    })
    const name = page.getByLabel('Display name')
    await name.pressSequentially('Alan Example', { delay: 20 })
    await expect(name).toHaveValue('Alan Example')
    await expect(name).toBeFocused()
    expect(await page.evaluate(() => window.clockMutations)).toBe(0)
    await page.getByLabel('Email', { exact: true }).fill('typing@browser.test')
    await page.getByLabel('New password').fill('browser password 1234')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.locator('#connection-status')).toHaveText('Connected')
    expect(crashed).toBe(false)
    expect(errors).toEqual([])
})

test('two players share a round; reload, outage recovery, deadline, and next round work', async ({ browser, game }, info) => {
    const hostContext = await browser.newContext()
    const guestContext = await browser.newContext()
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()
    const errors = []
    host.on('pageerror', error => errors.push(error.message))
    guest.on('pageerror', error => errors.push(error.message))
    try {
        await register(host, game.url, 'Host', 'host@browser.test')
        const roomUrl = host.url()
        await register(guest, roomUrl, 'Guest', 'guest@browser.test')
        await expect(host.locator('#bggl-people-count')).toHaveText('2')
        await expect(guest.locator('#settings')).toBeHidden()
        await host.getByText('4 by 4', { exact: true }).click()
        await host.getByText('1 min', { exact: true }).click()
        await host.getByRole('button', { name: 'Start round', exact: true }).click()
        await expect(host.locator('#board .die')).toHaveCount(16)
        await expect(guest.locator('#board .die')).toHaveCount(16)
        await host.getByRole('button', { name: /Room and players/ }).click()
        await expect(host.locator('#recent-groups-list')).toContainText('Guest')
        await expect(host.getByRole('button', { name: 'Copy invite for Guest' })).toBeVisible()
        await host.getByRole('button', { name: /Room and players/ }).click()
        expect(await host.locator('#board').innerText()).toEqual(await guest.locator('#board').innerText())
        for (let position = 0; position < 3; position++) await host.locator('#board .die').nth(position).click()
        await host.getByRole('button', { name: 'Save CAT', exact: true }).click()
        await expect(host.locator('#my-words')).toContainText('CAT')
        await expect(guest.locator('#my-words')).not.toContainText('CAT')
        const id = await host.evaluate(() => window.app.state.round.id)
        await host.reload()
        await expect(host.locator('#connection-status')).toHaveText('Connected')
        await expect(host.locator('#my-words')).toContainText('CAT')
        expect(await host.evaluate(() => window.app.state.round.id)).toEqual(id)
        // Exercise automatic reconnection after a dropped transport.
        await game.dropConnections()
        await expect(host.locator('#connection-status')).toHaveText('Connected', { timeout: 10000 })
        await expect(guest.locator('#connection-status')).toHaveText('Connected', { timeout: 10000 })
        await host.screenshot({ path: info.outputPath('desktop-round.png'), fullPage: true })
        await game.advance(61000)
        await expect(host.locator('#round-clock')).toHaveText('Round finished')
        await expect(guest.locator('#round-clock')).toHaveText('Round finished')
        await expect(host.locator('#score-list')).toContainText('Host: 1 points')
        await expect(guest.locator('#score-list')).toContainText('Host: 1 points')
        await host.getByRole('button', { name: 'Exclude CAT (1 points)', exact: true }).click()
        await expect(guest.locator('#score-list')).toContainText('Host: 0 points')
        await host.getByRole('button', { name: 'Restore CAT (1 points)', exact: true }).click()
        await expect(guest.locator('#score-list')).toContainText('Host: 1 points')
        await host.getByRole('button', { name: 'Start round', exact: true }).click()
        await expect(host.locator('#round-clock')).not.toHaveText('Round finished')
        await expect(host.locator('#my-words')).not.toContainText('CAT')
        expect(errors).toEqual([])
    } finally { await hostContext.close(); await guestContext.close() }
})

test('signup, signout, forgot/reset password, invalid room recovery, and mobile board', async ({ page, game }, info) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 390, height: 844 })
    await register(page, game.url, '<img src=x onerror=alert(1)>', 'mobile@browser.test')
    await expect(page.locator('#roster')).toContainText('<img src=x onerror=alert(1)>')
    expect(await page.locator('#roster img').count()).toBe(0)
    await page.getByRole('button', { name: 'Start round', exact: true }).click()
    await expect(page.locator('#board .die')).toHaveCount(25)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
    await page.screenshot({ path: info.outputPath('mobile-round.png'), fullPage: true })
    // Sign out with a selection, which previously caused stale selection errors on a new session.
    await page.locator('#board .die').nth(0).click()
    await page.getByLabel('Account menu').click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill('mobile@browser.test')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.locator('#account [role="status"]')).toContainText('If an account exists')
    expect(game.mail.length).toBe(1)
    // A reset link can be opened as a fragment navigation in an already-open tab.
    await page.evaluate(() => history.replaceState(null, '', '/'))
    await page.goto(`${game.url}/#reset=${game.mail[0].token}`)
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    expect(page.url()).not.toContain('reset=')
    await page.getByLabel('New password').fill('new browser password')
    await page.getByRole('button', { name: 'Set new password' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in to play' })).toBeVisible()
    await page.getByLabel('Email', { exact: true }).fill('mobile@browser.test')
    await page.getByLabel('Password', { exact: true }).fill('new browser password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.locator('#connection-status')).toHaveText('Connected')
    await page.goto(`${game.url}/?room=does-not-exist`)
    await expect(page.locator('#game-message')).toContainText('expired')
    await page.getByRole('button', { name: 'New room', exact: true }).click()
    await expect(page.locator('#connection-status')).toHaveText('Connected')
    await page.getByLabel('Account menu').click()
    await page.getByRole('button', { name: 'Change password', exact: true }).click()
    await page.getByLabel('Current password').fill('new browser password')
    await page.getByLabel('New password').fill('changed browser password')
    await page.locator('#account-form').getByRole('button', { name: 'Change password', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Sign in to play' })).toBeVisible()
    expect(errors).toEqual([])
})

test('a stale reconnect response cannot sign a player out after switching rooms', async ({ page, game }) => {
    await register(page, game.url, 'Switch rooms', 'switch@browser.test')
    const original = page.url()
    let heldRoute
    await page.route('**/api/session', route => { heldRoute = route })
    await game.dropConnections()
    await expect.poll(() => Boolean(heldRoute)).toBe(true)
    await page.getByRole('button', { name: 'New room', exact: true }).click()
    await expect(page.locator('#connection-status')).toHaveText('Connected')
    expect(page.url()).not.toEqual(original)
    const response = page.waitForResponse('**/api/session')
    await heldRoute.fulfill({ json: { user: null } })
    await response
    await page.unroute('**/api/session')
    // A fresh sync response proves the new room's connection remains authenticated.
    await page.evaluate(() => window.app.connection.send('sync', {}))
    await expect(page.locator('#account-name')).toContainText('Switch rooms')
    await expect(page.locator('#connection-status')).toHaveText('Connected')
    await expect(page.locator('#settings')).toBeVisible()
})

test('room voice joins, sends audio, mutes, and releases the microphone', async ({ browser, game }) => {
    const first = await browser.newContext({ permissions: ['microphone'] })
    const second = await browser.newContext({ permissions: ['microphone'] })
    const host = await first.newPage()
    const guest = await second.newPage()
    try {
        await register(host, game.url, 'Voice host', 'voice-host@browser.test')
        await register(guest, host.url(), 'Voice guest', 'voice-guest@browser.test')
        for (const page of [host, guest]) {
            await page.getByRole('button', { name: 'Voice chat settings' }).click()
            await page.getByRole('button', { name: 'Join voice' }).click()
            await expect(page.locator('#voice-status')).toHaveText('Connected to room voice.')
        }
        await expect(host.locator('#voice-members')).toContainText('Voice guest')
        await expect.poll(() => guest.evaluate(() => window.app.voice.queues.size)).toBeGreaterThan(0)
        await host.getByLabel('Mute microphone').check()
        expect(await host.evaluate(() => window.app.voice.stream.getAudioTracks()[0].enabled)).toBe(false)
        await host.getByLabel('Mute incoming audio').check()
        expect(await host.evaluate(() => window.app.voice.audio.volume)).toBe(0)
        await host.getByRole('button', { name: 'Leave voice' }).click()
        await expect(host.locator('#voice-status')).toHaveText('Voice chat is off.')
        expect(await host.evaluate(() => window.app.voice.stream)).toBe(null)
        await expect(guest.locator('#voice-members')).not.toContainText('Voice host')
    } finally { await first.close(); await second.close() }
})

test('Letterlight supports keyboard play and restores daily progress', async ({ page, game }, info) => {
    await page.goto(`${game.url}/letterlight/`)
    await expect(page.locator('#signin')).toBeVisible()
    await page.getByRole('link', { name: /Sign in to play/ }).click()
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await page.getByLabel('Display name').fill('Puzzle player')
    await page.getByLabel('Email', { exact: true }).fill('puzzle@browser.test')
    await page.getByLabel('New password').fill('browser password 1234')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page).toHaveURL(/\/letterlight\//)
    await expect(page.locator('#message')).toContainText('Type a five-letter')
    await page.keyboard.type('CRANE')
    await page.keyboard.press('Enter')
    await expect(page.locator('#attempts')).toHaveText('1 / 6 tries')
    await expect(page.locator('.tile').first()).toHaveText('C')
    await page.screenshot({ path: info.outputPath('letterlight-desktop.png'), fullPage: true })
    await page.reload()
    await expect(page.locator('#attempts')).toHaveText('1 / 6 tries')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: info.outputPath('letterlight-mobile.png'), fullPage: true })
    await expect(page.getByRole('button', { name: 'How to play' })).toBeVisible()
})
