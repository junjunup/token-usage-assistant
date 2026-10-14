# Design QA — Logo alignment and Windows taskbar repair 1.8.0-beta.4

final result: passed (package-native Windows regression; existing pins and Mac visual acceptance unverified)

## Findings from beta.3 and fixes

- [P2, fixed] Rail logo visibly shifted right. User evidence: `C:/Users/Jun/AppData/Local/Temp/codex-clipboard-572a4373-88ec-4699-ab40-f2a6289ca2c6.png` (83 × 82). The button's default horizontal padding constrained a 27 px SVG; `place-items:center` alone was insufficient. Set padding to zero only on the native rail brand button and make its SVG block-level. Shape, size, border, radius and all other page components remain unchanged.
- [P1, fixed in new package] Windows taskbar showed the Electron icon. User evidence: `C:/Users/Jun/AppData/Local/Temp/codex-clipboard-61dc433e-6b42-4217-9138-3a0293f12153.png` (2560 × 48). The old runtime window used a 512 × 512 PNG/HICON even though the executable contained the ring. Windows now loads the matching small icon from `app.ico`; main-window shell metadata explicitly references the stable launcher/installed executable. The prior EXE-only QA did not cover this and its earlier pass must not be treated as evidence of taskbar correctness.

## Post-fix evidence and normalization

Project root: `D:/Projects/TokenUsageAssistant/commandcode-companion`.

- Source full view: `docs/verification-1.8.0-beta.3/subscription-codex-dark.png`; final implementation: `docs/verification-1.8.0-beta.4/subscription-codex-dark.png`. Both 1260 × 960, DPR 1, identical synthetic Codex overview state (77% / 58%). Both were displayed together for comparison. Expected differences are the centered logo, version and live clock values; no page redesign.
- User's close-up and final rail images were compared together. Final close-ups `brand-rail-1260-light.png`, `brand-rail-1260-dark.png`, `brand-rail-780-light.png`, `brand-rail-780-dark.png` are 68 × 78 captures from the actual native page at DPR 1. They are cropped evidence, not enlarged/redrawn assets. The user's 83 × 82 crop has extra page area; button proportions and relative margins are the comparison target.
- `brand-native.json` measures SVG center offsets exactly 0 px in X/Y at both 1260 and 780 px widths, in light and dark themes. Visible path bounds differ from the button center by only −0.008 px horizontally / −0.037 px vertically. Theme transitions are completed before final evidence captures to avoid interpreting intermediate colors as final appearance.
- `brand-native-window-icon.png` is returned by the operating system for the real packaged main window, 32 × 32. Average bitmap-channel difference from the generated ring tray image is 0.098/255. This checks the running window's native icon, not just the PE resource. The test also checks that shell icon metadata points to a real filesystem file and that the portable build uses its stable outer launcher.
- `logo-scope-integrity.json` confirms 77 pre-existing files unchanged, including the exact ring artwork, main JSX, all domain/account/storage modules and original stylesheet. `desktop.css` changes only the rail brand padding/display rule. Both EXE payloads match the final source.

## Required fidelity surfaces

| Surface | Post-fix result |
| --- | --- |
| Fonts / typography | Existing Geist / Geist Mono, sizes, weights, line heights and wrapping preserved; no type changes. |
| Spacing / layout | Logo is now centered in 34 px and responsive 30 px buttons. Rail placement, titlebar, body grids, margins and all detail content retain their original layout. |
| Color / tokens | Original monochrome theme foreground and green system icon retained. Stable dark/light snapshots inspected after animations settled. |
| Asset fidelity / quality | Same source-derived ring SVG and native images, no artwork redraw; runtime Windows icon now resolves at the intended shell size. |
| Copy / content | Only version metadata advances to beta.4; original content and account semantics preserved. |

No further actionable P0/P1/P2 mismatch was found within this repair. Both Windows packages, 46 targeted tests, and final-package native regression passed. No actual NSIS install or global icon-cache rebuild was performed. Existing user-created pins that explicitly reference an older EXE are not rewritten. Mac real-device visual acceptance remains pending; full trial package uses the same verified application ASAR. No long soak or real-account reconciliation is claimed.

## Completion checklist

- [x] Fix only logo-button alignment.
- [x] Use native Windows ICO and explicit stable taskbar/relaunch metadata.
- [x] Compare full page and focused final captures to the source.
- [x] Check OS-reported runtime icon and measured alignment in the final portable package.
- [x] Verify installer / portable payloads and preserve old releases.
- [ ] Mac visual acceptance, existing-pin refresh and actual NSIS installation (not claimed).

---

# Historical Design QA — 刻度环 Logo 1.8.0-beta.3 (superseded by the regression findings above)

final result: passed (Windows logo scope; Mac visual acceptance pending)

## Current scope and visual truth — 2026-09-26

