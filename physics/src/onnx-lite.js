// The policies' networks run here, in plain JavaScript, instead of in onnxruntime-web. A policy is a
// 270 KB multilayer perceptron (training/export.py: normalize, clip, four Gemm layers with Elu, scale
// and clamp to the motors' range), and onnxruntime-web brought 14 MB of WebAssembly to run it: a
// third of everything the page downloaded before the robot could stand. This reads the .onnx file
// itself (its protobuf, decoded below) and evaluates the few operators those graphs use. Same
// interface as the subset of onnxruntime that policy.js calls (InferenceSession.create, run, Tensor,
// inputNames, outputNames, release), so policy.js does not know which one it has; check-policy runs
// every policy in both and compares their outputs.

// ---- Protobuf: just enough of the wire format to read an ONNX ModelProto ----

class Reader {
  constructor(bytes, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = start;
    this.end = end;
  }
  varint() {
    // In BigInt: an int64 is up to 10 bytes, and a negative one (Slice's -1) is 2^64 minus it,
    // which a double cannot hold exactly.
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = this.bytes[this.pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if (byte < 0x80) break;
      shift += 7n;
    }
    return Number(BigInt.asIntN(64, result));
  }
  // Each field: [number, wire type, value]; length-delimited values come as a sub-Reader.
  *fields() {
    while (this.pos < this.end) {
      const key = this.varint();
      const field = Math.floor(key / 8);
      const wire = key & 7;
      if (wire === 0) yield [field, wire, this.varint()];
      else if (wire === 1) {
        yield [field, wire, this.view.getFloat64(this.pos, true)];
        this.pos += 8;
      } else if (wire === 2) {
        const length = this.varint();
        yield [field, wire, new Reader(this.bytes, this.pos, this.pos + length)];
        this.pos += length;
      } else if (wire === 5) {
        yield [field, wire, this.view.getFloat32(this.pos, true)];
        this.pos += 4;
      } else throw new Error(`onnx-lite: protobuf wire type ${wire} is not supported`);
    }
  }
  string() {
    return new TextDecoder().decode(this.bytes.subarray(this.pos, this.end));
  }
  raw() {
    return this.bytes.slice(this.pos, this.end); // a copy, aligned for typed arrays
  }
  packedVarints() {
    const out = [];
    while (this.pos < this.end) out.push(this.varint());
    return out;
  }
  packedFloats() {
    const out = [];
    for (; this.pos < this.end; this.pos += 4) out.push(this.view.getFloat32(this.pos, true));
    return out;
  }
}

const FLOAT = 1;
const INT64 = 7;

// TensorProto -> { dims, data (Float32Array or plain numbers for int64), name }.
function readTensor(reader) {
  const dims = [];
  let type = FLOAT;
  let name = '';
  let raw = null;
  const floats = [];
  const ints = [];
  for (const [field, wire, value] of reader.fields()) {
    if (field === 1) wire === 2 ? dims.push(...value.packedVarints()) : dims.push(value);
    else if (field === 2) type = value;
    else if (field === 4) wire === 2 ? floats.push(...value.packedFloats()) : floats.push(value);
    else if (field === 7) wire === 2 ? ints.push(...value.packedVarints()) : ints.push(value);
    else if (field === 8) name = value.string();
    else if (field === 9) raw = value.raw();
  }
  let data;
  if (type === FLOAT) data = raw ? new Float32Array(raw.buffer) : Float32Array.from(floats);
  else if (type === INT64) data = raw ? Array.from(new BigInt64Array(raw.buffer), Number) : ints;
  else throw new Error(`onnx-lite: tensor type ${type} is not supported`);
  return { name, dims, data };
}

function readAttribute(reader) {
  const attribute = { name: '', value: undefined };
  for (const [field, wire, value] of reader.fields()) {
    if (field === 1) attribute.name = value.string();
    else if (field === 2) attribute.value = value; // f
    else if (field === 3) attribute.value = value; // i
    else if (field === 5) attribute.value = readTensor(value); // t
    else if (field === 8) attribute.value = wire === 2 ? value.packedVarints() : [value]; // ints
  }
  return attribute;
}

function readNode(reader) {
  const node = { inputs: [], outputs: [], op: '', attributes: {} };
  for (const [field, , value] of reader.fields()) {
    if (field === 1) node.inputs.push(value.string());
    else if (field === 2) node.outputs.push(value.string());
    else if (field === 4) node.op = value.string();
    else if (field === 5) {
      const { name, value: v } = readAttribute(value);
      node.attributes[name] = v;
    }
  }
  return node;
}

const valueName = (reader) => {
  for (const [field, , value] of reader.fields()) if (field === 1) return value.string();
  return '';
};

function readModel(bytes) {
  for (const [field, , graph] of new Reader(bytes).fields()) {
    if (field !== 7) continue;
    const out = { nodes: [], initializers: new Map(), inputs: [], outputs: [] };
    for (const [f, , value] of graph.fields()) {
      if (f === 1) out.nodes.push(readNode(value));
      else if (f === 5) {
        const tensor = readTensor(value);
        out.initializers.set(tensor.name, tensor);
      } else if (f === 11) out.inputs.push(valueName(value));
      else if (f === 12) out.outputs.push(valueName(value));
    }
    // Inputs listed as initializers too (older exporters) are weights, not the caller's.
    out.inputs = out.inputs.filter((name) => !out.initializers.has(name));
    return out;
  }
  throw new Error('onnx-lite: no graph in this file');
}

