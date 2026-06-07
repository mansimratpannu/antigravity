# Implementation Plan - Gesture Detection & Drawing Fixes

This plan aims to resolve the drawing detection issues ("cant draw", "index point not working", and "new layer peace sign not working") by switching the finger extension heuristic from a wrist-relative distance calculation to a knuckle-relative (MCP joint) 3D Euclidean distance calculation.

## User Review Required

> [!IMPORTANT]
> **Knuckle-Relative Extension Heuristic**:
> Instead of using the wrist (landmark 0) as the reference point for finger extension, we will use each finger's corresponding knuckle (MCP joint, landmark `pipIdx - 1`). 
> - **Extended Ratio (straight finger)**: The tip-to-knuckle distance is about `2.0x` to `2.5x` of the PIP-to-knuckle distance.
> - **Curled Ratio (folded finger)**: The tip curls back to the knuckle, dropping the ratio below `1.0x`.
> - This offers a massive, stable separation (2.0 vs < 1.0) compared to the old wrist-based ratio (1.23 vs 0.85), making it highly resilient to depth noise.

---

## Proposed Changes

### 1. Gesture Recognition Heuristics

#### [MODIFY] [gestureRecognition.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/gestureRecognition.js)
- Update `isFingerExtended(landmarks, tipIdx, pipIdx)` to:
  - Derive `mcpIdx = pipIdx - 1`.
  - Calculate `mcpToPip` and `mcpToTip` using 3D Euclidean distance.
  - Return `true` if `mcpToTip > mcpToPip * 1.35`.
- Remove the unused `wristIdx` parameter from `isFingerExtended`.

### 2. Coordinate Sanitization & Safety Guards

#### [MODIFY] [drawingEngine.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/drawingEngine.js)
- Add safety guards in `addPointToStroke(point)` to filter out any coordinates containing `NaN` values before performing operations or appending to `activeStrokePoints`.

#### [MODIFY] [main.js](file:///C:/Users/mansi/.gemini/antigravity/scratch/airdraw/src/main.js)
- Add debug logging to `executeGestureState` to write active modes to the HUD System Console when they change, making it easy to see if `DRAW` mode is successfully activated.

---

## Verification Plan

### Manual Verification
1. **Dwell/Pinch UI interactions**: Check that the virtual cursor continues to hover and click buttons seamlessly.
2. **Draw Mode**: Hold index finger up and curl other fingers. Confirm the system console logs "Started drawing..." and strokes are successfully drawn.
3. **Peace Sign**: Extend index and middle fingers. Verify that a "New active drawing layer" is created and logged to the console.
4. **Eraser Mode**: Form a closed fist. Verify that nearby strokes are erased with red particle debris.
5. **Color Cycle**: Hold up index, middle, and ring fingers. Verify the brush color changes.
6. **No-Webcam Fallback**: Double-click the canvas to enable mouse simulation. Verify that drawing and controls work properly.
