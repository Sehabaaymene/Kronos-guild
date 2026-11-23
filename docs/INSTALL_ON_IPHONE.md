# Put Watch Business on your iPhone — free, with GitHub

No Mac, no Apple developer account, no payment. GitHub publishes the app for free; your iPhone installs it from Safari. Your business data is stored **only on your iPhone**.

---

## Part 1 — Put the app on GitHub (once, on your computer, ~10 minutes)

1. Create a free account at **https://github.com/signup** (skip if you have one).
2. Click **+** (top right) › **New repository**.
   - Repository name: `watch-business-manager`
   - Choose **Public** (required for free publishing — only the app's code is visible, never your business data).
   - Do **not** tick "Add a README". Click **Create repository**.
3. On the new empty page, click the link **uploading an existing file**.
4. Open the folder **Desktop › watch-business-upload** in Windows Explorer.
   - Select **everything except the `src` folder** (press Ctrl+A, then Ctrl+click `src` to unselect it) and drag it into the GitHub page.
   - Wait until all files are listed, then click **Commit changes**.
5. Click **Add file › Upload files**, drag the **`src`** folder in, wait, click **Commit changes**.
6. Click **Settings** (top of the repository) › **Pages** (left menu) › under *Build and deployment*, set **Source** to **GitHub Actions**.
7. Click **Actions** (top) › **Publish iPhone app** (left) › **Run workflow** › **Run workflow**.
   Wait 3–5 minutes until it shows a **green check ✓**. (If an earlier run shows a red ✗ because Pages wasn't switched on yet, ignore it.)
8. Your app address is:
   **`https://YOUR-GITHUB-USERNAME.github.io/watch-business-manager/`**
   (also shown at Settings › Pages).

## Part 2 — Install on the iPhone (1 minute)

1. On the iPhone, open the address above in **Safari** (it must be Safari).
2. Tap the **Share** button (square with an arrow) › **Add to Home Screen** › **Add**.
3. Open **Watch Business** from the new icon on your Home Screen. It opens full screen, like any app.
4. From now on it works **without internet**.

> **Always open it from the Home Screen icon.** The Home Screen app keeps its own data, separate from Safari tabs.

## Keep your data safe

- Your data lives inside the Home Screen app on this iPhone. **Removing the icon deletes the data.**
- Make a backup every week: **Settings › Create full backup › Save to Files** (choose iCloud Drive). It includes all purchases, sales, expenses, goals and photos.
- New phone or reinstall: install as above, then **Settings › Restore from a backup…**

## Updating the app later

When the app is changed, upload the changed files to the same GitHub repository (Add file › Upload files). GitHub republishes automatically in a few minutes. The iPhone picks up the new version the next time you open the app with internet (close and reopen it once more if you still see the old version). Your data is kept.

## Good to know

| Feature | In the iPhone web app |
| --- | --- |
| Purchases, sales, batches, profit, expenses, goals, reports, history | ✅ Everything |
| Works offline | ✅ After the first opening |
| Photos (camera / library) | ✅ |
| Backup, restore, CSV export | ✅ via the iPhone share sheet (Save to Files) |
| PDF report | ✅ via Print › Share › Save to Files |
| Notification banners | ✅ iOS 16.4+ only, after allowing them in Settings (alerts are always in the in-app bell too) |
| Face ID lock | ❌ Not available for web apps — use your iPhone passcode / Screen Time if needed |

Want the code private instead of public? Free GitHub only publishes public repositories. With GitHub Pro (about 4 USD/month) the repository can be private and still published.
