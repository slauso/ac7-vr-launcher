# AC7 VR Launcher

AC7 VR Launcher is a Windows-focused Electron + TypeScript utility that now acts as a **one-stop shop** for **Ace Combat 7: Skies Unknown** in VR with **Quest 3 + Virtual Desktop + UEVR**.

## Features

- Integrated tabs for **UEVR**, **Camera**, **Mods**, **Skins**, **Overlays**, and **Settings**
- System dependency checks (Windows version, VC++ Runtime, DirectX)
- Steam / SteamVR / AC7 / Virtual Desktop detection with launch/install links
- Full UEVR integration: status, inject-from-launcher, import local folder, runtime toggles, profile deploy
- Camera preset manager (inside cockpit / outside chase / cinematic + FOV/offset/rotation sliders)
- Mod manager for `~mods` / `~mods_disabled` with install/enable/disable/uninstall
- Skin manager grouped by aircraft with single-active-skin enforcement per aircraft
- Overlay manager with master toggle + common in-VR overlay switches
- Unified settings persisted at `%APPDATA%/ac7-vr-launcher/settings.json`
- Profile and game configuration tools (borderless mode, motion blur off, resolution)
- One-click launch sequence with real-time status updates and logs
- Dark aviation-themed UI

## Quick Start

1. Open **Settings** and set your AC7 + UEVR paths (auto-detection is attempted first).
2. Open **UEVR** and click **Install & Configure** (or import an existing UEVR folder).
3. Use **Camera**, **Overlays**, **Mods**, and **Skins** to apply your preferred VR setup.
4. Open **Launch VR** and click **Launch VR**.

## UI Screenshot Placeholders

- `docs/screenshots/uevr-tab.png`
- `docs/screenshots/camera-tab.png`
- `docs/screenshots/mods-tab.png`

## Install & Use — Quest 3 + Virtual Desktop + Steam AC7 (Non-Technical Guide)

This is the recommended walkthrough if you just want to play **Ace Combat 7 in VR** on a Windows PC with a **Meta Quest 3** using **Virtual Desktop**. You do **not** need to be a developer to follow these steps.

### Before you start — what you need

Make sure all of the following are already set up and working **outside VR** first:

1. **A Windows 10 or Windows 11 PC (64-bit)** with a VR-capable GPU.
2. **Ace Combat 7: Skies Unknown** installed and working through **Steam**. Launch it in flat-screen mode at least once to confirm it runs and to get past the first-time shader compile.
3. **Meta Quest 3** headset, fully set up with your Meta account.
4. **Virtual Desktop** purchased and installed on the Quest 3 from the Meta Store, with the companion **Virtual Desktop Streamer** installed and signed in on your PC. Confirm you can connect the headset to the PC desktop wirelessly before continuing.
5. Your PC and Quest 3 are on the **same Wi-Fi network** (a 5 GHz / Wi-Fi 6 router is strongly recommended for good image quality).
6. **SteamVR is not needed.** Do not start it — Virtual Desktop handles everything.

### Step 1 — Download the launcher

> ⚠️ **Do not use the green "Code → Download ZIP" button on GitHub.** That ZIP contains the launcher's _source code_ (folders like `src/`, `package.json`, `webpack.config.ts`) and **does not** contain a clickable installer. Use one of the two paths below instead.

**Option A — From the Releases page (recommended):**

1. Go to <https://github.com/slauso/ac7-vr-launcher/releases>.
2. On the latest release, click the file named **`AC7-VR-Launcher-<version>-Setup.exe`** under **Assets** to download it.

**Option B — From the latest CI build (if Releases is empty):**

1. Go to <https://github.com/slauso/ac7-vr-launcher/actions/workflows/release.yml>.
2. Click the most recent successful run (green check mark) at the top.
3. Scroll to the **Artifacts** section at the bottom and download **`ac7-vr-launcher-windows-installer`** (a small ZIP).
4. Open that ZIP — inside is the **`AC7-VR-Launcher-<version>-Setup.exe`** file. That is the one-click installer.

> If neither option shows an installer, the build hasn't finished yet — wait a few minutes for the workflow to complete, then refresh.

### Step 2 — Install the launcher

1. Double-click the `AC7-VR-Launcher-<version>-Setup.exe` file you downloaded.
2. Windows SmartScreen may warn about an unrecognized app. Click **More info → Run anyway**.
3. Follow the installer. You can keep the default install location and let it create a **Desktop shortcut**.
4. When install finishes, open **AC7 VR Launcher** from the desktop shortcut or Start menu.

### Step 3 — Run the setup wizard (once)

Inside the launcher, go through each tab from top to bottom. Every step has a **Check** or **Install & Configure** button — just click it and wait for the green check.

1. **System Check** — verifies Windows version, Visual C++ Runtime, and DirectX. If anything is red, click the provided link to install/update it, then re-run the check.
2. **Software Detection** — confirms it found **Steam**, **Ace Combat 7**, and the **Virtual Desktop Streamer** on your PC. (SteamVR will show as not required — that is correct.) If AC7 is not found, make sure you have launched it at least once from Steam.
3. **Install Mod** — click **Install & Configure**. This will:
   - Download the latest **UEVR** release from GitHub,
   - Drop the Ace Combat 7 VR profile into the correct UEVR folder,
   - Apply the recommended game settings (borderless window, motion blur off, sensible resolution).
   
   Wait for the green check. You do not need to touch any files manually.
