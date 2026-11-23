# Installing Watch Business on your iPhone

Apple only lets apps onto an iPhone in a few ways. This app is private (not on the App Store), so you have these options:

| Option | Need a Mac? | Cost | Works without your computer? | Lasts |
| --- | --- | --- | --- | --- |
| **A. Expo Go** (try it today) | No | Free | No — your PC must be running and on the same Wi‑Fi | While testing |
| **B. Cloud build with EAS** (recommended without a Mac) | No | Apple Developer Program, 99 USD/year | Yes — a real app on your home screen | 1 year, then rebuild |
| **C. Build with Xcode** | Yes | Free Apple ID, or 99 USD/year | Yes | 7 days (free) / 1 year (paid) |

> **Your data is safe across updates.** Installing a newer build of the same app keeps all your data. Data is only lost if you **delete the app** — so always make a backup (Settings › Backup) before deleting or reinstalling.

---

## A. Try it now with Expo Go (free, no Mac)

Good for checking the app, **not** for daily business use.

1. On your iPhone, install **Expo Go** from the App Store.
2. On your Windows PC, open a terminal in the project folder and run:
   ```powershell
   npx expo start
   ```
3. Make sure the iPhone and PC are on the same Wi‑Fi. Open the iPhone **Camera**, scan the QR code shown in the terminal, and tap the banner to open it in Expo Go.

Limitations: the PC must be running `npx expo start` every time; Face ID lock is not available inside Expo Go; data is stored inside Expo Go (use Settings › Backup before moving to option B, then restore in the real app).

---

## B. Real app without a Mac — EAS cloud build (recommended)

Expo's cloud service builds and signs the iOS app for you; you install it from a link on your iPhone.

### What you need (one time)

1. **Apple Developer Program** membership — https://developer.apple.com/programs/enroll/ (99 USD/year, use your Apple ID). Enrolment can take up to 48 hours.
2. **Expo account** (free) — https://expo.dev/signup

### Steps

1. In the project folder, log in to Expo:
   ```powershell
   npx eas-cli@latest login
   ```
2. Link the project (creates an Expo project ID in `app.json`):
   ```powershell
   npx eas-cli@latest init
   ```
3. Register your iPhone (Apple requires it for private installs):
   ```powershell
   npx eas-cli@latest device:create
   ```
   Choose *Website*, open the link/QR on your **iPhone in Safari**, and install the profile it offers (iPhone Settings › Profile Downloaded › Install).
4. Build the app:
   ```powershell
   npx eas-cli@latest build --platform ios --profile preview
   ```
   - When asked, log in with your **Apple ID** (the one in the Developer Program). EAS creates the certificates automatically — answer **Yes** to the defaults.
   - If Apple says the bundle identifier is taken, change `ios.bundleIdentifier` in `app.json` (e.g. `com.yourname.watchbusiness`) and run the build again.
   - The build runs in the cloud (about 10–20 min). Your PC can be closed.
5. When it finishes, open the build link (or scan the QR) **on your iPhone**, tap **Install**.
6. First launch: iPhone Settings › Privacy & Security › **Developer Mode** › On (the iPhone restarts), then open **Watch Business** from your home screen.

### Updating later

Run step 4 again and install the new build over the old one — your data stays. Before the yearly certificate expires, rebuild the same way.

---

## C. With a Mac — Xcode

1. Install **Xcode** (Mac App Store), **Node.js** (https://nodejs.org), and **Git**.
2. Copy the project to the Mac (`git clone` from GitHub), then in Terminal:
   ```bash
   npm install
   ```
3. Connect the iPhone with a cable, unlock it, tap **Trust**. Enable iPhone Settings › Privacy & Security › **Developer Mode**.
4. In Xcode › Settings › Accounts, add your Apple ID.
5. Build and install a release version:
   ```bash
   npx expo run:ios --device --configuration Release
   ```
   Pick your iPhone when asked. If Xcode reports a signing error, open `ios/WatchBusiness.xcworkspace`, select the project › *Signing & Capabilities*, choose your team, and run again.
6. On the iPhone: Settings › General › VPN & Device Management › trust your developer certificate.

With a **free** Apple ID the app stops opening after 7 days — repeat step 5 (data is kept). With the paid program it lasts a year.

---

## After installing

1. Open the app — it starts with the dashboard (nothing to sign up for).
2. Settings › **Business name**, logo, theme.
3. Settings › Notifications › turn on **iPhone banner notifications** and allow them when iOS asks.
4. Optional: Settings › Security › **Face ID lock**.
5. Record your first purchase, then make a **backup** and save it to iCloud Drive.

### What needs the internet?

Nothing. Every feature works offline. Internet is only needed to *install/update* the app, and if you choose to save a backup to iCloud Drive or email.

### About notifications on iPhone

- iOS asks permission once. If you refuse, enable later in iPhone Settings › Notifications › Watch Business.
- The app has no server, so alerts are produced on the phone when something happens in the app (a sale drops stock below the threshold, a goal reaches 75 %…) and when you open it (unpaid-balance reminders). Nothing can be detected while the app is fully closed.
- Every alert is also kept in the in-app Notification center (bell icon on the dashboard).

### Future native upgrades

This is already a native iOS app (React Native), so features like widgets or Siri shortcuts can be added later without rebuilding the app.
