export class GestureRecognition {
  constructor() {
    this.pinchThreshold = 0.035;
    
    // Debouncing/Trigger state tracking
    this.lastTriggeredTime = {
      colorCycle: 0,
      newLayer: 0
    };
    this.triggerDelay = 800; // ms between triggers to avoid rapid fire
  }

  // Calculate Euclidean distance between two 3D points
  getDistance(p1, p2) {
    if (!p1 || !p2) return 999;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z || 0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Heuristic: Is a finger extended?
  // Checks if the distance from the wrist to the finger tip is greater than the distance from the wrist to the PIP joint.
  isFingerExtended(landmarks, tipIdx, pipIdx, wristIdx = 0) {
    const wrist = landmarks[wristIdx];
    const pip = landmarks[pipIdx];
    const tip = landmarks[tipIdx];
    
    const wristToPip = this.getDistance(wrist, pip);
    const wristToTip = this.getDistance(wrist, tip);
    
    // Multiplier of 1.05 adds a small buffer to avoid jitter
    return wristToTip > (wristToPip * 1.05);
  }

  // Heuristic for thumb extension
  // Checks if the thumb tip is extended away from the Index MCP joint compared to the Thumb IP joint.
  isThumbExtended(landmarks) {
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const indexMCP = landmarks[5];
    
    const ipToMcp = this.getDistance(thumbIP, indexMCP);
    const tipToMcp = this.getDistance(thumbTip, indexMCP);
    
    return tipToMcp > (ipToMcp * 1.05);
  }

  // Classifies the gesture of a single hand
  classifyHand(landmarks) {
    if (!landmarks || landmarks.length < 21) {
      return { gesture: 'NONE', confidence: 0 };
    }

    const isThumbExt = this.isThumbExtended(landmarks);
    const isIndexExt = this.isFingerExtended(landmarks, 8, 6);
    const isMiddleExt = this.isFingerExtended(landmarks, 12, 10);
    const isRingExt = this.isFingerExtended(landmarks, 16, 14);
    const isPinkyExt = this.isFingerExtended(landmarks, 20, 18);

    const pinchDist = this.getDistance(landmarks[4], landmarks[8]);
    const isPinching = pinchDist < this.pinchThreshold;

    // 1. PINCH (Index & Thumb tips are close)
    if (isPinching) {
      // Check if wrist rotation is happening
      // Vector from wrist (0) to index MCP (5)
      const wrist = landmarks[0];
      const indexMCP = landmarks[5];
      const dx = indexMCP.x - wrist.x;
      const dy = indexMCP.y - wrist.y;
      
      // Calculate hand roll angle (rotation around Z axis, in radians)
      const angle = Math.atan2(dy, dx);
      
      return { 
        gesture: 'PINCH', 
        pinchPoint: {
          x: (landmarks[4].x + landmarks[8].x) / 2,
          y: (landmarks[4].y + landmarks[8].y) / 2,
          z: (landmarks[4].z + landmarks[8].z) / 2
        },
        pinchDistance: pinchDist,
        wristAngle: angle,
        landmarks: landmarks
      };
    }

    // 2. CLOSED FIST (Eraser Mode)
    // All fingers folded
    if (!isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt) {
      return { gesture: 'FIST', landmarks: landmarks };
    }

    // 3. PEACE SIGN (New Layer)
    // Index and Middle extended, others folded
    if (isIndexExt && isMiddleExt && !isRingExt && !isPinkyExt) {
      return { gesture: 'PEACE', landmarks: landmarks };
    }

    // 4. THREE FINGERS EXTENDED (Cycle Colors)
    // Index, Middle, Ring extended, Pinky folded
    if (isIndexExt && isMiddleExt && isRingExt && !isPinkyExt) {
      return { gesture: 'THREE_FINGERS', landmarks: landmarks };
    }

    // 5. DRAW MODE (Index extended only)
    if (isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt) {
      return { gesture: 'DRAW', indexTip: landmarks[8], landmarks: landmarks };
    }

    // 6. OPEN PALM (Stop Drawing / Hover)
    // All 4 fingers extended (thumb can be either)
    if (isIndexExt && isMiddleExt && isRingExt && isPinkyExt) {
      return { gesture: 'PALM', landmarks: landmarks };
    }

    return { gesture: 'HOVER', landmarks: landmarks };
  }

  // Analyzes the results of multi-hand tracking and outputs the overall action state
  recognizeGestures(multiHandLandmarks, multiHandedness) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
      return { mode: 'LOST', hands: [] };
    }

    const handData = multiHandLandmarks.map((landmarks, i) => {
      const classification = this.classifyHand(landmarks);
      const handedness = multiHandedness[i];
      return {
        ...classification,
        label: handedness.label, // 'Left' or 'Right' (MediaPipe label)
        score: handedness.score
      };
    });

    const now = Date.now();

    // Check if we have two-hand pinch (scaling gesture)
    if (handData.length === 2) {
      const hand1 = handData[0];
      const hand2 = handData[1];

      if (hand1.gesture === 'PINCH' && hand2.gesture === 'PINCH') {
        const distBetweenHands = this.getDistance(hand1.pinchPoint, hand2.pinchPoint);
        return {
          mode: 'SCALE',
          hands: handData,
          scaleDistance: distBetweenHands,
          pinchPoint1: hand1.pinchPoint,
          pinchPoint2: hand2.pinchPoint
        };
      }
    }

    // Single-hand classification mapping
    // We prioritize the primary hand (usually right hand for drawing, or the first detected hand)
    const primaryHand = handData[0];
    
    // Hand Size estimation to calculate Z depth
    // Vector from Wrist (0) to Index MCP (5)
    const wrist = primaryHand.landmarks[0];
    const indexMCP = primaryHand.landmarks[5];
    const handScaleSize = this.getDistance(wrist, indexMCP);

    const result = {
      mode: 'HOVER',
      primaryHand: primaryHand,
      hands: handData,
      handScaleSize: handScaleSize,
      cursorPosition: null, // to be populated
      triggerAction: null   // triggers single-event actions
    };

    // Project raw tracking coords to a normalized relative center for cursor mapping
    if (primaryHand.gesture === 'DRAW') {
      result.mode = 'DRAW';
      result.cursorPosition = primaryHand.indexTip;
    } else if (primaryHand.gesture === 'PINCH') {
      result.mode = 'PINCH';
      result.cursorPosition = primaryHand.pinchPoint;
    } else if (primaryHand.gesture === 'FIST') {
      result.mode = 'ERASE';
      // Use wrist or MCP center as the erase center
      result.cursorPosition = primaryHand.landmarks[9]; // Middle MCP
    } else if (primaryHand.gesture === 'PALM') {
      result.mode = 'HOVER';
      result.cursorPosition = primaryHand.landmarks[9];
    } else {
      result.mode = 'HOVER';
      result.cursorPosition = primaryHand.landmarks[8] || primaryHand.landmarks[0];
    }

    // Trigger action checks (debounced)
    if (primaryHand.gesture === 'PEACE') {
      if (now - this.lastTriggeredTime.newLayer > this.triggerDelay) {
        result.triggerAction = 'NEW_LAYER';
        this.lastTriggeredTime.newLayer = now;
      }
    } else if (primaryHand.gesture === 'THREE_FINGERS') {
      if (now - this.lastTriggeredTime.colorCycle > this.triggerDelay) {
        result.triggerAction = 'CYCLE_COLOR';
        this.lastTriggeredTime.colorCycle = now;
      }
    }

    return result;
  }
}

export const gestureRecognition = new GestureRecognition();
