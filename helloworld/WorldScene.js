import { TILE_SIZE, TILE_SPACING, COLORS } from './WorldConfig.js';
import { TerrainTileManager } from './TerrainTileManager.js';

// Config moved to WorldConfig.js
const WS_TILE_SIZE = TILE_SIZE;
const WS_TILE_SPACING = TILE_SPACING;
const WS_COLORS = COLORS;

class Tile {
  constructor(id, gridX, gridY, type) {
    this.id = id;
    this.gridX = gridX;
    this.gridY = gridY;
    this.type = type;
    this.buildings = [];
    this.owner = null;

    // Station name is set externally from node data after construction
    // Do NOT use hash-based assignment here as it leads to incorrect names
    this.stationName = "";

    this.neighbors = [];
    this.mesh = null; // Three.js Mesh or virtual mesh object
    
    // Instancing references
    this.instancedMesh = null;
    this.instanceIndex = -1;
    this.chunkGroup = null;
    
    // Label references
    this.labelGroup = null;
    this.labelPlane = null;
    this.labelMaterial = null;
    this.labelText = null;
    this.labelTextureSlot = undefined;
    this.labelHasTexture = false;
  }

  get isRoad() {
    return !this.type.startsWith("env");
  }

  get isColored() {
    return ["blue", "red", "yellow", "green", "start"].includes(this.type);
  }

  // Helper to get world position based on grid
  get worldPos() {
    return new THREE.Vector3(this.gridX * WS_TILE_SIZE, 0, this.gridY * WS_TILE_SIZE);
  }
}

export class WorldScene {
  constructor(scene, configScale) {
    this.scene = scene;
    this.configScale = configScale;
    this.map = [];
    this.tilesMap = new Map();
    this.mapGroup = null;
    this.stationLabelsGroup = new THREE.Group();
    this.stationLabelsGroup.name = 'stationLabels';
    this.scene.add(this.stationLabelsGroup);
    
    this.roadChunkGroups = [];
    this._stationLabelTexturePool = null;
    
    this.terrainManager = null;
    this.mapCenterLon = 0;
    this.mapCenterLat = 0;

    this.initMaterials();
  }

