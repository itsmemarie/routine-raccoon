import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell (TECH_SPEC D2, Phase 3). `npx cap add android` creates `android/` from this.
 * The web build in `out/` is bundled into the APK, so the app works fully offline.
 */
const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

const config: CapacitorConfig = {
  appId: isStaging ? "app.routineraccoon.staging" : "app.routineraccoon",
  appName: isStaging ? "Raccoon (staging)" : "Routine Raccoon",
  webDir: "out",
  android: {
    // Release builds must not expose the WebView to chrome://inspect.
    webContentsDebuggingEnabled: process.env.NEXT_PUBLIC_APP_ENV !== "production",
  },
  server: {
    androidScheme: "https",
    // Never navigate the app WebView to other origins; external links open in the system browser.
    allowNavigation: [],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_raccoon",
      iconColor: "#E5134A",
    },
  },
};

export default config;
