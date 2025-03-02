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

// attemping to optimize for NVIDIA RTX 4090:
// - 32 threads per warp
// - 16x8 = 128 threads (4 warps) for better occupancy
// - RTX 4090 has 128 SMs, each capable of 16 warps
@compute @workgroup_size(16, 8)
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

            sum = fma(a0, b0, sum);
            sum = fma(a1, b1, sum);
            sum = fma(a2, b2, sum);
            sum = fma(a3, b3, sum);
        } else {
            for (var j = i; j < params.k; j = j + 1u) {
                sum = fma(a[a_row_offset + j], b[j * params.n + b_col_offset], sum);
            }
        }
    }

    result[row * params.n + col] = sum * params.alpha;
}
