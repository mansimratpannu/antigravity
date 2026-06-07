# Implementation Plan - AirDraw Phase 6

This plan outlines the steps required to complete the visual polish, feature additions, and production-ready cleanups for Phase 6 of the AirDraw project.

## User Review Required

> [!NOTE]
> We will restructure the onboarding screen from a static single-card list into a high-fidelity interactive step-by-step wizard. The user can click through each gesture (Draw, Erase, Clear, Save) and see an animated illustration for each. We will also include a "Skip" button to jump straight into the application.

> [!IMPORTANT]
> The Gallery, Share, Fullscreen, and Theme features are already partially defined in the HTML/CSS and some JS helper functions, but the event listeners and binding logic are completely missing. We will wire them up fully.

## Proposed Changes

### HTML Markup

#### [MODIFY] [index.html](file:///c:/Users/mansi/OneDrive/Desktop/AirDraw/index.html)
- Restructure the `#onboarding` container to hold multiple slides (Welcome, Draw, Erase, Clear, Save, Ready) instead of a single list.
- Add "Next", "Back", and "Skip" / "Start Creating" buttons to navigate the slides.
- Add progress indicator dots for the wizard.
- Add custom SVG-based or emoji-based visual placeholders for each gesture inside the wizard to act as "illustrations".

---

### Visual Styling

#### [MODIFY] [style.css](file:///c:/Users/mansi/OneDrive/Desktop/AirDraw/style.css)
- Add styles for the multi-slide onboarding wizard.
- Define slide transitions (fade/slide in).
- Add CSS animations for the illustrations (e.g., a cursor drawing a line, an eraser wiping away a path, a hand model clearing, a loading circle around the save icon).
- Ensure high-fidelity hover effects on all buttons.
- Polish the Gallery grid to look modern and neat (with a delete button if desired, or nice hover states).

---

### Application Logic

#### [MODIFY] [main.js](file:///c:/Users/mansi/OneDrive/Desktop/AirDraw/main.js)
- **Onboarding Wizard**:
  - Implement slideshow navigation (Back, Next, Skip, dots).
  - Track current step and update active classes.
- **Wiring Event Listeners**:
  - Add click listeners to `galleryButton` (open gallery), `galleryClose` (close gallery), and `saveGalleryButton` (capture canvas, add to gallery).
  - Add click listener to `shareButton` to invoke `shareArtwork()`.
  - Add click listener to `fullscreenButton` to toggle fullscreen.
  - Add `fullscreenchange` listener to `document` to update the button's text depending on actual fullscreen state.
  - Bind `themeSelect` change event to `applyTheme()` and load saved theme on initialization.
- **Config & Magic Numbers Cleanup**:
  - Consolidate all magic numbers in `main.js` (like gesture thresholds, skeleton drawing sizes, cursor scale sizes, physics speeds) into the `CONFIG` object.
  - Remove all debugging `console.log` statements (keeping necessary `console.error` logs for setup troubleshooting).
  - Add rich, descriptive comments explaining the gesture thresholds, rendering pipelines, and event handling.
- **Performance Verification**:
  - Ensure the requestAnimationFrame loop and MediaPipe hands detection interval run smoothly at 30+ fps.

## Verification Plan

### Automated Tests
- Since this is a vanilla HTML/JS project without a test suite, we will manually test and verify functionality.

### Manual Verification
- **Onboarding wizard**: Launch the app, verify it shows the multi-step guide. Navigate using Back and Next. Click "Start Creating" or "Skip" and verify it starts the camera and closes onboarding. Verify it doesn't show again on reload (or test clearing localStorage).
- **Gallery**: Draw a simple shape, click "Gallery", then click "Save current". Check if it appears in the grid. Click it to trigger a download. Close gallery, verify UI behaves correctly.
- **Share**: Click "Share" and verify that a PNG download starts. Verify the PNG contains the drawing overlaid on top of a 42% opacity webcam background.
- **Fullscreen**: Click "Fullscreen". Verify browser enters fullscreen. Verify button text changes to "Exit Fullscreen". Press Escape and verify button text reverts to "Fullscreen".
- **Themes**: Cycle themes (Dark, Light, Galaxy, Grid) and verify backdrop changes. Reload page and check if selected theme is persisted.
- **Code Audit**: Verify no `console.log` is printed in developer tools during usage.
