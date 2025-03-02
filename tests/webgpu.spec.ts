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
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.error('No adapter found');
        return null;
      }
      return {
        isFallbackAdapter: adapter.isFallbackAdapter,
        features: Array.from(adapter.features).map(f => f.toString()),
        limits: Object.fromEntries(
          Object.entries(adapter.limits).map(([key, value]) => [key, value]),
        ),
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
        const gl =
          canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          (canvas.getContext('experimental-webgl') as WebGLRenderingContext);

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

  test('should perform WebGPU matmul', async ({ page }) => {
    await _gotoWebGpuSamples(page);

    const result = await page.evaluate(async () => {
      if (!navigator.gpu) {
        return { error: 'WebGPU not supported' };
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return { error: 'No adapter found' };
      }

      const device = await adapter.requestDevice();
      if (!device) {
        return { error: 'No device found' };
      }

      /**
       * disclaimer: this is a partially generated and unverified webgpu sgemm
       * @param m
       * @param n
       * @param k
       * @param alpha
       * @param a
       * @param b
       * @returns
       */
      async function sgemm(
        m: number,
        n: number,
        k: number,
        alpha: number,
        a: Float32Array,
        b: Float32Array,
      ): Promise<Float32Array> {
        const aBuffer = device.createBuffer({
          size: a.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const bBuffer = device.createBuffer({
          size: b.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const resultBuffer = device.createBuffer({
          size: Float32Array.BYTES_PER_ELEMENT * m * n,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const readbackBuffer = device.createBuffer({
          size: Float32Array.BYTES_PER_ELEMENT * m * n,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // Write data to buffers
        device.queue.writeBuffer(aBuffer, 0, a);
        device.queue.writeBuffer(bBuffer, 0, b);

        // Create compute shader
        const shaderCode = `
          @group(0) @binding(0) var<storage, read> a: array<f32>;
          @group(0) @binding(1) var<storage, read> b: array<f32>;
          @group(0) @binding(2) var<storage, read_write> result: array<f32>;

          struct Params {
            m: u32,
            n: u32,
            k: u32,
            alpha: f32,
          }
          @group(0) @binding(3) var<uniform> params: Params;

          @compute @workgroup_size(8, 8)
          fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let row = global_id.x;
            let col = global_id.y;

            if (row >= params.m || col >= params.n) {
              return;
            }

            var sum = 0.0;

            for (var i = 0u; i < params.k; i = i + 4u) {
              let a_row_offset = row * params.k;
              let b_col_offset = col;

              if (i + 3u < params.k) {
                let a0 = a[a_row_offset + i];
                let a1 = a[a_row_offset + i + 1u];
                let a2 = a[a_row_offset + i + 2u];
                let a3 = a[a_row_offset + i + 3u];

                let b0 = b[(i) * params.n + b_col_offset];
                let b1 = b[(i + 1u) * params.n + b_col_offset];
                let b2 = b[(i + 2u) * params.n + b_col_offset];
                let b3 = b[(i + 3u) * params.n + b_col_offset];

                sum = sum + a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
              } else {
                for (var j = i; j < params.k; j = j + 1u) {
                  sum = sum + a[a_row_offset + j] * b[j * params.n + b_col_offset];
                }
              }
            }

            result[row * params.n + col] = sum * params.alpha;
          }
        `;

        const shaderModule = device.createShaderModule({
          code: shaderCode,
        });
        const paramsBuffer = device.createBuffer({
          size: 4 * 4, // 4 u32/f32 values
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const paramsData = new ArrayBuffer(4 * 4);
        const paramsView = new DataView(paramsData);
        paramsView.setUint32(0, m, true);
        paramsView.setUint32(4, n, true);
        paramsView.setUint32(8, k, true);
        paramsView.setFloat32(12, alpha, true);
        device.queue.writeBuffer(paramsBuffer, 0, paramsData);

        const bindGroupLayout = device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.COMPUTE,
              buffer: { type: 'read-only-storage' },
            },
            {
              binding: 1,
              visibility: GPUShaderStage.COMPUTE,
              buffer: { type: 'read-only-storage' },
            },
            {
              binding: 2,
              visibility: GPUShaderStage.COMPUTE,
              buffer: { type: 'storage' },
            },
            {
              binding: 3,
              visibility: GPUShaderStage.COMPUTE,
              buffer: { type: 'uniform' },
            },
          ],
        });

        const computePipeline = device.createComputePipeline({
          layout: device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
          }),
          compute: {
            module: shaderModule,
            entryPoint: 'main',
          },
        });

        const bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: aBuffer } },
            { binding: 1, resource: { buffer: bBuffer } },
            { binding: 2, resource: { buffer: resultBuffer } },
            { binding: 3, resource: { buffer: paramsBuffer } },
          ],
        });

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(computePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(m / 8), Math.ceil(n / 8));
        passEncoder.end();

        commandEncoder.copyBufferToBuffer(
          resultBuffer,
          0,
          readbackBuffer,
          0,
          Float32Array.BYTES_PER_ELEMENT * m * n,
        );

        device.queue.submit([commandEncoder.finish()]);

        await readbackBuffer.mapAsync(GPUMapMode.READ);
        const resultArray = new Float32Array(readbackBuffer.getMappedRange());
        const result = new Float32Array(m * n);
        result.set(resultArray);
        readbackBuffer.unmap();

        return result;
      }

      function makeRandom(length: number): Float32Array {
        const array = new Float32Array(length);
        for (let i = 0; i < length; i++) {
          array[i] = 0.01 + 0.99 * Math.random();
        }
        return array;
      }

      try {
        // run benchmarks of the sgemm with various shapes to measure webgpu performance
        const shapes = [
          [64, 64, 64],
          [256, 256, 256],
          [1024, 1024, 1024],
          [4096, 4096, 4096],
          // this shape about as large as I can go before the operation returns 0s
          // in the result array, which is a sign WebGPU is failing, probably a
          // timeout issue somewhere
          [4096, 4096, 8000],
        ];
        const alpha = 1.0;
        const runs = 30;
        let shapeResults: any[] = [];

        for (const [m, n, k] of shapes) {
          const array_a = makeRandom(m * k);
          const array_b = makeRandom(k * n);
          // warmup
          await sgemm(m, n, k, alpha, array_a, array_b);
          let timeSum = 0;
          let retSum = 0;
          let lastResult;

          for (let i = 0; i < runs; i++) {
            console.time('sgemm');
            const sgemmStartTime = performance.now(); //ms
            const runResult = await sgemm(m, n, k, alpha, array_a, array_b);
            lastResult = runResult;
            retSum += runResult[0];
            const sgemmEndTime = performance.now();
            console.timeEnd('sgemm');
            timeSum += sgemmEndTime - sgemmStartTime;
          }
          const avgTime = timeSum / runs;
          const flops = (m * n * k * 2 * 1000) / avgTime / 1000000000;
          shapeResults.push({
            success: true,
            averageTimeMs: avgTime,
            flops: flops,
            sampleValues: lastResult ? lastResult.slice(0, 4) : [],
            shape: [m, n, k],
          });
        }
        return shapeResults;
      } catch (err) {
        console.error(err);
        return { error: err.toString() };
      }
    });

    console.log('WebGPU matmuls done: ', JSON.stringify(result, null, 2));
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
