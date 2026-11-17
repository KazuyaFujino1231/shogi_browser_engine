#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Invoke from an extracted copy of the distributed yaneuraou-source.tar.gz.
# Obtain Emscripten 3.1.43 (the upstream build toolchain); Python 3 and make are required.
set -euo pipefail
make -C source -j2 tournament COMPILER=em++ TARGET_CPU=WASM \
  YANEURAOU_EDITION=YANEURAOU_ENGINE_SFNN_ka2_2048_8_64_progress8 \
  EM_EXPORT_NAME=YaneuraOu_SFNN_ka2_2048_8_64_progress8 \
  EM_INITIAL_MEMORY_SIZE=138412032 TARGET=yaneuraou.js
# The model is external. /eval/nn.bin and /eval/progress.bin are mounted by loader.js.
# Model-specific configuration: EvalDir=/eval, EvalFile=nn.bin, FV_SCALE=24.
