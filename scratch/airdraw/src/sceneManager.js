import * as THREE from 'three';

export class SceneManager {
  constructor() {
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    this.lights = {};
    this.helpers = {};
    
    // Particle System properties
    this.particles = [];
    this.particleGeometry = null;
    this.particleMaterial = null;
    this.particleSystem = null;
    this.maxParticles = 500;
    this.particleIndex = 0;
    
    // Bounds check cage size
    this.cageSize = 40; 
  }

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container #${containerId} not found.`);
      return;
    }

    // 1. Create Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020208, 0.015); // Enabled by default for Hologram view

    // 2. Create Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    // Position camera slightly back and up looking at the center
    this.camera.position.set(0, 0, 45);
    this.camera.lookAt(0, 0, 0);

    // 3. Create Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x020208, 1); // Solid dark by default
    this.renderer.shadowMap.enabled = true;
    
    this.container.appendChild(this.renderer.domElement);

    // 4. Setup Lights
    this.setupLights();

    // 5. Setup Grid & Holographic Cage
    this.setupHolographicCage();

    // 6. Setup Particle System
    this.setupParticles();

    // 7. Event Listeners
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupLights() {
    // Ambient light for general visibility of structures
    const ambientLight = new THREE.AmbientLight(0x050b1a, 1.5);
    this.scene.add(ambientLight);
    this.lights.ambient = ambientLight;

    // A directional light casting soft shadows
    const dirLight = new THREE.DirectionalLight(0x00f0ff, 1.2);
    dirLight.position.set(20, 40, 20);
    this.scene.add(dirLight);
    this.lights.directional = dirLight;

    // Glowing point light that tracks the drawing cursor to illuminate nearby drawing tubes
    const cursorLight = new THREE.PointLight(0xbd00ff, 4, 30, 2);
    cursorLight.position.set(0, 0, 1000); // Start far away
    this.scene.add(cursorLight);
    this.lights.cursorLight = cursorLight;
    
    // Secondary cyber point light
    const auxLight = new THREE.PointLight(0x00f0ff, 2, 40, 1.5);
    auxLight.position.set(-20, 20, 10);
    this.scene.add(auxLight);
    this.lights.auxLight = auxLight;
  }

  setupHolographicCage() {
    // Add a glowing holographic floor grid
    const gridSize = 80;
    const gridDivisions = 40;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0xbd00ff, 0x00f0ff);
    gridHelper.position.y = -20;
    gridHelper.material.opacity = 0.25;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);
    this.helpers.grid = gridHelper;

    // Bounding cage wireframe to indicate drawing space
    const boxGeom = new THREE.BoxGeometry(this.cageSize, this.cageSize, this.cageSize);
    const edges = new THREE.EdgesGeometry(boxGeom);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending
    });
    const cage = new THREE.LineSegments(edges, lineMat);
    this.scene.add(cage);
    this.helpers.cage = cage;

    // Add futuristic corner brackets to the drawing cage
    const frameGeom = new THREE.BoxGeometry(this.cageSize + 0.5, this.cageSize + 0.5, this.cageSize + 0.5);
    const cageEdges = new THREE.EdgesGeometry(frameGeom);
    const cageMat = new THREE.LineBasicMaterial({
      color: 0xbd00ff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending
    });
    const cageFrame = new THREE.LineSegments(cageEdges, cageMat);
    this.scene.add(cageFrame);
    this.helpers.cageFrame = cageFrame;
  }

  setupParticles() {
    // Create pool of particles
    this.particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);
    
    for (let i = 0; i < this.maxParticles; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 1000; // Hide initially
      
      colors[i * 3] = 0;
      colors[i * 3 + 1] = 0.94;
      colors[i * 3 + 2] = 1;
      
      sizes[i] = 0;
    }
    
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    // Create a circular particle texture
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    
    const pTexture = new THREE.CanvasTexture(canvas);
    
    this.particleMaterial = new THREE.PointsMaterial({
      size: 1.5,
      map: pTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    
    this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.scene.add(this.particleSystem);
    
    // Particle data structures for velocity/life
    this.particles = Array.from({ length: this.maxParticles }, () => ({
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0,
      color: new THREE.Color(),
      baseSize: 0
    }));
  }

  // Emit a burst of particles at a point
  emitParticles(position, colorHex, count = 2, customVelocity = null) {
    const posAttr = this.particleGeometry.attributes.position;
    const colAttr = this.particleGeometry.attributes.color;
    const sizeAttr = this.particleGeometry.attributes.size;
    
    const color = new THREE.Color(colorHex);

    for (let i = 0; i < count; i++) {
      const idx = this.particleIndex;
      
      // Set position
      posAttr.setXYZ(idx, position.x, position.y, position.z);
      
      // Set color
      colAttr.setXYZ(idx, color.r, color.g, color.b);
      
      // Set metadata
      const p = this.particles[idx];
      p.life = 1.0;
      p.maxLife = 30 + Math.random() * 30; // lifespan in frames
      p.baseSize = 0.5 + Math.random() * 2.0;
      sizeAttr.setX(idx, p.baseSize);
      
      if (customVelocity) {
        p.velocity.copy(customVelocity).add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        ));
      } else {
        // Random explosive velocity
        p.velocity.set(
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.15
        );
      }
      
      this.particleIndex = (this.particleIndex + 1) % this.maxParticles;
    }
    
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }

  updateParticles() {
    const posAttr = this.particleGeometry.attributes.position;
    const sizeAttr = this.particleGeometry.attributes.size;
    let needsUpdate = false;
    
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        // Get current position
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        
        // Apply velocity
        posAttr.setXYZ(i, x + p.velocity.x, y + p.velocity.y, z + p.velocity.z);
        
        // Decay velocity (drag) and add slight upward float
        p.velocity.multiplyScalar(0.96);
        p.velocity.y += 0.002;
        
        // Age particle
        p.life -= 1 / p.maxLife;
        
        // Set size based on life
        sizeAttr.setX(i, p.baseSize * p.life);
        
        if (p.life <= 0) {
          // Send dead particles far away
          posAttr.setXYZ(i, 0, 0, 1000);
          sizeAttr.setX(i, 0);
        }
        
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      posAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    }
  }

  updateCursorLight(position, colorHex, isDrawing) {
    if (position) {
      this.lights.cursorLight.position.copy(position);
      this.lights.cursorLight.color.setHex(colorHex);
      this.lights.cursorLight.intensity = isDrawing ? 6.0 : 2.5;
    } else {
      // Hide light if hand lost
      this.lights.cursorLight.position.set(0, 0, 1000);
    }
  }

  update() {
    // Slowly rotate auxiliary helpers for sci-fi active tracking feel
    if (this.helpers.cageFrame) {
      this.helpers.cageFrame.rotation.y += 0.001;
      this.helpers.cageFrame.rotation.x += 0.0005;
    }
    
    // Update cursor and stroke particles
    this.updateParticles();

    // Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Helper to clear all user-drawn objects from scene
  clearUserObjects(userObjects) {
    userObjects.forEach(obj => {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
    });
  }

  setViewspaceMode(mode) {
    if (!this.scene || !this.renderer) return;

    if (mode === 'ar') {
      this.renderer.setClearColor(0x000000, 0); // Transparent background
      this.scene.fog = null; // Disable fog
    } else {
      this.renderer.setClearColor(0x020208, 1); // Solid dark
      this.scene.fog = new THREE.FogExp2(0x020208, 0.015); // Re-enable fog
    }
  }

  addObject(obj) {
    this.scene.add(obj);
  }

  removeObject(obj) {
    this.scene.remove(obj);
  }
}

// Single instance export
export const sceneManager = new SceneManager();
