# Implementation Plan - AirDraw (Futuristic 3D Air-Drawing App)

AirDraw is a futuristic, sci-fi-inspired web application that enables users to draw 3D holographic artwork in mid-air using hand gestures captured from a webcam. The project integrates **Three.js** for 3D rendering and **MediaPipe Hands** for real-time, high-frequency hand tracking.

## User Review Required

> [!IMPORTANT]
> **MediaPipe Loading Method**: We will load MediaPipe Hands via Google's official CDN. This guarantees 100% reliability, avoids local WASM bundling configuration issues, and ensures the fastest initial load.
> **Active Workspace**: We will create the project inside `C:\Users\mansi\.gemini\antigravity\scratch\airdraw`. You will need to set this subdirectory as your active workspace in your editor.

## Open Questions
- *None at this stage. The requirements are detailed and clear.*

---

## Proposed Changes

We will initialize a Vanilla JS project using Vite and organize the codebase into modular JS files under `src/`.

### 1. Core Structure & Configuration

#### [NEW] [package.json](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/package.json)
- Standard Node project setup.
- Dependencies: `three` (latest), `vite` (devDependency).

#### [NEW] [index.html](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/index.html)
- Main entry page with webcam video input (hidden or PIP view).
- HTML container for the Three.js canvas.
- Heads-up Display (HUD) overlay for stats, confidence indicators, and sci-fi glassmorphism controls.
- Import MediaPipe libraries from CDN.

#### [NEW] [style.css](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/style.css)
- Sci-fi CSS theme using custom fonts (e.g., Orbitron / Share Tech Mono).
- Glassmorphism panels (using `backdrop-filter: blur()`).
- Neon glow styles (`box-shadow`, `text-shadow`) using cyber cyan and purple.
- Custom cursor styling.

---

### 2. JavaScript Modules (`src/`)

#### [NEW] [sceneManager.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/sceneManager.js)
- Initializes Three.js renderer, perspective camera, lights (ambient, directional, neon point lights).
- Optional bloom post-processing (UnrealBloomPass) for futuristic glow.
- Renders a grid helper and a futuristic 3D boundary cage.
- Handles window resizing.
- Implements particle engine for cursor trail and particle brush.

#### [NEW] [handTracking.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/handTracking.js)
- Configures camera feed at 60fps.
- Sets up MediaPipe `Hands` API with confidence thresholds (e.g., minDetectionConfidence: 0.7, minTrackingConfidence: 0.7).
- Sends raw coordinate data to gesture recognizer.
- Provides status updates (tracking lost, tracking active, hand confidence levels).

#### [NEW] [gestureRecognition.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/gestureRecognition.js)
- Normalizes coordinates relative to the hand size (distance from wrist) to ensure orientation/distance independence.
- Implements heuristics to detect:
  1. **Draw Mode**: Index finger extended only.
  2. **Stop Drawing**: All fingers extended (open palm).
  3. **Eraser Mode**: Closed fist.
  4. **Pinch Mode**: Index and thumb tips touching (distance < threshold).
  5. **Two-Hand Pinch**: Both hands in pinch mode (calculates relative distance change for scaling).
  6. **Wrist Rotation**: Measures roll angle based on the vector from wrist to index knuckle.
  7. **Cycle Brush Colors**: Index, middle, and ring fingers extended.
  8. **Create New Layer**: Peace sign (index and middle fingers extended).
- Includes debouncing logic for triggers (e.g., color cycle, creating new layer) to prevent rapid firing.

#### [NEW] [drawingEngine.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/drawingEngine.js)
- Manages drawing layers and strokes.
- Stores every stroke as an array of 3D coordinates.
- Generates 3D meshes for strokes using `CatmullRomCurve3` combined with:
  - Standard tube geometry (for thick 3D lines).
  - Emissive glowing materials (Glow Brush mode).
  - Particle trails (Particle Brush mode).
- Implements:
  - **Undo / Redo stacks**.
  - **Eraser collision checking**: Calculates distance between the fist (eraser cursor) and stroke geometries to delete close strokes.
  - **Brush properties**: Colors, sizes, types (Solid, Glow, Particle).

#### [NEW] [objectManipulation.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/objectManipulation.js)
- Implements object selection using a raycast/distance check from the index tip to the drawing strokes.
- Translates (moves) the selected drawing stroke relative to the pinch point movement.
- Scales the selected drawing based on the relative change in distance between two pinch points (when two-hand pinch is active).
- Rotates the selected drawing based on wrist roll angle or delta angle from start of rotation.

#### [NEW] [exportManager.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/exportManager.js)
- Implements exporting the 3D drawing strokes as a **GLTF** file using Three.js `GLTFExporter`.
- Saves drawing strokes data structure (layers, colors, brush sizes, 3D point lists) as **JSON** files.
- Handles importing saved JSON drawings and reconstructing their 3D meshes in the scene.

#### [NEW] [ui.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/ui.js)
- Updates the HTML HUD with current gesture status, active mode, layer counts, active color, and brush size.
- Displays tracking indicators (hand confidence percentage, FPS, tracking status).
- Manages virtual cursor projection: maps 2D/3D hand coordinates to screen-space for UI interactions.
- Dwell click implementation: hovering over HTML UI buttons (like Clear, Undo, Export) triggers action.
- Screenshot, Fullscreen, and Import/Export file dialogue bindings.

#### [NEW] [main.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/main.js)
- Application orchestrator.
- Connects `handTracking` callbacks to `gestureRecognition`, which then routes to `drawingEngine`, `objectManipulation`, and `ui`.
- Maintains the main animation loop (`requestAnimationFrame`) to update Three.js rendering, particles, and smooth transitions.

---

## Verification Plan

### Automated Tests
- Since this is a highly visual, gesture-controlled WebGL application, we will rely on manual runtime verification and standard console logging/performance monitoring.
- We will include an optional "mouse/keyboard simulator" mode to test drawing and manipulation functionalities without a webcam.

### Manual Verification
1. **Camera & Tracking initialization**: Verify webcam requests permissions, initializes at 60 FPS, and successfully feeds frames to MediaPipe Hands.
2. **Gesture Calibration**: Print gesture classifications to HUD/console. Verify high-accuracy recognition of:
   - Index-extended -> Draw mode.
   - Open Palm -> Hover/Stop mode.
   - Fist -> Eraser mode (removing nearby strokes).
   - Pinch -> Move/Rotate/Scale mode.
   - Peace sign -> New layer creation.
   - Three fingers -> Color rotation.
3. **Drawing System**: Verify drawing works in true 3D (rotate scene to check curves). Test Undo/Redo and Clear.
4. **Transformations**: Select an existing stroke by pinching it, then move it, scale it (using two hands), and rotate it.
5. **Glow & Particles**: Toggle brush styles. Confirm visual fidelity of Glow brush and Particle brush modes.
6. **File Operations**: Save/Load JSON files. Export to GLTF and inspect the exported file using standard GLTF viewers.
7. **Performance Check**: Verify frame rates stay near 60fps on desktop and mobile. Check for memory leaks on repeated stroke creation.
