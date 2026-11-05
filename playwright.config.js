const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
    testDir: './test/browser',
    fullyParallel: false,
    workers: 1,
    timeout: 30000,
    use: {
        channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
        headless: true,
        launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
        viewport: { width: 1100, height: 1000 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    }
})
