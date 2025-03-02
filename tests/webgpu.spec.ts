/// <reference types="@webgpu/types" />

import { test, expect, Page } from '@playwright/test';
import exp from 'constants';
import * as fs from 'fs';
import * as path from 'path';

async function loadShader(filename): Promise<string> {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.join(process.cwd(), 'shaders', filename), 'utf8');
}

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
    // go to a real https page so WebGPU works, it doesn't seem to init on about:blank
    // even with security flags set?
    await _gotoWebGpuSamples(page);

    const shaderCode = await loadShader('matmul_fma.wgsl');
    expect(shaderCode).toBeTruthy();
    expect(shaderCode.length).toBeGreaterThan(10);

    type WebGPUSgemmBenchmarkResult = {
      success: true;
      averageTimeMs: number;
      flops: number;
      sampleValues: number[];
      shape: [number, number, number];
      launchParams: LaunchParams | undefined;
    };

    type SgemmResult = {
      result: Float32Array;
      launchParams: LaunchParams;
    };

    type WebGPUError = {
      error: string;
    };

    type LaunchParams = {
      dispatchX: number;
      dispatchY: number;
      workgroupSizeX: number;
      workgroupSizeY: number;
    };

    type WebGPUBenchmarkResult = {
      gemmResults: WebGPUSgemmBenchmarkResult[];
    };

    type Result = WebGPUBenchmarkResult | WebGPUError;

    const result = await page.evaluate(async (shaderCode): Promise<Result> => {
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
       * a simple sgemm implementation using WebGPU, shaders are loaded from shaders/*.wgsl
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
      ): Promise<SgemmResult> {
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

        device.queue.writeBuffer(aBuffer, 0, a);
        device.queue.writeBuffer(bBuffer, 0, b);
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
            module: device.createShaderModule({
              code: shaderCode,
            }),
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

        // attempt to get workgroup size from shader code dynamically
        let workgroupSizeX = 16;
        let workgroupSizeY = 8;
        const workgroupSizeMatch = shaderCode.match(
          /@compute\s+@workgroup_size\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/,
        );
        if (workgroupSizeMatch) {
          workgroupSizeX = parseInt(workgroupSizeMatch[1], 10);
          workgroupSizeY = parseInt(workgroupSizeMatch[2], 10);
        }
        const dispatchX = Math.ceil(m / workgroupSizeX);
        const dispatchY = Math.ceil(n / workgroupSizeY);
        passEncoder.dispatchWorkgroups(dispatchX, dispatchY);
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

        return {
          result: result,
          // include the computed launch parameters to aid in performance analysis
          launchParams: {
            dispatchX: dispatchX,
            dispatchY: dispatchY,
            workgroupSizeX: workgroupSizeX,
            workgroupSizeY: workgroupSizeY,
          },
        };
      }

      // simple LCG random number generator with seed, scaled to [0.01, 1.0] range
      function makeRandom(length: number, seed: number = 12345): Float32Array {
        const array = new Float32Array(length);
        let x = seed;
        for (let i = 0; i < length; i++) {
          x = (x * 48271) % 2147483647;
          array[i] = 0.01 + 0.99 * (x / 2147483647);
        }
        return array;
      }

      try {
        // run benchmarks of the sgemm with various shapes to measure webgpu performance.
        // Bench harness partiall borrowed from `milhidaka/webgpu-blas`
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
        const sampleSliceLen = 4;
        let shapeResults: WebGPUSgemmBenchmarkResult[] = [];

        for (const [m, n, k] of shapes) {
          const array_a = makeRandom(m * k);
          const array_b = makeRandom(k * n);
          // warmup
          await sgemm(m, n, k, alpha, array_a, array_b);
          let timeSum = 0;
          let retSum = 0;
          let lastResult;
          let launchParams: LaunchParams | undefined;

          for (let i = 0; i < runs; i++) {
            console.time('sgemm');
            const sgemmStartTime = performance.now(); //ms
            const runResult = await sgemm(m, n, k, alpha, array_a, array_b);
            lastResult = runResult.result;
            launchParams = runResult.launchParams;

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
            sampleValues: lastResult ? Array.from(lastResult.slice(0, sampleSliceLen)) : [],
            shape: [m, n, k],
            launchParams: launchParams,
          });
        }
        return {
          gemmResults: shapeResults,
        };
      } catch (err) {
        console.error(err);
        return { error: err.toString() };
      }
    }, shaderCode);

    if ('error' in result) {
      console.error('WebGPU sgemm error:', result.error);
    }
    expect('error' in result).toBe(false);

    const benchmarkResult = result as WebGPUBenchmarkResult;
    expect(Array.isArray(benchmarkResult.gemmResults)).toBe(true);
    expect(benchmarkResult.gemmResults.length).toBeGreaterThan(0);

    for (const benchmark of benchmarkResult.gemmResults) {
      expect(benchmark.success).toBe(true);
      expect(benchmark.averageTimeMs).toBeGreaterThan(0);
      expect(benchmark.flops).toBeGreaterThan(0);
      expect(benchmark.shape.length).toBe(3);
      expect(benchmark.sampleValues.length).toBeGreaterThan(0);

      // most critical test: ensure the sampled results are non-zero; if they are zero, the matmul failed.
      expect(benchmark.sampleValues.some(v => v !== 0)).toBe(true);
    }

    console.log('WebGPU gemms completed: ', JSON.stringify(result, null, 2));
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
