# headless-webgpu-playground

Exploring the settings needed to get headless WebGPU working on NVIDIA hardware, and the performance of WebGPU shaders under frameworks like puppeteer and playwright.

## Usage

- `npm run test:puppeteer` - runs the puppeteer tests that will check the `chrome://gpu` page for expected settings, and save a screenshot of the page
- `npm run test:webgpu` - run the playwright tests that render a few things that require working WebGPU, as well as validate that `navigator.gpu` is present. This also will run some matrix math on the GPU and dump a FLOPS estimate, to show what kind of performance WebGPU is capable of on the current machine.

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
WebGPU matmuls done:  [
  {
    "success": true,
    "averageTimeMs": 1.6333333333333333,
    "flops": 0.32099265306122454,
    "sampleValues": {
      "0": 20.75855827331543,
      "1": 16.7813720703125,
      "2": 17.734426498413086,
      "3": 15.489055633544922
    },
    "shape": [
      64,
      64,
      64
    ]
  },
  {
    "success": true,
    "averageTimeMs": 3.896666666679084,
    "flops": 8.611060393471275,
    "sampleValues": {
      "0": 64.46620178222656,
      "1": 60.390655517578125,
      "2": 62.5800666809082,
      "3": 63.98574447631836
    },
    "shape": [
      256,
      256,
      256
    ]
  },
  {
    "success": true,
    "averageTimeMs": 11.800000000007762,
    "flops": 181.99013966089726,
    "sampleValues": {
      "0": 266.7172546386719,
      "1": 266.0361328125,
      "2": 274.69879150390625,
      "3": 266.9803771972656
    },
    "shape": [
      1024,
      1024,
      1024
    ]
  },
  {
    "success": true,
    "averageTimeMs": 237.08333333334886,
    "flops": 579.7073608660428,
    "sampleValues": {
      "0": 1039.3314208984375,
      "1": 1040.7728271484375,
      "2": 1027.8123779296875,
      "3": 1027.906005859375
    },
    "shape": [
      4096,
      4096,
      4096
    ]
  },
  {
    "success": true,
    "averageTimeMs": 411.37999999998135,
    "flops": 652.524323010385,
    "sampleValues": {
      "0": 2041.892333984375,
      "1": 2035.90771484375,
      "2": 2065.724365234375,
      "3": 2040.863037109375
    },
    "shape": [
      4096,
      4096,
      8000
    ]
  }
]
  4 passed (23.6s)

```
And in `nvtop`: 
![image](https://github.com/user-attachments/assets/a5642c3e-4f1e-4648-85ae-250a84ee08a7)
