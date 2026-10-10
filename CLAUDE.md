# Conventions

- Everything in this repository is written in English: code, identifiers,
  comments, commit messages, documentation and UI copy (until i18n lands).
- Money is always an integer number of cents (`Cents`). Never use floats for
  amounts, and divide amounts only through `allocate()` from `@bill-splitter/core`.
- Domain and money logic belongs in `packages/core`, which must stay free of
  framework and I/O dependencies. Apps only orchestrate it.
- Components use the semantic design tokens from `apps/web/src/assets/main.css`
  (`bg-surface`, `text-ink-muted`, `bg-accent`, ...), never raw colors.
- Run `pnpm check` before committing; CI runs the same checks plus the build.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, ...).
