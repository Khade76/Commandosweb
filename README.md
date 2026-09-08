# 44th Commando Regiment — WARDOGS Website

React + Node.js website for the 44th Commando Regiment WARDOGS community.

## Included

- Routed React/Vite frontend
- Express production server
- Separate pages for Home, About, Companies, individual company pages, Our Servers, Enlist, WARDOGS and Donate
- Local assets under `public/assets`, so the site no longer depends on Google Drive hotlinks
- Ko-fi Donate link: https://ko-fi.com/44thwardogs
- Discord link: https://discord.gg/44thwardogs
- Future-ready `/api/servers` endpoint for WARDOGS server status cards
- `/api/health` endpoint for deployment checks

## Routes

- `/`
- `/about`
- `/companies`
- `/companies/vanguard`
- `/companies/spectre`
- `/companies/spartan`
- `/servers`
- `/enlist`
- `/wardogs`
- `/donate`

## Run locally

```bash
npm install
npm run dev
```

The development site runs on port `5173` by default.

## Build and run production

```bash
npm run build
npm start
```

The production server listens on `PORT` or defaults to `3000`.

## API

```text
GET /api/health
GET /api/servers
```

`/api/servers` currently returns placeholder WARDOGS server cards and can later be replaced with live server query data, whitelisting state, player counts, map names, restart notices or admin information.

## Project structure

```text
.
├── index.html
├── package.json
├── public/
│   └── assets/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── data/
│   ├── layout/
│   └── pages/
└── server/
    ├── index.js
    └── servers.js
```

The WARDOGS game link points to the official Steam page. This community website is not affiliated with BULKHEAD or Team17.