The user approved the refined ring logo and explicitly asked to retain the existing detail page/UI. The truth for the logo is `docs/brand/approved-ring-r2.png` (1536 × 1024). The truth for the application is the existing beta.2 native screenshots in `docs/verification-1.8.0-beta.2`, not the previously rejected generated dashboard redesign. All paths are relative to `D:/Projects/TokenUsageAssistant/commandcode-companion`.

The black master in the approved board was automatically vector-traced into `desktop/assets/brand-mark.svg`; its silhouette was not invented or redrawn with primitive shapes. Parameters and source hash are recorded in `docs/brand/source.json`. Background texture was removed by monochrome tracing, and 32 units of optical padding were added around the 512-unit extraction. System green deliberately remains the existing #10b981.

## Evidence and comparison

- Full-view source and implementation were displayed together in one comparison input: beta.2 and beta.3 `subscription-codex-dark.png`, each 1260 × 960 native screenshot pixels, same Windows window size and sample Codex account, dark theme, overview, 77% and 58% quota values. They use the same native capture scale; no density resizing was applied. Clock/reset seconds and version text are dynamic/expected differences.
- Implementation evidence: `docs/verification-1.8.0-beta.3/subscription-codex-dark.png`, `balance-multi-light.png` (1260 × 960), and `balance-widget-compact.png` (324 × 366). The main and compact widget retain their native layout. No screenshot was presented as a live account result.
- Focused asset comparison displayed the approved board, the actual icon extracted from the packaged Windows EXE (`executable-icon.png`, 32 × 32), and `desktop/assets/tray.png` (32 × 32) together. The additional 512 × 512 `desktop/assets/app.png` inspection checks contour, clear cutouts, transparency and smoothing at large size. These mark comparisons assess normalized shape, not pixel equality between a textured large specimen and a small monochrome icon.
- `logo-scope-integrity.json` confirms 72 pre-existing source/native files are byte-identical, including all existing styles and native business logic. The main JSX differs only in the logo import and three brand occurrences; preview data differs only in the version string. This supports unchanged page typography/layout beyond the screenshot comparison.
- `icon-proof.html` is a local reference sheet, not a browser-verified capture. Browser policy refused its local file URL; QA instead used directly inspected native screenshots and PNG assets. No workaround browser navigation was attempted.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts and typography | Original Geist / Geist Mono, hierarchy, sizes, weights, wrapping and label spacing retained. No typography source changed; full-view output remains aligned. |
| Spacing and layout | Same rail, titlebar, content margins, account row, quota panel, 34 px logo button, dividers and widget bounds. Only the mark's intended silhouette changes inside its existing 27 / 17 / 30 px SVG box. |
| Colors and tokens | Existing dark/light colors and semantic green/purple remain unchanged. Mark inherits currentColor in the interface; system icon uses existing #10b981. No new gradients, glows, shadows or dashboard treatments. |
| Image quality and fidelity | Long arc, right-upper short arc and two diagonal openings preserved. Transparent backgrounds are clean. Small native icon and tray asset are legible at 32 px; the 17 px compact widget mark remains distinguishable. Vector source supports scaling; ICO includes 16, 20, 24, 32, 48, 64, 128 and 256 px. |
| Copy and content | No product renaming, labels, data semantics or detail content changed. Only version metadata advances to beta.3. Native screenshot values are test fixtures. |

## Findings and remaining limits

No actionable P0/P1/P2 visual mismatch was found in the approved logo scope. First comparison passed; no redesign was introduced. Brand SVG is decorative (`aria-hidden`, non-focusable); the enclosing button keeps its existing accessible label.

Windows package-native smoke passed with both main/widget ready and tray created. 46 targeted desktop/platform/Sites tests passed. Packaged files match source; installer and portable include the same application ASAR. The actual NSIS installation flow and Windows shell icon-cache refresh were not tested. Mac Dock/menu-bar rendering, static ICNS behavior and real Mac acceptance remain unverified; the Mac full kit is still a development trial. There was no new long stability test or new real-account/model call.

## Completion checklist

- [x] Preserve approved source and vector master; generate native PNG/ICO/ICNS.
- [x] Replace only active product brand marks.
- [x] Verify unchanged page/native sources and compare native dark/light/widget views.
- [x] Build both Windows artifacts; verify native startup, source and payload consistency.
- [x] Package the same ASAR with the unmodified official Mac ARM64 runtime.
- [ ] Mac real-device visual acceptance (explicitly pending, not claimed).

---

# Historical Design QA — original Command Code reference prototype

final result: passed

## Scope and reference

This is a desktop-companion adaptation of the supplied Usage page, not a pixel-for-pixel clone. The user requested one interactive prototype after providing the website as the UI reference. Account numbers in the prototype are synthetic.

