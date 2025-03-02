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

            sum = fma(a0, b0, sum);
            sum = fma(a1, b1, sum);
            sum = fma(a2, b2, sum);
            sum = fma(a3, b3, sum);
        } else if (i < params.k) {
            sum = fma(a[row * params.k + i], b[i * params.n + col], sum);
        }
    }

    result[row * params.n + col] = sum * params.alpha;
}
