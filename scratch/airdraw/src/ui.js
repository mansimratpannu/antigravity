import { sceneManager } from './sceneManager';
import { drawingEngine } from './drawingEngine';
import { exportManager } from './exportManager';
import { objectManipulation } from './objectManipulation';

export class UIManager {
  constructor() {
    this.virtualCursor = null;
    this.cursorRing = null;
    
    // Dwell click settings
    this.hoveredElement = null;
    this.dwellFrames = 0;
    this.dwellThreshold = 45; // ~0.75 seconds at 60fps
    
    // Prev state for UI updates
    this.lastActiveGestureId = null;
  }

  init() {
    this.virtualCursor = document.getElementById('virtual-cursor');
    if (this.virtualCursor) {
      this.cursorRing = this.virtualCursor.querySelector('.cursor-ring');
    }
    
    this.bindClickEvents();
    this.bindFileInput();
    this.logConsole("System ready. Hover hand cursor to interact or use gesture shortcuts.");
  }

  // Log message in the holographic console
  logConsole(message) {
    const consoleLogs = document.getElementById('console-logs');
    if (consoleLogs) {
      const timestamp = new Date().toTimeString().split(' ')[0];
      consoleLogs.innerHTML += `\n[${timestamp}] ${message}`;
      consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }
  }

  // Update HUD text indicators
  updateStats(fps, handCount, trackingConfidence) {
    const fpsVal = document.querySelector('#fps-counter .status-text');
    if (fpsVal) fpsVal.innerText = fps;

    const handsVal = document.getElementById('pip-hands-count');
    if (handsVal) handsVal.innerText = handCount;

    const confVal = document.getElementById('pip-confidence');
    if (confVal) confVal.innerText = `${Math.round(trackingConfidence * 100)}%`;
  }

  // Update webcam connection status
  updateWebcamStatus(text, isActive) {
    const camStatus = document.getElementById('cam-status');
    if (camStatus) {
      const dot = camStatus.querySelector('.status-dot');
      const label = camStatus.querySelector('.status-text');
      
      label.innerText = text;
      if (isActive) {
        dot.className = "status-dot green";
      } else {
        dot.className = "status-dot red";
      }
    }
  }

  // Update tracking status
  updateTrackingStatus(text, isActive) {
    const trackStatus = document.getElementById('track-status');
    if (trackStatus) {
      const dot = trackStatus.querySelector('.status-dot');
      const label = trackStatus.querySelector('.status-text');
      
      label.innerText = text;
      if (isActive) {
        dot.className = "status-dot green";
      } else {
        dot.className = "status-dot red";
      }
    }
  }

  // Highlight active gesture item in left side menu
  updateActiveGestureHUD(activeGesture) {
    const gestureIdMap = {
      'DRAW': 'gesture-draw',
      'PALM': 'gesture-hover',
      'FIST': 'gesture-erase',
      'PINCH': 'gesture-pinch',
      'PEACE': 'gesture-layer',
      'THREE_FINGERS': 'gesture-color',
      'SCALE': 'gesture-scale'
    };

    const targetId = gestureIdMap[activeGesture];
    
    if (this.lastActiveGestureId && this.lastActiveGestureId !== targetId) {
      const prevEl = document.getElementById(this.lastActiveGestureId);
      if (prevEl) prevEl.classList.remove('active');
    }

    if (targetId) {
      const curEl = document.getElementById(targetId);
      if (curEl) {
        curEl.classList.add('active');
        this.lastActiveGestureId = targetId;
      }
    } else {
      this.lastActiveGestureId = null;
    }
  }

