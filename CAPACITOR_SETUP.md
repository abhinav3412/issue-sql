# Capacitor Setup

This project is configured to run as a Capacitor mobile shell.

## Why hosted mode

Your app uses Next.js API routes and database-backed server logic, so it cannot run as a fully static offline bundle.  
Capacitor is set up to load a deployed URL via `CAPACITOR_SERVER_URL`.

## Commands

- Install dependencies: `npm install`
- Sync native projects: `npm run cap:sync`
- Open Android Studio: `npm run cap:open:android`
- Open Xcode: `npm run cap:open:ios`

## Required env before sync/build

Set a hosted URL before syncing:

```powershell
$env:CAPACITOR_SERVER_URL="https://your-domain.com"
npm run cap:sync
```

For local Android emulator against dev server:

```powershell
$env:CAPACITOR_SERVER_URL="http://10.0.2.2:3000"
npm run dev
npm run cap:sync
```

For local iOS simulator:

```powershell
$env:CAPACITOR_SERVER_URL="http://localhost:3000"
npm run dev
npm run cap:sync
```
