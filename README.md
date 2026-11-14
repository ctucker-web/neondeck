# NEONDECK

A fullscreen, remote-friendly TV interface for a Windows 11 PC: app tiles for
every major streaming service, an app store screen, and (in later milestones)
live TV, DVR, library, and search. No accounts, no telemetry, no cloud.

**Status: Windows preview 0.3.0.** Home, Live TV, Guide, Apps, and Settings
work. Library, DVR, and Search are not built yet and say so on screen.

## Install on Windows 11

Run `NEONDECK-Setup-0.3.0.exe` from the repository's Releases page. The installer is unsigned, so Windows
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

## Live TV

Live TV merges every enabled source into one channel list.

- **Starter channels:** ten news and world channels that are the
  broadcasters' own free public streams (DW, France 24, Al Jazeera English,
  NHK World-Japan, TRT World, Arirang TV). NEONDECK links to them; it does not
  host or relay them, and their terms of use have not been reviewed
  individually. Turn the pack off under **Live TV → Sources** if you prefer.
- **Your sources:** add an M3U playlist address or an Xtream-style account
  under **Live TV → Sources**. An XMLTV guide address is optional; a guide
  named in the playlist header is picked up automatically.
- NEONDECK ships no other streams and does not bypass any protection.

Watching:

| Input | Action |
|---|---|
| OK on a channel | Tune. OK again goes fullscreen. |
| Up / Down (fullscreen) | Next / previous channel |
| Left (fullscreen) | Last channel |
| Right (fullscreen) | Show or hide the channel banner |
| 0–9 (fullscreen) | Go to a channel number |
| ★ beside a channel | Add or remove a favorite |

The time from tune to first picture is measured and shown on every channel
change.

Sources, favorites, and the last channel are saved in
`%APPDATA%\NEONDECK\config\livetv.json`. An Xtream password is stored there
in plain text, because the player must send it to your provider.

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
hidden tiles, custom tiles, and remembered app links; `livetv.json` holds
sources and favorites. Copy the folder to back up or move your setup.

If something does not work, **Settings → Diagnostics** opens the folder with
`neondeck.log`, a plain-text record of what NEONDECK tried and what failed.

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

## How it is tested

- Unit tests for the playlist, guide, and winget parsers, tile logic, and
  navigation (`npm test`).
- Every push builds the installer on a GitHub Windows machine and then drives
  the packaged app there: it plays each starter channel, changes channels
  fullscreen, opens an app tile in Edge and checks that focus returns, and
  runs winget search, install, and uninstall. Results are saved to the
  `ci-logs` branch.

Not covered by those checks: a physical remote or gamepad, HDMI-CEC,
Microsoft Store sign-in, and your own playlists.

## License

No license has been chosen yet, so this code is not open source at present.
