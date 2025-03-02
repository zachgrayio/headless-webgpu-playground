# headless-webgpu-playground

## Usage

- `npm run test:puppeteer` - runs the puppeteer tests that will check the `chrome://gpu` page for expected settings, and save a screenshot of the page
- `npm run test:webgpu` - run the playwright tests that render a few things that require working WebGPU, as well as validate that `navigator.gpu` is present

## GPU status

With the checked in configuration, `chrome://gpu` reports the following on my machine (Nvidia 4090, ubuntu, cuda sdk, drivers and nvidia-smi etc all working):

﻿﻿![image](https://github.com/user-attachments/assets/07249d11-bfd0-4dd2-866a-698b772f5cc5)

Contrary to some guides, using the flag `--use-gl=egl` or `gl` or similar to get the `chrome://gpu` page to show WebGL and WebGPU as fully hardware accelerated actually will break the availability of `navigator.gpu` because the GL backend isn't fully compatible yet, so mileage may vary with that approach.
