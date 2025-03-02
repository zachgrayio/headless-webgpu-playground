import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],

        launchOptions: {
          // executablePath: process.env.CHROME_EXECUTABLE,
          args: [
            '--headless=new',

            // disable gpu blocklist for testing
            '--ignore-gpu-blocklist',
            // bypass security restrictions for testing
            '--no-sandbox',
            // treat about:blank as secure
            '--unsafely-treat-insecure-origin-as-secure="about:blank"',
            // set window dimensions
            '--window-size=1600,1200',
            // gpu acceleration settings
            '--enable-gpu',
            '--enable-gpu-rasterization',
            '--gpu-no-context-lost',
            '--disable-gpu-sandbox',
            '--disable-software-rasterizer',
            '--use-cmd-decoder=passthrough',
            '--disable-gpu-watchdog',
            '--force-high-performance-gpu',
            '--enable-zero-copy',
            // graphics api settings
            '--use-gl=angle',
            '--use-angle=vulkan',
            '--use-vulkan=native',
            '--enable-features=Ozone,Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,WebGPU',
            '--disable-vulkan-surface',
            // webgpu settings
            '--enable-unsafe-webgpu',
            '--enable-dawn-features=disable_robustness,disable_dawn_validation,skip_validation,allow_unsafe_apis,dawn_disable_timing_queries',
          ],
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
