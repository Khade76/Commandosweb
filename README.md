# 44th Commando Regiment — WARDOGS Website

A responsive single-page community website inspired by the structure and feel of the existing 44th Squad site, rebuilt specifically for WARDOGS and the 44th Commando Regiment.

## Included

- Full-screen hero with supplied 44th artwork
- Responsive desktop/mobile navigation
- About / mission section
- WARDOGS format strip
- Vanguard Company, Spectre Company and Spartan Company sections
- Discord enlistment flow
- Final recruitment CTA
- Mobile menu and scroll-reveal effects

## Discord

https://discord.gg/44thwardogs

## Run locally

No build step is required. Open `index.html` directly, or serve the folder locally:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deployment

The site is static HTML/CSS/JS, so it can be hosted directly with GitHub Pages, Cloudflare Pages, Netlify, Vercel, OVH, or another standard web host.

## Editing company copy

Company descriptions are in `index.html` under `#companies`. They are draft recruitment copy and can be replaced with official company roles/descriptions whenever those are finalised.

## Artwork

The deployed repository references the supplied public Google Drive artwork through direct image URLs. `remote-assets.css` contains the background artwork mappings, while the logo/patch image URLs are in `index.html`.

The WARDOGS game link points to the official Steam page. This community site is not affiliated with BULKHEAD or Team17.
