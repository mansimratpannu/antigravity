import * as THREE from 'three';
import { sceneManager } from './sceneManager';
import { drawingEngine } from './drawingEngine';

export class ObjectManipulation {
  constructor() {
    this.selectedStroke = null;
    this.selectionBoxHelper = null;
    this.selectionThreshold = 6.0; // Distance in 3D units

    // Transformation start parameters
    this.initialStrokePoints = [];
    this.initialPinchPoint = null;
    this.initialWristAngle = 0;
    this.initialScaleDistance = 0;
    this.strokeCenter = new THREE.Vector3();
    
    // Log for undoing translations
    this.transformUndoPoints = null;
  }

  // Find and select the nearest stroke to the pinch point
  selectStrokeNear(pinchPoint, activeStrokes) {
    if (activeStrokes.length === 0) return null;

    let nearestStroke = null;
    let minDistance = parseFloat('Infinity');

    activeStrokes.forEach(stroke => {
      stroke.points.forEach(pt => {
        const dist = pt.distanceTo(pinchPoint);
        if (dist < minDistance) {
          minDistance = dist;
          nearestStroke = stroke;
        }
      });
    });

    if (minDistance < this.selectionThreshold) {
      this.setSelectedStroke(nearestStroke);
      return nearestStroke;
    }

    return null;
  }

  // Set the selected stroke and create a holographic bounding box helper
  setSelectedStroke(stroke) {
    this.deselect();

    if (!stroke || !stroke.mesh) return;

    this.selectedStroke = stroke;
    
    // Create futuristic bounding box helper
    this.selectionBoxHelper = new THREE.BoxHelper(stroke.mesh, 0x00f0ff);
    // Give helper glow look
    this.selectionBoxHelper.material.transparent = true;
    this.selectionBoxHelper.material.opacity = 0.8;
    this.selectionBoxHelper.material.blending = THREE.AdditiveBlending;
    
    sceneManager.addObject(this.selectionBoxHelper);
  }

  deselect() {
    if (this.selectionBoxHelper) {
      sceneManager.removeObject(this.selectionBoxHelper);
      this.selectionBoxHelper.dispose();
      this.selectionBoxHelper = null;
    }
    this.selectedStroke = null;
  }

  // Store initial state when transformation begins
  startTransform(pinchPoint, wristAngle = 0, scaleDistance = 0) {
    if (!this.selectedStroke) return;

    // Deep copy starting points
    this.initialStrokePoints = this.selectedStroke.points.map(p => p.clone());
    this.transformUndoPoints = this.selectedStroke.points.map(p => p.clone());
    
    this.initialPinchPoint = pinchPoint.clone();
    this.initialWristAngle = wristAngle;
    this.initialScaleDistance = scaleDistance;

    // Calculate center of the stroke to rotate/scale around
    this.calculateStrokeCenter();
  }

  // Calculate bounding sphere center of the selected stroke
  calculateStrokeCenter() {
    if (!this.selectedStroke) return;
    
    const box = new THREE.Box3();
    this.selectedStroke.points.forEach(p => box.expandByPoint(p));
    box.getCenter(this.strokeCenter);
  }

  // Update stroke geometry dynamically
  applyTransform(currentPinchPoint, currentWristAngle = 0, currentScaleDistance = 0, undoStack = null) {
    if (!this.selectedStroke) return;

    const points = this.selectedStroke.points;
    const initialPoints = this.initialStrokePoints;
    const center = this.strokeCenter;

    // 1. Calculate transformations
    let translation = new THREE.Vector3();
    let scale = 1.0;
    let rotationAngle = 0;

    if (currentScaleDistance > 0 && this.initialScaleDistance > 0) {
      // Two-hand pinch: Scale only
      scale = currentScaleDistance / this.initialScaleDistance;
    } else {
      // Single-hand pinch: Move and Rotate
      translation.subVectors(currentPinchPoint, this.initialPinchPoint);
      rotationAngle = currentWristAngle - this.initialWristAngle;
    }

    // 2. Apply translations/rotations to stroke coordinates
    for (let i = 0; i < points.length; i++) {
      const pt = initialPoints[i].clone();

      if (scale !== 1.0) {
        // Scale relative to bounding center
        pt.sub(center).multiplyScalar(scale).add(center);
      }

      if (rotationAngle !== 0) {
        // Rotate in the camera view plane (Z roll) around bounding center
        const dx = pt.x - center.x;
        const dy = pt.y - center.y;
        
        const cos = Math.cos(rotationAngle);
        const sin = Math.sin(rotationAngle);

        pt.x = dx * cos - dy * sin + center.x;
        pt.y = dx * sin + dy * cos + center.y;
      }

      if (translation.length() > 0) {
        // Move
        pt.add(translation);
      }

      // Update the live points
      points[i].copy(pt);
    }

    // 3. Rebuild the mesh in the scene
    this.rebuildStrokeMesh();
  }

  // Re-creates the tube geometry or points geometry for the transformed points
  rebuildStrokeMesh() {
    if (!this.selectedStroke) return;
    drawingEngine.rebuildStroke(this.selectedStroke);
    
    // Update the box helper bounding box
    if (this.selectionBoxHelper) {
      this.selectionBoxHelper.update();
    }
  }

  // End transform and optionally add the transformation to the undo stack
  endTransform(undoStack) {
    if (!this.selectedStroke || !this.transformUndoPoints || !undoStack) {
      this.transformUndoPoints = null;
      return;
    }

    // Store deep copy of old and new points
    const oldPoints = this.transformUndoPoints.map(p => p.clone());
    const newPoints = this.selectedStroke.points.map(p => p.clone());
    const stroke = this.selectedStroke;

    // Add transform operation to undo history
    undoStack.push({
      type: 'transform',
      stroke: stroke,
      oldPoints: oldPoints,
      newPoints: newPoints
    });

    this.transformUndoPoints = null;
  }
}

export const objectManipulation = new ObjectManipulation();
