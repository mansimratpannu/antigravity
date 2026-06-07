import './style.css';
import * as THREE from 'three';
import { sceneManager } from './sceneManager';
import { handTracking } from './handTracking';
import { gestureRecognition } from './gestureRecognition';
import { drawingEngine } from './drawingEngine';
import { objectManipulation } from './objectManipulation';
import { uiManager } from './ui';

class App {
  constructor() {
    this.smoothedCoords = new THREE.Vector3();
    this.coordsSmoothing = 0.75; // Low pass filter factor (0 = no smoothing, 1 = locked)
    
    // Track gesture changes
    this.prevMode = 'LOST';
    
    // Cycle colors array
    this.colorPalette = ['#00f0ff', '#bd00ff', '#ff0055', '#00ff66', '#ffcc00', '#ffffff'];
    
    // Mouse fallback state
    this.mouseCoords = new THREE.Vector3(0, 0, 0);
    this.isMouseDown = false;
    this.isShiftDown = false;
    this.isSpaceDown = false;
    this.useMouseFallback = false;
  }

  init() {
    // 1. Init 3D Viewport
    sceneManager.init('canvas-container');
    
    // 2. Init UI overlay
    uiManager.init();
    uiManager.syncUIStates();

    // 3. Init Hand Tracking loop
    handTracking.init(
      'webcam', 
      'tracking-canvas',
      (results, fps) => this.onHandTrackingResults(results, fps),
      (text, isActive) => this.onHandTrackingStatusChange(text, isActive)
    );

    // 4. Setup Keyboard/Mouse backup controls for local validation
    this.setupFallbackControls();

    // 5. Start main requestAnimationFrame loop
    this.animate();
  }

