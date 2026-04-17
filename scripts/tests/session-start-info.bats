#!/usr/bin/env bats

setup() {
  TEST_DIR="$(mktemp -d)"
  cd "$TEST_DIR"
  export HOME="$TEST_DIR"
}

teardown() {
  rm -rf "$TEST_DIR"
}

@test "silent when no active flow" {
  run bash "${BATS_TEST_DIRNAME}/../session-start-info.sh"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "silent when CLAUDE.md missing (non-DevFlow project)" {
  echo '{"flowId":"abc","displayId":"DF-214","state":"planning","since":"2026-04-17"}' > .devflow-active
  run bash "${BATS_TEST_DIRNAME}/../session-start-info.sh"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "prints active flow when .devflow-active exists in DevFlow project" {
  echo "# devflow_init" > CLAUDE.md
  echo '{"flowId":"abc","displayId":"DF-214","state":"planning","since":"2026-04-17"}' > .devflow-active
  run bash "${BATS_TEST_DIRNAME}/../session-start-info.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"DF-214"* ]]
  [[ "$output" == *"planning"* ]]
}

@test "prints different states correctly" {
  echo "# devflow_init" > CLAUDE.md
  echo '{"flowId":"xyz","displayId":"DF-100","state":"in_progress","since":"2026-04-17"}' > .devflow-active
  run bash "${BATS_TEST_DIRNAME}/../session-start-info.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"DF-100"* ]]
  [[ "$output" == *"in_progress"* ]]
}

@test "exits silently if displayId is empty" {
  echo "# devflow_init" > CLAUDE.md
  echo '{"flowId":"abc","displayId":"","state":"planning","since":"2026-04-17"}' > .devflow-active
  run bash "${BATS_TEST_DIRNAME}/../session-start-info.sh"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