4. **Game Settings** — optional. The defaults are already good. Only change things here if you know what you are doing.

You only have to do Step 3 once. The launcher remembers everything.

### Step 4 — Get ready to fly (every play session)

1. Put on the Quest 3, but **do not** open Virtual Desktop on the headset yet.
2. On the PC, open the **AC7 VR Launcher** and go to the **Launch VR** tab.
3. Click the big **Launch** button. The launcher will automatically, in order:
   - Start **Virtual Desktop Streamer** on the PC (if it is not already running).
   - Start **Ace Combat 7** through Steam.
   - Wait about 25 seconds for Unreal Engine to finish loading.
   - Trigger the elevated **UEVR Injector** scheduled task that was registered during Install &amp; Configure, with `--attach=Ace7Game-Win64-Shipping.exe` baked in. The injector waits for the running game and auto-injects with no UAC prompt and no manual click. (If the scheduled task is missing — e.g. you upgraded from an older launcher — Launch VR falls back to launching the injector elevated, which shows a single UAC prompt; re-run Install &amp; Configure to register the task and skip future prompts.)
4. Put the Quest 3 on your head, open the **Virtual Desktop** app inside the headset, and connect to your PC.
5. Ace Combat 7 will appear in VR. Grab your controller/HOTAS and play.

### When you are done

- Take off the headset, quit AC7 normally.
- You can close the launcher. Virtual Desktop Streamer can be left running or closed from its tray icon — either is fine.

### Common first-time problems

- **Windows says "unrecognized app" when running the installer** — click **More info → Run anyway**. The installer is not code-signed yet.
- **No UAC prompt appears / UEVR does not inject** — by default Launch VR uses a pre-registered elevated scheduled task and does **not** show a UAC prompt. If the task is missing the launcher falls back to launching the injector elevated; if you blocked that UAC prompt, click Launch again and accept it. To stop seeing the prompt entirely, re-run Install &amp; Configure (or click **Install one-click injector** in the UEVR step).
- **"AC7 not found" in Software Detection** — launch Ace Combat 7 once from Steam, let it reach the main menu, quit, then re-run the check.
- **Game launches but screen stays flat in the headset** — UEVR did not inject. Open the **UEVR** step in the launcher and confirm "One-click VR injector" shows **Yes**; if not, click **Install one-click injector** and accept the UAC prompt once.
- **Virtual Desktop will not connect** — open Virtual Desktop Streamer on the PC, sign in to the same Meta account you use on the Quest 3, and make sure PC + headset are on the same network.
- **Stutters / low frame rate** — in the Virtual Desktop headset app, lower the bitrate or resolution; in the launcher's **Game Settings**, lower the game resolution.

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

End users do **not** need to build anything — grab the latest `AC7-VR-Launcher-<version>-Setup.exe` from the [Releases page](https://github.com/slauso/ac7-vr-launcher/releases) and run it.

### Releasing a new version (maintainers)

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds the Windows NSIS installer on `windows-latest`, attaches it to a GitHub Release named after the tag, and also uploads `latest.yml` for future in-app auto-updates:

```bash
npm version patch          # bumps package.json + creates a v<x.y.z> tag
git push --follow-tags
```

You can also trigger the workflow manually from the Actions tab (`Build Windows installer` → **Run workflow**) to produce an installer artifact without cutting a release.

### Building locally on Windows

```bash
npm install
npm run build
npm run package
```

The resulting installer lands in `release/AC7-VR-Launcher-<version>-Setup.exe`. It is a per-user install that creates a Desktop shortcut and a Start-Menu entry under **Games → AC7 VR Launcher**, requires no admin rights to install, and offers to launch the wizard at the end so the user can run **Install &amp; Configure** in one sitting.

## Test / Lint

```bash
npm test
```

## Usage

1. Open **System Check** and verify required dependencies.
2. Run **Software Detection** to confirm Steam, AC7, and Virtual Desktop Streamer (PC side) state. SteamVR is **not required** for Quest 3 + Virtual Desktop.
3. Open **Install Mod** and click **Install & Configure** — downloads UEVR, deploys the AC7 VR profile automatically, and applies recommended game settings.
4. Adjust optional per-setting toggles in **Game Settings** if needed.
5. Use **Launch VR** to start Virtual Desktop Streamer → Ace Combat 7 → UEVR injection. After the game process is detected, the launcher waits ~25 seconds for Unreal Engine to finish initializing, then triggers the elevated injector via the pre-registered scheduled task (no UAC prompt) with `--attach=Ace7Game-Win64-Shipping.exe` so it auto-injects with no manual click. (Falls back to launching the injector elevated with one UAC prompt if the task is absent.) Then put on your Quest 3 and open the Virtual Desktop app on the headset to connect.
6. Configure optional preferences in **Settings & About**.

## Notes

- Windows x64 is the only supported platform target.
- Registry and process checks rely on Windows shell tooling (`reg query`, `tasklist`).
- SteamVR is **not** part of the Quest 3 + Virtual Desktop flow and is not started by the launcher.
