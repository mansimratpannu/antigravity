import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { sceneManager } from './sceneManager';
import { drawingEngine } from './drawingEngine';

export class ExportManager {
  // Helper to trigger a browser download for text/json strings
  downloadFile(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Export only the stroke meshes to a GLTF file
  exportToGLTF() {
    if (drawingEngine.strokes.length === 0) {
      console.warn("No strokes to export.");
      return false;
    }

    const exporter = new GLTFExporter();
    // Gather all meshes from active strokes
    const meshesToExport = drawingEngine.strokes.map(stroke => stroke.mesh);

    const options = {
      binary: false, // Export as .gltf JSON text format
      animations: [],
      includeCustomExtensions: false
    };

    exporter.parse(
      meshesToExport,
      (gltf) => {
        const output = JSON.stringify(gltf, null, 2);
        this.downloadFile(output, "airdraw_export.gltf", "application/json");
        console.log("GLTF Export successful!");
      },
      (error) => {
        console.error("An error occurred during GLTF export:", error);
      },
      options
    );
    
    return true;
  }

  // Save drawing stroke coordinate data as a JSON file
  saveToJSON() {
    if (drawingEngine.strokes.length === 0) {
      console.warn("No strokes to save.");
      return false;
    }

    const serializedData = drawingEngine.strokes.map(stroke => ({
      color: stroke.color,
      size: stroke.size,
      type: stroke.type,
      layer: stroke.layer,
      points: stroke.points.map(p => ({ x: p.x, y: p.y, z: p.z }))
    }));

    const jsonContent = JSON.stringify(serializedData, null, 2);
    this.downloadFile(jsonContent, "airdraw_artwork.json", "application/json");
    console.log("JSON Save successful!");
    return true;
  }

  // Import drawing strokes from a JSON file and render them
  importFromJSON(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data)) {
        throw new Error("Invalid format. Expected JSON array of strokes.");
      }

      // Clear the active scene and history first to avoid overlap/leaks
      drawingEngine.clearAll();

      data.forEach(strokeData => {
        const points = strokeData.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        
        // Recreate the mesh using drawingEngine's logic
        // We temporarily set drawingEngine parameters to match the imported stroke properties
        const prevColor = drawingEngine.currentColor;
        const prevSize = drawingEngine.currentSize;
        const prevType = drawingEngine.currentBrushType;
        const prevLayer = drawingEngine.currentLayer;

        drawingEngine.currentColor = strokeData.color;
        drawingEngine.currentSize = strokeData.size;
        drawingEngine.currentBrushType = strokeData.type;
        drawingEngine.currentLayer = strokeData.layer;

        // Populate active stroke points and generate mesh
        drawingEngine.activeStrokePoints = points;
        drawingEngine.updateActiveStrokeMesh();

        // Save stroke metadata and push to active list
        const stroke = {
          id: Math.random().toString(36).substring(2, 9),
          points: points,
          mesh: drawingEngine.activeStrokeMesh,
          color: strokeData.color,
          size: strokeData.size,
          type: strokeData.type,
          layer: strokeData.layer
        };

        drawingEngine.strokes.push(stroke);
        
        // Reset drawingEngine temporary properties
        drawingEngine.activeStrokePoints = [];
        drawingEngine.activeStrokeMesh = null;
        drawingEngine.currentColor = prevColor;
        drawingEngine.currentSize = prevSize;
        drawingEngine.currentBrushType = prevType;
        drawingEngine.currentLayer = prevLayer;
      });

      console.log(`Successfully imported ${data.length} strokes.`);
      return true;

    } catch (error) {
      console.error("Failed to import JSON drawing:", error);
      alert("Error importing JSON file: " + error.message);
      return false;
    }
  }
}

export const exportManager = new ExportManager();
