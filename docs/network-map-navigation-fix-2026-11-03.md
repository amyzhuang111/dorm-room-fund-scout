# Network map navigation fix — November 3, 2026

## Screenshot problem

The user's live screenshot showed an almost empty off-white map, tiny annotations floating at its margins and very long diagonal leader lines. The central founder/company network was not readable, and map navigation wasn't discoverable in the viewport.

## Changes

- **Initial view:** launch the 2D network overview on desktop and mobile (not WebGL 3D). At initial overview scale, the entire network is framed directly on a canvas with visible color-coded clusters and nodes. 3D remains an explicit, reversible option.
- **A clear camera:** first render starts at Overview (camera scale 1.14), not Wide (0.76). Users can still select Wide as the far-out view or Fit to restore a readable overview.
- **On-canvas controls:** Zoom in, Zoom out, and Fit always appear inside the map at its upper right. They are accessible with keyboard, have descriptive labels and stop pointer events from starting an accidental pan.
- **Remove visual clutter:** eliminate 2D editorial callouts with giant diagonal lines and 3D campus margin leader lines. Keep local campus and program labels and the substantive network/source information below the canvas.
- **Navigation stability:** 3D no longer starts slowly rotating after inactivity. The optional 3D view has a limited number of campus annotations, and both canvas heights are capped so graph and search/roster are easier to reach.

## Scope and verification

Code-only change to `components/networks-graph.tsx` and `components/networks-graph-3d.tsx`. **Do not** modify the global campus/HQ map, university source directories, networks data generation, GitHub's canonical SQLite database, founder page, or company page. Follow existing functions for search by founder/company, network evidence links, and company records.

CI `.github/workflows/verify-network-navigation.yml` tests overview mode, map controls, disappearance of obstructive margin lines, network counts, directory regression and TypeScript. Vercel independently builds the production bundle. Visual behavior in an actual browser should be checked after production deployment; a successful build alone doesn't guarantee all graphics load on a given device.
