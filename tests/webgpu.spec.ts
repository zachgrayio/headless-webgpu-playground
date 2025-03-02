/// <reference types="@webgpu/types" />

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('WebGPU tests', () => {
  const resultsDir = path.join(process.cwd(), 'test-results/webgpu');
  test.beforeAll(async () => {
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
  });

  test('should render helloTriangle sample without console errors', async ({ page }) => {
    const p = await _gotoWebGpuSamples(page);
    await p.screenshot({
      path: path.join(resultsDir, 'helloTriangle.png'),
      fullPage: true,
    });
  });

  test('should have gpu on navigator', async ({ page }) => {
    await _gotoWebGpuSamples(page);
    const adapter = await page.evaluate(async () => {
      if (!navigator.gpu) {
        console.error('WebGPU not supported');
        return null;
      };
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.error('No adapter found');
        return null;
      };
      return {
        isFallbackAdapter: adapter.isFallbackAdapter,
        features: Array.from(adapter.features).map(f => f.toString()),
        limits: Object.fromEntries(
          Object.entries(adapter.limits).map(([key, value]) => [key, value])
        )
      };
    });

    console.log('GPU Adapter info:', adapter);
    expect(adapter).toBeTruthy();
  });

  test('should get WebGL device info', async ({ page }) => {
    await page.goto('about:blank');
    const glInfo = await page.evaluate(() => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') ||
                   canvas.getContext('webgl') ||
                   canvas.getContext('experimental-webgl') as WebGLRenderingContext;

        if (!gl) {
          return { error: 'WebGL not supported' };
        }

        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

        if (!debugInfo) {
          return {
            vendor: gl.getParameter(gl.VENDOR),
            renderer: gl.getParameter(gl.RENDERER),
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
          };
        }

        return {
          vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
          version: gl.getParameter(gl.VERSION),
          shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        };
      } catch (err) {
        return { error: err.toString() };
      }
    });

    console.log('WebGL Device Info:', glInfo);
    expect(glInfo).toBeTruthy();
    expect(glInfo.error).toBeUndefined();
  });

  async function _gotoWebGpuSamples(page: Page, sample: string = 'helloTriangle'): Promise<Page> {
    const consoleMessages: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') {
        consoleMessages.push(`${message.type()}: ${message.text()}`);
      }
    });
    await page.goto('https://webgpu.github.io/webgpu-samples/?sample=helloTriangle', {
      waitUntil: 'networkidle',
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(resultsDir, 'helloTriangle.png'),
      fullPage: true,
    });
    expect(consoleMessages.length).toBe(0);

    return page;
  }
});
