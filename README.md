# AC7 VR Launcher

AC7 VR Launcher is a Windows-focused Electron + TypeScript wizard that automates setup and launch for **Ace Combat 7: Skies Unknown** in VR with **Quest 3 + Virtual Desktop + UEVR**.

## Features

- Multi-step setup wizard with individual controls per stage
- System dependency checks (Windows version, VC++ Runtime, DirectX)
- Steam / SteamVR / AC7 / Virtual Desktop detection with launch/install links
- UEVR manager that fetches latest release from GitHub and installs it
- Profile and game configuration tools (borderless mode, motion blur off, resolution)
- One-click launch sequence with real-time status updates and logs
- Settings + about panel with useful links
- Dark aviation-themed UI

## Tech Stack

- Electron (main + preload)
- React (renderer)
- TypeScript
- Webpack
- npm

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run package
```

## Test / Lint

```bash
npm test
```

## Usage

1. Open **System Check** and verify required dependencies.
2. Run **Software Detection** and confirm SteamVR, AC7, and Virtual Desktop state.
3. Open **UEVR Mod** and install or update UEVR.
4. Apply **Profile & Config** defaults (or import your own profile).
5. Use **Launch VR** to run SteamVR → Virtual Desktop Streamer → AC7 → UEVR injection.
6. Configure optional preferences in **Settings & About**.

## Notes

- Windows x64 is the only supported platform target.
- Registry and process checks rely on Windows shell tooling (`reg query`, `tasklist`).
