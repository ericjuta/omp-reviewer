# Changelog

## Unreleased

- Accept OMP's host-required top-level `i` intent label on `submit_review` while keeping the review schema strict.

## 0.1.0

First public release of omp-reviewer, a standalone code review CLI that drives the installed `omp` binary. It reviews a Git diff in a fresh OMP process and returns prioritized P0 through P3 findings in the same shape as standalone `codex review`.

This is a native-OMP fork of [pi-reviewer](https://github.com/osolmaz/pi-reviewer). It does not use pi-factory, `@earendil-works/*`, or `~/.pi/agent`.
