#!/usr/bin/env bash
# Shared utilities for DevFlow hook scripts.
# Source with: source "$(dirname "$0")/lib/devflow-state.sh"

# Find repo root by walking up from CWD
devflow_repo_root() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/CLAUDE.md" ] || [ -d "$dir/.git" ]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

# Returns 0 if project is DevFlow-managed (CLAUDE.md mentions devflow_init)
devflow_is_managed_project() {
  local root
  root="$(devflow_repo_root)" || return 1
  [ -f "$root/CLAUDE.md" ] && grep -q "devflow_init" "$root/CLAUDE.md"
}

# Returns 0 if an active flow exists, prints .devflow-active path on stdout
devflow_active_file() {
  local root
  root="$(devflow_repo_root)" || return 1
  local f="$root/.devflow-active"
  [ -f "$f" ] && echo "$f"
}

# Read a field from .devflow-active via node (reliable JSON parse)
devflow_active_field() {
  local field="$1"
  local f
  f="$(devflow_active_file)" || return 1
  node -e "const d=require('$f');process.stdout.write(String(d['$field']||''))"
}
