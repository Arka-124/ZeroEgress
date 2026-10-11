#!/bin/bash
# =========================================================================
# ZeroEgress macOS Finder Quick Action / Automator Shell Hook
# Receives file paths directly from Finder context menu without copying data.
# =========================================================================

APP_PATH="/Applications/ZeroEgress.app"

if [ ! -d "$APP_PATH" ]; then
    APP_PATH="$HOME/Applications/ZeroEgress.app"
fi

if [ $# -eq 0 ]; then
    open -a "$APP_PATH"
else
    for file in "$@"; do
        open -a "$APP_PATH" --args "$file"
    done
fi
