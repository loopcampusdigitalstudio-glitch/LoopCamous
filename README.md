# LoopCampus Digital Studio — website

A one-page, mobile-first website for a student-run digital marketing studio.
Plain HTML, CSS and vanilla JavaScript — no frameworks, no build step. Just
open `index.html` in a browser.

## Files

| File | Purpose |
|------|---------|
| `index.html` | All page content and structure |
| `style.css` | All styling (mobile-first, responsive) |
| `script.js` | Mobile menu, contact form mailto, scroll effects |
| `assets/logo.svg` | Studio logo (used in header and footer) |
| `assets/hero-illustration.svg` | Illustration in the hero section |
| `assets/team-placeholder.svg` | Placeholder photo for team cards |
| `assets/og-image.svg` | Open Graph / social preview image |

## How to customise

### 1. Things you MUST fill in (marked with [SQUARE BRACKETS])

Search the project for `[` and `]` to find every placeholder:

- `[YOUR WEBSITE URL]` — Open Graph URL in `index.html`
- `https://wa.me/91XXXXXXXXXX` — your WhatsApp number (appears in the hero, packs and contact section)
- `[YOUR EMAIL]` — contact email (appears in `index.html` and `script.js`)
- `[YOUR INSTAGRAM HANDLE]` — your Instagram handle in `index.html`
- `[LOGO IMAGE OR TEXT]` — swap `assets/logo.svg` for your real logo file
- `[Member 1 Name]` … `[Member 7 Name]` — team member names
- `[Teacher Name]` — faculty mentor name
- `[Photo of ...]` — alt text for real team photos once you replace `assets/team-placeholder.svg`
- `[YEAR]` — copyright year in the footer

### 2. Colours

Open `style.css` and edit the CSS variables at the top:

```css
:root {
  --color-indigo: #1E1B4B;
  --color-coral: #FF7A59;
  --color-teal: #2EC4B6;
  --color-cream: #FBF7F0;
  /* ... */
}
```

Change any hex value and the whole site updates. Keep contrast in mind:
dark indigo text on cream passes accessibility contrast checks.

### 3. Fonts

Fonts are loaded from Google Fonts in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fredoka:wght@600;700&display=swap" rel="stylesheet">
```

- Headings: **Fredoka**
- Body: **DM Sans**

To change, swap the font names in that link and in `--font-heading` /
`--font-body` in `style.css`.

### 4. Images

Replace any file in `assets/` with your own image of the same name (or update
the `src` attributes in `index.html`). Recommended sizes:

- `logo.svg` — square brand mark, ~32×32 px display size
- `team-placeholder.svg` — square portrait, ~120×120 px display size
- `hero-illustration.svg` — ~420×320 px
- `og-image.svg` — ~1200×630 px for social previews

Always add meaningful `alt` text to images for accessibility.

### 5. Text

Edit the copy directly in `index.html`:

- Hero headline and subheading
- Problem cards
- Service cards
- How-it-works steps
- Pack names, prices and features
- Team names, roles and descriptions
- Contact details and form labels

Do not invent testimonials, statistics, clients or awards — use placeholders
until you have real content.

### 6. Contact form behaviour

The form opens the visitor's default email app (mailto) rather than sending
from the site, so no backend is needed. The recipient address is set in
`script.js`:

```js
const to = '[YOUR EMAIL]';
```

Replace `[YOUR EMAIL]` with your real address.

## Browser support

Works in any modern browser. Tested approach: open `index.html` directly or
serve it with any static server (e.g. `python3 -m http.server`).

## Accessibility notes

- Skip-to-content link for keyboard users
- Sticky navigation with an accessible mobile menu (`aria-expanded`)
- `:focus-visible` outlines on all interactive elements
- Semantic HTML (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`)
- `prefers-reduced-motion` respected for animations