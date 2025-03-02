# headless-webgpu-playground

## Usage

- `npm run test:puppeteer` - runs the puppeteer tests that will check the `chrome://gpu` page for expected settings, and save a screenshot of the page
- `npm run test:webgpu` - run the playwright tests that render a few things that require working WebGPU, as well as validate that `navigator.gpu` is present. This also will run some matrix math on the GPU and dump a FLOPS estimate, to show what kind of performance WebGPU is capable of on the current machine.

## GPU status

With the checked in configuration, `chrome://gpu` reports the following on my machine (Nvidia 4090, ubuntu, cuda sdk, drivers and nvidia-smi etc all working):

![image](https://github.com/user-attachments/assets/07249d11-bfd0-4dd2-866a-698b772f5cc5)

Contrary to some guides, using the flag `--use-gl=egl` or `gl` or similar to get the `chrome://gpu` page to show WebGL and WebGPU as fully hardware accelerated actually will break the availability of `navigator.gpu` because the GL backend isn't fully compatible yet, so mileage may vary with that approach.

## Performance

Again on my 4090 I'm seeing the following output from the `sgemm` benchmark on WebGPU:

```
[
  {
    "success": true,
    "averageTimeMs": 2.3100000001490115,
    "flops": 0.22696450214986133,
    "sampleValues": {
      "0": 15.472850799560547,
      "1": 13.9146728515625,
      "2": 14.548881530761719,
      "3": 14.497349739074707
    },
    "shape": [
      64,
      64,
      64
    ]
  },
  {
    "success": true,
    "averageTimeMs": 3.65,
    "flops": 9.19299506849315,
    "sampleValues": {
      "0": 67.73794555664062,
      "1": 66.70209503173828,
      "2": 62.81159210205078,
      "3": 68.3356704711914
    },
    "shape": [
      256,
      256,
      256
    ]
  },
  {
    "success": true,
    "averageTimeMs": 10.009999999962748,
    "flops": 214.53383096982935,
    "sampleValues": {
      "0": 252.95870971679688,
      "1": 259.64569091796875,
      "2": 263.2388000488281,
      "3": 258.0788269042969
    },
    "shape": [
      1024,
      1024,
      1024
    ]
  },
  {
    "success": true,
    "averageTimeMs": 249.5800000000745,
    "flops": 550.680957897103,
    "sampleValues": {
      "0": 1031.1014404296875,
      "1": 1066.0184326171875,
      "2": 1055.2919921875,
      "3": 1062.053955078125
    },
    "shape": [
      4096,
      4096,
      4096
    ]
  }
]
```
