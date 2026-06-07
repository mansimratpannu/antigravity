import * as THREE from 'three';
import { sceneManager } from './sceneManager';

export class DrawingEngine {
  constructor() {
    this.strokes = []; // Active user strokes
    this.activeStrokePoints = []; // Current drawing stroke points
    this.activeStrokeMesh = null;
    
    // Brush settings
    this.currentColor = '#00f0ff';
    this.currentSize = 5;
    this.currentBrushType = 'solid'; // 'solid', 'glow', 'particle'
    this.currentLayer = 1;
    
    // Undo/Redo history stacks
    this.undoStack = [];
    this.redoStack = [];
    
    // Eraser settings
    this.eraserRadius = 3.5;
  }

  setBrushColor(hexColor) {
    this.currentColor = hexColor;
  }

  setBrushSize(size) {
    this.currentSize = parseFloat(size);
  }

  setBrushType(type) {
    this.currentBrushType = type;
  }

  setLayer(layerNum) {
    this.currentLayer = parseInt(layerNum);
  }

  // Starts a new drawing stroke
  startStroke() {
    this.activeStrokePoints = [];
    this.activeStrokeMesh = null;
    this.redoStack = []; // Clear redo stack on new action
  }

  // Adds a point to the current stroke and updates its 3D mesh
  addPointToStroke(point) {
    // Prevent consecutive identical points
    if (this.activeStrokePoints.length > 0) {
      const lastPoint = this.activeStrokePoints[this.activeStrokePoints.length - 1];
      if (lastPoint.distanceTo(point) < 0.15) {
        return; // Too close, skip
      }
    }
    
    // Keep drawings bounded inside the holographic cage
    const maxBound = sceneManager.cageSize / 2;
    const boundedPoint = point.clone();
    boundedPoint.x = Math.max(-maxBound, Math.min(maxBound, boundedPoint.x));
    boundedPoint.y = Math.max(-maxBound, Math.min(maxBound, boundedPoint.y));
    boundedPoint.z = Math.max(-maxBound, Math.min(maxBound, boundedPoint.z));

    this.activeStrokePoints.push(boundedPoint);
    
    // Update or create mesh
    this.updateActiveStrokeMesh();
  }

  // Finishes the current stroke, pushes it to active list, and registers in undo stack
  endStroke() {
    if (this.activeStrokePoints.length < 2) {
      // Clean up single-point helper meshes
      if (this.activeStrokeMesh) {
        sceneManager.removeObject(this.activeStrokeMesh);
        this.activeStrokeMesh.geometry.dispose();
        if (this.activeStrokeMesh.material.dispose) this.activeStrokeMesh.material.dispose();
      }
      this.activeStrokePoints = [];
      this.activeStrokeMesh = null;
      return;
    }

    const strokeData = {
      id: Math.random().toString(36).substring(2, 9),
      points: this.activeStrokePoints,
      mesh: this.activeStrokeMesh,
      color: this.currentColor,
      size: this.currentSize,
      type: this.currentBrushType,
      layer: this.currentLayer
    };

    this.strokes.push(strokeData);
    this.undoStack.push({ type: 'add', stroke: strokeData });
    
    this.activeStrokePoints = [];
    this.activeStrokeMesh = null;
  }

