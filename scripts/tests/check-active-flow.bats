#!/usr/bin/env bats

setup() {
  TEST_DIR="$(mktemp -d)"
  cd "$TEST_DIR"
  export HOME="$TEST_DIR"
}

teardown() {
  rm -rf "$TEST_DIR"
}

@test "exits 0 when CLAUDE.md missing (non-DevFlow project)" {
  run bash "${BATS_TEST_DIRNAME}/../check-active-flow.sh"
  [ "$status" -eq 0 ]
}

@test "exits 0 when CLAUDE.md lacks devflow_init marker" {
  echo "# My project" > CLAUDE.md
  run bash "${BATS_TEST_DIRNAME}/../check-active-flow.sh"
  [ "$status" -eq 0 ]
}

@test "blocks when CLAUDE.md has marker but .devflow-active missing" {
  echo "# Use devflow_init" > CLAUDE.md
  run bash "${BATS_TEST_DIRNAME}/../check-active-flow.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"No active flow"* ]]
}

@test "allows when .devflow-active exists" {
  echo "# Use devflow_init" > CLAUDE.md
  echo '{"flowId":"x","displayId":"DF-1","state":"in_progress"}' > .devflow-active
  run bash "${BATS_TEST_DIRNAME}/../check-active-flow.sh"
  [ "$status" -eq 0 ]
}
