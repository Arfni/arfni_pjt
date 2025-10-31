#!/bin/bash
# Arfni Build Script for Linux/macOS
# Date: 2025-10-30

echo "================================================"
echo "  Arfni Build Script"
echo "================================================"
echo ""

# 1. Build ic (Deployment Engine)
echo "[1/2] Building ic..."
cd cmd/ic
go build -o ../../bin/ic .
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build ic"
    exit 1
fi
echo "[SUCCESS] ic built successfully"
cd ../..
echo ""

# 2. Build arfni-go (Deploy Wrapper)
echo "[2/2] Building arfni-go..."
cd cmd/arfni-go
go build -o ../../bin/arfni-go .
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build arfni-go"
    exit 1
fi
echo "[SUCCESS] arfni-go built successfully"
cd ../..
echo ""

echo "================================================"
echo "  Build Completed Successfully!"
echo "================================================"
echo ""
echo "Output files:"
echo "  - bin/ic"
echo "  - bin/arfni-go"
echo ""