  // Sync controls UI state when variables change
  syncUIStates() {
    // 1. Sync Brush Color Active state
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      if (swatch.dataset.color.toLowerCase() === drawingEngine.currentColor.toLowerCase()) {
        swatch.classList.add('active');
      } else {
        swatch.classList.remove('active');
      }
    });

    // 2. Sync Brush Type Buttons
    document.querySelectorAll('[id^="btn-brush-"]').forEach(btn => {
      const type = btn.id.replace('btn-brush-', '');
      if (type === drawingEngine.currentBrushType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 3. Sync Brush Size Slider & Value
    const slider = document.getElementById('brush-size');
    const sizeVal = document.getElementById('size-val');
    if (slider) slider.value = drawingEngine.currentSize;
    if (sizeVal) sizeVal.innerText = drawingEngine.currentSize;

    // 4. Sync Active Layer Indicator
    const layerVal = document.getElementById('layer-val');
    if (layerVal) layerVal.innerText = drawingEngine.currentLayer;
  }

  // Position virtual screen space cursor, handle dwell & pinch triggers
  updateVirtualCursor(normalizedPos, isPinching) {
    if (!normalizedPos || !this.virtualCursor) {
      if (this.virtualCursor) this.virtualCursor.classList.remove('visible');
      this.resetDwell();
      return;
    }

    this.virtualCursor.classList.add('visible');

    // MediaPipe coordinate spaces are mirrored, map back to screen
    const screenX = (1.0 - normalizedPos.x) * window.innerWidth;
    const screenY = normalizedPos.y * window.innerHeight;

    // Apply smooth hardware-accelerated transform positioning
    this.virtualCursor.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;

    // Detect element under virtual cursor
    const elem = document.elementFromPoint(screenX, screenY);
    
    if (elem) {
      // Find closest click-supporting element in DOM
      const button = elem.closest('button, .color-swatch, input[type="range"]');
      
      if (button) {
        // Handle immediate pinch-click trigger
        if (isPinching && this.hoveredElement !== button) {
          this.logConsole(`UI Action: Gestured-Click on [${button.id || button.className}]`);
          button.click();
          this.triggerVisualFeedback(button);
          this.resetDwell();
          return;
        }

        // Handle hover dwell-click trigger
        if (this.hoveredElement === button) {
          this.dwellFrames++;
          
          // Animate ring loading progress
          const progress = 1.0 - (this.dwellFrames / this.dwellThreshold);
          if (this.cursorRing) {
            this.cursorRing.style.transform = `scale(${0.4 + 0.6 * progress})`;
            this.cursorRing.style.borderColor = `rgba(0, 240, 255, ${0.5 + 0.5 * (1 - progress)})`;
          }

          if (this.dwellFrames >= this.dwellThreshold) {
            this.logConsole(`UI Action: Dwell-Click on [${button.id || button.className}]`);
            button.click();
            this.triggerVisualFeedback(button);
            this.resetDwell();
          }
        } else {
          this.hoveredElement = button;
          this.dwellFrames = 0;
        }
      } else {
        this.resetDwell();
      }
    } else {
      this.resetDwell();
    }
  }

  resetDwell() {
    this.hoveredElement = null;
    this.dwellFrames = 0;
    if (this.cursorRing) {
      this.cursorRing.style.transform = '';
      this.cursorRing.style.borderColor = '';
    }
  }

  triggerVisualFeedback(el) {
    el.style.transform = 'scale(0.9)';
    el.style.borderColor = '#ffffff';
    el.style.boxShadow = '0 0 15px #ffffff';
    setTimeout(() => {
      el.style.transform = '';
      el.style.borderColor = '';
      el.style.boxShadow = '';
    }, 150);
  }

  // Bind all GUI button clicks to their drawing engine counterparts
  bindClickEvents() {
    // Color Swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        drawingEngine.setBrushColor(color);
        this.logConsole(`Brush color set to: ${color}`);
        this.syncUIStates();
      });
    });

    // Brush Modes
    document.getElementById('btn-brush-solid')?.addEventListener('click', () => {
      drawingEngine.setBrushType('solid');
      this.logConsole("Brush mode: SOLID");
      this.syncUIStates();
    });

    document.getElementById('btn-brush-glow')?.addEventListener('click', () => {
      drawingEngine.setBrushType('glow');
      this.logConsole("Brush mode: GLOW");
      this.syncUIStates();
    });

    document.getElementById('btn-brush-particle')?.addEventListener('click', () => {
      drawingEngine.setBrushType('particle');
      this.logConsole("Brush mode: PARTICLE");
      this.syncUIStates();
    });

    // Brush Size Slider
    const sizeSlider = document.getElementById('brush-size');
    sizeSlider?.addEventListener('input', (e) => {
      drawingEngine.setBrushSize(e.target.value);
      this.syncUIStates();
    });

    // Layer Actions
    document.getElementById('btn-new-layer')?.addEventListener('click', () => {
      this.triggerNewLayer();
    });

    document.getElementById('btn-clear-layer')?.addEventListener('click', () => {
      if (drawingEngine.clearLayer(drawingEngine.currentLayer)) {
        this.logConsole(`Cleared current layer ${drawingEngine.currentLayer}`);
      }
    });

    // Undo / Redo / Clear All
    document.getElementById('btn-undo')?.addEventListener('click', () => {
      if (drawingEngine.undo()) {
        this.logConsole("Action Undone.");
        // Deselect transform helpers
        objectManipulation.deselect();
      }
    });

    document.getElementById('btn-redo')?.addEventListener('click', () => {
      if (drawingEngine.redo()) {
        this.logConsole("Action Redone.");
        objectManipulation.deselect();
      }
    });

    document.getElementById('btn-clear-all')?.addEventListener('click', () => {
      drawingEngine.clearAll();
      objectManipulation.deselect();
      this.logConsole("Cleared sketch pad.");
    });

    // System Utilities
    document.getElementById('btn-screenshot')?.addEventListener('click', () => {
      this.captureScreenshot();
    });

    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    // Export operations
    document.getElementById('btn-save-json')?.addEventListener('click', () => {
      exportManager.saveToJSON();
    });

    document.getElementById('btn-load-json')?.addEventListener('click', () => {
      document.getElementById('file-input-json')?.click();
    });

    document.getElementById('btn-export-gltf')?.addEventListener('click', () => {
      exportManager.exportToGLTF();
    });
  }

  // Setup file input listener for loading JSONs
  bindFileInput() {
    const fileInput = document.getElementById('file-input-json');
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        if (exportManager.importFromJSON(evt.target.result)) {
          this.logConsole(`Imported artwork: ${file.name}`);
          this.syncUIStates();
        }
      };
      reader.readAsText(file);
      // Reset input value so same file can be reloaded
      fileInput.value = '';
    });
  }

  // Trigger layer increment
  triggerNewLayer() {
    const nextLayer = drawingEngine.currentLayer + 1;
    drawingEngine.setLayer(nextLayer);
    this.logConsole(`Created active drawing layer ${nextLayer}`);
    this.syncUIStates();
  }

  // Screen captures current Three.js canvas buffer
  captureScreenshot() {
    try {
      sceneManager.update(); // Render clean frame
      const strMime = "image/png";
      const imgData = sceneManager.renderer.domElement.toDataURL(strMime);
      
      const link = document.createElement('a');
      link.download = `airdraw_artwork_${Date.now()}.png`;
      link.href = imgData;
      link.click();
      
      this.logConsole("Snapshot captured successfully!");
    } catch (e) {
      console.error(e);
      this.logConsole("Failed to capture snapshot.");
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => {
          this.logConsole("Fullscreen enabled.");
        })
        .catch(err => {
          this.logConsole(`Error enabling fullscreen: ${err.message}`);
        });
    } else {
      document.exitFullscreen();
      this.logConsole("Fullscreen disabled.");
    }
  }
}

export const uiManager = new UIManager();
