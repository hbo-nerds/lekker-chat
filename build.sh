#!/bin/bash

# LekkerChat - Build Script
# Creates distribution packages for Chrome and Firefox

set -e

echo "Building LekkerChat Extension..."

# Create dist directories
mkdir -p dist/chrome dist/firefox

# Common files for both browsers
COMMON_FILES=(
    "content.js"
    "style.css"
    "data/"
    "fonts/"
    "icons/"
    "popup/"
)

# Copy common files to both distributions
for file in "${COMMON_FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "dist/chrome/"
        cp "$file" "dist/firefox/"
    elif [ -d "$file" ]; then
        if [ "$file" = "popup/" ]; then
            # Copy popup directory but exclude node_modules
            mkdir -p "dist/chrome/popup" "dist/firefox/popup"
            cp popup/*.html popup/*.css popup/*.js dist/chrome/popup/ 2>/dev/null || true
            cp popup/*.html popup/*.css popup/*.js dist/firefox/popup/ 2>/dev/null || true
        else
            cp -r "$file" "dist/chrome/"
            cp -r "$file" "dist/firefox/"
        fi
    fi
done

# Copy browser-specific manifests
cp manifest-chrome.json dist/chrome/manifest.json
cp manifest-firefox.json dist/firefox/manifest.json

# Create icons directory (placeholder)
mkdir -p dist/chrome/icons dist/firefox/icons

echo "✓ Chrome extension built in dist/chrome/"
echo "✓ Firefox addon built in dist/firefox/"

# Create zip files for distribution (zip contents directly, not folders)
cd dist/chrome
zip -r "../twitch-chat-sync-chrome.zip" .
cd ../firefox
zip -r "../twitch-chat-sync-firefox.zip" .
cd ../..

echo "✓ Distribution packages created:"
echo "  - dist/twitch-chat-sync-chrome.zip"
echo "  - dist/twitch-chat-sync-firefox.zip"

echo ""
echo "Next steps:"
echo "1. Add icon files to icons/ directories"
echo "2. Test both extensions in their respective browsers"
echo "3. Submit to Chrome Web Store and Firefox Add-ons"