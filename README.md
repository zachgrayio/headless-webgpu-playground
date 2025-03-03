# headless-webgpu-playground

Exploring the settings needed to get headless WebGPU working on NVIDIA hardware, and the performance of WebGPU shaders under frameworks like puppeteer and playwright.

## Usage

- `npm run test:puppeteer` - runs the puppeteer tests that will check the `chrome://gpu` page for expected settings, and save a screenshot of the page
- `npm run test:webgpu` - run the playwright tests that render a few things that require working WebGPU, as well as validate that `navigator.gpu` is present. This also will run some matrix math on the GPU and dump a FLOPS estimate, to show what kind of performance WebGPU is capable of on the current machine.
- NOTE: if the test times out on your hardware, remove some of the larger `shapes` from the GEMM benchark so it doesn't pass the default 30s timeout threshold, or raise the timeout.

## GPU status

With the checked in configuration, `chrome://gpu` reports the following on my machine (Nvidia 4090, ubuntu, cuda sdk, drivers and nvidia-smi etc all working):

![image](https://github.com/user-attachments/assets/07249d11-bfd0-4dd2-866a-698b772f5cc5)

Contrary to some guides, using the flag `--use-gl=egl` or `gl` or similar to get the `chrome://gpu` page to show WebGL and WebGPU as fully hardware accelerated actually will break the availability of `navigator.gpu` because the GL backend isn't fully compatible yet, so mileage may vary with that approach.

## Results & GEMM Performance on RTX 4090

Again on my 4090, I'm seeing the following output from the `sgemm` benchmark on WebGPU:

```
npm run test:webgpu

> headless-gpu@1.0.0 test:webgpu
> playwright test webgpu.spec.ts


Running 4 tests using 4 workers
[chromium] › tests/webgpu.spec.ts:48:7 › WebGPU tests › should get WebGL device info
WebGL Device Info: {
  vendor: 'Google Inc. (NVIDIA)',
  renderer: 'ANGLE (NVIDIA, Vulkan 1.3.277 (NVIDIA NVIDIA GeForce RTX 4090 (0x00002684)), NVIDIA)',
  version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
  shadingLanguageVersion: 'WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)'
}
[chromium] › tests/webgpu.spec.ts:23:7 › WebGPU tests › should have gpu on navigator
GPU Adapter info: {
  isFallbackAdapter: false,
  features: [
    'depth32float-stencil8',
    'rg11b10ufloat-renderable',
    'bgra8unorm-storage',
    'chromium-experimental-multi-draw-indirect',
    'texture-compression-bc',
    'dual-source-blending',
    'chromium-experimental-snorm16-texture-formats',
    'chromium-experimental-timestamp-query-inside-passes',
    'float32-filterable',
    'indirect-first-instance',
    'float32-blendable',
    'depth-clip-control',
    'timestamp-query',
    'chromium-experimental-unorm16-texture-formats',
    'clip-distances',
    'subgroups'
  ],
  limits: {}
}
[chromium] › tests/webgpu.spec.ts:89:7 › WebGPU tests › should perform WebGPU matmul
WebGPU gemms completed:  {
  "gemmResults": [
    ...
    {
      "success": true,
      "averageTimeMs": 419.3766666666915,
      "flops": 640.0820010650349,
      "sampleValues": [
        2031.99755859375,
        2064.060302734375,
        2070.109130859375,
        2069.388671875
      ],
      "shape": [
        4096,
        4096,
        8000
      ],
      "launchParams": {
        "dispatchX": 512,
        "dispatchY": 512,
        "workgroupSizeX": 8,
        "workgroupSizeY": 8
      }
    }
  ]
}
  4 passed (23.6s)

```
And in `nvtop`: 
![image](https://github.com/user-attachments/assets/a5642c3e-4f1e-4648-85ae-250a84ee08a7)

## MacOS CPU

See [this branch](https://github.com/zachgrayio/headless-webgpu-playground/tree/mac-cpu) to get this running on macOS and CPU via swiftshader. Compared to my 4090:
- the 4090 completes the matmul benchmark at around 0.64 TFLOPS, not great, but good enough for my purposes
- an M4 Max chip running with Swiftshader & CPU gets 0.0112 TFLOPS

So the real GPU is around 56x faster for this workload.
