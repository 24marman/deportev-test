# Figma Match Card Template

This is the first real implementation of the Figma design at node `1:4`.

## Files

- `index.html`: static preview.
- `styles.css`: visual recreation of the Figma layout.
- `app.js`: dynamic data binding.
- `assets/`: local Figma assets downloaded from the MCP asset URLs.

## What Is Dynamic

- Tournament name/year.
- Phase, group, matchday.
- Match status.
- Home and away names.
- Home and away scores.
- Home and away flag images.
- Stadium name.
- Stadium background image.
- Goal scorer rows.

## Preview

Open `index.html` in a browser.

## Next Step

The next implementation step is to add a render script that opens this HTML at
1080 x 1350 and exports a WebP automatically.

PNG can still be used as a temporary debug/export format when comparing against
Figma, but the public generated asset should be WebP to keep storage and upload
size low.
