# Reading Progress for Digital Garden

A thin screen-edge bar measures progress through the main note, excluding
the page footer. Its color uses the applied theme's `--interactive-accent`,
falling back to `--text-accent` or `--color-accent`. Theme switches are reflected
automatically through CSS variables.

Configure bar height, top/bottom placement, background track, and hiding on
short notes in Obsidian's **Digital Garden garden plugin menu**. Enable or
disable it there. Publish/redeploy the garden after changing settings.

Scrolling updates are batched into animation frames. Content resizing (images,
fonts, expanded callouts) updates the measurement. The bar never captures
clicks, respects reduced-motion settings, and is hidden in print and on canvas
pages. No controls are added to the published site.

## Publish as a separate repository

This folder is the repository root. No build step or dependencies are needed.

```sh
git init -b main
git add .
git commit -m "Initial Reading Progress plugin"
gh repo create garden-plugin-reading-progress --public --source=. --remote=origin --push
```

GitHub CLI must be authenticated. Alternatively, create an empty public repo
on GitHub and push this folder to it. Paste its repository URL into Digital
Garden's **Install from GitHub** control. Update both version fields when
releasing changes. The installer prefers the latest GitHub release when one
exists, otherwise the default branch.

## Develop locally

```sh
npm run check
npm test
npm run install:garden -- /path/to/my-digital-garden
```

The installation command copies runtime files and preserves existing settings.
Requires a Digital Garden template with garden plugin support and Node 22+.
