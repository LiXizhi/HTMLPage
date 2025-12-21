import { TILE_SIZE, TERRAIN_TILE_DEGREES, MAX_CACHED_TERRAIN_TILES, TERRAIN_LOAD_RADIUS, TERRAIN_CDN_BASE, TERRAIN_IMAGE_SIZE, TERRAIN_COLORS } from './WorldConfig.js';

/**
 * TerrainTileManager - Manages loading, caching, and rendering of terrain tiles
 * 
 * Each terrain tile:
 * - Covers a fixed 2x2 degree area of the Earth (aligned to even degree boundaries)
 * - Is stored as a PNG image on CDN (e.g., terrain_72_74_18_20.png)
 * - Contains 70x70 or at most 512*512 pixels, each pixel = one terrain block
 * - Is loaded on-demand based on camera position
 * 
 * Typically 9 tiles (3x3 grid) are loaded around the camera view.
 * Up to 32 tiles can be cached in memory using LRU eviction.
 */
export class TerrainTileManager {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    
    // Cache for terrain tiles: key = "lonFrom_lonTo_latFrom_latTo"
    // Each tile contains imageData (pixel colors) and rendered meshGroup
    this.terrainTiles = new Map();
    // LRU order tracking for cache eviction
    this.tileAccessOrder = [];
    
    // Currently visible terrain tile keys (typically 9 tiles)
    this.visibleTiles = new Set();
    
    // Loading promises to prevent duplicate loads
    this.loadingPromises = new Map();
    
    // THREE.js group for terrain meshes
    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'terrainGroup';
    this.scene.add(this.terrainGroup);
    
    // Materials cache for terrain types
    this.terrainMaterials = {};
    this.initTerrainMaterials();
    
    // Block geometry (reused for all terrain blocks)
    this.blockGeometry = new THREE.BoxGeometry(TILE_SIZE, 1, TILE_SIZE);
    
