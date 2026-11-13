# NEONDECK

A fullscreen, remote-friendly TV interface for a Windows 11 PC: app tiles for
every major streaming service, an app store screen, and (in later milestones)
live TV, DVR, library, and search. No accounts, no telemetry, no cloud.

**Status: Windows preview 0.2.0.** Home screen, navigation, themes, and the
Apps section are built. Live TV, library, search, and DVR screens are
placeholders. The Windows-specific code has not yet been run on a real
Windows 11 PC; see "Not yet tested" below.

## Install on Windows 11

Run `NEONDECK-Setup-0.2.0.exe`. The installer is unsigned, so Windows
SmartScreen will show a warning: choose **More info → Run anyway**.

Then, inside NEONDECK:

- **Settings → Start at sign-in** opens NEONDECK fullscreen when you sign in.
- **Settings → Media server** installs Jellyfin Server with its native
  Windows installer (through winget).
- **F11** toggles fullscreen. **Ctrl + Shift + Home** returns to NEONDECK
  from any app or site it opened.

## Controls

| Input | Move | Select | Back |
|---|---|---|---|
| Keyboard or remote | Arrow keys | Enter | Esc or Backspace |
| Gamepad | D-pad or left stick | A | B |

## App tiles

The catalog (`packages/core/src/catalog.json`) lists 43 services across Free,
Subscription, Live TV, Sports, and Music. Each profile can pin, hide, and
reorder tiles, and add custom tiles for any web address or installed program.

A tile launches in this order:

1. If the service's Windows app is installed, NEONDECK opens it.
2. If it is not installed but an app is known, NEONDECK offers **Install**
   (through winget or the Microsoft Store).
3. Otherwise the site opens in Microsoft Edge app mode, fullscreen.

Package IDs are never guessed. Three are shipped because they were confirmed
in the winget community repository (`Spotify.Spotify`, `Plex.Plex`,
`TIDALMusicAS.TIDAL`). For every other service, **Find the Windows app** runs
a live `winget search` against the Microsoft Store on your PC and lets you
pick the right result; NEONDECK remembers your choice.

**Sign-ins:** you sign in inside each service's own app or site. NEONDECK
never sees, stores, or handles service passwords. Sites opened in Edge use a
separate Edge profile per NEONDECK profile, kept in NEONDECK's data folder
and managed entirely by Edge.

## Configuration

Plain JSON files in `%APPDATA%\NEONDECK\config\`. `tiles.json` holds pins,
hidden tiles, custom tiles, and remembered app links. Copy the folder to
back up or move your setup.

## Develop

Requires Node.js 20 or newer. Works on Windows, macOS, and Linux; outside
Windows the UI runs in demo mode with sample app data.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

Run the desktop shell:

```bash
npm run build
```

```bash
npm run desktop
```

Build the Windows installer (on Windows; on Linux it also needs Wine with
32-bit support):

```bash
npm run dist:win
```

The installer is written to `apps/desktop/release/`.

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Catalog, winget output parsers, tile and launch logic, platform contract. Pure TypeScript, fully tested. |
| `apps/tv` | The TV interface (React + TypeScript + Vite). |
| `apps/desktop` | Electron shell. `src/platform/windows.ts` is the only Windows-specific code; a Linux adapter implements the same contract later. |
| `docs/screenshots` | Screenshots from each milestone. |

## Not yet tested

Verified here: unit tests, the UI in a browser against a demo platform, the
desktop shell starting on Linux, and the installer building successfully.

Not verified, because it needs a real Windows 11 PC:

- Running the installer and the installed app.
- winget search, install, update, and uninstall, and reading the Start menu.
- Launching apps and Edge, and returning focus when they close.
- Start at sign-in.
- A physical gamepad.

## License

No license has been chosen yet, so this code is not open source at present.
