# 44th Commando Regiment — WARDOGS Website

React + Node.js website for the 44th Commando Regiment WARDOGS community.

## Stack

- React 19
- Vite 8
- Node.js 20+
- Express 5

## Included

- Full-screen 44th/WARDOGS recruitment homepage
- Responsive desktop/mobile navigation
- Vanguard Company, Spectre Company and Spartan Company sections
- Discord enlistment links
- Scroll reveal effects
- Express production server
- `/api/health` endpoint ready for future API integrations
- Supplied 44th Google Drive artwork

## Discord

https://discord.gg/44thwardogs

## Development

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The development site runs on port `5173` by default.

## Production

Build the React frontend:

```bash
npm run build
```

Start the Node.js/Express server:

```bash
npm start
```

The production server uses `PORT` when supplied, otherwise port `3000`.

Example:

```bash
PORT=8080 npm start
```

## API

Health check:

```text
GET /api/health
```

This Node server can be expanded later for live WARDOGS server status, recruitment applications, Discord integrations, company rosters, authentication, administration tools, or other dynamic features.

## Project structure

```text
.
├── index.html
├── package.json
├── vite.config.js
├── styles.css
├── remote-assets.css
├── src/
│   ├── App.jsx
│   └── main.jsx
└── server/
    └── index.js
```

## Artwork

The site currently references the supplied public Google Drive artwork using direct image URLs. `remote-assets.css` contains the background-image mappings and `src/App.jsx` contains the foreground logo/patch/banner references.

The WARDOGS game link points to the official Steam page. This community website is not affiliated with BULKHEAD or Team17.
