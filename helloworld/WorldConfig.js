// WorldConfig.js

// --- World Constants ---
export const TILE_SIZE = 4; // World unit size for a tile
export const TILE_SPACING = 0.2; // Gap between tiles

export const COLORS = {
  bg: 0x87ceeb, // Sky Blue
  ground: 0x1a1a20,

  // Tile Materials
  blue: 0x3b82f6, // Money +
  red: 0xef4444, // Money -
  yellow: 0xeab308, // Event
  green: 0x22c55e, // Station
  start: 0xffffff, // Start

  road: 0x9ca3af, // Plain Road
  env_nature: 0x15803d, // Nature
  env_culture: 0x52525b, // Culture

  // Buildings
  building: [0x60a5fa, 0x818cf8, 0xa78bfa],
};

// --- Terrain Constants ---
export const TERRAIN_TILE_DEGREES = 2; // Each terrain tile covers 2x2 degrees of lon/lat
export const MAX_CACHED_TERRAIN_TILES = 32; // Maximum number of cached terrain tile image data
export const TERRAIN_LOAD_RADIUS = 1; // Load 3x3 = 9 terrain tiles around camera (radius 1 means current + neighbors)
export const TERRAIN_CDN_BASE = 'https://cdn.keepwork.com/worldmap/';
export const TERRAIN_IMAGE_SIZE = 512; // Default size for fallback

// --- Terrain Color Legend ---
export const TERRAIN_COLORS = {
  '#000000': { type: 'ocean', height: -1, color: 0x000000, label: '海洋', heightType: 'water' },
  '#1A5BAB': { type: 'water', height: -1, color: 0x1A5BAB, label: '水域', heightType: 'water' },
  '#358221': { type: 'forest', height: 2, color: 0x358221, label: '森林', heightType: 'varied', minHeight: 1, maxHeight: 3, treeChance: 0.8 },
  '#A7D282': { type: 'grass', height: 1, color: 0xA7D282, label: '草地', heightType: 'varied', minHeight: 1, maxHeight: 1.4, treeChance: 0.15 },
  '#90C090': { type: 'urban', height: 1, color: 0x90C090, label: '城市', heightType: 'flat', treeChance: 0.15 },
  '#FFDB5C': { type: 'crops', height: 1, color: 0xFFDB5C, label: '耕地', heightType: 'varied', minHeight: 1, maxHeight: 1.3, treeChance: 0.08 },
  '#EECFA8': { type: 'scrub', height: 1, color: 0xEECFA8, label: '灌木', heightType: 'varied', minHeight: 1, maxHeight: 1.5, treeChance: 0.12 },
  '#EDE9E4': { type: 'barren', height: 1, color: 0xEDE9E4, label: '荒漠', heightType: 'varied', minHeight: 1, maxHeight: 1.6 },
  '#F2F2F2': { type: 'snow', height: 3, color: 0xF2F2F2, label: '雪山', heightType: 'varied', minHeight: 1.3, maxHeight: 5 },
  '#419BDF': { type: 'wetland', height: 1, color: 0x419BDF, label: '湿地', heightType: 'flat', treeChance: 0.15 }
};