  initMaterials() {
    this.materials = {
      road: new THREE.MeshLambertMaterial({ color: WS_COLORS.road }),
      start: new THREE.MeshLambertMaterial({ color: WS_COLORS.start }),
      blue: new THREE.MeshLambertMaterial({ color: WS_COLORS.blue }),
      red: new THREE.MeshLambertMaterial({ color: WS_COLORS.red }),
      yellow: new THREE.MeshLambertMaterial({ color: WS_COLORS.yellow }),
      green: new THREE.MeshLambertMaterial({ color: WS_COLORS.green }),
      env_nature: new THREE.MeshLambertMaterial({ color: WS_COLORS.env_nature }),
      env_culture: new THREE.MeshLambertMaterial({ color: WS_COLORS.env_culture }),
      rail: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 }),
    };

    this.geometries = {
      tile: new THREE.BoxGeometry(WS_TILE_SIZE - WS_TILE_SPACING, 1, WS_TILE_SIZE - WS_TILE_SPACING),
      envBlock: new THREE.BoxGeometry(WS_TILE_SIZE, 4, WS_TILE_SIZE), // Taller blocks for env
    };
  }

  dispose() {
    if (this.terrainManager) {
      this.terrainManager.dispose();
      this.terrainManager = null;
    }
    // Clean up scene objects
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      this.mapGroup = null;
    }
    if (this.stationLabelsGroup) {
      this.scene.remove(this.stationLabelsGroup);
      // Clear children
      while(this.stationLabelsGroup.children.length > 0){ 
        this.stationLabelsGroup.remove(this.stationLabelsGroup.children[0]); 
      }
    }
    this.map = [];
    this.tilesMap.clear();
    this.roadChunkGroups = [];
  }

  // --- Map Generation Algorithm ---
  
  _createPriorityQueue() {
    return {
      items: [],
      enqueue(element, priority) {
        const qElement = { element, priority };
        let contain = false;
        for (let i = 0; i < this.items.length; i++) {
          if (this.items[i].priority > qElement.priority) {
            this.items.splice(i, 0, qElement);
            contain = true;
            break;
          }
        }
        if (!contain) this.items.push(qElement);
      },
      dequeue() { return this.items.shift(); },
      isEmpty() { return this.items.length === 0; }
    };
  }

  _createUnionFind(elements) {
    const parent = {};
    elements.forEach(e => parent[e] = e);
    return {
      find(id) {
        if (parent[id] === id) return id;
        parent[id] = this.find(parent[id]);
        return parent[id];
      },
      union(id1, id2) {
        const root1 = this.find(id1);
        const root2 = this.find(id2);
        if (root1 !== root2) {
          parent[root1] = root2;
          return true;
        }
        return false;
      },
      connected(id1, id2) { 
        return this.find(id1) === this.find(id2); 
      }
    };
  }

  generateMap(stationData, stationNames) {
    this.map = [];
    this.tilesMap.clear();
    
    // Initialize simplex noise for terrain
    const simplex = new SimplexNoise();
    
    // World map for terrain data
    const worldMap = new Map(); // Key: "x,z", Value: { h: height, obj: objectType }
    const roadSet = new Set(); // Track built roads for dynamic costing
    
    // Cost constants for A* pathfinding
    const COST_EMPTY = 10;     // Expensive to build new
    const COST_EXISTING = 1;   // Cheap to use existing
    
    // Helper functions
    const setCell = (x, z, data) => {
      worldMap.set(`${x},${z}`, data);
    };
    
    const getCell = (x, z) => {
      return worldMap.get(`${x},${z}`);
    };
    
    const getNoiseHeight = (x, z) => {
      let n = simplex.noise2D(x*0.03, z*0.03); 
      let n2 = simplex.noise2D(x*0.1, z*0.1);
      let h = -1;
      if (n > -0.2) h = 1; 
      if (n > 0.5) h = 3; 
      if (h === 1 && n2 > 0.4) h = 2;
      return h;
    };
    
    const getCost = (x, z) => {
      return roadSet.has(`${x},${z}`) ? COST_EXISTING : COST_EMPTY;
    };
    
    // A* Pathfinding
    const findPath = (start, end) => {
      const openSet = this._createPriorityQueue();
      openSet.enqueue(start, 0);
      
      const cameFrom = {};
      const gScore = {};
      const startKey = `${start.x},${start.z}`;
      gScore[startKey] = 0;

      const getKey = (pt) => `${pt.x},${pt.z}`;
      
      while (!openSet.isEmpty()) {
        const current = openSet.dequeue().element;
        const currentKey = getKey(current);

        if (current.x === end.x && current.z === end.z) {
          const path = [];
          let curr = currentKey;
          while (cameFrom[curr]) {
            const [x, z] = curr.split(',').map(Number);
            path.push({x, z});
            curr = cameFrom[curr];
          }
          return { path: path.reverse(), cost: gScore[currentKey] };
        }

        const neighbors = [
          {x: current.x+1, z: current.z}, {x: current.x-1, z: current.z},
          {x: current.x, z: current.z+1}, {x: current.x, z: current.z-1}
        ];

        for (let neighbor of neighbors) {
          const neighborKey = getKey(neighbor);
          const newCost = gScore[currentKey] + getCost(neighbor.x, neighbor.z);

          if (newCost < (gScore[neighborKey] ?? Infinity)) {
            cameFrom[neighborKey] = currentKey;
            gScore[neighborKey] = newCost;
            const h = Math.abs(neighbor.x - end.x) + Math.abs(neighbor.z - end.z);
            openSet.enqueue(neighbor, newCost + h);
          }
        }
      }
      return { path: [], cost: Infinity };
    };
    
    const addPathToRoadSet = (path) => {
      path.forEach(p => roadSet.add(`${p.x},${p.z}`));
    };
    
    const buildDirectRoad = (start, end) => {
      let x = start.x;
      let z = start.z;
      
      while(x !== end.x) {
        roadSet.add(`${x},${z}`);
        x += (end.x > x ? 1 : -1);
      }
      while(z !== end.z) {
        roadSet.add(`${x},${z}`);
        z += (end.z > z ? 1 : -1);
      }
      roadSet.add(`${end.x},${end.z}`);
    };
    
    const ensureRoad = (x, z) => {
      let cell = getCell(x, z);
      if (!cell) {
        setCell(x, z, { h: 1, obj: 1 });
      } else {
        if (cell.obj === 0) {
          cell.obj = 1;
          cell.h = Math.max(cell.h, 1);
          setCell(x, z, cell);
        }
      }
      
      // Padding around roads
      for(let dx=-1; dx<=1; dx++) {
        for(let dz=-1; dz<=1; dz++) {
          if(dx===0 && dz===0) continue;
          let px = x+dx, pz = z+dz;
          if(!worldMap.has(`${px},${pz}`)) {
            let h = getNoiseHeight(px, pz);
            if(h < 1) h = 1; 
            setCell(px, pz, { h: h, obj: 0 });
          }
        }
      }
    };

    // --- Step 1: Load Station Data ---
    const CONFIG_SCALE = this.configScale;
    const RENDER_RADIUS = 6;
    
    let rawPoints = [];
    let centerLat = 0;
    let centerLng = 0;
    
    if (stationData && stationData.length > 0) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      stationData.forEach(d => {
        if (d.lat < minLat) minLat = d.lat;
        if (d.lat > maxLat) maxLat = d.lat;
        if (d.lng < minLng) minLng = d.lng;
        if (d.lng > maxLng) maxLng = d.lng;
      });
      
      centerLat = (minLat + maxLat) / 2;
      centerLng = (minLng + maxLng) / 2;
      
      this.mapCenterLon = centerLng;
      this.mapCenterLat = centerLat;

      rawPoints = stationData.map(d => ({
        x: (d.lng - centerLng) * CONFIG_SCALE,
        z: -(d.lat - centerLat) * CONFIG_SCALE,
        originalName: d.name,
        population: d.population || 100000,
        level: d.level || 3,
        lon: d.lng,
        lat: d.lat
      }));
    } else {
      for (let i = 0; i < (stationNames ? stationNames.length : 0); i++) {
        rawPoints.push({
          x: (Math.random() - 0.5) * 100,
          z: (Math.random() - 0.5) * 100,
          originalName: stationNames[i],
          population: 1000000 - i * 10000,
          level: 3
        });
      }
    }
    
    // --- Step 2: Snap to Even Grid ---
    const nodes = [];
    const occupied = new Set();
    
    rawPoints.sort((a, b) => (b.population || 0) - (a.population || 0));
    
    const snapToEvenGrid = (val) => Math.round(val / 2) * 2;
    
    const findNearestFree = (startGx, startGz) => {
      startGx = snapToEvenGrid(startGx);
      startGz = snapToEvenGrid(startGz);
      
      if (!occupied.has(`${startGx},${startGz}`)) return { x: startGx, z: startGz };
      
      let radius = 2;
      while (radius < 100) {
        for (let x = -radius; x <= radius; x += 2) {
          for (let z = -radius; z <= radius; z += 2) {
            if (Math.abs(x) !== radius && Math.abs(z) !== radius) continue;
            
            let checkX = startGx + x;
            let checkZ = startGz + z;
            if (!occupied.has(`${checkX},${checkZ}`)) {
              return { x: checkX, z: checkZ };
            }
          }
        }
        radius += 2;
      }
      return null;
    };

    rawPoints.forEach((p, index) => {
      let desiredGx = snapToEvenGrid(Math.round(p.x));
      let desiredGz = snapToEvenGrid(Math.round(p.z));
      
      let pos = findNearestFree(desiredGx, desiredGz);
      
      if (pos) {
        let gx = pos.x;
        let gz = pos.z;
        let key = `${gx},${gz}`;
        
        occupied.add(key);
        let type = (p.level <= 2) ? 'station' : 'city';
        let node = {
          id: nodes.length,
          x: gx, 
          z: gz,
          type: type,
          name: p.originalName,
          population: p.population,
          level: p.level,
          neighbors: [],
          lon: p.lon,
          lat: p.lat
        };
        nodes.push(node);
        setCell(gx, gz, { h: 1, obj: type === 'station' ? 3 : 2 });
      }
    });

    // --- Step 3: Generate Terrain Around Stations ---
    nodes.forEach(node => {
      for(let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) {
        for(let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
          let wx = node.x + dx;
          let wz = node.z + dz;
          if (!worldMap.has(`${wx},${wz}`)) {
            let h = getNoiseHeight(wx, wz);
            setCell(wx, wz, { h: h, obj: 0 });
          }
        }
      }
    });

    // --- Step 4: Build Road Network ---
    const solveNetwork = () => {
      if (nodes.length < 2) return;

      roadSet.clear();
      
      const loopVal = 50;
      
      let edges = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dist = Math.abs(nodes[i].x - nodes[j].x) + Math.abs(nodes[i].z - nodes[j].z);
          edges.push({ u: nodes[i], v: nodes[j], dist: dist });
        }
      }
      edges.sort((a, b) => a.dist - b.dist);

      const uf = this._createUnionFind(nodes.map(n => n.id));
      let rejectedEdges = [];

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        
        if (uf.connected(edge.u.id, edge.v.id)) {
          rejectedEdges.push(edge);
          continue;
        }

        const pathRes = findPath(edge.u, edge.v);
        
        if (!uf.connected(edge.u.id, edge.v.id)) {
          uf.union(edge.u.id, edge.v.id);
          addPathToRoadSet(pathRes.path);
          
          edge.u.neighbors.push(edge.v);
          edge.v.neighbors.push(edge.u);
        }
      }

      if (loopVal > 0) {
        const localEdges = rejectedEdges.filter(e => e.dist < 15);

        for (let edge of localEdges) {
          const currentRailPath = findPath(edge.u, edge.v);
          
          if (currentRailPath.cost - edge.dist > 8) {
            buildDirectRoad(edge.u, edge.v);
            edge.u.neighbors.push(edge.v);
            edge.v.neighbors.push(edge.u);
          }
        }
      }

      roadSet.forEach(k => {
        const [x, z] = k.split(',').map(Number);
        if(!nodes.some(n => n.x === x && n.z === z)) {
          ensureRoad(x, z);
        }
      });
    };
    
    solveNetwork();

    // --- Step 5: Convert to Tile System ---
    const tileData = new Map();
    
    worldMap.forEach((cell, key) => {
      const [xStr, zStr] = key.split(',');
      const x = parseInt(xStr);
      const z = parseInt(zStr);
      
      let h = cell.h;
      let obj = cell.obj;
      
      if (h === -1) return;
      
      let type = 'road';
      
      if (obj === 2 || obj === 3) {
        type = 'green';
      } else if (obj === 1) {
        type = Math.random() < 0.3 ? this.getRandomColoredType() : 'road';
      } else {
        if (h === 0 || h === -1) type = 'env_nature';
        else if (h === 1) type = Math.random() > 0.3 ? 'env_nature' : 'env_culture';
        else if (h === 2) type = 'env_nature';
        else if (h === 3) type = 'env_culture';
      }
      
      let stationName = '';
      let population = 0;
      if (type === 'green') {
        const node = nodes.find(n => n.x === x && n.z === z);
        if (node) {
          stationName = node.name;
          population = node.population || 0;
        }
      }
      
      tileData.set(key, { x, z, type, stationName, population, height: h, obj });
    });

    // --- Step 6: Instantiate Tiles ---
    const mapGroup = new THREE.Group();
    mapGroup.name = 'gameMapGroup';
    this.scene.add(mapGroup);
    this.mapGroup = mapGroup;
    
    let idCounter = 0;
    const ROAD_CHUNK_SIZE = 16;
    
    const tilesByChunk = {};
    
    const getChunkKey = (gridX, gridZ) => {
      const chunkX = Math.floor(gridX / ROAD_CHUNK_SIZE);
      const chunkZ = Math.floor(gridZ / ROAD_CHUNK_SIZE);
      return `${chunkX},${chunkZ}`;
    };
    
    tileData.forEach((data) => {
      if (data.obj === 1 || data.obj === 2 || data.obj === 3 || 
          data.type === 'green' || data.type === 'road' || 
          ['blue', 'red', 'yellow'].includes(data.type)) {
        const tile = new Tile(idCounter++, data.x, data.z, data.type);
        if (data.stationName) tile.stationName = data.stationName;
        if (data.population) tile.population = data.population;

        this.map.push(tile);
        this.tilesMap.set(`${data.x},${data.z}`, tile);
        
        const chunkKey = getChunkKey(data.x, data.z);
        if (!tilesByChunk[chunkKey]) {
          tilesByChunk[chunkKey] = {};
        }
        if (!tilesByChunk[chunkKey][data.type]) {
          tilesByChunk[chunkKey][data.type] = [];
        }
        tilesByChunk[chunkKey][data.type].push(tile);
      }
    });

    this.createChunkedInstancedTileMeshes(tilesByChunk, mapGroup, ROAD_CHUNK_SIZE);

    // --- Step 6.5: Initialize Terrain Manager ---
    if (this.terrainManager) {
      this.terrainManager.dispose();
    }
    
    this.terrainManager = new TerrainTileManager(this.scene, this);
    this.terrainManager.tilesMap = this.tilesMap;
    this.terrainManager.updateVisibleTiles(centerLng, centerLat, CONFIG_SCALE);

    // --- Step 7: Link Neighbors ---
    this.map.forEach((tile) => {
      if (!tile.isRoad) return;

      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      dirs.forEach(([dx, dz]) => {
        const nx = tile.gridX + dx;
        const nz = tile.gridY + dz;
        const neighbor = this.tilesMap.get(`${nx},${nz}`);
        if (neighbor && neighbor.isRoad) {
          tile.neighbors.push(neighbor);
        }
      });
    });

    // --- Step 8: Set Start Position ---
    const stations = this.map.filter((t) => t.type === "green");
    stations.sort((a, b) => (b.population || 0) - (a.population || 0));
    let startTile = stations.length > 0 ? stations[0] : this.map[0];

    if (!startTile) startTile = this.map[0];

    if (startTile) {
      startTile.type = "start";
      if (startTile.instancedMesh && startTile.instanceIndex !== undefined) {
        const matrix = new THREE.Matrix4();
        startTile.instancedMesh.getMatrixAt(startTile.instanceIndex, matrix);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(pos, quat, scale);
        pos.y = 0.2;
        matrix.compose(pos, quat, scale);
        startTile.instancedMesh.setMatrixAt(startTile.instanceIndex, matrix);
        startTile.instancedMesh.instanceMatrix.needsUpdate = true;
        
        if (startTile.mesh && startTile.mesh.position) {
          startTile.mesh.position.y = 0.2;
        }
      }
      if (startTile.labelGroup) {
        startTile.labelGroup.visible = false;
        this._releaseLabelTexture(startTile);
      }
    }

    return startTile;
  }

  createChunkedInstancedTileMeshes(tilesByChunk, parentGroup, chunkSize) {
    const tileGeo = this.geometries.tile;
    const stationMarkerGeo = new THREE.BoxGeometry(2.5, 1, 2.5);
    const stationMarkerMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    
    const matrix = new THREE.Matrix4();
    const posVec = new THREE.Vector3();
    const scaleVec = new THREE.Vector3(1, 1, 1);
    const quaternion = new THREE.Quaternion();
    
    this.roadChunkGroups = [];
    
    for (const [chunkKey, tilesByType] of Object.entries(tilesByChunk)) {
      const chunkGroup = new THREE.Group();
      const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
      chunkGroup.name = `road_chunk_${chunkKey}`;
      
      const chunkCenterX = (chunkX + 0.5) * chunkSize * WS_TILE_SIZE;
      const chunkCenterZ = (chunkZ + 0.5) * chunkSize * WS_TILE_SIZE;
      chunkGroup.userData.chunkCenter = new THREE.Vector3(chunkCenterX, 0.5, chunkCenterZ);
      chunkGroup.userData.chunkRadius = chunkSize * WS_TILE_SIZE * Math.SQRT2 * 0.5;
      
      const stationMarkerPositions = [];
      
      for (const [type, tiles] of Object.entries(tilesByType)) {
        if (tiles.length === 0) continue;
        
        const material = this.materials[type] || this.materials.road;
        const count = tiles.length;
        
        const instancedMesh = new THREE.InstancedMesh(tileGeo, material, count);
        instancedMesh.receiveShadow = true;
        instancedMesh.name = `instanced_${type}`;
        
        instancedMesh.userData.tileType = type;
        instancedMesh.userData.tiles = tiles;
        
        tiles.forEach((tile, index) => {
          const x = tile.gridX * WS_TILE_SIZE;
          const z = tile.gridY * WS_TILE_SIZE;
          
          posVec.set(x, 0, z);
          matrix.compose(posVec, quaternion, scaleVec);
          instancedMesh.setMatrixAt(index, matrix);
          
          tile.instancedMesh = instancedMesh;
          tile.instanceIndex = index;
          tile.chunkGroup = chunkGroup;
          
          tile.mesh = {
            position: new THREE.Vector3(x, 0, z),
            add: (child) => {
              child.position.x += x;
              child.position.z += z;
              chunkGroup.add(child);
            }
          };
          
          if (type === 'green') {
            stationMarkerPositions.push({ x, z, tile });
            this.create3DStationLabel(tile, chunkGroup);
          }
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        chunkGroup.add(instancedMesh);
      }
      
      if (stationMarkerPositions.length > 0) {
        const markerInstancedMesh = new THREE.InstancedMesh(
          stationMarkerGeo, 
          stationMarkerMat, 
          stationMarkerPositions.length
        );
        markerInstancedMesh.name = 'station_markers';
        
        stationMarkerPositions.forEach((pos, i) => {
          posVec.set(pos.x, 0.6, pos.z);
          matrix.compose(posVec, quaternion, scaleVec);
          markerInstancedMesh.setMatrixAt(i, matrix);
        });
        
        markerInstancedMesh.instanceMatrix.needsUpdate = true;
        chunkGroup.add(markerInstancedMesh);
      }
      
      parentGroup.add(chunkGroup);
      this.roadChunkGroups.push(chunkGroup);
    }
  }

  getRandomColoredType() {
    const r = Math.random();
    if (r < 0.33) return "red";
    if (r < 0.66) return "yellow";
    return "blue";
  }

  // --- Station Label Logic ---

  static TextCanvas = {
    _roundRect(ctx, x, y, w, h, r) {
      const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    },

    draw(ctx, opts) {
      const {
        text,
        fontFamily = 'Segoe UI, Arial, sans-serif',
        fontWeight = '700',
        fontSizePx = 48,
        paddingPx = 18,
        textColor = '#ffffff',
        bgColor = 'rgba(0,0,0,0.70)',
        cornerRadiusPx = 16
      } = opts || {};

      const w = ctx.canvas.width;
      const h = ctx.canvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.save();

      if (bgColor) {
        ctx.fillStyle = bgColor;
        this._roundRect(ctx, 0, 0, w, h, cornerRadiusPx);
        ctx.fill();
      }

      ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = textColor;
      ctx.fillText(text, w / 2, h / 2);

      ctx.restore();
    }
  };

  initStationLabelTexturePool() {
    if (this._stationLabelTexturePool) return;

    const MAX = 64;
    const pool = {
      max: MAX,
      slots: [],
      free: [],
      activeOwners: new Map()
    };

    for (let i = 0; i < MAX; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;

      pool.slots.push({ 
        canvas, ctx, texture, 
        ownerId: null,
        renderedText: null,
        renderedStyleKey: null
      });
      pool.free.push(i);
    }

    this._stationLabelTexturePool = pool;
  }

  _makeStyleKey(style) {
    const s = style || {};
    return `${s.fontSizePx || 48}_${s.fontWeight || '700'}_${s.textColor || '#fff'}_${s.bgColor || 'rgba(0,0,0,0.7)'}`;
  }

  _stationLabelAcquireAndRender(text, style, ownerId) {
    this.initStationLabelTexturePool();
    const pool = this._stationLabelTexturePool;

    let slotIndex = pool.activeOwners.get(ownerId);
    let isNewSlot = false;
    
    if (slotIndex === undefined) {
      slotIndex = pool.free.pop();
      if (slotIndex === undefined) return null;
      
      pool.slots[slotIndex].ownerId = ownerId;
      pool.activeOwners.set(ownerId, slotIndex);
      isNewSlot = true;
    }

    const slot = pool.slots[slotIndex];
    const styleKey = this._makeStyleKey(style);
    
    const needsRedraw = isNewSlot || 
                        slot.renderedText !== text || 
                        slot.renderedStyleKey !== styleKey;

    if (!needsRedraw) {
      return { 
        texture: slot.texture, 
        width: slot.canvas.width, 
        height: slot.canvas.height, 
        slotIndex,
        redrawn: false
      };
    }

    const fontFamily = (style && style.fontFamily) || 'Segoe UI, Arial, sans-serif';
    const fontWeight = (style && style.fontWeight) || '700';
    const fontSizePx = (style && style.fontSizePx) || 48;
    const paddingPx = (style && style.paddingPx) || 18;

    slot.ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
    const m = slot.ctx.measureText(text);
    const textW = Math.ceil(m.width);
    const textH = Math.ceil((m.actualBoundingBoxAscent || fontSizePx * 0.8) + (m.actualBoundingBoxDescent || fontSizePx * 0.2));
    const w = Math.min(1024, Math.max(64, textW + paddingPx * 2));
    const h = Math.min(512, Math.max(32, textH + paddingPx * 2));

    if (slot.canvas.width !== w || slot.canvas.height !== h) {
      slot.canvas.width = w;
      slot.canvas.height = h;
    }

    WorldScene.TextCanvas.draw(slot.ctx, {
      text,
      fontFamily,
      fontWeight,
      fontSizePx,
      paddingPx,
      textColor: (style && style.textColor) || '#ffffff',
      bgColor: (style && style.bgColor) || 'rgba(0,0,0,0.70)',
      cornerRadiusPx: (style && style.cornerRadiusPx) || 16
    });

    slot.texture.needsUpdate = true;
    
    slot.renderedText = text;
    slot.renderedStyleKey = styleKey;
    
    return { texture: slot.texture, width: w, height: h, slotIndex, redrawn: true };
  }

  _stationLabelReleaseByOwner(ownerId) {
    const pool = this._stationLabelTexturePool;
    if (!pool) return;
    
    const slotIndex = pool.activeOwners.get(ownerId);
    if (slotIndex === undefined) return;
    
    pool.slots[slotIndex].ownerId = null;
    pool.activeOwners.delete(ownerId);
    pool.free.push(slotIndex);
  }

  updateVisibleStationLabels(camera) {
    if (!this.roadChunkGroups || this.roadChunkGroups.length === 0) return;
    
    this.initStationLabelTexturePool();
    const pool = this._stationLabelTexturePool;
    const cameraPos = camera.position;
    
    const visibleTiles = [];
    const newlyHiddenTiles = [];
    
    for (const chunkGroup of this.roadChunkGroups) {
      if (!chunkGroup.userData.labelTiles) continue;
      
      const isChunkVisible = chunkGroup.visible;
      const chunkVisibilityChanged = chunkGroup.userData._visibilityChanged;
      
      if (!isChunkVisible && !chunkVisibilityChanged) {
        continue;
      }
      
      for (const tile of chunkGroup.userData.labelTiles) {
        if (!tile.labelGroup) continue;
        if (!tile.labelText) continue;
        if (tile.labelGroup.visible === false) continue;
        
        if (isChunkVisible) {
          const tileX = tile.gridX * WS_TILE_SIZE;
          const tileZ = tile.gridY * WS_TILE_SIZE;
          const dx = tileX - cameraPos.x;
          const dz = tileZ - cameraPos.z;
          tile._distToCamera = dx * dx + dz * dz;
          
          visibleTiles.push(tile);
        } else if (chunkVisibilityChanged) {
          newlyHiddenTiles.push(tile);
        }
      }
    }
    
    for (const tile of newlyHiddenTiles) {
      if (tile.labelHasTexture) {
        this._releaseLabelTexture(tile);
      }
    }
    
    visibleTiles.sort((a, b) => a._distToCamera - b._distToCamera);
    
    const maxLabels = pool.max;
    const tilesToShow = new Set(visibleTiles.slice(0, maxLabels));
    
    for (const tile of visibleTiles) {
      if (!tilesToShow.has(tile) && tile.labelHasTexture) {
        this._releaseLabelTexture(tile);
      }
    }
    
    for (const tile of tilesToShow) {
      const { text, style } = tile.labelText;
      const ownerId = `tile_${tile.gridX}_${tile.gridY}`;
      
      const currentStyleKey = this._makeStyleKey(style);
      const needsUpdate = !tile.labelHasTexture || 
                         tile._renderedText !== text ||
                         tile._renderedStyleKey !== currentStyleKey;
      
      if (needsUpdate) {
        const rendered = this._stationLabelAcquireAndRender(text, style, ownerId);
        
        if (rendered) {
          if (rendered.redrawn || !tile.labelHasTexture) {
            const pxToWorld = 0.03;
            const planeW = rendered.width * pxToWorld;
            const planeH = rendered.height * pxToWorld;
            tile.labelPlane.geometry.dispose();
            tile.labelPlane.geometry = new THREE.PlaneGeometry(planeW, planeH);
          }
          
          tile.labelMaterial.map = rendered.texture;
          tile.labelMaterial.needsUpdate = true;
          tile.labelPlane.visible = true;
          
          tile.labelTextureSlot = rendered.slotIndex;
          tile.labelHasTexture = true;
          tile._renderedText = text;
          tile._renderedStyleKey = currentStyleKey;
        } else {
          tile.labelPlane.visible = false;
        }
      }
    }
  }
  
  create3DStationLabel(tile, chunkGroup) {
    const text = tile.stationName;
    if (!text) return;

    const labelGroup = new THREE.Group();
    labelGroup.rotation.x = -Math.PI / 4;

    const style = {
      fontFamily: 'Segoe UI, Arial, sans-serif',
      fontWeight: '700',
      fontSizePx: 32,
      paddingPx: 12,
      bgColor: 'rgba(0,0,0,0.70)',
      textColor: '#ffffff',
      cornerRadiusPx: 8
    };

    const estCharW = style.fontSizePx * 0.6;
    const estW = text.length * estCharW + style.paddingPx * 2;
    const estH = style.fontSizePx + style.paddingPx * 2;
    const pxToWorld = 0.03;

    const planeGeo = new THREE.PlaneGeometry(estW * pxToWorld, estH * pxToWorld);
    const planeMat = new THREE.MeshBasicMaterial({
      map: null,
      transparent: true,
      opacity: 1.0,
      depthTest: false
    });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.visible = false;
    labelGroup.add(planeMesh);

    const x = tile.gridX * WS_TILE_SIZE;
    const z = tile.gridY * WS_TILE_SIZE;
    labelGroup.position.set(x, 4, z);

    tile.labelGroup = labelGroup;
    tile.labelPlane = planeMesh;
    tile.labelMaterial = planeMat;
    tile.labelText = { text, style };
    tile.labelTextureSlot = undefined;
    tile.labelTextureKey = undefined;
    tile.labelHasTexture = false;

    if (!chunkGroup.userData.labelTiles) {
      chunkGroup.userData.labelTiles = [];
    }
    chunkGroup.userData.labelTiles.push(tile);

    chunkGroup.add(labelGroup);
  }

  _releaseLabelTexture(tile) {
    if (!tile.labelHasTexture) return;

    const ownerId = `tile_${tile.gridX}_${tile.gridY}`;
    this._stationLabelReleaseByOwner(ownerId);

    if (tile.labelMaterial) {
      tile.labelMaterial.map = null;
      tile.labelMaterial.needsUpdate = true;
    }
    if (tile.labelPlane) {
      tile.labelPlane.visible = false;
    }

    tile.labelTextureSlot = undefined;
    tile.labelHasTexture = false;
    tile._renderedText = null;
    tile._renderedStyleKey = null;
  }
  
  updateStationLabelHighlight(tile, isDestination) {
    if (!tile.labelGroup || !tile.labelPlane || !tile.labelMaterial || !tile.labelText) return;

    const baseStyle = tile.labelText.style || {};
    const newStyle = {
      ...baseStyle,
      bgColor: isDestination ? 'rgba(251,191,36,1.0)' : 'rgba(0,0,0,0.70)',
      textColor: isDestination ? '#000000' : '#ffffff'
    };

    tile.labelText.style = newStyle;

    if (tile.labelHasTexture) {
      const ownerId = `tile_${tile.gridX}_${tile.gridY}`;
      const rendered = this._stationLabelAcquireAndRender(tile.labelText.text, newStyle, ownerId);

      if (rendered) {
        tile.labelMaterial.map = rendered.texture;
        tile.labelMaterial.needsUpdate = true;

        const pxToWorld = 0.012;
        const planeW = rendered.width * pxToWorld;
        const planeH = rendered.height * pxToWorld;
        tile.labelPlane.geometry.dispose();
        tile.labelPlane.geometry = new THREE.PlaneGeometry(planeW, planeH);

        tile.labelTextureSlot = rendered.slotIndex;
        tile._renderedText = tile.labelText.text;
        tile._renderedStyleKey = this._makeStyleKey(newStyle);
      }
    }
  }
}
