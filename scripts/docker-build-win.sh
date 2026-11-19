#!/usr/bin/env bash
set -euo pipefail

WIN_ARCH="${WIN_ARCH:-x64}"

if [[ "${WIN_ARCH}" != "x64" && "${WIN_ARCH}" != "ia32" ]]; then
  echo "Unsupported WIN_ARCH='${WIN_ARCH}'. Use 'x64' or 'ia32'." >&2
  exit 1
fi

echo "==> [1/5] Generating application icons..."
npm run generate-icons

echo "==> [2/5] Building React renderer bundle..."
npm run build

echo "==> [3/5] Fetching prebuilt better-sqlite3 native binding for Electron 22.3.27 (win32-${WIN_ARCH})..."
(
  cd node_modules/better-sqlite3
  ../../node_modules/.bin/prebuild-install \
    --runtime=electron \
    --target=22.3.27 \
    --platform=win32 \
    --arch="${WIN_ARCH}" \
    --force \
    --verbose
)

echo "==> [4/5] Packaging Windows NSIS installer (${WIN_ARCH})..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder \
  --win nsis "--${WIN_ARCH}" \
  --publish never \
  -c.npmRebuild=false

echo "==> [5/5] Generating SHA256SUMS.txt..."
mkdir -p release
(
  cd release
  sha256sum *.exe > SHA256SUMS.txt
)
ls -lh release/
cat release/SHA256SUMS.txt