  // Generates 3D tube or particle mesh from stroke points
  updateActiveStrokeMesh() {
    if (this.activeStrokePoints.length === 0) return;

    // Remove existing temporary active mesh
    if (this.activeStrokeMesh) {
      sceneManager.removeObject(this.activeStrokeMesh);
      // Clean up memory
      this.activeStrokeMesh.geometry.dispose();
      if (this.activeStrokeMesh.material.dispose) {
        this.activeStrokeMesh.material.dispose();
      }
    }

    const pts = this.activeStrokePoints;
    const radius = this.currentSize * 0.06;

    // If 1 point, draw a small sphere indicator
    if (pts.length === 1) {
      const geom = new THREE.SphereGeometry(radius, 16, 16);
      const mat = this.createMaterial();
      this.activeStrokeMesh = new THREE.Mesh(geom, mat);
      this.activeStrokeMesh.position.copy(pts[0]);
      sceneManager.addObject(this.activeStrokeMesh);
      return;
    }

    // Generate smooth curve using CatmullRom spline
    const curve = new THREE.CatmullRomCurve3(pts);
    
    let geometry;
    let material;
    let mesh;

    if (this.currentBrushType === 'particle') {
      // Particle Brush: Generate points along the curve
      const totalPoints = pts.length * 8;
      const curvePoints = curve.getPoints(totalPoints);
      
      geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      
      // Setup sizes and color buffers
      const sizes = new Float32Array(curvePoints.length);
      const colors = new Float32Array(curvePoints.length * 3);
      const baseColor = new THREE.Color(this.currentColor);

      for (let i = 0; i < curvePoints.length; i++) {
        sizes[i] = (0.2 + Math.random() * 0.8) * this.currentSize * 0.2;
        colors[i * 3] = baseColor.r;
        colors[i * 3 + 1] = baseColor.g;
        colors[i * 3 + 2] = baseColor.b;
      }
      
      geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      // Circular canvas texture for points
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 16);
      const pTex = new THREE.CanvasTexture(canvas);

      material = new THREE.PointsMaterial({
        size: 1.0,
        map: pTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true
      });

      mesh = new THREE.Points(geometry, material);
    } else {
      // Solid or Glow Brush: Generate volumetric 3D tubes
      const segments = Math.max(20, pts.length * 3);
      geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false);
      material = this.createMaterial();
      mesh = new THREE.Mesh(geometry, material);
    }

    this.activeStrokeMesh = mesh;
    sceneManager.addObject(this.activeStrokeMesh);
  }

  // Factory to create material based on active settings
  createMaterial() {
    const color = new THREE.Color(this.currentColor);
    
    if (this.currentBrushType === 'glow') {
      // Emissive/Self-luminous look
      return new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
      });
    } else {
      // Solid Brush: Shiny metallic sci-fi polymer
      return new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.2,
        metalness: 0.8,
        emissive: color.clone().multiplyScalar(0.25), // Subtle glow
        shadowSide: THREE.DoubleSide
      });
    }
  }

  // Eraser checking: Deletes strokes if hand fist cursor is within threshold
  eraseStrokesNear(point, handScaleSize) {
    if (this.strokes.length === 0) return;

    const dynamicEraserRadius = this.eraserRadius * (handScaleSize * 10);
    const strokesToKeep = [];
    const strokesToErase = [];

    this.strokes.forEach(stroke => {
      // Check distance from eraser point to all points of this stroke
      let isColliding = false;
      
      for (let i = 0; i < stroke.points.length; i++) {
        const dist = stroke.points[i].distanceTo(point);
        if (dist < dynamicEraserRadius) {
          isColliding = true;
          break;
        }
      }

      if (isColliding) {
        strokesToErase.push(stroke);
      } else {
        strokesToKeep.push(stroke);
      }
    });

    if (strokesToErase.length > 0) {
      strokesToErase.forEach(stroke => {
        sceneManager.removeObject(stroke.mesh);
        // Save action in undo history
        this.undoStack.push({ type: 'delete', stroke: stroke });
        
        // Spawn debris particles at collision point
        sceneManager.emitParticles(point, stroke.color, 15);
      });
      
      this.strokes = strokesToKeep;
      this.redoStack = []; // Clear redo stack on action
      return true; // Erase occurred
    }
    
    return false;
  }

  // Rebuild geometry for a stroke (useful for transformations and updates)
  rebuildStroke(stroke) {
    if (!stroke || !stroke.mesh) return;

    const oldMesh = stroke.mesh;
    oldMesh.geometry.dispose();

    const pts = stroke.points;
    const radius = stroke.size * 0.06;

    let newGeom;

    if (stroke.type === 'particle') {
      const curve = new THREE.CatmullRomCurve3(pts);
      const curvePoints = curve.getPoints(pts.length * 8);
      
      newGeom = new THREE.BufferGeometry().setFromPoints(curvePoints);
      
      const sizes = new Float32Array(curvePoints.length);
      const colors = new Float32Array(curvePoints.length * 3);
      const baseColor = new THREE.Color(stroke.color);

      for (let i = 0; i < curvePoints.length; i++) {
        sizes[i] = (0.2 + Math.random() * 0.8) * stroke.size * 0.2;
        colors[i * 3] = baseColor.r;
        colors[i * 3 + 1] = baseColor.g;
        colors[i * 3 + 2] = baseColor.b;
      }
      
      newGeom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      newGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    } else {
      const curve = new THREE.CatmullRomCurve3(pts);
      const segments = Math.max(20, pts.length * 3);
      newGeom = new THREE.TubeGeometry(curve, segments, radius, 8, false);
    }

    oldMesh.geometry = newGeom;
  }

  // History Operations
  undo() {
    if (this.undoStack.length === 0) return false;

    const action = this.undoStack.pop();
    this.redoStack.push(action);

    if (action.type === 'add') {
      // Remove stroke
      sceneManager.removeObject(action.stroke.mesh);
      this.strokes = this.strokes.filter(s => s.id !== action.stroke.id);
    } else if (action.type === 'delete') {
      // Restore stroke
      sceneManager.addObject(action.stroke.mesh);
      this.strokes.push(action.stroke);
    } else if (action.type === 'transform') {
      // Revert transformation points
      action.stroke.points = action.oldPoints.map(p => p.clone());
      this.rebuildStroke(action.stroke);
    }
    
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;

    const action = this.redoStack.pop();
    this.undoStack.push(action);

    if (action.type === 'add') {
      // Restore stroke
      sceneManager.addObject(action.stroke.mesh);
      this.strokes.push(action.stroke);
    } else if (action.type === 'delete') {
      // Remove stroke
      sceneManager.removeObject(action.stroke.mesh);
      this.strokes = this.strokes.filter(s => s.id !== action.stroke.id);
    } else if (action.type === 'transform') {
      // Apply transformation points
      action.stroke.points = action.newPoints.map(p => p.clone());
      this.rebuildStroke(action.stroke);
    }
    
    return true;
  }

  // Clear specific layer
  clearLayer(layerNum) {
    const targetLayer = parseInt(layerNum);
    const strokesToKeep = [];
    const strokesToClear = [];

    this.strokes.forEach(stroke => {
      if (stroke.layer === targetLayer) {
        strokesToClear.push(stroke);
      } else {
        strokesToKeep.push(stroke);
      }
    });

    if (strokesToClear.length > 0) {
      strokesToClear.forEach(stroke => {
        sceneManager.removeObject(stroke.mesh);
        this.undoStack.push({ type: 'delete', stroke: stroke });
      });
      this.strokes = strokesToKeep;
      this.redoStack = [];
      return true;
    }
    return false;
  }

  // Clear entire scene
  clearAll() {
    if (this.strokes.length === 0) return;
    
    this.strokes.forEach(stroke => {
      sceneManager.removeObject(stroke.mesh);
      // Dispose geometry/materials to prevent memory leaks
      if (stroke.mesh.geometry) stroke.mesh.geometry.dispose();
      if (stroke.mesh.material.dispose) stroke.mesh.material.dispose();
    });

    this.strokes = [];
    this.activeStrokePoints = [];
    this.activeStrokeMesh = null;
    this.undoStack = [];
    this.redoStack = [];
  }
}

export const drawingEngine = new DrawingEngine();
