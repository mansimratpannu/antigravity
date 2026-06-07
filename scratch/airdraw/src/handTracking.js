export class HandTracking {
  constructor() {
    this.hands = null;
    this.cameraHelper = null;
    this.videoElement = null;
    this.overlayCanvas = null;
    this.overlayCtx = null;
    
    this.isTracking = false;
    this.onResultsCallback = null;
    this.onStatusChangeCallback = null;
    
    // FPS tracking variables
    this.lastFrameTime = performance.now();
    this.fps = 0;
    this.fpsFilter = 50; // Simple low pass filter for FPS display
  }

  async init(videoElementId, canvasId, onResults, onStatusChange) {
    this.videoElement = document.getElementById(videoElementId);
    this.overlayCanvas = document.getElementById(canvasId);
    this.onResultsCallback = onResults;
    this.onStatusChangeCallback = onStatusChange;

    if (!this.videoElement || !this.overlayCanvas) {
      console.error("Webcam video or overlay canvas elements missing.");
      this.updateStatus('DISCONNECTED', false);
      return false;
    }

    this.overlayCtx = this.overlayCanvas.getContext('2d');
    
    // Set overlay canvas internal resolution to match screen layout
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    try {
      this.updateStatus('INITIALIZING...', false);
      
      // Initialize MediaPipe Hands model
      // Note: In browser context via CDN, "Hands" is exposed on the window
      if (!window.Hands) {
        throw new Error("MediaPipe Hands library not loaded from CDN.");
      }

      this.hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
      });

      this.hands.onResults((results) => this.handleResults(results));

      // Request webcam and start camera utilities
      await this.startWebcam();
      this.updateStatus('ACTIVE', true);
      return true;
      
    } catch (error) {
      console.error("Failed to initialize hand tracking:", error);
      this.updateStatus(`ERROR: ${error.message}`, false);
      return false;
    }
  }

  resizeCanvas() {
    if (this.overlayCanvas) {
      this.overlayCanvas.width = this.videoElement?.videoWidth || 640;
      this.overlayCanvas.height = this.videoElement?.videoHeight || 480;
    }
  }

  updateStatus(text, isActive) {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(text, isActive);
    }
  }

  async startWebcam() {
    if (!window.Camera) {
      throw new Error("MediaPipe Camera utility not loaded from CDN.");
    }
    
    this.videoElement.addEventListener('loadedmetadata', () => {
      this.resizeCanvas();
    });
    
    // Initialize Camera helper
    this.cameraHelper = new window.Camera(this.videoElement, {
      onFrame: async () => {
        // Send frame to MediaPipe Hands model
        await this.hands.send({ image: this.videoElement });
        
        // Calculate tracking FPS
        const now = performance.now();
        const delta = now - this.lastFrameTime;
        this.lastFrameTime = now;
        const currentFps = 1000 / delta;
        this.fps += (currentFps - this.fps) / this.fpsFilter;
      },
      width: 1280,
      height: 720
    });

    await this.cameraHelper.start();
    this.isTracking = true;
  }

  handleResults(results) {
    // 1. Clear skeleton overlay canvas
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    
    // 2. Draw hand skeleton overlay in the PIP window
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      results.multiHandLandmarks.forEach((landmarks, index) => {
        const handedness = results.multiHandedness[index];
        const isRightHand = handedness.label === 'Right';
        
        this.drawHandSkeleton(landmarks, isRightHand);
      });
    }

    // 3. Callback to main logic containing all results
    if (this.onResultsCallback) {
      this.onResultsCallback(results, Math.round(this.fps));
    }
  }

  // Draw futuristic skeleton lines and glowing joints
  drawHandSkeleton(landmarks, isRightHand) {
    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    
    // Theme colors
    const lineColor = isRightHand ? '#00f0ff' : '#bd00ff';
    const jointColor = '#ffffff';
    
    // Connection paths
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17] // Knuckles
    ];

    // Draw connections
    ctx.lineWidth = 2;
    ctx.strokeStyle = lineColor;
    ctx.shadowBlur = 4;
    ctx.shadowColor = lineColor;

    connections.forEach(([p1, p2]) => {
      const pt1 = landmarks[p1];
      const pt2 = landmarks[p2];
      
      ctx.beginPath();
      ctx.moveTo(pt1.x * w, pt1.y * h);
      ctx.lineTo(pt2.x * w, pt2.y * h);
      ctx.stroke();
    });

    // Draw joints
    ctx.shadowBlur = 6;
    ctx.shadowColor = lineColor;
    
    landmarks.forEach((pt, index) => {
      // Make tips larger/glow more
      const isTip = [4, 8, 12, 16, 20].includes(index);
      const radius = isTip ? 4 : 2.5;
      
      ctx.fillStyle = isTip ? lineColor : jointColor;
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, radius, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Reset shadow properties
    ctx.shadowBlur = 0;
  }
}

export const handTracking = new HandTracking();
