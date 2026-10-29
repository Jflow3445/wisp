const { defineConfig } = require('../../nister-org/node_modules/@playwright/test');
module.exports = defineConfig({
  testDir: '.', testMatch: 'ui.spec.cjs', timeout: 45000, workers: 1,
  outputDir: '../../artifacts/spin/playwright',
  reporter: [['list']],
  use: { baseURL: process.env.SPIN_TEST_BASE_URL || 'http://127.0.0.1:8037', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 1100 } } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }]
});
