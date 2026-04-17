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
2. Run **Software Detection** to confirm Steam, AC7, and Virtual Desktop Streamer (PC side) state. SteamVR is **not required** for Quest 3 + Virtual Desktop.
3. Open **Install Mod** and click **Install & Configure** — downloads UEVR, deploys the AC7 VR profile automatically, and applies recommended game settings.
4. Adjust optional per-setting toggles in **Game Settings** if needed.
5. Use **Launch VR** to start Virtual Desktop Streamer → Ace Combat 7 → UEVR injection. After the game process is detected, the launcher waits ~25 seconds for Unreal Engine to finish initializing, then opens the UEVR Injector **with a UAC prompt** (required because DLL injection needs Administrator privileges). The first time, select `Ace7Game-Win64-Shipping.exe` in the injector window and click **Inject** — on subsequent launches UEVR auto-injects with no user action. Then put on your Quest 3 and open the Virtual Desktop app on the headset to connect.
6. Configure optional preferences in **Settings & About**.

## Notes

- Windows x64 is the only supported platform target.
- Registry and process checks rely on Windows shell tooling (`reg query`, `tasklist`).
- SteamVR is **not** part of the Quest 3 + Virtual Desktop flow and is not started by the launcher.
