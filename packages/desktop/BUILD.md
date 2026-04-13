# Building Orbit AI Desktop App

The desktop app is a lightweight native wrapper (via Tauri v2) around the Orbit AI web app at `orbitai.work`. It uses the system's built-in WebView — no bundled browser engine, so the `.exe` is ~5-10MB.

## Prerequisites

1. **Rust toolchain** — install via [rustup.rs](https://rustup.rs)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Node.js 18+** — for the Tauri CLI

3. **Windows**: WebView2 runtime (pre-installed on Windows 10/11)
   **macOS**: No extra requirements (uses WKWebView)
   **Linux**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

## Build

```bash
cd packages/desktop

# Install Tauri CLI
npm install

# Development (opens a window pointing to orbitai.work)
npm run dev

# Build release (.exe on Windows, .dmg on macOS, .deb/.AppImage on Linux)
npm run build
```

## Output

Build artifacts go to `src-tauri/target/release/bundle/`:
- **Windows**: `nsis/Orbit AI_0.1.0_x64-setup.exe` (NSIS installer) or `msi/Orbit AI_0.1.0_x64_en-US.msi`
- **macOS**: `dmg/Orbit AI_0.1.0_aarch64.dmg` or `macos/Orbit AI.app`
- **Linux**: `deb/orbit-ai_0.1.0_amd64.deb` or `appimage/orbit-ai_0.1.0_amd64.AppImage`

## How it works

The app opens a native window that loads `https://orbitai.work`. All features (auth, chat, git, connections) work exactly like in the browser. The only difference is it runs as a standalone app instead of a browser tab.

## Customizing the URL

To point to a different server, edit `src-tauri/tauri.conf.json`:
```json
"build": {
  "devUrl": "https://your-domain.com"
}
```
And update `dist/index.html`'s meta refresh URL.
