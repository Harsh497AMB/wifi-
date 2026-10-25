# AGENTS.md — Project rules for the AI agent (Wi-Fi Dead Zone Mapper)

Read this file before every task. These rules override your defaults.

## Project
Native Android app (Kotlin, Jetpack Compose, Material 3). Indoor Wi-Fi mapping.
Three bottom tabs: (1) AP Radar list, (2) Live RSSI graph, (3) Indoor floor-plan heatmap.
Full spec: `docs/SPEC.md`.

## Hard rules
1. NO internet. Do NOT add `INTERNET` permission. No analytics, no Firebase, no Google Maps, no GPS/FusedLocation.
2. minSdk 24, compile/target = latest stable. Every API above minSdk must be guarded with `Build.VERSION.SDK_INT`.
3. Never call `WifiManager.startScan()` more often than once per 30 s. Tab 1 must show cached `scanResults` and a "last updated" time.
4. Tab 2 and Tab 3 read RSSI of the CONNECTED network only (never scan for them). Poll every 2 s inside `repeatOnLifecycle(STARTED)` so polling stops in background.
5. All heavy math (IDW, bitmap building, image decoding) runs on `Dispatchers.Default`/`IO`, never on the main thread. Cancel the previous job before starting a new one.
6. Do not hardcode UI strings, colors, fonts or sizes in screens. Use `ui/theme/Color.kt`, `Type.kt`, `Theme.kt`, `strings.xml`, `dimens`. The owner restyles the UI later by editing ONLY `ui/theme/`.
7. Keep UI "dumb": screens get a `UiState` from a `ViewModel` and send events. No Wi-Fi/DB code inside composables.
8. Architecture: `data/` (wifi, db, repository) → `domain/` (pure Kotlin: IDW, distance, channel, color mapping) → `ui/` (screens, viewmodels, theme). Domain code must be unit-testable with no Android imports.
9. Add unit tests for everything in `domain/`.
10. Release build: `isMinifyEnabled = true`, `isShrinkResources = true`, `android:allowBackup="false"`, `debuggable=false`, non-launcher components `exported="false"`.
11. Never log SSID/BSSID/RSSI in release builds. Wrap logging in `if (BuildConfig.DEBUG)`.
12. Use only free/open-source libraries from Maven Central or Google Maven (no JitPack unless asked). Tell me the exact dependency lines and why before adding any.
13. Do not rename/move packages or rewrite files outside the task scope. Keep diffs small.

## Working style
- For each task: first show a short plan (files to create/change), then implement.
- After implementing, run `./gradlew assembleDebug` and `./gradlew testDebugUnitTest`; fix errors before reporting done.
- If something is ambiguous, ask ONE question instead of guessing.
- Finish with a list: files changed, how to test it on a real phone, known limitations.
