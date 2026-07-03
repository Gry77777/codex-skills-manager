# Changelog

## 0.1.0 - 2026-07-03

Initial beta release.

### Added

- Windows desktop app built with Electron, React and TypeScript.
- Local skill scanner for:
  - `%USERPROFILE%\.codex\skills`
  - `%USERPROFILE%\.agents\skills`
  - `%APPDATA%\CodexSkillsManager\imported-skills`
- Skill card grid with search, filters, pagination and detail modal.
- Physical enable/disable by renaming:
  - `SKILL.md`
  - `SKILL.md.disabled`
- Local folder import.
- GitHub skill import from repository, folder, `blob/SKILL.md` and raw `SKILL.md` URLs.
- Online Skills marketplace with indexed GitHub sources and direct skill import.
- Faster marketplace source filtering that avoids full repository deep scans on click.
- AI skill analysis settings for mainstream providers and custom compatible API gateways.
- Managed local skill copies under AppData.
- One-click repair for common broken skill states.
- Chinese UI.
- Custom Windows icon.
- Portable Windows x64 build and zip package.

### Notes

- This release is Windows x64 only.
- The app is not code signed yet, so Windows SmartScreen may show an unknown publisher warning.
- Existing Codex sessions may need restart or a new session before skill changes are picked up.
- This is not an official OpenAI or Codex product.
