# Backup and recovery

Your business data exists **only on your iPhone**. Back it up.

## Where the data is

- Database: a private SQLite file inside the app (`watch-business.db`). Other apps cannot read it.
- Pictures (watches, receipts, logo): the app's private `Documents/images` folder.

## 1. Full backup (recommended weekly)

Settings › Backup & restore › **Create full backup**

- Creates one file `WatchBusiness-backup-YYYY-MM-DD-….json` containing **every table** (models, purchases, sales, payments, expenses, goals, notifications, history, settings) **and every picture**.
- The iPhone share sheet opens: choose **Save to Files › iCloud Drive** (best), AirDrop it to a computer, or email it to yourself.
- The app shows a warning when your last backup is older than 7 days.

## 2. iCloud device backup (automatic)

If iPhone Settings › [your name] › iCloud › **iCloud Backup** is on, the app's data and pictures are included in the iPhone backup. Restoring the whole iPhone from iCloud brings the app data back. Use this as a second layer — the full backup file above is easier to restore selectively.

## 3. Restoring

Settings › Backup & restore › **Restore from a backup…**

1. Pick the backup file (from Files / iCloud Drive).
2. The app shows what the file contains (date, number of models, purchases, sales, expenses, goals, pictures).
3. Confirm **Replace my data**. All current data is replaced by the backup, in one atomic step (if anything fails, nothing changes).
4. Before replacing, the app automatically saves a **safety copy** of the current data on the phone (Settings › *Automatic safety copies*). If you restored the wrong file, restore that safety copy.

## 4. Recovering from accidental changes

- **Edited or cancelled something by mistake?** Every change is recorded in *Business history* with before/after values — use it to re-enter the correct values.
- **Deleted an expense/purchase?** History keeps the full deleted record. Re-create it, or restore your last backup.
- **Lost or replaced the iPhone?** Install the app on the new phone, then restore your latest backup file from iCloud Drive.
- **Deleting the app deletes its data.** Always back up first.

## 5. Spreadsheet exports (not a backup)

Settings › Export data, or Reports. CSV files for purchases, sales, expenses and inventory open in Excel, Numbers or Google Sheets. A PDF financial report is in Reports. These are for reading and accounting — **only the full backup file can be restored**.

## 6. Pictures

Pictures are included in the full backup file (as base64). Restoring a backup writes them back. If you only need the pictures, they are also visible in the backup file or via each product page.