    // Current center position (in lon/lat)
    this.centerLon = 0;
    this.centerLat = 0;
  }

  initTerrainMaterials() {
    for (const [hexColor, data] of Object.entries(TERRAIN_COLORS)) {
      this.terrainMaterials[data.type] = new THREE.MeshLambertMaterial({ 
        color: data.color 
      });
    }
    // Default material for unknown terrain
    this.terrainMaterials['default'] = new THREE.MeshLambertMaterial({ color: 0x808080 });
  }

  /**
   * Get terrain tile key from longitude and latitude
   * Tiles are aligned to 2-degree boundaries
   */
  getTileKey(lon, lat) {
    const lonFrom = Math.floor(lon / TERRAIN_TILE_DEGREES) * TERRAIN_TILE_DEGREES;
    const latFrom = Math.floor(lat / TERRAIN_TILE_DEGREES) * TERRAIN_TILE_DEGREES;
    const lonTo = lonFrom + TERRAIN_TILE_DEGREES;
    const latTo = latFrom + TERRAIN_TILE_DEGREES;
    return `${lonFrom}_${lonTo}_${latFrom}_${latTo}`;
  }

  /**
   * Parse tile key back to bounds
   */
  parseTileKey(key) {
    const [lonFrom, lonTo, latFrom, latTo] = key.split('_').map(Number);
    return { lonFrom, lonTo, latFrom, latTo };
  }

  /**
   * Get the terrain image URL for a tile
   */
  getTileImageUrl(lonFrom, lonTo, latFrom, latTo) {
    return `${TERRAIN_CDN_BASE}terrain_${lonFrom}_${lonTo}_${latFrom}_${latTo}.png`;
  }

  /**
   * Load a terrain tile image and cache its pixel data
   */
  async loadTerrainTile(key) {
    // Check if already loading
    if (this.loadingPromises.has(key)) {
      return this.loadingPromises.get(key);
    }

    // Check if already cached
    if (this.terrainTiles.has(key)) {
      this.updateLRU(key);
      return this.terrainTiles.get(key);
    }

    const { lonFrom, lonTo, latFrom, latTo } = this.parseTileKey(key);
    const imageUrl = this.getTileImageUrl(lonFrom, lonTo, latFrom, latTo);

    const loadPromise = new Promise(async (resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((imgResolve, imgReject) => {
          img.onload = imgResolve;
          img.onerror = imgReject;
          img.src = imageUrl;
        });

        // Create canvas to read pixel data
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        
        // Debug: Log sample pixel colors from the loaded image
        console.log(`Loaded terrain image ${key}: ${img.width}x${img.height}`);
        const samplePixels = [];
        for (let i = 0; i < 5; i++) {
          const px = Math.floor(Math.random() * img.width);
          const py = Math.floor(Math.random() * img.height);
          const idx = (py * img.width + px) * 4;
          const r = imageData.data[idx];
          const g = imageData.data[idx + 1];
          const b = imageData.data[idx + 2];
          const a = imageData.data[idx + 3];
          const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
          samplePixels.push({ px, py, r, g, b, a, hex });
        }
        // console.log('Sample pixel colors:', samplePixels);
        
        const tileData = {
          key,
          lonFrom, lonTo, latFrom, latTo,
          imageData,
          width: img.width,
          height: img.height,
          meshGroup: null, // Will be created when rendering
          visible: false,
          loaded: true
        };

        // Evict oldest tiles if cache is full
        this.evictOldTiles();
        
        this.terrainTiles.set(key, tileData);
        this.updateLRU(key);
        
        // console.log(`Loaded terrain tile: ${key}`);
        resolve(tileData);
      } catch (error) {
        console.warn(`Failed to load terrain tile ${key}:`, error);
        // Create empty tile data for failed loads
        const emptyTileData = {
          key,
          lonFrom, lonTo, latFrom, latTo,
          imageData: null,
          width: TERRAIN_IMAGE_SIZE,
          height: TERRAIN_IMAGE_SIZE,
          meshGroup: null,
          visible: false,
          loaded: false
        };
        this.terrainTiles.set(key, emptyTileData);
        this.updateLRU(key);
        resolve(emptyTileData);
      } finally {
        this.loadingPromises.delete(key);
      }
    });

    this.loadingPromises.set(key, loadPromise);
    return loadPromise;
  }

  /**
   * Update LRU order
   */
  updateLRU(key) {
    const index = this.tileAccessOrder.indexOf(key);
    if (index > -1) {
      this.tileAccessOrder.splice(index, 1);
    }
    this.tileAccessOrder.push(key);
  }

  /**
   * Evict oldest tiles when cache is full
   */
  evictOldTiles() {
    while (this.terrainTiles.size >= MAX_CACHED_TERRAIN_TILES && this.tileAccessOrder.length > 0) {
      const oldestKey = this.tileAccessOrder.shift();
      const tile = this.terrainTiles.get(oldestKey);
      if (tile) {
        // Remove mesh from scene
        if (tile.meshGroup) {
          this.terrainGroup.remove(tile.meshGroup);
          // Dispose geometries and materials
          tile.meshGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
          });
          tile.meshGroup = null;
        }
        this.terrainTiles.delete(oldestKey);
        this.visibleTiles.delete(oldestKey);
        console.log(`Evicted terrain tile: ${oldestKey}`);
      }
    }
  }

  /**
   * Get pixel color at specific position in the terrain image
   */
  getPixelColor(tileData, localX, localY) {
    if (!tileData || !tileData.imageData) return null;
    
    const x = Math.floor(localX);
    const y = Math.floor(localY);
    
    if (x < 0 || x >= tileData.width || y < 0 || y >= tileData.height) return null;
    
    const index = (y * tileData.width + x) * 4;
    const r = tileData.imageData.data[index];
    const g = tileData.imageData.data[index + 1];
    const b = tileData.imageData.data[index + 2];
    
    return { r, g, b };
  }

  /**
   * Convert RGB to hex string for lookup
   */
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
  }

  /**
   * Find closest terrain color from the legend
   */
  findClosestTerrainType(r, g, b) {
    const hexColor = this.rgbToHex(r, g, b);
    
    // Direct match
    if (TERRAIN_COLORS[hexColor]) {
      return TERRAIN_COLORS[hexColor];
    }
    
    // Find closest color by distance
    let closestType = null;
    let minDistance = Infinity;
    
    for (const [hex, data] of Object.entries(TERRAIN_COLORS)) {
      const tr = parseInt(hex.slice(1, 3), 16);
      const tg = parseInt(hex.slice(3, 5), 16);
      const tb = parseInt(hex.slice(5, 7), 16);
      
      const distance = Math.sqrt(
        Math.pow(r - tr, 2) + 
        Math.pow(g - tg, 2) + 
        Math.pow(b - tb, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestType = data;
      }
    }
    
    return closestType || { type: 'default', height: 1, color: 0x808080 };
  }

  /**
   * Get terrain data at a specific world coordinate
   * @param worldX - World X coordinate (corresponds to longitude)
   * @param worldZ - World Z coordinate (corresponds to latitude, inverted)
   * @param centerLon - Center longitude of the map
   * @param centerLat - Center latitude of the map
   */
  getTerrainAt(worldX, worldZ, centerLon, centerLat) {
    // Convert world coordinates to lon/lat
    // worldX/Z are grid coordinates * TILE_SIZE, and grid coords = (lon/lat - center) * CONFIG_SCALE
    const configScale = this.game?.configScale || 70;
    const lon = centerLon + (worldX / TILE_SIZE) / configScale;
    const lat = centerLat - (worldZ / TILE_SIZE) / configScale;
    
    const key = this.getTileKey(lon, lat);
    const tileData = this.terrainTiles.get(key);
    
    if (!tileData || !tileData.imageData) return null;
    
    // Calculate local position within the tile (0 to TERRAIN_TILE_DEGREES)
    const localLon = lon - tileData.lonFrom;
    const localLat = tileData.latTo - lat; // Y is inverted in image
    
    // Convert to pixel coordinates using actual image dimensions
    const pixelsPerDegree = tileData.width / TERRAIN_TILE_DEGREES;
    const pixelX = localLon * pixelsPerDegree;
    const pixelY = localLat * pixelsPerDegree;
    
    const color = this.getPixelColor(tileData, pixelX, pixelY);
    if (!color) return null;
    
    return this.findClosestTerrainType(color.r, color.g, color.b);
  }

  /**
   * Create mesh for a terrain tile (called after loading)
   * Ray traces into the image at world grid positions to determine terrain type
   */
  createTerrainMesh(tileData, centerLon, centerLat, CONFIG_SCALE) {
    if (tileData.meshGroup) return; // Already created
    if (!tileData.imageData) return; // No data to render
    
    const meshGroup = new THREE.Group();
    meshGroup.name = `terrain_${tileData.key}`;
    
    // Spatial chunk size for instanced meshes (16x16 grid cells)
    const CHUNK_SIZE = 16;
    
    // Create a water plane for this terrain tile
    // Calculate tile bounds in world coordinates
    const minGridX = Math.floor((tileData.lonFrom - centerLon) * CONFIG_SCALE);
    const maxGridX = Math.ceil((tileData.lonTo - centerLon) * CONFIG_SCALE);
    const minGridZ = Math.floor(-(tileData.latTo - centerLat) * CONFIG_SCALE);
    const maxGridZ = Math.ceil(-(tileData.latFrom - centerLat) * CONFIG_SCALE);
    
    // Calculate water plane size and position
    const tileSizeX = (maxGridX - minGridX) * TILE_SIZE;
    const tileSizeZ = (maxGridZ - minGridZ) * TILE_SIZE;
    const tileCenterX = (minGridX + maxGridX) / 2 * TILE_SIZE;
    const tileCenterZ = (minGridZ + maxGridZ) / 2 * TILE_SIZE;
    
    // Add water plane for this tile
    const waterGeo = new THREE.PlaneGeometry(tileSizeX, tileSizeZ);
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x1e3a8a }); // Deep blue ocean
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(tileCenterX, -0.5, tileCenterZ);
    waterMesh.receiveShadow = false;
    meshGroup.add(waterMesh);
    
    // Calculate pixels per degree from actual image size
    const pixelsPerDegree = tileData.width / TERRAIN_TILE_DEGREES;
    
    // Helper to get chunk key from grid coordinates
    const getChunkKey = (gridX, gridZ) => {
      const chunkX = Math.floor(gridX / CHUNK_SIZE);
      const chunkZ = Math.floor(gridZ / CHUNK_SIZE);
      return `${chunkX},${chunkZ}`;
    };
    
    // Group blocks by chunk AND terrain type for spatially chunked instancing
    // Structure: { chunkKey: { terrainType: Map<posKey, blockData> } }
    const blocksByChunk = {};
    
    // Debug: count terrain types found
    const terrainTypeCounts = {};
    
    // Iterate over game world grid positions that fall within this tile
    // (reusing minGridX, maxGridX, minGridZ, maxGridZ calculated above for water plane)
    
    for (let gridX = minGridX; gridX <= maxGridX; gridX++) {
      for (let gridZ = minGridZ; gridZ <= maxGridZ; gridZ++) {
        const key = `${gridX},${gridZ}`;
        
        // Skip positions that already have road/station tiles
        if (this.tilesMap && this.tilesMap.has(key)) {
          continue;
        }
        
        // Convert grid position to lon/lat
        const lon = centerLon + gridX / CONFIG_SCALE;
        const lat = centerLat - gridZ / CONFIG_SCALE;
        
        // Check if this position is within this tile's bounds
        if (lon < tileData.lonFrom || lon >= tileData.lonTo ||
            lat < tileData.latFrom || lat >= tileData.latTo) {
          continue;
        }
        
        // Calculate pixel position in image
        const localLon = lon - tileData.lonFrom;
        const localLat = tileData.latTo - lat; // Y is inverted in image
        const px = Math.floor(localLon * pixelsPerDegree);
        const py = Math.floor(localLat * pixelsPerDegree);
        
        const color = this.getPixelColor(tileData, px, py);
        if (!color) continue;
        
        const terrain = this.findClosestTerrainType(color.r, color.g, color.b);
        
        // Count terrain types for debugging
        terrainTypeCounts[terrain.type] = (terrainTypeCounts[terrain.type] || 0) + 1;
        
        // Skip water types (ocean plane handles them)
        if (terrain.type === 'water' || terrain.type === 'ocean') continue;
        
        // Get chunk key for this position
        const chunkKey = getChunkKey(gridX, gridZ);
        
        if (!blocksByChunk[chunkKey]) {
          blocksByChunk[chunkKey] = {};
        }
        if (!blocksByChunk[chunkKey][terrain.type]) {
          blocksByChunk[chunkKey][terrain.type] = new Map();
        }
        
        // Generate random height based on terrain type using position-based seed for consistency
        // Use Math.abs to handle negative grid coordinates (negative seed would cause negative heights)
        const seed = Math.abs((gridX * 73856093) ^ (gridZ * 19349663));
        const pseudoRandom = (seed % 1000) / 1000;
        
        let blockHeight = 1; // Default flat height (same as road tiles)
        const terrainConfig = Object.values(TERRAIN_COLORS).find(t => t.type === terrain.type);
        
        if (terrainConfig && terrainConfig.heightType === 'varied') {
          const minH = terrainConfig.minHeight || 1;
          const maxH = terrainConfig.maxHeight || 3;
          blockHeight = minH + pseudoRandom * (maxH - minH);
        } else {
          blockHeight = 1;
        }
        
        // Only add if not already occupied
        const posKey = `${gridX},${gridZ}`;
        if (!blocksByChunk[chunkKey][terrain.type].has(posKey)) {
          blocksByChunk[chunkKey][terrain.type].set(posKey, {
            x: gridX * TILE_SIZE,
            z: gridZ * TILE_SIZE,
            height: blockHeight,
            seed: seed // Store seed for consistent decoration generation
          });
        }
      }
    }
    
    // Create terrain meshes with optimized instanced rendering
    // All terrain types now use instanced meshes with scale for varied heights
    
    // Shared tree/bush geometries for instanced decoration
    const treeGeo = new THREE.ConeGeometry(0.8, 2.5, 6);
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x14532d });
    const tallTreeGeo = new THREE.ConeGeometry(1.2, 4, 6);
    const tallTreeMat = new THREE.MeshLambertMaterial({ color: 0x0d3d1a });
    const bushGeo = new THREE.ConeGeometry(0.6, 1.8, 6);
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x5d6d3a });
    
    // Decoration config per terrain type: { chance, geo, mat, heightOffset, useOffset }
    const decorationConfig = {
      forest: { chance: 0.7, geo: tallTreeGeo, mat: tallTreeMat, heightOffset: 2, useOffset: true },
      grass: { chance: 0.15, geo: treeGeo, mat: treeMat, heightOffset: 1.25, useOffset: false },
      crops: { chance: 0.08, geo: treeGeo, mat: treeMat, heightOffset: 1.25, useOffset: false },
      scrub: { chance: 0.12, geo: bushGeo, mat: bushMat, heightOffset: 0.9, useOffset: true, offsetScale: 0.5 }
    };
    
    // Unit box geometry (1x1x1) - will be scaled per instance
    const unitBoxGeo = new THREE.BoxGeometry(TILE_SIZE, 1, TILE_SIZE);
    
    // Helper matrices for instancing
    const matrix = new THREE.Matrix4();
    const posVec = new THREE.Vector3();
    const scaleVec = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    
    // Create meshes by spatial chunk, each chunk containing instanced meshes by terrain type
    let totalBlocks = 0;
    let chunkCount = 0;
    
    for (const [chunkKey, blocksByType] of Object.entries(blocksByChunk)) {
      // Create a group for this spatial chunk
      const chunkGroup = new THREE.Group();
      const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
      chunkGroup.name = `chunk_${chunkKey}`;
      
      // Calculate chunk center for potential frustum culling
      const chunkCenterX = (chunkX + 0.5) * CHUNK_SIZE * TILE_SIZE;
      const chunkCenterZ = (chunkZ + 0.5) * CHUNK_SIZE * TILE_SIZE;
      chunkGroup.userData.chunkCenter = new THREE.Vector3(chunkCenterX, 0, chunkCenterZ);
      chunkGroup.userData.chunkRadius = CHUNK_SIZE * TILE_SIZE * Math.SQRT2 * 0.5;
      
      for (const [type, positions] of Object.entries(blocksByType)) {
        if (positions.size === 0) continue;
        
        const material = this.terrainMaterials[type] || this.terrainMaterials['default'];
        const count = positions.size;
        totalBlocks += count;
        
        // Create instanced mesh for terrain blocks with varied heights via scale
        const instancedMesh = new THREE.InstancedMesh(unitBoxGeo, material, count);
        instancedMesh.receiveShadow = true;
        
        // Collect decoration positions for instanced decoration rendering
        const decoConfig = decorationConfig[type];
        const decoPositions = [];
        
        let index = 0;
        for (const [, pos] of positions) {
          const blockHeight = pos.height;
          // Position: center block vertically, with bottom above sea level (water is at y=-0.5)
          const yOffset = blockHeight * 0.5;
          posVec.set(pos.x, yOffset, pos.z);
          scaleVec.set(1, blockHeight, 1);
          matrix.compose(posVec, quaternion, scaleVec);
          instancedMesh.setMatrixAt(index++, matrix);
          
          // Check for decoration
          if (decoConfig) {
            // Use Math.abs to handle negative seeds from negative grid coordinates
            const treeRandom = (Math.abs(pos.seed * 7) % 100) / 100;
            if (treeRandom < decoConfig.chance) {
              let dx = 0, dz = 0;
              // Add random offset for natural variation within tile bounds
              const maxRandomOffset = TILE_SIZE * 0.2;
              dx = ((Math.abs(pos.seed * 13) % 100) / 100 - 0.5) * 2 * maxRandomOffset;
              dz = ((Math.abs(pos.seed * 17) % 100) / 100 - 0.5) * 2 * maxRandomOffset;
              // Random height scale for trees (0.5 to 1.5)
              const heightScale = 0.8 + (Math.abs(pos.seed * 19) % 100) / 100 * 0.6;
              decoPositions.push({
                x: pos.x + dx,
                y: blockHeight,
                z: pos.z + dz,
                heightScale: heightScale
              });
            }
          }
        }
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        chunkGroup.add(instancedMesh);
        
        // Create instanced mesh for decorations (trees/bushes) if any
        if (decoConfig && decoPositions.length > 0) {
          const decoInstancedMesh = new THREE.InstancedMesh(decoConfig.geo, decoConfig.mat, decoPositions.length);
          decoInstancedMesh.castShadow = true;
          
          for (let i = 0; i < decoPositions.length; i++) {
            const dp = decoPositions[i];
            // Apply random uniform scale for natural variation
            // ConeGeometry origin is at center, so add half the height offset to place tree base on top of terrain
            const treeYOffset = decoConfig.heightOffset * dp.heightScale * 0.5;
            posVec.set(dp.x, dp.y + treeYOffset, dp.z);
            scaleVec.set(dp.heightScale, dp.heightScale, dp.heightScale);
            matrix.compose(posVec, quaternion, scaleVec);
            decoInstancedMesh.setMatrixAt(i, matrix);
          }
          
          decoInstancedMesh.instanceMatrix.needsUpdate = true;
          chunkGroup.add(decoInstancedMesh);
        }
      }
      
      meshGroup.add(chunkGroup);
      chunkCount++;
    }
    
    tileData.meshGroup = meshGroup;
    this.terrainGroup.add(meshGroup);
    
    console.log(`Created terrain mesh for ${tileData.key} with ${totalBlocks} blocks in ${chunkCount} chunks (${CHUNK_SIZE}x${CHUNK_SIZE})`);
  }

  /**
   * Perform frustum culling on terrain chunk groups
   * Call this every frame before rendering to hide chunks outside view
   * @param {THREE.Camera} camera - The active camera
   * @returns {Object} Stats about visible/culled chunks
   */
  cullChunks(camera) {
    if (!camera) return { visible: 0, culled: 0 };
    
    // Reuse cached objects to avoid GC pressure
    if (!this._cullFrustum) {
      this._cullFrustum = new THREE.Frustum();
      this._cullMatrix = new THREE.Matrix4();
      this._cullSphere = new THREE.Sphere();
    }
    
    // Update frustum from camera
    this._cullMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._cullFrustum.setFromProjectionMatrix(this._cullMatrix);
    
    let visibleCount = 0;
    let culledCount = 0;
    
    // Iterate through all terrain tiles
    for (const [, tileData] of this.terrainTiles) {
      if (!tileData.meshGroup) continue;
      
      // Iterate through chunk groups within each tile
      for (const child of tileData.meshGroup.children) {
        // Skip non-chunk children (like water plane)
        if (!child.userData.chunkCenter) {
          continue;
        }
        
        // Check if chunk's bounding sphere intersects frustum
        this._cullSphere.center.copy(child.userData.chunkCenter);
        this._cullSphere.radius = child.userData.chunkRadius;
        
        const isVisible = this._cullFrustum.intersectsSphere(this._cullSphere);
        
        child.visible = isVisible;
        
        if (isVisible) {
          visibleCount++;
        } else {
          culledCount++;
        }
      }
    }
    
    return { visible: visibleCount, culled: culledCount };
  }

  /**
   * Update which terrain tiles should be loaded and visible
   * Loads a 3x3 grid of tiles (9 total) centered on the camera position
   * Each tile is a 2x2 degree area containing many terrain blocks
   * @returns {boolean} true if any tiles were loaded, created, or visibility changed
   */
  async updateVisibleTiles(centerLon, centerLat, CONFIG_SCALE) {
    this.centerLon = centerLon;
    this.centerLat = centerLat;
    
    let tilesChanged = false;
    
    // Calculate which tiles should be visible (3x3 grid = 9 tiles around camera)
    const newVisibleTiles = new Set();
    
    // TERRAIN_LOAD_RADIUS = 1 means: current tile + 1 tile in each direction = 3x3 grid
    for (let dx = -TERRAIN_LOAD_RADIUS; dx <= TERRAIN_LOAD_RADIUS; dx++) {
      for (let dy = -TERRAIN_LOAD_RADIUS; dy <= TERRAIN_LOAD_RADIUS; dy++) {
        const lon = centerLon + dx * TERRAIN_TILE_DEGREES;
        const lat = centerLat + dy * TERRAIN_TILE_DEGREES;
        const key = this.getTileKey(lon, lat);
        newVisibleTiles.add(key);
      }
    }
    
    // Hide tiles that are no longer visible
    for (const key of this.visibleTiles) {
      if (!newVisibleTiles.has(key)) {
        const tile = this.terrainTiles.get(key);
        if (tile && tile.meshGroup) {
          tile.meshGroup.visible = false;
          tile.visible = false;
          tilesChanged = true;
        }
      }
    }
    
    // Load and show new visible tiles
    for (const key of newVisibleTiles) {
      if (!this.terrainTiles.has(key)) {
        // Load new tile
        const tileData = await this.loadTerrainTile(key);
        if (tileData && tileData.loaded) {
          this.createTerrainMesh(tileData, centerLon, centerLat, CONFIG_SCALE);
          tilesChanged = true;
        }
      }
      
      const tile = this.terrainTiles.get(key);
      if (tile) {
        if (!tile.meshGroup && tile.loaded) {
          this.createTerrainMesh(tile, centerLon, centerLat, CONFIG_SCALE);
          tilesChanged = true;
        }
        if (tile.meshGroup && !tile.visible) {
          tile.meshGroup.visible = true;
          tile.visible = true;
          tilesChanged = true;
        }
      }
    }
    
    this.visibleTiles = newVisibleTiles;
    return tilesChanged;
  }

  /**
   * Check if a world position is on a road-buildable terrain
   */
  isRoadBuildable(worldX, worldZ, centerLon, centerLat) {
    const terrain = this.getTerrainAt(worldX, worldZ, centerLon, centerLat);
    if (!terrain) return true; // Default to buildable if no terrain data
    return terrain.type !== 'water';
  }

  /**
   * Get terrain type at world position
   */
  getTerrainTypeAt(worldX, worldZ, centerLon, centerLat) {
    const terrain = this.getTerrainAt(worldX, worldZ, centerLon, centerLat);
    return terrain ? terrain.type : 'default';
  }

  /**
   * Cleanup all terrain tiles
   */
  dispose() {
    for (const [key, tile] of this.terrainTiles) {
      if (tile.meshGroup) {
        this.terrainGroup.remove(tile.meshGroup);
        tile.meshGroup.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
        });
      }
    }
    this.terrainTiles.clear();
    this.tileAccessOrder = [];
    this.visibleTiles.clear();
    this.loadingPromises.clear();
    
    if (this.terrainGroup.parent) {
      this.terrainGroup.parent.remove(this.terrainGroup);
    }
  }
}
