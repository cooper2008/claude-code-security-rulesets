#!/bin/bash

echo "🧹 Cleaning up repository files..."

# Remove test/debug files
echo "Removing test and debug files..."
rm -f test-config-preview.js
rm -f debug-setup.js
rm -f claude-security-custom.json
rm -f my-enterprise-security.json

# Remove duplicate files
echo "Removing duplicate files..."
rm -f "src/cli/index 2.ts"

# Remove external tool artifacts
echo "Removing external tool artifacts..."
rm -rf .serena/
rm -f .claude/settings.local.json

# Remove redundant CI/CD files (keep only GitHub workflow)
echo "Removing redundant CI/CD files..."
rm -rf ci-cd/
rm -rf config-mgmt/

# Clean up empty directories
echo "Cleaning up empty directories..."
find . -type d -empty -delete

echo "✅ Repository cleanup completed!"
echo ""
echo "Files removed:"
echo "- test-config-preview.js"
echo "- debug-setup.js"
echo "- claude-security-custom.json"
echo "- my-enterprise-security.json"
echo "- src/cli/index 2.ts"
echo "- .serena/ (external tool artifacts)"
echo "- .claude/settings.local.json (personal settings)"
echo "- ci-cd/ (redundant CI/CD files)"
echo "- config-mgmt/ (enterprise-specific configs)"
echo ""
echo "Kept essential files:"
echo "- .github/workflows/npm-publish.yml (our main CI/CD)"
echo "- All src/ code files"
echo "- All tests/"
echo "- All docs/"
echo "- All examples/"
echo "- All plugins/"