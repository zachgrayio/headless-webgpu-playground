const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Create results directory if it doesn't exist
const resultsDir = path.join(process.cwd(), 'test-results/puppeteer');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
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
    //dumpio: true,
  });

  const version = await browser.version();
  console.log('Browser version:', version);
  fs.writeFileSync(path.join(resultsDir, 'chrome-version.txt'), version);

  console.log('\n==> Checking WebGPU availability...');
  const webgpuPage = await browser.newPage();
  await webgpuPage.goto('https://webgpu.github.io/webgpu-samples/?sample=helloTriangle', {
    waitUntil: 'networkidle2',
  });

  const webgpuInfo = await webgpuPage.evaluate(() => {
    const detection = {
      navigatorGpu: 'gpu' in navigator,
      navigatorGpuDefined: typeof navigator.gpu !== 'undefined',
      windowGpu: 'gpu' in window,
      windowNavigatorGpu: 'gpu' in window.navigator,
      //navigatorProperties: Object.getOwnPropertyNames(Navigator.prototype),
      //navigatorOwnProps: Object.getOwnPropertyNames(navigator),
      userAgent: navigator.userAgent,
    };

    try {
      detection.canvasWebGPU = !!document.createElement('canvas').getContext('webgpu');
    } catch (e) {
      detection.canvasError = e.toString();
    }

    return detection;
  });

  console.log('WebGPU information:', webgpuInfo);
  fs.writeFileSync(path.join(resultsDir, 'webgpu.json'), JSON.stringify(webgpuInfo, null, 2));

  const webglInfo = await webgpuPage.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { webglSupported: false };

      const info = {
        webglSupported: true,
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        extensions: gl.getSupportedExtensions(),
      };

      const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugExt) {
        info.unmaskedVendor = gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL);
        info.unmaskedRenderer = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL);
      }

      return info;
    } catch (e) {
      return { error: e.toString() };
    }
  });

  console.log('WebGL information:', webglInfo);
  fs.writeFileSync(path.join(resultsDir, 'webgl.json'), JSON.stringify(webglInfo, null, 2));

  console.log('\n==> Checking chrome://gpu page...');
  const page = await browser.newPage();

  try {
    await page.goto('chrome://gpu');

    const txt = await page.waitForSelector('text/WebGPU');
    const status = await txt.evaluate(g => g.parentElement.textContent);
    console.log(status);

    await page.screenshot({ path: 'test-results/puppeteer/chrome-gpu-page.png' });
    await browser.close();
  } catch (e) {
    console.error('Error accessing chrome://gpu:', e);
    fs.writeFileSync(path.join(resultsDir, 'error.txt'), e.toString());
  }

  await browser.close();
  console.log('\nTest completed! Results saved to:', resultsDir);
})();
