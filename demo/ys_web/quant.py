import sys

import numpy as np
import onnx
from onnx import TensorProto as T
from onnx import helper as h
from onnx import numpy_helper as nh


def wfp16(src, dst, min_size=1024):
    # weight-only fp16: store big fp32 initializers as fp16, Cast back to fp32 at load
    m = onnx.load(src)
    g = m.graph
    new = []
    casts = []
    for init in list(g.initializer):
        a = nh.to_array(init)
        if a.dtype == np.float32 and a.size >= min_size:
            n = init.name
            h16 = nh.from_array(a.astype(np.float16), n + "_h")
            new.append(h16)
            casts.append(h.make_node("Cast", [n + "_h"], [n], to=T.FLOAT, name=n + "_cast"))
            g.initializer.remove(init)
    g.initializer.extend(new)
    for i, c in enumerate(casts):
        g.node.insert(i, c)
    onnx.save(m, dst)


def fp16full(src, dst, block):
    from onnxconverter_common import float16

    m = onnx.load(src)
    m = float16.convert_float_to_float16(m, keep_io_types=True, op_block_list=list(float16.DEFAULT_OP_BLOCK_LIST) + block)
    onnx.save(m, dst)


def int8(src, dst, ops):
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(src, dst, op_types_to_quantize=ops, weight_type=QuantType.QInt8, per_channel=True)


v = sys.argv[1]
if v == "w16":
    for n in ["enc", "f0n", "dec"]:
        wfp16(f"models/{n}.onnx", f"models_q/{n}_w16.onnx")
if v == "f16":
    for n in ["enc", "f0n", "dec"]:
        try:
            fp16full(
                f"models/{n}.onnx",
                f"models_q/{n}_f16.onnx",
                [
                    "LSTM",
                    "Sin",
                    "Cos",
                    "Cast",
                    "Range",
                    "CumSum",
                    "RandomNormalLike",
                    "RandomUniformLike",
                    "InstanceNormalization",
                    "Pow",
                    "Reciprocal",
                    "Div",
                    "Where",
                    "Resize",
                    "Expand",
                    "ConstantOfShape",
                    "TopK",
                ],
            )
            print(n, "ok")
        except Exception as e:
            print(n, "FAIL", e)
if v == "i8":
    int8("models/dec.onnx", "models_q/dec_i8gemm.onnx", ["MatMul", "Gemm"])
    int8("models/dec.onnx", "models_q/dec_i8conv.onnx", ["MatMul", "Gemm", "Conv"])
