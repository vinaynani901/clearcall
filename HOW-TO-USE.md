# ClearCall — How to Use Every Day

## Step 1 — Every Morning, Start the Servers

Double click the file called **START HERE FIRST.bat**.

Wait about 5 seconds. Chrome will open automatically.

Do not close the CMD windows that appear — they keep the app running. You can minimize them, just don't close them.

## Step 2 — Open the Dashboard You Want

- Double click **ClearCall - EMPLOYER.bat** to open the employer dashboard.
- Double click **ClearCall - JOB SEEKER.bat** to open the job seeker dashboard.
- Double click **ClearCall - ADMIN.bat** to open the admin panel.

Each of these opens straight to that dashboard's login screen — you'll still need to enter your email/password (or the admin credentials) as normal.

## Step 3 — Put Shortcuts on Your Desktop

1. Right click on **START HERE FIRST.bat**.
2. Click **Send to**, then click **Desktop (create shortcut)**.
3. Right click the new desktop shortcut and click **Properties**.
4. Click the **Change Icon** button.
5. Click **Browse**.
6. Go to the `frontend/public` folder inside your project.
7. Select **server-icon.ico**.
8. Click **OK**, then click **Apply**.

Repeat these same steps for the other three .bat files, using their matching icon file:

- **ClearCall - EMPLOYER.bat** uses `employer-icon.ico`
- **ClearCall - JOB SEEKER.bat** uses `jobseeker-icon.ico`
- **ClearCall - ADMIN.bat** uses `admin-icon.ico`

## Step 4 — Install as a PWA for Even Easier Access

After starting the servers, open Chrome at `localhost:5173`.

Look for a small computer icon with a down arrow in the Chrome address bar, on the right side.

Click it, then click **Install**.

ClearCall installs as an app on your desktop with proper icons. You can then right click the installed app and pin it to your taskbar.

## Step 5 — Shutting Down at the End of the Day

Close the two CMD windows that opened when you ran **START HERE FIRST.bat** (one for the backend, one for the frontend), then close the launcher window itself.

The app will no longer be accessible until you start it again tomorrow.