// ---- The operators the policies use ----

const size = (dims) => dims.reduce((a, b) => a * b, 1);

// Elementwise with numpy broadcasting, for the shapes these graphs have: equal shapes, or one side
// a scalar or a row broadcast over the last axis ([1, n] with [n]).
function elementwise(a, b, fn) {
  const dims = a.dims.length >= b.dims.length ? a.dims : b.dims;
  const n = size(dims);
  const out = new Float32Array(n);
  const la = a.data.length;
  const lb = b.data.length;
  if (n % la || n % lb) throw new Error(`onnx-lite: cannot broadcast [${a.dims}] with [${b.dims}]`);
  for (let i = 0; i < n; i++) out[i] = fn(a.data[i % la], b.data[i % lb]);
  return { dims, data: out };
}

function gemm([a, b, c], { alpha = 1, beta = 1, transA = 0, transB = 0 }) {
  const [m, k] = transA ? [a.dims[1], a.dims[0]] : a.dims;
  const n = transB ? b.dims[0] : b.dims[1];
  const out = new Float32Array(m * n);
  const A = a.data;
  const B = b.data;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) {
        sum += (transA ? A[p * m + i] : A[i * k + p]) * (transB ? B[j * k + p] : B[p * n + j]);
      }
      out[i * n + j] = alpha * sum + (c ? beta * c.data[(i * n + j) % c.data.length] : 0);
    }
  }
  return { dims: [m, n], data: out };
}

// Slice of a 2-D tensor (the imitation policy takes part of its observation).
function slice([x, starts, ends, axes, steps]) {
  const rank = x.dims.length;
  const from = new Array(rank).fill(0);
  const to = x.dims.slice();
  const step = new Array(rank).fill(1);
  (axes?.data ?? starts.data.map((_, i) => i)).forEach((axis, i) => {
    const ax = axis < 0 ? axis + rank : axis;
    const dim = x.dims[ax];
    const clamp = (v) => Math.max(0, Math.min(dim, v < 0 ? v + dim : v));
    from[ax] = clamp(starts.data[i]);
    to[ax] = clamp(ends.data[i]);
    step[ax] = steps?.data[i] ?? 1;
    if (step[ax] !== 1) throw new Error('onnx-lite: Slice with a step is not supported');
  });
  if (rank !== 2) throw new Error('onnx-lite: Slice of a tensor that is not 2-D is not supported');
  const dims = [to[0] - from[0], to[1] - from[1]];
  const out = new Float32Array(size(dims));
  for (let i = 0; i < dims[0]; i++) {
    for (let j = 0; j < dims[1]; j++) out[i * dims[1] + j] = x.data[(from[0] + i) * x.dims[1] + from[1] + j];
  }
  return { dims, data: out };
}

const OPS = {
  Add: ([a, b]) => elementwise(a, b, (x, y) => x + y),
  Sub: ([a, b]) => elementwise(a, b, (x, y) => x - y),
  Mul: ([a, b]) => elementwise(a, b, (x, y) => x * y),
  Div: ([a, b]) => elementwise(a, b, (x, y) => x / y),
  Max: ([a, b]) => elementwise(a, b, Math.max),
  Min: ([a, b]) => elementwise(a, b, Math.min),
  Clip: ([x, lo, hi], { min = -Infinity, max = Infinity }) => {
    const low = lo ? lo.data[0] : min;
    const high = hi ? hi.data[0] : max;
    return { dims: x.dims, data: x.data.map((v) => Math.min(high, Math.max(low, v))) };
  },
  Elu: ([x], { alpha = 1 }) => ({ dims: x.dims, data: x.data.map((v) => (v >= 0 ? v : alpha * Math.expm1(v))) }),
  Gemm: gemm,
  Constant: (_, { value }) => value,
  Slice: slice,
};

// ---- The onnxruntime-shaped interface ----

export class Tensor {
  constructor(type, data, dims) {
    if (type !== 'float32') throw new Error(`onnx-lite: only float32 inputs (got ${type})`);
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
}

export class InferenceSession {
  constructor(graph) {
    this.graph = graph;
    this.inputNames = graph.inputs;
    this.outputNames = graph.outputs;
    for (const node of graph.nodes) {
      if (!OPS[node.op]) throw new Error(`onnx-lite: the operator ${node.op} is not supported`);
    }
  }

  /** @param model  the .onnx file's bytes (Uint8Array or ArrayBuffer) */
  static async create(model) {
    return new InferenceSession(readModel(model instanceof Uint8Array ? model : new Uint8Array(model)));
  }

  /** Synchronous inside; async only to match onnxruntime's run(). */
  async run(feeds) {
    const values = new Map(this.graph.initializers);
    for (const name of this.inputNames) values.set(name, { dims: feeds[name].dims, data: feeds[name].data });
    for (const node of this.graph.nodes) {
      const inputs = node.inputs.map((name) => (name ? values.get(name) : undefined));
      values.set(node.outputs[0], OPS[node.op](inputs, node.attributes));
    }
    return Object.fromEntries(this.outputNames.map((name) => {
      const { data, dims } = values.get(name);
      return [name, new Tensor('float32', data instanceof Float32Array ? data : Float32Array.from(data), dims)];
    }));
  }

  release() {}
}
