#!/bin/bash
# Build SisyphusUI and create a proper .app bundle
set -e

cd "$(dirname "$0")"

echo "Building SisyphusUI..."
swift build -c release 2>&1

APP_DIR=".build/Sisyphus.app/Contents"
mkdir -p "$APP_DIR/MacOS"
mkdir -p "$APP_DIR/Resources"

# Copy binary
cp .build/release/SisyphusUI "$APP_DIR/MacOS/SisyphusUI"

# Copy Info.plist
cp Sources/SisyphusUI/Resources/Info.plist "$APP_DIR/Info.plist"

echo "✅ Built: .build/Sisyphus.app"
echo ""
echo "To run:  open .build/Sisyphus.app"
echo "To install: cp -r .build/Sisyphus.app /Applications/"