Source visual truth: C:/Users/张董/Documents/Codex/2026-09-23/token-x20/work/commandcode-reference.png
Source URL: https://commandcode.ai/junjunup/settings/usage
Implementation: http://127.0.0.1:4173/
Implementation screenshot: preview.jpg
Full-view comparison: C:/Users/张董/Documents/Codex/2026-09-23/token-x20/work/qa-comparison.jpg
Focused comparison: work/reference-quota.png and work/prototype-quota.png under the parent workspace; both inspected together in the browser tool output.

## Viewport, state, and normalization

- CSS viewport: 1440 × 1000, light theme, overview, normal state, details collapsed, floating widget hidden.
- Reference raster: 1440 × 1000. Implementation raster: 1425 × 990, as emitted by the in-app browser. These files are JPEG captures.
- Both raster captures were normalized to 1440 × 1000 for a single side-by-side 2880 × 1000 comparison. No pixel-diff accuracy claim is made; the approximately 1% browser-capture scaling difference is immaterial to the style-adaptation comparison.
- Additional viewports: 900 × 760 and 390 × 844. The 390px viewport had document scrollWidth 375px, with no horizontal overflow. Narrow content uses vertical scrolling.
- Full-page capture at the narrow viewport showed a browser stitching artifact; it was not used as a visual fidelity reference or deliverable. The actual DOM width and viewport rendering were checked.

## Comparison history

### Initial review

- [P2, resolved] Supporting copy was too small for comfortable Chinese reading. Quota metadata, legends, settings descriptions, footer, and widget text were increased by 1–2px.
- [P2, resolved] Initial vertical rhythm placed footer controls at the lower edge of the 1000px viewport. Reduced titlebar, heading, row and section spacing. Final footer ends at approximately CSS y=944, above the simulated tray.
- [P2, resolved] A low-usage scenario initially showed a threshold warning even with a 10% threshold. Changed the comparison to strictly below the user-selected threshold. Verified that 18% at a 10% threshold does not trigger a low-quota warning.
- Status text green and amber were darkened on the light theme for readability.

### Post-fix review

Reference and final screenshot were opened together, then normalized into qa-comparison.jpg. Quota detail captures were also viewed together. No actionable P0/P1/P2 visual or functional issues remain within the requested prototype scope.

## Required fidelity surfaces

- Fonts/typography: source DOM identifies Geist. Local Geist and Geist Mono are used, with Microsoft YaHei UI fallback for Chinese. Large quota figures have strongest hierarchy; supporting figures and labels remain secondary.
- Spacing/layout: white surfaces, narrow navigation rail, thin dividers, mostly square panels, restrained shadows. Quota panels intentionally move to the left to match the user's priority. Footer and primary controls remain reachable at narrower widths.
- Colors/tokens: emerald segmented quota bars, purple Token split, zinc foreground and borders, amber warning/cost accents. Deep theme uses the same semantic palette.
- Images/assets/icons: no photography or illustration is necessary. No user avatar, trace data, or actual account values are copied into the prototype. Standard icons use Phosphor, with local font packages. Command symbol is a standard icon, not a claim of official branding.
- Copy/content: Chinese task labels distinguish remaining vs used quota, account aggregate vs client attribution, and fee allowance vs Token quantities. Prototype and demonstration labels are always visible.

## Primary interactions verified in the browser

- Remaining/used switch: 68/42 remaining becomes 32/58 used, with matching progressbar values and captions.
- Floating widget: opens/closes; values track 18/26 and 0/12 scenarios; unpin, drag, re-pin work. Drag moved the widget to approximately x=325,y=144 at a 900 × 760 viewport.
- Minimize/close detail panel: keeps simulated widget and tray. Tray menu restores the overview.
- Normal, low, limit, and offline scenarios: offline retains the preceding successful data and sync time; limit shows 0% remaining.
- Settings: 10/20/30% thresholds, refresh interval, notification on/off, theme, and widget toggle.
- Notifications disabled: threshold and test controls disabled. Test notification reflects selected threshold.
- Refresh: button becomes disabled while loading; completion updates timestamp and visible feedback.
- Billing details: expands to correct input/output/total/request/cost rows.
- Explanation dialog: opens, returns focus, dismisses with Escape.
- Light/dark switch: inspected both rendered states.
- No console warnings or errors were returned by the browser log inspection.
- Production build passed after final source changes.

## Expected differences and limitations

- This is a browser prototype. Tray, floating window, and notifications do not integrate with the operating system.
- No auth, API keys, actual billing API, persistence across reloads, or live request history.
- The website's request table and decorative mini charts were replaced with supported aggregate metrics and optional detail rows.
- No formal screen-reader or automated WCAG audit was performed. Native controls, labels, focus styles, semantic progressbars, dialog focus behavior, and reduced-motion support are present.

## Follow-up polish

- [P3] A future native implementation can replace the simulated rail/tray with real Windows tray and toast APIs.
- [P3] Source request history can only be added after its data access contract is confirmed.