  // Fallback keyboard/mouse triggers for testing
  setupFallbackControls() {
    const canvas = sceneManager.renderer.domElement;
    
    // Enable mouse mode if double-clicked on canvas (means developer bypass or camera missing)
    canvas.addEventListener('dblclick', () => {
      this.useMouseFallback = !this.useMouseFallback;
      uiManager.logConsole(`System: Mouse testing fallback ${this.useMouseFallback ? 'ENABLED' : 'DISABLED'}`);
      if (this.useMouseFallback) {
        uiManager.updateTrackingStatus('MOUSE_SIMULATION', true);
      } else {
        uiManager.updateTrackingStatus('DISCONNECTED', false);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.isShiftDown = true;
      if (e.key === ' ') {
        this.isSpaceDown = true;
        e.preventDefault();
      }
      // Keyboard shortcuts
      if (e.key.toLowerCase() === 'z' && e.ctrlKey) {
        document.getElementById('btn-undo')?.click();
      }
      if (e.key.toLowerCase() === 'y' && e.ctrlKey) {
        document.getElementById('btn-redo')?.click();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.isShiftDown = false;
      if (e.key === ' ') this.isSpaceDown = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      this.isMouseDown = true;
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      // Map mouse x, y to viewport coordinates [-20, 20]
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      
      this.mouseCoords.x = x * 22;
      this.mouseCoords.y = y * 16;
      // Mouse wheel shifts Z depth
    });

    canvas.addEventListener('wheel', (e) => {
      if (this.useMouseFallback) {
        this.mouseCoords.z -= e.deltaY * 0.02;
        this.mouseCoords.z = Math.max(-18, Math.min(18, this.mouseCoords.z));
      }
    });
  }

  // Handle webcam connection status updates
  onHandTrackingStatusChange(text, isActive) {
    uiManager.updateWebcamStatus(text, isActive);
    if (isActive) {
      uiManager.logConsole("Webcam connection active. Starting tracking system...");
    } else {
      uiManager.logConsole(`Webcam state change: ${text}`);
    }
  }

  // Process raw landmarks sent by MediaPipe tracking thread
  onHandTrackingResults(results, fps) {
    if (this.useMouseFallback) return; // Prioritize mouse simulation if toggled

    const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
    
    // Update top header stats
    uiManager.updateStats(
      fps, 
      numHands, 
      numHands > 0 ? results.multiHandedness[0].score : 0
    );

    if (numHands === 0) {
      this.handleLostTracking();
      return;
    }

    // Hand tracking connected
    uiManager.updateTrackingStatus('ACTIVE', true);

    // 1. Recognize hand gestures
    const gestureState = gestureRecognition.recognizeGestures(
      results.multiHandLandmarks,
      results.multiHandedness
    );

    // Highlight active gestures in left list HUD
    if (gestureState.hands && gestureState.hands.length > 0) {
      uiManager.updateActiveGestureHUD(gestureState.hands[0].gesture);
    }

    // 2. Process triggers (Single event triggers)
    if (gestureState.triggerAction === 'NEW_LAYER') {
      uiManager.triggerNewLayer();
      // Celebrate layer addition with a volumetric burst of particles at center
      sceneManager.emitParticles(new THREE.Vector3(0, 0, 0), '#00f0ff', 30);
      sceneManager.emitParticles(new THREE.Vector3(0, 0, 0), '#bd00ff', 30);
    } else if (gestureState.triggerAction === 'CYCLE_COLOR') {
      this.cycleColorPalette();
    }

    // 3. Project normalized tracking coordinates to Three.js world space
    let target3DPos = null;

    if (gestureState.mode === 'SCALE') {
      // Scale mode: Pinch midpoint is the cursor
      const midPoint = {
        x: (gestureState.pinchPoint1.x + gestureState.pinchPoint2.x) / 2,
        y: (gestureState.pinchPoint1.y + gestureState.pinchPoint2.y) / 2,
        z: (gestureState.pinchPoint1.z + gestureState.pinchPoint2.z) / 2
      };
      target3DPos = this.mapCoordinates(midPoint, gestureState.handScaleSize || 0.12);
    } else if (gestureState.cursorPosition) {
      target3DPos = this.mapCoordinates(gestureState.cursorPosition, gestureState.handScaleSize || 0.12);
    }

    // 4. Apply exponential smoothing to prevent coordinate noise/jitter
    if (target3DPos) {
      this.smoothedCoords.lerp(target3DPos, 1.0 - this.coordsSmoothing);
    }

    // 5. Execute state machine logic based on gesture mode
    this.executeGestureState(gestureState);
  }

  handleLostTracking() {
    uiManager.updateTrackingStatus('LOST', false);
    uiManager.updateActiveGestureHUD('NONE');

    // Make sure we commit active strokes/transforms if hand drops out of frame
    if (this.prevMode === 'DRAW') {
      drawingEngine.endStroke();
    } else if (this.prevMode === 'PINCH' || this.prevMode === 'SCALE') {
      objectManipulation.endTransform(drawingEngine.undoStack);
      objectManipulation.deselect();
    }

    // Hide virtual cursor and scene lights
    uiManager.updateVirtualCursor(null, false);
    sceneManager.updateCursorLight(null, 0xffffff, false);
    
    this.prevMode = 'LOST';
  }

  // Maps normalized MediaPipe coordinates into Three.js cage volume
  mapCoordinates(normalizedPoint, handScaleSize) {
    // X axis mirroring: maps 0..1 raw coord to Three.js range [-22, 22]
    const x = (0.5 - normalizedPoint.x) * 44;
    // Y axis: maps 0..1 raw coord to Three.js range [-16, 16]
    const y = (0.5 - normalizedPoint.y) * 32;
    
    // Z axis: Map hand size (distance from camera) to Three.js range [-18, 18]
    // Standard hand size values range from 0.07 (far) to 0.22 (close)
    const minHand = 0.07;
    const maxHand = 0.20;
    const clampedHand = Math.max(minHand, Math.min(maxHand, handScaleSize));
    const normalizedHand = (clampedHand - minHand) / (maxHand - minHand);
    
    // Moving hand closer to camera maps to +Z, far maps to -Z
    const z = (normalizedHand - 0.5) * 36;

    return new THREE.Vector3(x, y, z);
  }

  // Gesture State Machine logic
  executeGestureState(gestureState) {
    const mode = gestureState.mode;
    const currentPos = this.smoothedCoords;
    const colorHex = drawingEngine.currentColor;

    // Handle transitions between states
    if (this.prevMode !== mode) {
      // 1. Exiting states
      if (this.prevMode === 'DRAW') {
        drawingEngine.endStroke();
        uiManager.logConsole("Drawing finished.");
      } else if (this.prevMode === 'PINCH' || this.prevMode === 'SCALE') {
        objectManipulation.endTransform(drawingEngine.undoStack);
      }
      
      // 2. Entering states
      if (mode === 'DRAW') {
        drawingEngine.startStroke();
        uiManager.logConsole("Started drawing...");
      } else if (mode === 'ERASE') {
        uiManager.logConsole("Eraser mode active.");
      }
      
      this.prevMode = mode;
    }

    // Update scene light tracker
    sceneManager.updateCursorLight(currentPos, colorHex, mode === 'DRAW');

    // Run active state operations
    switch (mode) {
      case 'DRAW':
        drawingEngine.addPointToStroke(currentPos);
        // Spawn active trail particles
        sceneManager.emitParticles(currentPos, colorHex, 2);
        // Update virtual screen overlay cursor (no clicking in draw mode)
        if (gestureState.primaryHand) {
          uiManager.updateVirtualCursor(gestureState.primaryHand.landmarks[8], false);
        }
        break;

      case 'ERASE':
        const handScaleSize = gestureState.handScaleSize || 0.12;
        if (drawingEngine.eraseStrokesNear(currentPos, handScaleSize)) {
          uiManager.logConsole("Erasing strokes...");
        }
        // Emit red/pink sparks for eraser visual
        sceneManager.emitParticles(currentPos, '#ff0055', 3);
        if (gestureState.primaryHand) {
          uiManager.updateVirtualCursor(gestureState.primaryHand.landmarks[9], false);
        }
        break;

      case 'PINCH':
        // Project screen space virtual cursor to click buttons
        if (gestureState.primaryHand) {
          const rawPinch = gestureState.primaryHand.pinchPoint;
          const wristAngle = gestureState.primaryHand.wristAngle || 0;

          // Project cursor to screen for buttons hover click (isPinching = true)
          uiManager.updateVirtualCursor(rawPinch, true);

          // Handle 3D stroke manipulations
          if (!objectManipulation.selectedStroke) {
            // Find nearest object to pinch and select
            const selected = objectManipulation.selectStrokeNear(currentPos, drawingEngine.strokes);
            if (selected) {
              uiManager.logConsole(`Selected stroke [${selected.id}] for manipulation.`);
              objectManipulation.startTransform(currentPos, wristAngle, 0);
            }
          } else {
            // Apply drag & rotation
            objectManipulation.applyTransform(currentPos, wristAngle, 0);
          }
        }
        break;

      case 'SCALE':
        // Two-hand scale
        if (objectManipulation.selectedStroke) {
          if (this.prevMode !== 'SCALE') {
            objectManipulation.startTransform(currentPos, 0, gestureState.scaleDistance);
          }
          objectManipulation.applyTransform(currentPos, 0, gestureState.scaleDistance);
        }
        break;

      case 'HOVER':
      default:
        // Deselect if we hovered away
        if (objectManipulation.selectedStroke) {
          objectManipulation.deselect();
        }
        
        // Project screen space virtual cursor for dwell selection (isPinching = false)
        if (gestureState.primaryHand) {
          uiManager.updateVirtualCursor(gestureState.primaryHand.landmarks[8], false);
        }
        break;
    }
  }

  // Cycles the active brush color
  cycleColorPalette() {
    const curColor = drawingEngine.currentColor.toLowerCase();
    const curIdx = this.colorPalette.findIndex(c => c.toLowerCase() === curColor);
    const nextIdx = (curIdx + 1) % this.colorPalette.length;
    const nextColor = this.colorPalette[nextIdx];
    
    drawingEngine.setBrushColor(nextColor);
    uiManager.logConsole(`Cycle brush color to: ${nextColor}`);
    uiManager.syncUIStates();

    // Spawn burst of colored sparkles around active hand position
    sceneManager.emitParticles(this.smoothedCoords, nextColor, 20);
  }

  // Mouse Simulation loop for local development and validation without cameras
  runMouseSimulation() {
    this.smoothedCoords.copy(this.mouseCoords);
    sceneManager.updateCursorLight(this.mouseCoords, drawingEngine.currentColor, this.isMouseDown);

    // Virtual cursor update based on mouse position
    const normX = this.mouseCoords.x / 22 * 0.5 + 0.5;
    const normY = -this.mouseCoords.y / 16 * 0.5 + 0.5;
    uiManager.updateVirtualCursor({ x: 1.0 - normX, y: normY }, this.isMouseDown && this.isShiftDown);

    if (this.isMouseDown && !this.isShiftDown && !this.isSpaceDown) {
      // Drawing Mode
      if (this.prevMode !== 'DRAW') {
        drawingEngine.startStroke();
        uiManager.logConsole("Simulating Draw Mode...");
        this.prevMode = 'DRAW';
      }
      drawingEngine.addPointToStroke(this.mouseCoords);
      sceneManager.emitParticles(this.mouseCoords, drawingEngine.currentColor, 2);
    } else if (this.isMouseDown && this.isShiftDown && !this.isSpaceDown) {
      // Selection & Drag Mode
      if (this.prevMode !== 'PINCH') {
        const selected = objectManipulation.selectStrokeNear(this.mouseCoords, drawingEngine.strokes);
        if (selected) {
          uiManager.logConsole(`Simulating Selection on [${selected.id}]`);
          objectManipulation.startTransform(this.mouseCoords, 0, 0);
        }
        this.prevMode = 'PINCH';
      } else {
        objectManipulation.applyTransform(this.mouseCoords, 0, 0);
      }
    } else if (this.isSpaceDown) {
      // Eraser Mode
      if (this.prevMode !== 'ERASE') {
        uiManager.logConsole("Simulating Eraser Mode...");
        this.prevMode = 'ERASE';
      }
      drawingEngine.eraseStrokesNear(this.mouseCoords, 0.12);
      sceneManager.emitParticles(this.mouseCoords, '#ff0055', 3);
    } else {
      // Hover Mode
      if (this.prevMode === 'DRAW') {
        drawingEngine.endStroke();
      } else if (this.prevMode === 'PINCH') {
        objectManipulation.endTransform(drawingEngine.undoStack);
        objectManipulation.deselect();
      }
      
      this.prevMode = 'HOVER';
    }
  }

  // Renders Three.js scene and loops app states
  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.useMouseFallback) {
      this.runMouseSimulation();
    }

    // Render 3D and update particle lifecycle
    sceneManager.update();
  }
}

// Instantiate and start app on window load
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
export default App;
