/**
 * 3D World Traveler Game Logics
 */

import { WorldScene } from './WorldScene.js';
import { DiceAnimation } from './DiceAnimation.js';
import { TILE_SIZE, TILE_SPACING, COLORS } from './WorldConfig.js';


const BUILDING_COSTS = [1000, 5000, 20000];
const BUILDING_NAMES = ["拉面摊", "商务酒店", "摩天大楼"];
const BUILDING_INCOME = [200, 800, 4000];

// 目的地奖励金额
const DESTINATION_REWARD = 5000;

// 房产相关常量
const PROPERTY_PRICE_RANGE = [3000, 8000]; // 房产价格范围
const INITIAL_PLAYER_MONEY = 30000; // 玩家初始资金

// --- 穷神系统 ---
// 消息中的 {playerName} 会在显示时根据玩家类型替换：用户显示"你"，AI显示玩家名字
const BINBOUGAMI_EFFECTS = {
  // 普通穷神效果
  normal: [
    { type: "loseMoney", min: 300, max: 1500, msg: "穷神偷走了{playerName}的钱！" },
    { type: "loseMoney", min: 500, max: 2000, msg: "穷神请客吃饭，用的是{playerName}的钱！" },
    { type: "sellProperty", msg: "穷神强行半价卖掉了{playerName}的物件！" },
    { type: "nothing", msg: "穷神今天心情好，放过{playerName}了~" },
    { type: "loseMoney", min: 200, max: 800, msg: "穷神打碎了{playerName}的存钱罐！" },
  ],
  // 大魔王穷神效果（升级后）
  king: [
    { type: "loseMoney", min: 2000, max: 5000, msg: "大魔王穷神疯狂吞噬{playerName}的财产！" },
    { type: "sellAllProperty", msg: "大魔王穷神吞噬了{playerName}所有的物件！" },
    { type: "debt", min: 3000, max: 8000, msg: "大魔王穷神让{playerName}背上巨额债务！" },
    { type: "loseMoney", min: 1500, max: 4000, msg: "大魔王穷神召开豪华宴会，账单给{playerName}！" },
  ],
};
// 穷神升级所需的回合数
const BINBOUGAMI_UPGRADE_TURNS = 8;

// --- 卡牌系统 ---
const CARD_TYPES = {
  // 移动类卡牌
  express: { name: "急行卡", desc: "掷2个骰子", icon: "🚃", type: "move", diceCount: 2, rarity: "common", price: 500 },
  superExpress: { name: "特急卡", desc: "掷3个骰子", icon: "🚄", type: "move", diceCount: 3, rarity: "rare", price: 1500 },
  rocket: { name: "火箭卡", desc: "掷4个骰子", icon: "🚀", type: "move", diceCount: 4, rarity: "epic", price: 3000 },
  backward: { name: "后退卡", desc: "可以向后移动", icon: "⏪", type: "special", effect: "backward", rarity: "common", price: 300 },
  teleport: { name: "任意门", desc: "传送到任意车站", icon: "🚪", type: "special", effect: "teleport", rarity: "legendary", price: 5000 },

  // 攻击/妨碍类卡牌
  hibernate: { name: "冬眠卡", desc: "让对手停1回合", icon: "💤", type: "attack", effect: "skip", rarity: "rare", price: 1200 },
  fart: { name: "放屁卡", desc: "吹飞对手1-3格", icon: "💨", type: "attack", effect: "blowAway", rarity: "common", price: 600 },
  trap: { name: "陷阱卡", desc: "在当前格子设置陷阱", icon: "🕳️", type: "attack", effect: "trap", rarity: "rare", price: 800 },

  // 防御/特殊类卡牌
  shield: { name: "护身符", desc: "免疫一次穷神效果", icon: "🛡️", type: "defense", effect: "immunity", rarity: "rare", price: 2000 },
  exorcism: { name: "驱魔符", desc: "立即驱除穷神", icon: "📿", type: "special", effect: "exorcise", rarity: "epic", price: 4000 },
  doubleIncome: { name: "倍收卡", desc: "下次决算收益翻倍", icon: "💎", type: "buff", effect: "doubleIncome", rarity: "epic", price: 3500 },
};

// 卡牌抽取池（按稀有度分类）
const CARD_POOL = {
  common: ["express", "backward", "fart"],
  rare: ["superExpress", "hibernate", "trap", "shield"],
  epic: ["rocket", "exorcism", "doubleIncome"],
  legendary: ["teleport"],
};

// 最大手牌数
const MAX_HAND_SIZE = 8;
// 一年的回合数（每月一回合，12回合=1年，3月决算）
const TURNS_PER_YEAR = 12;
const SETTLEMENT_MONTH = 3; // 3月决算

// 房产缓存系统 - 追踪房产的购买状态和已购买房产的固定数据
const PROPERTIES_CACHE = {};
function initializePropertiesCache() {
  PROPERTIES_CACHE.homes = {}; // 按城市存储房产: { cityName: [homes...] }
}
function getOrCreatePropertyId(cityName, propertyIndex) {
  if (!PROPERTIES_CACHE.homes[cityName]) {
    PROPERTIES_CACHE.homes[cityName] = [];
  }
  const key = `${cityName}_${propertyIndex}`;
  if (!PROPERTIES_CACHE.homes[cityName][propertyIndex]) {
    PROPERTIES_CACHE.homes[cityName][propertyIndex] = {
      id: key,
      cityName: cityName,
      index: propertyIndex,
      purchasedBy: null, // 购买者的玩家ID，null表示未购买
      purchasePrice: null,
      // 以下字段在购买时会被填充，用于保持已购买房产的数据不变
      cachedData: null  // { level, price, income, playerId, playerName, avatar, homeName, isOnline }
    };
  }
  return PROPERTIES_CACHE.homes[cityName][propertyIndex];
}

// Station data loaded from world_traveler_map_data (full city info with lat/lng/population)
export let STATION_DATA = [];
// Station names (extracted from STATION_DATA for backward compatibility)
let STATION_NAMES = [];

// --- Utilities ---
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Get the URL for a mini game or related page
 * @param {string} gameName - The name of the game file (without extension), e.g., "HelloCrush", "WorldMapSelect"
 * @returns {string} - The full URL with search params preserved
 */
function GetMiniGameUrl(gameName) {
  const currentPath = window.location.pathname;
  const lastSlashIndex = currentPath.lastIndexOf('/');
  const basePath = currentPath.substring(0, lastSlashIndex + 1);
  const filename = currentPath.substring(lastSlashIndex + 1);
  const dotIndex = filename.lastIndexOf('.');
  const extension = dotIndex !== -1 ? filename.substring(dotIndex) : '';
  return basePath + gameName + extension + window.location.search;
}

// Home city - always shown on map in green
export let homeCity = "深圳";

// Global toast function for notifications
function showToast(msg, color = "white") {
  const logEl = document.getElementById("game-log");
  const entry = document.createElement("div");
  entry.innerHTML = `<span style="color:${color}; text-shadow: 1px 1px 0 #000">${msg}</span>`;
  logEl.appendChild(entry);
  if (logEl.children.length > 5) logEl.removeChild(logEl.firstChild);
  setTimeout(() => {
    entry.style.opacity = "0";
    setTimeout(() => entry.remove(), 500);
  }, 4000);
}

// --- Load Station Data from External File ---
export async function loadStationData() {
  // Fallback default station data
  const defaultStations = [
    { name: "深圳 - 福田区", lat: 22.5431, lng: 114.0579, population: 1553200, level: 1 },
    { name: "深圳 - 南山区", lat: 22.5229, lng: 113.9294, population: 1795800, level: 1 },
    { name: "深圳 - 罗湖区", lat: 22.5478, lng: 114.1316, population: 1143800, level: 2 },
    { name: "广州 - 天河区", lat: 23.1343, lng: 113.3603, population: 2241800, level: 1 },
    { name: "广州 - 越秀区", lat: 23.1291, lng: 113.2644, population: 1038600, level: 1 }
  ];

  try {
    const response = await fetch("world_traveler_map_data.json");
    const text = await response.text();

    // Extract JSON from file (can be array or object with cities property)
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      // Clean up the JSON text: remove comments
      const jsonText = jsonMatch[0].replace(/\/\/.*$/gm, "");
      const parsed = JSON.parse(jsonText);
      
      let cities = [];
      if (Array.isArray(parsed)) {
        cities = parsed;
      } else if (parsed.cities) {
        cities = parsed.cities;
      }

      // Store full city data
      if (cities.length > 0) {
        STATION_DATA = cities;
        STATION_NAMES = cities.map(city => city.name);
        console.log(`Loaded ${STATION_DATA.length} stations from world_traveler_map_data`);
      } else {
        console.error("No cities found in world_traveler_map_data");
        STATION_DATA = defaultStations;
        STATION_NAMES = defaultStations.map(s => s.name);
      }
    } else {
      console.error("Could not parse station data from world_traveler_map_data");
      STATION_DATA = defaultStations;
      STATION_NAMES = defaultStations.map(s => s.name);
    }
  } catch (error) {
    console.error("Error loading station data:", error);
    STATION_DATA = defaultStations;
    STATION_NAMES = defaultStations.map(s => s.name);
  }
}

// --- Game Classes ---

// Tile class moved to WorldScene.js

class Player {
  constructor(id, name, color, isAI) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isAI = isAI;
    this.money = INITIAL_PLAYER_MONEY;
    this.assets = 0;

    this.currentTile = null;
    this.previousTile = null;

    this.mesh = null; // Three.js Mesh (Group)

    // For smooth movement animation
    this.animating = false;
    this.targetPos = new THREE.Vector3();

    // --- 穷神系统 ---
    this.hasBinbougami = false; // 是否被穷神附身
    this.binbougamiTurns = 0; // 穷神附身回合数
    this.binbougamiLevel = 0; // 0=普通, 1=大魔王
    this.binbougamiMesh = null; // 穷神3D模型
    this.binbougamiJustAttached = false; // 刚刚被附身，本回合不触发效果

    // --- 卡牌系统 ---
    this.cards = []; // 手牌
    this.skipNextTurn = false; // 下回合是否跳过（冬眠效果）
    this.doubleIncomeNext = false; // 下次决算收益翻倍
    this.hasShield = false; // 是否有护身符保护
  }
}

export class Game {
  constructor() {
    this.container = document.getElementById("game-container");
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // FPS and render stats tracking
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 0;
    this.lastStatsUpdate = 0;

    // Camera change detection for rendering optimization
    this._lastCameraPosition = new THREE.Vector3();
    this._lastCameraTarget = new THREE.Vector3();
    this._lastCameraZoom = 0;
    this._cameraDirty = true; // Flag to force recalculation
    this._viewportDirty = true; // Flag for viewport size changes
    this._cameraChangeThreshold = 0.01; // Minimum movement to trigger recalculation

    // Three.js Components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.map = [];
    this.players = [];
    this.turn = 0;
    this.state = "INIT";
    this.cameraLocked = true;
    this.isUserInteracting = false;

    // 目的地竞速系统
    this.destinationTile = null;
    this.destinationMarker = null;

    // 时间系统（年/月）
    this.gameYear = 1;
    this.gameMonth = 4; // 从4月开始
    this.totalTurns = 0;

    this.mode = "GAME"; // 'MAP' or 'GAME' - start in GAME mode (load home city directly)
    this.worldMap = null; // Legacy - no longer used (iframe handles world map)
    this.worldMapIframe = null; // Reference to world map iframe element
    this.pendingCity = null; // City pending selection after travel animation
    this.currentCity = null;

    // 城市信息缓存
    this.cityInfoCache = {};
    this.currentCityInfoTile = null;
    this.cityInfoPanelMode = "purchase"; // "purchase" for buying, "view-only" for clicking on map
    
    // Session级别的地产显示缓存 - 保存一局游戏中的地产显示顺序
    // 结构: { cityName: { seed: randomSeed, properties: [list of property indices in order] } }
    this.sessionPropertyCache = {};
    // 已购买的地产缓存 - 在session中保持固定显示在最前
    this.purchasedPropertiesInSession = {}; // { cityName: [list of purchased property indices] }
    
    // Game mode raycaster for tile clicking
    this.gameRaycaster = null;
    this.gameMouse = new THREE.Vector2();

    // Terrain tile manager for large-scale terrain
    this.terrainManager = null;
    // Map center coordinates (lon/lat)
    this.mapCenterLon = 0;
    this.mapCenterLat = 0;
    // since we are using 2*2 degree of 512*512 terrain image file, the max scale can be 256
    this.configScale = 96; // Scale factor for lat/lon to grid units

    this.initThree();
    // this.initGame(); // Delayed until city selection

    window.addEventListener("resize", () => this.onResize());
    document.getElementById("roll-btn").onclick = () => this.playerRoll();

    this.initWorldMap();

    // Start Loop
    this.animate();
  }

  initThree() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
    this.scene.fog = new THREE.Fog(0x87CEEB, 100, 300); // Matching fog

    // 2. Camera (Perspective)
    const fov = 45;
    const aspect = this.width / this.height;
    const near = 0.1;
    const far = 300;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    // Perspective View Setup: Position and LookAt
    this.camera.position.set(0, 60, 60);
    this.camera.lookAt(this.scene.position); // Will be updated to follow player

    // 3. Renderer
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setSize(this.width, this.height);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.container.appendChild(this.renderer.domElement);
    }

    // Controls
    if (this.controls) this.controls.dispose();
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 200;
    this.controls.target.set(0, 0, 0);

    // Lock rotation, enable pan on ground plane
    this.controls.enableRotate = false;
    // Pan on XZ plane (ground) instead of screen space
    // This keeps the camera-to-ground distance constant when panning
    this.controls.screenSpacePanning = false;
    // Lock polar angle to maintain fixed camera height relative to ground
    // Camera is at (0, 60, 60) looking at (0, 0, 0), so polar angle is ~45 degrees (π/4)
    const fixedPolarAngle = Math.PI / 4; // 45 degrees from vertical
    this.controls.minPolarAngle = fixedPolarAngle;
    this.controls.maxPolarAngle = fixedPolarAngle;
    
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // Stop auto-following if user interacts
    this.controls.addEventListener("start", () => {
      this.cameraLocked = false;
      this.isUserInteracting = true;
    });

    this.controls.addEventListener("end", () => {
      this.isUserInteracting = false;
      if (this.state === "MOVING") {
        this.cameraLocked = true;
      }
    });

    // Setup click detection for tiles (raycaster for game mode clicks)
    this.gameRaycaster = new THREE.Raycaster();
    this.gameMouse = new THREE.Vector2();
    let downX = 0, downY = 0;
    
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    canvas.addEventListener("pointerup", (e) => {
      const moveDist = Math.sqrt(Math.pow(e.clientX - downX, 2) + Math.pow(e.clientY - downY, 2));
      // Allow small movement (jitter) but filter out drags
      if (moveDist < 10 && this.mode === "GAME") {
        this.onGameClick(e);
      }
    });

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    const shadowSize = 50;
    dirLight.shadow.camera.left = -shadowSize;
    dirLight.shadow.camera.right = shadowSize;
    dirLight.shadow.camera.top = shadowSize;
    dirLight.shadow.camera.bottom = -shadowSize;
    this.scene.add(dirLight);
  }

  initWorldMap() {
    // Use iframe for world map instead of inline WorldMapManager
    this.worldMapIframe = document.getElementById("world-map-iframe");
    this.worldMap = null; // No longer using WorldMapManager class
    
    // Hide world map iframe initially - game loads directly to home city
    if (this.worldMapIframe) {
      this.worldMapIframe.style.display = "none";
    }
    
    // Hide game UI initially until user starts the game
    document.getElementById("ui-layer").style.display = "none";

    // Setup message listener for iframe communication
    window.addEventListener("message", (e) => this.handleMapMessage(e));
  }

  handleMapMessage(e) {
    const data = e.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'mapLoaded':
        console.log("World map iframe loaded");
        // Send initial config to iframe
        this.sendMapMessage({ 
          type: 'setConfig', 
          homeCity: homeCity,
          currentCity: this.currentCity ? this.currentCity.name : null
        });
        break;

      case 'mapStarted':
        console.log("Map started (user clicked start)");
        break;

      case 'citySelected':
        console.log("City selected:", data.city);
        // User clicked on a city in the map - trigger travel animation then enter city
        if (data.city) {
          this.pendingCity = data.city;
          // Send fly command to iframe
          this.sendMapMessage({ 
            type: 'flyToCity', 
            cityName: data.city.name, 
            enterCity: true 
          });
        }
        break;

      case 'travelComplete':
        console.log("Travel complete:", data.city);
        // Plane animation finished, now enter the city
        if (data.city) {
          this.selectCity(data.city);
        }
        break;

      case 'mapClosed':
        console.log("Map closed by user");
        // User closed the map, return to game if we have a city
        if (this.currentCity) {
          this.hideWorldMap();
        }
        break;
    }
  }

  sendMapMessage(message) {
    if (this.worldMapIframe && this.worldMapIframe.contentWindow) {
      this.worldMapIframe.contentWindow.postMessage(message, '*');
    }
  }

  showWorldMap() {
    if (this.worldMapIframe) {
      // Load iframe src on first use (lazy loading)
      if (!this.worldMapIframe.src || this.worldMapIframe.src === 'about:blank' || this.worldMapIframe.src === window.location.href) {
        this.worldMapIframe.src = GetMiniGameUrl('WorldMapSelect');
        
        // Hide login modal when world map is first loaded
        const loginModal = document.getElementById("login-modal");
        if (loginModal) loginModal.classList.add("hidden");
      }
      this.worldMapIframe.style.display = "block";
    }
    this.mode = "MAP";
  }

  hideWorldMap() {
    if (this.worldMapIframe) {
      this.worldMapIframe.style.display = "none";
    }
    this.mode = "GAME";
    if (this.controls) this.controls.enabled = true;
    document.getElementById("ui-layer").style.display = "flex";
  }

  startGame() {
    // This is called when the iframe's start button is clicked (via postMessage)
  }

  selectCity(city) {
    this.currentCity = city;
    this.mode = "GAME";

    // Hide the world map iframe
    this.hideWorldMap();

    // Dispose terrain manager before clearing scene
    if (this.terrainManager) {
      this.terrainManager.dispose();
      this.terrainManager = null;
    }

    // Reset Game Scene if needed or just init
    // Clear existing map if any?
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }

    // 重置目的地标记
    this.destinationTile = null;
    this.destinationMarker = null;

    this.initThree(); // Re-init scene/camera/lights for Game
    this.initGame(); // Generate city map
    
    // Force camera dirty to recalculate all positions after city change
    this._cameraDirty = true;
    this._viewportDirty = true;

    // Update UI
    document.getElementById("ui-layer").style.display = "flex";
  }

  // Travel from current city (or homeCity) to the provided city. Will perform plane animation then select City
  travelToCity(cityOrName, enterCity = true) {
    let cityObj = null;
    if (!cityOrName) return;
    if (typeof cityOrName === "string") {
      cityObj = { name: cityOrName }; // Create minimal city object with name
    } else {
      cityObj = cityOrName;
    }
    if (!cityObj || !cityObj.name) {
      console.warn("travelToCity: city not found", cityOrName);
      return;
    }

    // Show world map and send fly command to iframe
    this.showWorldMap();
    this.pendingCity = cityObj;
    
    // Send fly command to iframe (iframe will send travelComplete when done)
    this.sendMapMessage({ 
      type: 'flyToCity', 
      cityName: cityObj.name, 
      enterCity: enterCity 
    });
  }

  toggleMap() {
    if (this.mode === "GAME") {
      this.showWorldMap();
      if (this.controls) this.controls.enabled = false;

      document.getElementById("ui-layer").style.display = "none";
      document.getElementById("destination-indicator").classList.add("hidden");
    } else {
      if (this.currentCity) {
        this.hideWorldMap();
      }
    }
  }


  async initGame() {
    // Initialize properties cache
    initializePropertiesCache();
    
    // 初始化session级别的地产显示缓存
    this.sessionPropertyCache = {};
    this.purchasedPropertiesInSession = {};
    
    // Use WorldScene for map generation and rendering
    this.worldScene = new WorldScene(this.scene, this.configScale);
    const startTile = this.worldScene.generateMap(STATION_DATA, STATION_NAMES);
    
    // Sync references for compatibility
    this.map = this.worldScene.map;
    this.tilesMap = this.worldScene.tilesMap;
    this.terrainManager = this.worldScene.terrainManager;
    this.mapCenterLon = this.worldScene.mapCenterLon;
    this.mapCenterLat = this.worldScene.mapCenterLat;
    this.materials = this.worldScene.materials;
    this.geometries = this.worldScene.geometries;

    // Init Players
    this.players = [new Player("p1", "玩家", 0x3b82f6, false), new Player("com", "电脑", 0xef4444, true)];

    this.players.forEach((p) => {
      this.createPlayerMesh(p);
      p.currentTile = startTile;
      p.mesh.position.copy(startTile.worldPos);
      p.mesh.position.y = 1.5; // Sit on top of tile
    });

    // Initial Camera Setup: Center on P1, looking from South
    const p1Pos = this.players[0].mesh.position;
    this.camera.position.set(p1Pos.x, p1Pos.y + 60, p1Pos.z + 60);
    this.controls.target.copy(p1Pos);
    this.controls.update();

    // 初始化目的地和时间
    this.gameYear = 1;
    this.gameMonth = 4;
    this.totalTurns = 0;
    await this.setNewDestination();
    document.getElementById("destination-panel").classList.remove("hidden");

    this.updateUI();
    this.startTurn();

    // Debug: Quickly attach binbougami to P1 if 'testBinbougami' query present
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("testBinbougami") === "1") {
        await wait(500);
        await this.attachBinbougami(this.players[0]);
      }
    } catch (e) {}
  }

  createPlayerMesh(player) {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.8, 1, 2, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: player.color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.2;
    head.castShadow = true;
    group.add(head);
    // expose head reference for attaching UI / effects
    player.headMesh = head;

    // Hat/Indicator (Cone)
    const hatGeo = new THREE.ConeGeometry(0.6, 1, 16);
    const hatMat = new THREE.MeshStandardMaterial({ color: player.color });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 3;
    hat.rotation.x = Math.PI; // Point down? No point up like a party hat
    group.add(hat);

    this.scene.add(group);
    player.mesh = group;
  }

  // --- 目的地竞速系统 ---
  async setNewDestination() {
    // 获取所有车站（绿色格子），排除当前起始点和玩家所在位置
    const stations = this.map.filter((t) => t.type === "green" && t !== this.destinationTile && !this.players.some((p) => p.currentTile === t));

    if (stations.length === 0) return;

    // 移除旧目的地的高亮样式 (3D label)
    if (this.destinationTile) {
      this.worldScene.updateStationLabelHighlight(this.destinationTile, false);
    }

    // 随机选择一个车站作为目的地
    let newDest = stations[Math.floor(Math.random() * stations.length)];

    // 显示抽奖动画
    newDest = await this.showDestinationLottery(stations, newDest);

    this.destinationTile = newDest;

    // 更新UI显示
    document.getElementById("destination-name").innerText = newDest.stationName;

    // 添加目的地标签高亮样式 (3D label)
    this.worldScene.updateStationLabelHighlight(newDest, true);

    // 移除旧的目的地标记
    if (this.destinationMarker) {
      this.scene.remove(this.destinationMarker);
    }

    // 创建新的目的地标记（发光的圆柱+旗帜）
    this.createDestinationMarker(newDest);

    this.log(`🎯 新目的地: ${newDest.stationName}`, "#fbbf24");
    showToast(`🎯 目的地已更新: ${newDest.stationName}`, "#fbbf24");

    // 更新距离显示
    this.updateDistanceDisplay();
  }

  // 使用0-1 BFS计算从一个格子到目的地的最短距离（站数）
  // 非彩色格子不消耗步数(权重0)，彩色格子消耗1步(权重1)
  calculateDistanceToDestination(fromTile) {
    if (!this.destinationTile || !fromTile) return -1;
    if (fromTile === this.destinationTile) return 0;

    // 0-1 BFS: 使用双端队列，权重0的边加到队首，权重1的边加到队尾
    const dist = new Map();
    const deque = []; // 双端队列
    
    dist.set(fromTile, 0);
    deque.push({ tile: fromTile, distance: 0 });

    while (deque.length > 0) {
      const { tile, distance } = deque.shift();
      
      // 如果当前距离大于已记录的最短距离，跳过
      if (distance > (dist.get(tile) ?? Infinity)) continue;

      for (const neighbor of tile.neighbors) {
        // 计算到邻居的新距离：彩色格子+1，非彩色格子+0
        const weight = neighbor.isColored ? 1 : 0;
        const newDist = distance + weight;
        
        // 如果找到更短的路径
        if (newDist < (dist.get(neighbor) ?? Infinity)) {
          dist.set(neighbor, newDist);
          
          // 到达目的地
          if (neighbor === this.destinationTile) {
            return newDist;
          }
          
          // 0-1 BFS: 权重0加到队首，权重1加到队尾
          if (weight === 0) {
            deque.unshift({ tile: neighbor, distance: newDist });
          } else {
            deque.push({ tile: neighbor, distance: newDist });
          }
        }
      }
    }

    return -1; // 无法到达
  }

  // AI使用A*算法计算到达目的地的最优路径
  // 考虑新的移动规则：行动点数基于距离起点的步数，可以往返
  // 返回: { path: Tile[], totalSteps: number } 或 null
  calculateOptimalPathToDestination(fromTile, maxSteps = 100) {
    if (!this.destinationTile || !fromTile) return null;
    if (fromTile === this.destinationTile) return { path: [fromTile], totalSteps: 0 };

    // A* with state = (tile, distanceFromStart)
    // 因为可以往返，我们需要追踪 (tile, distance) 对
    // 目标是找到一条路径使得最终距离刚好等于某个值时到达目的地
    
    // 使用BFS找到所有可能的到达方式
    // state: { tile, distance, path, visited }
    const queue = [];
    const visited = new Map(); // key: `${tile.id}_${distance}`, value: true
    
    queue.push({
      tile: fromTile,
      distance: 0,
      path: [fromTile],
      visitedTiles: new Map([[fromTile, 0]]) // tile -> min distance when first visited
    });
    
    let bestResult = null;
    let bestTotalSteps = Infinity;
    
    while (queue.length > 0) {
      const state = queue.shift();
      const { tile, distance, path, visitedTiles } = state;
      
      // 如果距离已经超过最大步数，跳过
      if (distance > maxSteps) continue;
      
      // 检查是否到达目的地（距离刚好用完时在目的地）
      if (tile === this.destinationTile && distance > 0) {
        // 找到一条可行路径，记录需要的步数
        if (distance < bestTotalSteps) {
          bestTotalSteps = distance;
          bestResult = { path: [...path], totalSteps: distance };
        }
        continue; // 继续搜索可能更短的路径
      }
      
      // 防止状态爆炸：限制搜索深度
      if (path.length > maxSteps * 2) continue;
      
      // 避免重复探索相同状态
      const stateKey = `${tile.gridX}_${tile.gridY}_${distance}`;
      if (visited.has(stateKey)) continue;
      visited.set(stateKey, true);
      
      // 探索所有邻居
      for (const neighbor of tile.neighbors) {
        // 计算移动到邻居后的新距离
        let newDistance;
        const newVisitedTiles = new Map(visitedTiles);
        
        if (neighbor.isColored) {
          if (newVisitedTiles.has(neighbor)) {
            // 回到之前访问过的格子，使用之前的距离
            newDistance = newVisitedTiles.get(neighbor);
          } else {
            // 新格子，距离+1
            newDistance = distance + 1;
            newVisitedTiles.set(neighbor, newDistance);
          }
        } else {
          newDistance = distance;
          if (!newVisitedTiles.has(neighbor)) {
            newVisitedTiles.set(neighbor, distance);
          }
        }
        
        // 如果新距离已经超过最佳结果，剪枝
        if (bestResult && newDistance >= bestTotalSteps) continue;
        
        queue.push({
          tile: neighbor,
          distance: newDistance,
          path: [...path, neighbor],
          visitedTiles: newVisitedTiles
        });
      }
    }
    
    return bestResult;
  }

  // AI预计算：给定当前位置和骰子点数，计算应该走的路径
  // 返回最终能到达的最佳位置的路径
  calculateAIPath(fromTile, steps) {
    if (!this.destinationTile || !fromTile) return null;
    
    // 首先尝试找到能刚好到达目的地的路径
    const optimalPath = this.calculateOptimalPathToDestination(fromTile, steps);
    
    if (optimalPath && optimalPath.totalSteps === steps) {
      // 完美！刚好能到达目的地
      return optimalPath.path;
    }
    
    // 如果不能刚好到达目的地，找一条路径让我们尽可能接近目的地
    // 使用BFS枚举所有可能的终点位置，选择距离目的地最近的
    const visited = new Map();
    const queue = [{
      tile: fromTile,
      distance: 0,
      path: [fromTile],
      visitedTiles: new Map([[fromTile, 0]])
    }];
    
    let bestEndTile = fromTile;
    let bestEndPath = [fromTile];
    let bestDistToDest = this.calculateDistanceToDestination(fromTile);
    
    while (queue.length > 0) {
      const state = queue.shift();
      const { tile, distance, path, visitedTiles } = state;
      
      // 如果距离刚好等于步数，这是一个可能的终点
      if (distance === steps) {
        const distToDest = this.calculateDistanceToDestination(tile);
        if (distToDest >= 0 && (bestDistToDest < 0 || distToDest < bestDistToDest)) {
          bestDistToDest = distToDest;
          bestEndTile = tile;
          bestEndPath = [...path];
        }
        continue; // 不能再走了
      }
      
      // 如果距离已经超过步数，跳过
      if (distance > steps) continue;
      
      // 避免重复探索
      const stateKey = `${tile.gridX}_${tile.gridY}_${distance}`;
      if (visited.has(stateKey)) continue;
      visited.set(stateKey, true);
      
      // 限制搜索深度
      if (path.length > steps * 3) continue;
      
      // 探索所有邻居
      for (const neighbor of tile.neighbors) {
        let newDistance;
        const newVisitedTiles = new Map(visitedTiles);
        
        if (neighbor.isColored) {
          if (newVisitedTiles.has(neighbor)) {
            newDistance = newVisitedTiles.get(neighbor);
          } else {
            newDistance = distance + 1;
            newVisitedTiles.set(neighbor, newDistance);
          }
        } else {
          newDistance = distance;
          if (!newVisitedTiles.has(neighbor)) {
            newVisitedTiles.set(neighbor, distance);
          }
        }
        
        if (newDistance <= steps) {
          queue.push({
            tile: neighbor,
            distance: newDistance,
            path: [...path, neighbor],
            visitedTiles: newVisitedTiles
          });
        }
      }
    }
    
    return bestEndPath;
  }

  // AI选择最优方向：选择距离目的地最近的路径
  chooseBestDirection(options) {
    if (!this.destinationTile || options.length === 0) {
      return options[Math.floor(Math.random() * options.length)];
    }

    let bestTile = options[0];
    let bestDistance = this.calculateDistanceToDestination(options[0]);

    for (let i = 1; i < options.length; i++) {
      const dist = this.calculateDistanceToDestination(options[i]);
      // 选择距离更短的（如果距离为-1表示无法到达，跳过）
      if (dist >= 0 && (bestDistance < 0 || dist < bestDistance)) {
        bestDistance = dist;
        bestTile = options[i];
      }
    }

    return bestTile;
  }

  // 更新所有玩家的距离显示（现在只在详情面板中显示）
  updateDistanceDisplay() {
    // 距离信息现在只在玩家详情弹窗中显示
    // 此函数保留以供其他地方调用兼容
  }

  // 更新屏幕外目的地指示器
  updateDestinationIndicator() {
    const indicator = document.getElementById("destination-indicator");
    if (!indicator) return;

    // 如果没有目的地，隐藏指示器
    if (!this.destinationTile) {
      indicator.classList.add("hidden");
      return;
    }

    // Use relative world position between camera look at and the dest station
    this.camera.updateMatrixWorld();
    const destPosCamera = this.destinationTile.mesh.position.clone().applyMatrix4(this.camera.matrixWorldInverse);
    
    // Check if in front of camera (negative z in camera space)
    const isInFront = destPosCamera.z < 0;

    // 获取目的地在屏幕上的位置
    const destPos = this.getScreenPosition(this.destinationTile.mesh.position);
    const margin = 80; // 边缘margin

    // 检查目的地是否在屏幕可见范围内
    // Must be in front AND within screen bounds
    let isOnScreen = false;
    if (isInFront) {
       isOnScreen = destPos.x >= margin && destPos.x <= this.width - margin && destPos.y >= margin && destPos.y <= this.height - margin;
    }

    if (isOnScreen) {
      // 目的地在屏幕内，隐藏指示器
      indicator.classList.add("hidden");
      return;
    }

    // 目的地在屏幕外，显示指示器
    indicator.classList.remove("hidden");

    // 更新目的地名称
    document.getElementById("indicator-name").innerText = this.destinationTile.stationName;

    // 计算屏幕中心到目的地位置的方向
    // Use camera space coordinates to determine angle
    // Camera x is right, y is up. Screen x is right, y is down.
    // So angle = atan2(-y, x)
    const angle = Math.atan2(-destPosCamera.y, destPosCamera.x);

    // 计算指示器在屏幕边缘的位置
    const edgeMargin = 60;
    let indicatorX, indicatorY;

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // 根据角度确定指示器位置（在屏幕边缘）
    const maxX = this.width - edgeMargin;
    const maxY = this.height - edgeMargin;
    const minX = edgeMargin;
    const minY = edgeMargin;

    // Use cos/sin to find intersection with box
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    // Ray from center: x = centerX + t * cos, y = centerY + t * sin
    // Find t for each edge
    
    let t = Infinity;
    
    // Right edge: x = maxX
    if (cos > 0) {
       const tRight = (maxX - centerX) / cos;
       if (tRight < t) t = tRight;
    }
    // Left edge: x = minX
    if (cos < 0) {
       const tLeft = (minX - centerX) / cos;
       if (tLeft < t) t = tLeft;
    }
    // Bottom edge: y = maxY
    if (sin > 0) {
       const tBottom = (maxY - centerY) / sin;
       if (tBottom < t) t = tBottom;
    }
    // Top edge: y = minY
    if (sin < 0) {
       const tTop = (minY - centerY) / sin;
       if (tTop < t) t = tTop;
    }
    
    indicatorX = centerX + t * cos;
    indicatorY = centerY + t * sin;

    // 设置指示器位置，根据边缘位置调整transform避免超出屏幕
    let finalX = indicatorX;
    let finalY = indicatorY;

    // 根据指示器在屏幕的位置调整对齐方式
    let transformX = "-50%";
    let transformY = "-50%";

    const padding = 10; // 距离屏幕边缘的padding

    // 靠近右边缘时，向左对齐（元素右边贴着屏幕右边）
    if (indicatorX >= this.width - edgeMargin) {
      transformX = "-100%";
      finalX = this.width - padding;
    }
    // 靠近左边缘时，向右对齐（元素左边贴着屏幕左边）
    else if (indicatorX <= edgeMargin) {
      transformX = "0%";
      finalX = padding;
    }

    // 靠近下边缘时，向上对齐（元素下边贴着屏幕下边）
    if (indicatorY >= this.height - edgeMargin) {
      transformY = "-100%";
      finalY = this.height - padding;
    }
    // 靠近上边缘时，向下对齐（元素上边贴着屏幕上边）
    else if (indicatorY <= edgeMargin) {
      transformY = "0%";
      finalY = padding;
    }

    indicator.style.left = `${finalX}px`;
    indicator.style.top = `${finalY}px`;
    indicator.style.transform = `translate(${transformX}, ${transformY})`;

    // 更新箭头方向
    const arrowEl = document.getElementById("indicator-arrow");
    if (arrowEl) {
      // 根据方向选择箭头
      const degAngle = (angle * 180) / Math.PI;
      let arrow = "→";
      if (degAngle > -22.5 && degAngle <= 22.5) arrow = "→";
      else if (degAngle > 22.5 && degAngle <= 67.5) arrow = "↘";
      else if (degAngle > 67.5 && degAngle <= 112.5) arrow = "↓";
      else if (degAngle > 112.5 && degAngle <= 157.5) arrow = "↙";
      else if (degAngle > 157.5 || degAngle <= -157.5) arrow = "←";
      else if (degAngle > -157.5 && degAngle <= -112.5) arrow = "↖";
      else if (degAngle > -112.5 && degAngle <= -67.5) arrow = "↑";
      else if (degAngle > -67.5 && degAngle <= -22.5) arrow = "↗";

      arrowEl.innerText = arrow;
    }
  }

  // 显示目的地抽奖动画
  async showDestinationLottery(stations, finalDest) {
    // 创建全屏弹窗
    const overlay = document.createElement("div");
    overlay.id = "lottery-overlay";
    overlay.className = "fixed inset-0 flex items-center justify-center z-50";
    overlay.style.background = "rgba(0,0,0,0.9)";
    overlay.style.backdropFilter = "blur(8px)";

    overlay.innerHTML = `
      <div class="text-center relative">
          <div class="text-2xl text-gray-400 mb-4">🎲 正在选择目的地...</div>
          <div class="relative overflow-hidden h-32 w-80 mx-auto mb-6 rounded-xl border-4 border-yellow-600 bg-gray-900 shadow-2xl">
              <div class="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black to-transparent z-10"></div>
              <div class="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black to-transparent z-10"></div>
              <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 border-y-2 border-yellow-400 bg-yellow-400/10 z-10 box-border"></div>
              <div id="lottery-scroll" class="absolute inset-x-0 transition-transform" style="top: 50%; transform: translateY(-50%);">
                  <!-- 地名会在这里滚动 -->
              </div>
          </div>
          
          <!-- 拉杆/确定按钮 -->
          <div class="mb-6">
             <button id="lottery-stop-btn" class="group relative inline-flex items-center justify-center px-8 py-3 text-lg font-black text-white transition-all duration-200 bg-red-600 font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 active:scale-95 shadow-[0_6px_0_rgb(153,27,27)] hover:shadow-[0_4px_0_rgb(153,27,27)] hover:translate-y-1 active:shadow-none active:translate-y-2">
                <span class="mr-2 text-2xl">🎰</span> 立即确定
             </button>
          </div>

          <div id="lottery-result" class="text-5xl font-black text-yellow-400 mb-4 opacity-0 transition-opacity duration-500 transform scale-90"></div>
          <div id="lottery-subtitle" class="text-xl text-gray-300 opacity-0 transition-opacity duration-500">出发吧!</div>
      </div>
  `;

    document.body.appendChild(overlay);

    const scrollContainer = document.getElementById("lottery-scroll");
    const stopBtn = document.getElementById("lottery-stop-btn");

    // 创建滚动内容（所有车站名随机排列，重复多次）
    const allNames = stations.map((s) => s.stationName);
    // 打乱顺序
    for (let i = allNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNames[i], allNames[j]] = [allNames[j], allNames[i]];
    }

    // 确保最终目的地在最后
    const finalIndex = allNames.indexOf(finalDest.stationName);
    if (finalIndex > -1) {
      allNames.splice(finalIndex, 1);
    }

    // 创建滚动列表（重复多次 + 最终目的地）
    const repeatCount = 4;
    let scrollItems = [];
    for (let i = 0; i < repeatCount; i++) {
      scrollItems = scrollItems.concat([...allNames].sort(() => Math.random() - 0.5));
    }
    scrollItems.push(finalDest.stationName); // 最终停在这里

    // 渲染滚动项
    const itemHeight = 48;
    scrollContainer.innerHTML = scrollItems
      .map(
        (name, idx) => `
      <div class="h-12 flex items-center justify-center text-2xl font-bold ${name === finalDest.stationName && idx === scrollItems.length - 1 ? "text-yellow-400" : "text-white"}" 
           style="height: ${itemHeight}px;">${name}</div>
  `
      )
      .join("");

    // 设置初始位置（第一个项目在中心）
    scrollContainer.style.transform = `translateY(-${itemHeight / 2}px)`;
    scrollContainer.style.transition = "none";

    await wait(100);

    // 开始滚动动画
    const totalItems = scrollItems.length;
    const finalOffset = (totalItems - 1) * itemHeight + itemHeight / 2;

    // 先快后慢的滚动效果
    const duration = 3000;
    scrollContainer.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.85, 0.35, 1)`;
    scrollContainer.style.transform = `translateY(-${finalOffset}px)`;

    // Promise that resolves when animation should end (either timeout or click)
    let resolveAnimation;
    const animationPromise = new Promise(r => resolveAnimation = r);
    
    let isStopped = false;
    let selectedCity = finalDest; // Default to finalDest

    // Auto stop after duration + buffer
    const autoTimer = setTimeout(() => {
       if(!isStopped) {
           isStopped = true;
           resolveAnimation();
       }
    }, duration + 200);

// Manual stop: pause immediately and wait for second click
stopBtn.onclick = () => {
  if (!isStopped) {
    isStopped = true;
    clearTimeout(autoTimer);

    // Immediately freeze at the current transform value
    const computed = window.getComputedStyle(scrollContainer).transform;
    let currentY = 0;
    if (computed && computed !== "none") {
      // Handle matrix and matrix3d formats
      const matMatch = computed.match(/matrix.*\((.+)\)/);
      if (matMatch) {
        const values = matMatch[1].split(',');
        if (values.length === 6) {
        // matrix(a, b, c, d, tx, ty)
        currentY = parseFloat(values[5]);
      } else if (values.length === 16) {
        // matrix3d(..., ty at index 13)
        currentY = parseFloat(values[13]);
      }
      }
    } else {
      // Fallback: try to get transform from inline style
      const inlineTransform = scrollContainer.style.transform.match(/translateY\((-?\d+\.?\d*)px\)/);
      if (inlineTransform) currentY = parseFloat(inlineTransform[1]);
    }

    // Snap to nearest item (align to center)
    // currentY is negative. Center of item i is at -(i*h + h/2)
    // i = (-currentY - h/2) / h
    let itemIndex = Math.round((-currentY - itemHeight / 2) / itemHeight);
    // Clamp index
    itemIndex = Math.max(0, Math.min(itemIndex, scrollItems.length - 1));
    
    const snappedY = -(itemIndex * itemHeight + itemHeight / 2);

    // Get the city name at this position
    const cityName = scrollItems[itemIndex];
    selectedCity = stations.find(s => s.stationName === cityName) || finalDest;

    // Freeze at snapped position with smooth transition
    scrollContainer.style.transition = "transform 0.2s ease-out";
    scrollContainer.style.transform = `translateY(${snappedY}px)`;

    // After snap animation, change button text to "现在出发"
    setTimeout(() => {
      stopBtn.innerHTML = '<span class="mr-2 text-2xl">🚀</span> 现在出发';
      
      // Wait for second click to continue
      stopBtn.onclick = () => {
        resolveAnimation();
      };
    }, 200);
  }
};

    // Wait for animation to finish (or be skipped)
    await animationPromise;
    
    // Update finalDest to the selected city
    finalDest = selectedCity;

    // 直接淡出并返回游戏
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.5s";
    await wait(500);
    overlay.remove();
    
    return finalDest;
  }

  createDestinationMarker(tile) {
    const group = new THREE.Group();

    // 发光圆环
    const ringGeo = new THREE.TorusGeometry(2.5, 0.2, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    group.add(ring);

    // 旗杆
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 6, 8);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(1.5, 3, 1.5);
    group.add(pole);

    // 旗帜
    const flagGeo = new THREE.BoxGeometry(2, 1.5, 0.1);
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xff4444, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(2.5, 5, 1.5);
    group.add(flag);

    // 上下浮动动画的星星
    const starGeo = new THREE.OctahedronGeometry(0.5, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.y = 3;
    star.userData.baseY = 3;
    star.userData.animate = true;
    group.add(star);

    // 定位到目的地格子
    group.position.copy(tile.worldPos);
    group.position.y = 1;

    this.scene.add(group);
    this.destinationMarker = group;

    // 星星动画
    const animateStar = () => {
      if (!this.destinationMarker) return;
      const star = this.destinationMarker.children.find((c) => c.userData.animate);
      if (star) {
        star.position.y = star.userData.baseY + Math.sin(Date.now() * 0.003) * 0.5;
        star.rotation.y += 0.02;
      }
      requestAnimationFrame(animateStar);
    };
    animateStar();
  }

  // 显示到达目的地的结算动画
  async showDestinationArrival(player) {
    if (!this.destinationTile) return;

    const destName = this.destinationTile.stationName;

    // 创建礼花效果容器
    const fireworksContainer = document.createElement("div");
    fireworksContainer.className = "fireworks-container";
    fireworksContainer.id = "fireworks-container";
    document.body.appendChild(fireworksContainer);

    // 启动礼花动画
    this.startFireworks(fireworksContainer);

    // 创建结算动画弹窗
    const overlay = document.createElement("div");
    overlay.id = "arrival-overlay";
    overlay.className = "fixed inset-0 flex items-center justify-center z-50";
    overlay.style.background = "rgba(0,0,0,0.8)";
    overlay.style.backdropFilter = "blur(4px)";

    overlay.innerHTML = `
      <div class="text-center transform scale-0 transition-transform duration-500" id="arrival-content">
          <div class="text-8xl mb-6 animate-bounce">🏆</div>
          <div class="text-4xl font-black text-yellow-300 mb-4">${player.name} 最先到达目的地!</div>
          <div class="text-3xl font-bold text-white mb-6">📍 ${destName}</div>
          <div class="text-2xl text-gray-300 mb-4">获得了</div>
          <div class="text-6xl font-mono font-black text-green-400 mb-6">¥${DESTINATION_REWARD}</div>
          <div class="text-xl text-gray-300 mb-2">的援助金!</div>
          <div class="mt-4 flex justify-center gap-2 mb-8">
              <span class="text-4xl">🎉</span>
              <span class="text-4xl">🎊</span>
              <span class="text-4xl">✨</span>
              <span class="text-4xl">🎆</span>
              <span class="text-4xl">🎇</span>
          </div>
          <button id="arrival-confirm-btn" class="arrival-btn">确 定</button>
      </div>
  `;

    document.body.appendChild(overlay);

    // 弹出动画
    await wait(100);
    document.getElementById("arrival-content").style.transform = "scale(1)";

    // 播放金币音效（可选）
    this.log(`🏆 ${player.name} 到达目的地 ${destName}!`, "#22c55e");
    showToast(`🏆 ${player.name} 获得援助金 ¥${DESTINATION_REWARD}!`, "#22c55e");

    player.money += DESTINATION_REWARD;

    // --- 穷神附身逻辑 ---
    // 寻找距离目的地最远的玩家（除了到达者）
    let maxDist = -1;
    let victim = null;

    // 计算所有其他玩家到当前目的地的距离
    for (const p of this.players) {
      if (p === player) continue;

      const dist = this.calculateDistanceToDestination(p.currentTile);
      // 如果无法到达(-1)，视为无穷远
      const effectiveDist = dist === -1 ? 9999 : dist;

      if (effectiveDist > maxDist) {
        maxDist = effectiveDist;
        victim = p;
      } else if (effectiveDist === maxDist) {
        // 距离相同时，随机选择
        if (Math.random() > 0.5) victim = p;
      }
    }

    if (victim) {
      // 如果穷神已经在某人身上，且那个人不是victim，则转移
      // 如果穷神还没出现（游戏刚开始），则附身victim
      const currentOwner = this.players.find((p) => p.hasBinbougami);
      if (currentOwner !== victim) {
        await wait(500);
        await this.attachBinbougami(victim);
      }
    }

    this.updateUI();

    // 等待用户点击确定按钮
    await new Promise((resolve) => {
      const confirmBtn = document.getElementById("arrival-confirm-btn");
      confirmBtn.addEventListener("click", () => {
        resolve();
      }, { once: true });
    });

    // 停止礼花动画
    this.stopFireworks();

    // 淡出动画
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.5s";
    await wait(500);
    overlay.remove();
    
    // 移除礼花容器
    const fwContainer = document.getElementById("fireworks-container");
    if (fwContainer) fwContainer.remove();

    // 设置新的目的地
    await this.setNewDestination();
  }

  // 启动礼花动画
  startFireworks(container) {
    this.fireworksActive = true;
    this.fireworksInterval = setInterval(() => {
      if (!this.fireworksActive) return;
      this.createFirework(container);
    }, 300);
    
    // 立即创建几个礼花
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.createFirework(container), i * 100);
    }
  }

  // 停止礼花动画
  stopFireworks() {
    this.fireworksActive = false;
    if (this.fireworksInterval) {
      clearInterval(this.fireworksInterval);
      this.fireworksInterval = null;
    }
  }

  // 创建单个礼花效果
  createFirework(container) {
    if (!this.fireworksActive || !container) return;

    const colors = ['#ff0000', '#ff6600', '#ffff00', '#00ff00', '#00ffff', '#0066ff', '#ff00ff', '#ff69b4', '#ffd700'];
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * (window.innerHeight * 0.6) + window.innerHeight * 0.1;
    
    // 创建发射轨迹
    const trail = document.createElement("div");
    trail.className = "firework-trail";
    trail.style.left = x + "px";
    trail.style.bottom = "0";
    trail.style.background = colors[Math.floor(Math.random() * colors.length)];
    trail.style.setProperty("--end-y", -y + "px");
    container.appendChild(trail);
    
    // 轨迹消失后创建爆炸效果
    setTimeout(() => {
      trail.remove();
      
      // 创建爆炸粒子
      const particleCount = 20 + Math.floor(Math.random() * 15);
      const baseColor = colors[Math.floor(Math.random() * colors.length)];
      
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.className = "firework";
        particle.style.left = x + "px";
        particle.style.top = y + "px";
        particle.style.background = baseColor;
        particle.style.boxShadow = `0 0 6px ${baseColor}, 0 0 10px ${baseColor}`;
        
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3;
        const distance = 50 + Math.random() * 100;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.setProperty("--tx", tx + "px");
        particle.style.setProperty("--ty", ty + "px");
        
        container.appendChild(particle);
        
        // 自动移除粒子
        setTimeout(() => particle.remove(), 1500);
      }
      
      // 添加一些闪烁的emoji
      const sparkles = ['✨', '⭐', '🌟', '💫'];
      for (let i = 0; i < 3; i++) {
        const sparkle = document.createElement("div");
        sparkle.className = "sparkle";
        sparkle.textContent = sparkles[Math.floor(Math.random() * sparkles.length)];
        sparkle.style.left = (x + (Math.random() - 0.5) * 100) + "px";
        sparkle.style.top = (y + (Math.random() - 0.5) * 100) + "px";
        container.appendChild(sparkle);
        
        setTimeout(() => sparkle.remove(), 2000);
      }
    }, 800);
  }

  // --- 年度决算系统 ---

  advanceTime() {
    this.totalTurns++;
    this.gameMonth++;

    if (this.gameMonth > 12) {
      this.gameMonth = 1;
      this.gameYear++;
    }

    // 更新时间显示
    document.getElementById("game-year").innerText = this.gameYear;
    document.getElementById("game-month").innerText = this.gameMonth;

    // 检查是否到达决算月（3月）
    if (this.gameMonth === SETTLEMENT_MONTH) {
      return true; // 需要决算
    }
    return false;
  }

  async performSettlement() {
    this.log(`📊 ${this.gameYear}年度决算开始！`, "#fbbf24");
    showToast(`📊 ${this.gameYear}年度决算！`, "#fbbf24");

    await wait(500);

    for (const player of this.players) {
      let totalIncome = 0;
      const ownedStations = new Map(); // stationName -> buildingCount

      // 统计每个车站的物件
      this.map.forEach((tile) => {
        if (tile.type === "green" && tile.owner === player.id) {
          const stationBuildings = tile.buildings.length;
          if (stationBuildings > 0) {
            ownedStations.set(tile.stationName, stationBuildings);

            // 计算该车站的收益
            let stationIncome = 0;
            tile.buildings.forEach((tierIndex) => {
              stationIncome += BUILDING_INCOME[tierIndex];
            });

            // 独占奖励：如果拥有全部3种物件，收益翻倍
            const isMonopoly = tile.buildings.length === 3;
            if (isMonopoly) {
              stationIncome *= 2;
              this.log(`🏆 ${tile.stationName} 独占加成！`, "#a855f7");
            }

            totalIncome += stationIncome;
          }
        }
      });

      if (totalIncome > 0) {
        player.money += totalIncome;
        this.log(`💰 ${player.name} 收到红利 ¥${totalIncome}`, player.color === 0x3b82f6 ? "#60a5fa" : "#f87171");
        await this.showMoneyChangeDialog(player, totalIncome);
      } else {
        this.log(`${player.name} 没有物件收益`, "#9ca3af");
      }
    }

    this.updateUI();
    await wait(500);
  }

  // --- UI & Interaction ---

  log(msg, color = "white") {
    const logEl = document.getElementById("game-log");
    const entry = document.createElement("div");
    entry.innerHTML = `<span style="color:${color}; text-shadow: 1px 1px 0 #000">${msg}</span>`;
    logEl.appendChild(entry);
    if (logEl.children.length > 5) logEl.removeChild(logEl.firstChild);
    setTimeout(() => {
      entry.style.opacity = "0";
      setTimeout(() => entry.remove(), 500);
    }, 4000);
  }

  startTurn() {
    if (!this.isUserInteracting) {
      this.cameraLocked = true;
    }
    const p = this.players[this.turn];
    document.getElementById("turn-indicator").innerText = `${p.name} 的回合`;

    // Center camera on the current player
    this.centerCameraOnPlayer(p);

    const p1Panel = document.getElementById("p1-panel");
    const comPanel = document.getElementById("com-panel");

    p1Panel.style.opacity = this.turn === 0 ? "1" : "0.6";
    p1Panel.style.transform = this.turn === 0 ? "scale(1.05)" : "scale(1)";
    p1Panel.classList.toggle("border-yellow-400", this.turn === 0);

    comPanel.style.opacity = this.turn === 1 ? "1" : "0.6";
    comPanel.style.transform = this.turn === 1 ? "scale(1.05)" : "scale(1)";
    comPanel.classList.toggle("border-yellow-400", this.turn === 1);

    this.state = "IDLE";

    // Check for skip turn (Hibernate)
    if (p.skipNextTurn) {
      p.skipNextTurn = false;
      this.log(`💤 ${p.name} 正在冬眠，跳过回合`, "#9ca3af");
      setTimeout(() => this.nextTurn(), 1500);
      return;
    }

    if (p.isAI) {
      document.getElementById("roll-btn").classList.add("hidden");
      document.getElementById("use-card-btn").classList.add("hidden");
      setTimeout(() => this.aiAction(), 1000);
    } else {
      document.getElementById("roll-btn").classList.remove("hidden");
      const useCardBtn = document.getElementById("use-card-btn");
      if (p.cards.length > 0) {
        useCardBtn.classList.remove("hidden");
        useCardBtn.onclick = () => this.openUseCardModal();
      } else {
        useCardBtn.classList.add("hidden");
      }
    }
  }

  async playerRoll() {
    if (this.state !== "IDLE") return;
    document.getElementById("roll-btn").classList.add("hidden");
    await this.processMove();
  }

  async aiAction() {
    this.log("电脑正在思考...", "#fca5a5");
    await wait(1000);
    await this.processMove();
  }

  async processMove(diceCount = 1) {
    this.state = "MOVING";
    
    const player = this.players[this.turn];
    
    // Use dice animation to roll
    const { results: rolls, total: steps } = await diceAnimation.roll(diceCount);
    
    this.log(`${player.name} 掷出了 ${rolls.join("+")} = ${steps} 点!`, "#fbbf24");

    // Allow changing direction at the start of the turn
    player.previousTile = null;

    // 记录起点位置，用于计算距离
    const startTile = player.currentTile;
    // 记录访问过的格子及其从起点的最短距离
    const visitedDistances = new Map();
    visitedDistances.set(startTile, 0);
    
    let currentDistance = 0; // 当前距离起点的步数
    let reachedDestination = false;

    // AI预计算路径
    let aiPath = null;
    let aiPathIndex = 0;
    if (player.isAI && this.destinationTile) {
      aiPath = this.calculateAIPath(startTile, steps);
      if (aiPath && aiPath.length > 1) {
        aiPathIndex = 1; // 从第二个格子开始（第一个是起点）
        this.log(`🤖 AI规划了${aiPath.length - 1}步路径`, "#60a5fa");
      }
    }

    while (currentDistance < steps) {
      const current = player.currentTile;
      const neighbors = current.neighbors;

      let validNext = neighbors.filter((n) => n !== player.previousTile);
      if (validNext.length === 0 && neighbors.length > 0) {
        validNext = neighbors; // Dead end fallback
      }

      let nextTile = null;

      // AI使用预计算的路径
      if (player.isAI && aiPath && aiPathIndex < aiPath.length) {
        nextTile = aiPath[aiPathIndex];
        aiPathIndex++;
      } else if (validNext.length === 1) {
        nextTile = validNext[0];
      } else if (validNext.length > 1) {
        if (player.isAI) {
          // AI回退：如果预计算路径用完或无效，使用简单策略
          nextTile = this.chooseBestDirection(validNext);
        } else {
          nextTile = await this.askDirection(player, validNext);
        }
      } else {
        break;
      }

      // Physics Move
      player.previousTile = player.currentTile;
      player.currentTile = nextTile;

      await this.animateMove(player, nextTile.worldPos);

      // --- Binbougami Transfer Check ---
      // Check if we passed another player
      for (const other of this.players) {
        if (other !== player && other.currentTile === player.currentTile) {
          // Collision!
          if (player.hasBinbougami) {
            // Transfer FROM player TO other
            this.log(`👻 穷神从 ${player.name} 转移到了 ${other.name}！`, "#a855f7");
            await this.attachBinbougami(other);
          } else if (other.hasBinbougami) {
            // Transfer FROM other TO player
            this.log(`👻 穷神从 ${other.name} 转移到了 ${player.name}！`, "#a855f7");
            await this.attachBinbougami(player);
          }
        }
      }

      // 更新距离显示
      this.updateDistanceDisplay();

      // 计算新的距离：基于距离起点的步数
      if (nextTile.isColored) {
        // 计算到达这个格子时距离起点的步数
        let newDistance;
        if (visitedDistances.has(nextTile)) {
          // 如果回到之前访问过的格子，使用之前记录的距离
          newDistance = visitedDistances.get(nextTile);
        } else {
          // 新格子：距离加1
          newDistance = currentDistance + 1;
          visitedDistances.set(nextTile, newDistance);
        }
        currentDistance = newDistance;
      }
    }

    // 只有刚好落在目的地才算到达（步数用完时正好在目的地）
    if (this.destinationTile && player.currentTile === this.destinationTile) {
      reachedDestination = true;
      await this.showDestinationArrival(player);
    }

    await wait(300);
    await this.triggerTileEvent(player, reachedDestination);
  }

  animateMove(player, targetVec3) {
    if (!this.isUserInteracting) {
      this.cameraLocked = true;
    }
    return new Promise((resolve) => {
      const startPos = player.mesh.position.clone();
      const startTime = Date.now();
      const duration = 300; // ms

      // Simple Hop Animation
      const animateStep = () => {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);

        // Linear Interpolation for X/Z
        player.mesh.position.lerpVectors(startPos, targetVec3, progress);

        // Parabolic Arc for Y (Jump)
        // y = 4 * height * x * (1-x) + baseline
        const jumpHeight = 2;
        const baseHeight = 1.5;
        player.mesh.position.y = baseHeight + 4 * jumpHeight * progress * (1 - progress);

        if (progress < 1) {
          requestAnimationFrame(animateStep);
        } else {
          player.mesh.position.copy(targetVec3);
          player.mesh.position.y = baseHeight;
          resolve();
        }
      };
      animateStep();
    });
  }

  async askDirection(player, options) {
    // Center camera on the player before showing direction options
    await this.centerCameraOnPlayer(player, 300);

    // Determine best direction
    let bestTile = null;
    if (this.destinationTile) {
       bestTile = this.chooseBestDirection(options);
    }

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "absolute inset-0 pointer-events-auto z-50";
      overlay.id = "direction-overlay";
      document.getElementById("ui-layer").appendChild(overlay);

      options.forEach((tile) => {
        // Lift the icon slightly so it appears on top of the tile
        const targetPos = tile.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        const screenPos = this.getScreenPosition(targetPos);

        let label = "📍";
        const dx = tile.gridX - player.currentTile.gridX;
        const dy = tile.gridY - player.currentTile.gridY; // using gridY as Z

          if (dx > 0) label = "▶";
          else if (dx < 0) label = "◀";
          else if (dy > 0) label = "▼";
          else if (dy < 0) label = "▲";

        // Container for positioning (handles centering)
        const container = document.createElement("div");
        container.className = "absolute";
        container.style.left = `${screenPos.x}px`;
        container.style.top = `${screenPos.y}px`;
        container.style.transform = "translate(-50%, -50%)";

        // Button for appearance and interaction (handles animation)
        const btn = document.createElement("button");
        btn.innerText = label;
        
        const isBest = tile === bestTile;
        const baseClass = "w-12 h-12 rounded-full text-2xl shadow-xl border-4 animate-bounce-custom cursor-pointer transition-transform hover:scale-110";
        const colorClass = isBest 
          ? "bg-yellow-400 hover:bg-yellow-300 border-white text-black ring-4 ring-yellow-300 ring-opacity-50" 
          : "bg-blue-300 hover:bg-blue-200 border-white text-black";
        
        btn.className = `${baseClass} ${colorClass}`;
        
        if (isBest) {
            btn.style.zIndex = "10";
            // Add a small indicator for "Best"
            const badge = document.createElement("div");
            badge.className = "absolute -top-2 -right-2 bg-yellow-300 text-yellow-800 text-xs font-bold px-1 rounded border border-yellow-500";
            container.appendChild(badge);
        }

        btn.onclick = () => {
          document.getElementById("direction-overlay").remove();
          resolve(tile);
        };

        container.appendChild(btn);

        // Store 3D position on container for frame updates
        container.target3D = targetPos;

        overlay.appendChild(container);
      });
    });
  }

  async showMoneyChangeDialog(player, changeAmount) {
    return new Promise((resolve) => {
      const modal = document.getElementById("money-modal");
      const title = document.getElementById("money-modal-title");
      const amountEl = document.getElementById("money-modal-amount");
      const deltaEl = document.getElementById("money-modal-delta");
      const icon = document.getElementById("money-modal-icon");
      const container = modal.firstElementChild;

      modal.classList.remove("hidden");

      const endMoney = player.money;
      const startMoneyVal = endMoney - changeAmount;

      const isGain = changeAmount > 0;
      const colorClass = isGain ? "text-blue-600" : "text-red-600";
      const borderClass = isGain ? "border-blue-500" : "border-red-500";

      container.className = `bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full border-4 relative text-center transform transition-all scale-100 ${borderClass}`;

      title.innerText = player.name;
      icon.innerText = isGain ? "🤑" : "💸";

      deltaEl.className = `text-3xl font-black mb-2 ${colorClass}`;
      deltaEl.innerText = (isGain ? "+" : "") + "¥" + changeAmount;

      // Animation
      const duration = 1500;
      const startTime = Date.now();

      const animate = () => {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4); // Ease out

        const currentVal = Math.floor(startMoneyVal + changeAmount * ease);
        amountEl.innerText = "¥" + currentVal;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          amountEl.innerText = "¥" + endMoney;
          setTimeout(() => {
            modal.classList.add("hidden");
            resolve();
          }, 800);
        }
      };

      animate();
    });
  }

  // --- 小游戏挑战系统 ---
  
  /**
   * 处理小游戏挑战（统一UI流程）
   * @param {Object} player - 玩家对象
   * @param {number} baseAmount - 基础金额
   * @param {boolean} isGain - true为获得，false为损失
   * @returns {Promise<number>} - 返回最终金额（可能是原额、2x或0.5x）
   */
  async handleMinigameChallenge(player, baseAmount, isGain) {
    // AI玩家随机决定输赢
    if (player.isAI) {
      const won = Math.random() > 0.5; // 50%概率赢
      // 计算乘数：
      // 获得奖励(isGain=true): 赢了翻倍(x2)，输了减半(x0.5)
      // 损失金钱(isGain=false): 赢了减半(x0.5)，输了翻倍(x2)
      let multiplier;
      if (isGain) {
        multiplier = won ? 2 : 0.5;  // 奖励：赢了翻倍，输了减半
      } else {
        multiplier = won ? 0.5 : 2;  // 损失：赢了减半，输了翻倍
      }
      const finalAmount = Math.floor(baseAmount * multiplier);
      
      // 显示AI的挑战结果
      await this.showMinigameChallengeResult(player, baseAmount, finalAmount, isGain, won, true);
      return finalAmount;
    }
    
    // 玩家：显示统一的挑战UI
    return await this.showMinigameChallengeUI(player, baseAmount, isGain);
  }
  
  /**
   * 显示统一的小游戏挑战UI（给玩家用）
   */
  async showMinigameChallengeUI(player, baseAmount, isGain) {
    return new Promise((resolve) => {
      const modal = document.getElementById("minigame-challenge-modal");
      const content = document.getElementById("minigame-challenge-content");
      const icon = document.getElementById("minigame-challenge-icon");
      const title = document.getElementById("minigame-challenge-title");
      const desc = document.getElementById("minigame-challenge-desc");
      const amountEl = document.getElementById("minigame-challenge-amount");
      const hintEl = document.getElementById("minigame-challenge-hint");
      const skipBtn = document.getElementById("minigame-skip-btn");
      const playBtn = document.getElementById("minigame-play-btn");
      
      // 设置显示内容
      if (isGain) {
        icon.textContent = "💰";
        title.textContent = "幸运格子！";
        title.className = "text-3xl font-black text-blue-300 mb-4";
        desc.textContent = "踏上了蓝色幸运格！";
        content.className = "bg-gradient-to-b from-blue-900 to-indigo-900 p-8 rounded-2xl shadow-2xl max-w-md w-full border-4 border-blue-400 relative text-center";
        amountEl.className = "text-4xl font-mono font-bold text-green-400 mb-4";
        amountEl.textContent = `+¥${baseAmount}`;
        hintEl.innerHTML = `挑战小游戏，赢了<span class="text-green-400 font-bold">奖励翻倍</span>，输了只得<span class="text-red-400 font-bold">一半</span>！`;
      } else {
        icon.textContent = "💸";
        title.textContent = "倒霉格子！";
        title.className = "text-3xl font-black text-red-300 mb-4";
        desc.textContent = "踏上了红色厄运格！";
        content.className = "bg-gradient-to-b from-red-900 to-rose-900 p-8 rounded-2xl shadow-2xl max-w-md w-full border-4 border-red-400 relative text-center";
        amountEl.className = "text-4xl font-mono font-bold text-red-400 mb-4";
        amountEl.textContent = `-¥${baseAmount}`;
        hintEl.innerHTML = `挑战小游戏，赢了<span class="text-green-400 font-bold">损失减半</span>，输了<span class="text-red-400 font-bold">损失翻倍</span>！`;
      }
      
      modal.classList.remove("hidden");
      
      // 清除之前的事件监听器 - 通过克隆替换元素
      const newSkipBtn = skipBtn.cloneNode(true);
      const newPlayBtn = playBtn.cloneNode(true);
      skipBtn.parentNode.replaceChild(newSkipBtn, skipBtn);
      playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
      
      // 跳过按钮 - 直接领取原始金额，显示结算动画
      newSkipBtn.onclick = async () => {
        modal.classList.add("hidden");
        await this.showMinigameChallengeResult(player, baseAmount, baseAmount, isGain, null, false);
        resolve(baseAmount);
      };
      
      // 挑战按钮 - 打开小游戏
      newPlayBtn.onclick = async () => {
        modal.classList.add("hidden");
        console.log("点击挑战按钮，开始小游戏");
        const won = await this.playMinigame();
        console.log("小游戏返回结果 won:", won);
        // 确保 won 是 boolean（true 或 false），不是 null/undefined
        const isWon = won === true;
        
        // 计算乘数：
        // 获得奖励(isGain=true): 赢了翻倍(x2)，输了减半(x0.5)
        // 损失金钱(isGain=false): 赢了减半(x0.5)，输了翻倍(x2)
        let multiplier;
        if (isGain) {
          multiplier = isWon ? 2 : 0.5;  // 奖励：赢了翻倍，输了减半
        } else {
          multiplier = isWon ? 0.5 : 2;  // 损失：赢了减半，输了翻倍
        }
        const finalAmount = Math.floor(baseAmount * multiplier);
        
        // 显示结果和金额动画，传入明确的 true/false
        await this.showMinigameChallengeResult(player, baseAmount, finalAmount, isGain, isWon, false);
        resolve(finalAmount);
      };
    });
  }
  
  /**
   * 打开并运行小游戏
   * @returns {Promise<boolean>} - 返回是否获胜
   */
  async playMinigame() {
    return new Promise((resolve) => {
      const container = document.getElementById("minigame-iframe-container");
      const iframe = document.getElementById("minigame-iframe");
      const closeBtn = document.getElementById("minigame-close-btn");
      
      // 显示容器
      container.classList.remove("hidden");
      closeBtn.classList.remove("hidden"); // 始终显示关闭按钮
      
      // 加载小游戏
      iframe.src = GetMiniGameUrl('HelloCrush');
      
      let gameResult = null;
      let highestLevel = 0; // 记录玩家达到的最高关卡
      let resolved = false;
      
      const cleanup = () => {
        window.removeEventListener("message", messageHandler);
        container.classList.add("hidden");
        iframe.src = "";
      };
      
      // 监听小游戏消息
      const messageHandler = (event) => {
        if (resolved) return;
        if (!event.data) return;
        
        // 监听通关消息，记录最高关卡
        if (event.data.type === "levelCompleted") {
          const data = event.data.data;
          console.log("小游戏通关，当前关卡:", data?.level);
          if (data && data.level > highestLevel) {
            highestLevel = data.level;
            gameResult = data;
          }
        }
        
        // 监听游戏结束消息（失败或主动退出）
        if (event.data.type === "gameFinished") {
          resolved = true;
          const data = event.data.data;
          console.log("小游戏结束，结果:", data);
          // 使用最高记录的关卡，或者结束时的关卡
          if (data && data.level > highestLevel) {
            highestLevel = data.level;
            gameResult = data;
          }
          // 游戏结束，立即关闭并返回结果
          cleanup();
          // 如果 highestLevel >= 1，说明至少通过了第1关，视为获胜
          const won = highestLevel >= 1;
          console.log("判定结果 won:", won, "highestLevel:", highestLevel);
          resolve(won);
        }
      };
      
      window.addEventListener("message", messageHandler);
      
      // 关闭按钮处理 - 用户主动关闭
      closeBtn.onclick = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        // 用户主动关闭，根据已记录的最高关卡判断
        const won = highestLevel >= 1;
        console.log("用户关闭，判定结果 won:", won, "highestLevel:", highestLevel);
        resolve(won === true ? true : false); // 确保返回 boolean
      };
    });
  }
  
  /**
   * 显示小游戏挑战结果（统一UI，包含金额动画）
   * @param {Object} player - 玩家对象
   * @param {number} baseAmount - 基础金额
   * @param {number} finalAmount - 最终金额
   * @param {boolean} isGain - true为获得，false为损失
   * @param {boolean|null} won - 挑战结果：true=赢，false=输，null=跳过挑战
   * @param {boolean} isAI - 是否是AI玩家
   */
  async showMinigameChallengeResult(player, baseAmount, finalAmount, isGain, won, isAI) {
    return new Promise((resolve) => {
      const modal = document.getElementById("minigame-result-modal");
      const content = document.getElementById("minigame-result-content");
      const icon = document.getElementById("minigame-result-icon");
      const title = document.getElementById("minigame-result-title");
      const desc = document.getElementById("minigame-result-desc");
      const amountEl = document.getElementById("minigame-result-amount");
      const btn = document.getElementById("minigame-result-btn");
      const comparisonEl = document.getElementById("minigame-result-comparison");
      const originalAmountEl = document.getElementById("minigame-original-amount");
      const finalAmountEl = document.getElementById("minigame-final-amount");
      
      // 根据不同情况设置显示内容
      if (won === null) {
        // 跳过挑战，直接领取 - 不显示对比
        comparisonEl.classList.add("hidden");
        if (isGain) {
          icon.textContent = "💰";
          title.textContent = "领取奖励";
          title.className = "text-3xl font-black text-blue-300 mb-4";
          desc.textContent = "踏上蓝色幸运格！";
          content.className = "bg-gradient-to-b from-blue-900 to-indigo-900 p-8 rounded-2xl shadow-2xl max-w-md w-full border-4 border-blue-400 relative text-center";
        } else {
          icon.textContent = "💸";
          title.textContent = "损失金钱";
          title.className = "text-3xl font-black text-red-300 mb-4";
          desc.textContent = "踏上红色厄运格！";
          content.className = "bg-gradient-to-b from-red-900 to-rose-900 p-8 rounded-2xl shadow-2xl max-w-md w-full border-4 border-red-400 relative text-center";
        }
      } else if (won) {
        // 挑战成功 - 显示对比
        comparisonEl.classList.remove("hidden");
        originalAmountEl.textContent = `¥${baseAmount}`;
        finalAmountEl.textContent = `¥${finalAmount}`;
        finalAmountEl.className = isGain ? "font-bold text-green-400" : "font-bold text-yellow-400";
        
        if (isAI) {
          icon.textContent = "🎲";
          title.textContent = `${player.name} 运气不错！`;
          desc.innerHTML = `<div class="text-lg text-green-200 mb-1">🎮 小游戏通关！</div><div>${isGain ? '奖励翻倍！' : '损失减半！'}</div>`;
        } else {
          icon.textContent = "🎉";
          title.textContent = "挑战成功！";
          desc.innerHTML = `<div class="text-lg text-green-200 mb-1">🎮 小游戏通关！</div><div>${isGain ? '奖励翻倍！' : '损失减半！'}</div>`;
        }
        title.className = "text-3xl font-black text-green-300 mb-4";
        content.className = "bg-gradient-to-b from-green-900 to-emerald-900 p-8 rounded-2xl shadow-2xl max-w-md w-full border-4 border-green-400 relative text-center";
      } else {
        // 挑战失败 - 显示对比
        comparisonEl.classList.remove("hidden");
        originalAmountEl.textContent = `¥${baseAmount}`;
        finalAmountEl.textContent = `¥${finalAmount}`;
        finalAmountEl.className = isGain ? "font-bold text-yellow-400" : "font-bold text-red-400";
        
        if (isAI) {
          icon.textContent = "🎲";
          title.textContent = `${player.name} 运气不好...`;
          desc.innerHTML = `<div class="text-lg text-red-200 mb-1">🎮 小游戏未通关</div><div>${isGain ? '奖励减半...' : '损失翻倍！'}</div>`;
        } else {
          icon.textContent = "😢";
          title.textContent = "挑战失败...";
          desc.innerHTML = `<div class="text-lg text-red-200 mb-1">🎮 小游戏未通关</div><div>${isGain ? '奖励减半...' : '损失翻倍！'}</div>`;
        }
        title.className = "text-3xl font-black text-red-300 mb-4";
        content.className = "bg-gradient-to-b from-gray-900 to-slate-900 p-8 rounded-2xl shadow-2xl max-w-md w-full border-4 border-gray-400 relative text-center";
      }
      
      // 金额动画
      const startAmount = 0;
      const displayAmount = isGain ? finalAmount : finalAmount;
      const prefix = isGain ? "+" : "-";
      const colorClass = isGain ? "text-green-400" : "text-red-400";
      
      amountEl.className = `text-5xl font-mono font-bold ${colorClass} mb-6`;
      amountEl.textContent = `${prefix}¥0`;
      
      // AI玩家隐藏确定按钮
      if (isAI) {
        btn.classList.add("hidden");
      } else {
        btn.classList.remove("hidden");
      }
      
      modal.classList.remove("hidden");
      
      // 金额滚动动画
      const duration = 1200;
      const startTime = Date.now();
      
      const animate = () => {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4); // Ease out
        
        const currentVal = Math.floor(displayAmount * ease);
        amountEl.textContent = `${prefix}¥${currentVal}`;
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          amountEl.textContent = `${prefix}¥${displayAmount}`;
          // AI玩家动画结束后自动关闭
          if (isAI) {
            setTimeout(() => {
              modal.classList.add("hidden");
              resolve();
            }, 800);
          }
        }
      };
      
      animate();
      
      btn.onclick = () => {
        modal.classList.add("hidden");
        resolve();
      };
    });
  }

  // --- 穷神系统方法 ---

  async attachBinbougami(player) {
    // Remove from current owner
    const currentOwner = this.players.find((p) => p.hasBinbougami);
    if (currentOwner) {
      currentOwner.hasBinbougami = false;
      // Remove visual from current owner
      if (currentOwner.binbougamiMesh) {
        // Remove from whichever parent it was attached to
        try {
          if (typeof currentOwner.binbougamiMesh.removeFromParent === "function") currentOwner.binbougamiMesh.removeFromParent();
          else if (currentOwner.binbougamiMesh.parent) currentOwner.binbougamiMesh.parent.remove(currentOwner.binbougamiMesh);
        } catch (e) {
          // swallow
        }
        currentOwner.binbougamiMesh = null;
      }
    }

    // Attach to new player
    player.hasBinbougami = true;
    player.binbougamiTurns = 0;
    player.binbougamiLevel = 0; // Reset to normal
    player.binbougamiJustAttached = true; // 标记刚刚附身，本回合不触发效果

    this.log(`👻 穷神附身在了 ${player.name} 身上！`, "#a855f7");

    // Play possession sequence
    await this.showBinbougamiPossessionSequence(player);

    this.updateUI();
  }

  async showBinbougamiPossessionSequence(player) {
    // 1. Show Fullscreen UI
    const modal = document.getElementById("possession-modal");
    const content = document.getElementById("possession-content");
    const text = document.getElementById("possession-text");

    if (modal && content && text) {
      text.innerText = `${player.name} 被穷神附身了！`;
      modal.classList.remove("hidden");

      // Trigger animation
      // Force reflow
      void modal.offsetWidth;

      content.classList.remove("scale-0");
      content.classList.add("scale-100");

      // Wait for UI
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Hide UI
      content.classList.remove("scale-100");
      content.classList.add("scale-0");
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 500);
    }

    // 2. Move Camera to Player
    this.cameraLocked = false;
    await this.centerCameraOnPlayer(player, 800);

    // 3. Create Falling Binbougami
    this.createBinbougamiMesh(player, true);

    // Wait for fall animation (approx 1s)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Shake effect (simple camera shake)
    const originalPos = this.camera.position.clone();
    for (let i = 0; i < 10; i++) {
      this.camera.position.x = originalPos.x + (Math.random() - 0.5) * 2;
      this.camera.position.y = originalPos.y + (Math.random() - 0.5) * 2;
      this.camera.position.z = originalPos.z + (Math.random() - 0.5) * 2;
      await new Promise((r) => setTimeout(r, 30));
    }
    this.camera.position.copy(originalPos);

    // Restore camera lock if in game mode
    if (this.mode === "GAME") {
      this.cameraLocked = true;
    }
  }

  createBinbougamiMesh(player, animateFalling = false) {
    if (player.binbougamiMesh) return;

    const group = new THREE.Group();
    // Use a modest world scale so the ghost matches character size
    const scale = 1.2; // slightly bigger than player head

    // Simple Ghost Shape
    const bodyGeo = new THREE.SphereGeometry(0.4, 16, 16);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xa855f7 }); // Purple
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    group.add(body);

    // Tail
    const tailGeo = new THREE.ConeGeometry(0.2, 0.6, 16);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    tail.position.y = 0.1;
    tail.rotation.x = Math.PI;
    group.add(tail);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.15, 0.55, 0.3);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.15, 0.55, 0.3);
    group.add(rightEye);

    // Apply scale
    group.scale.set(scale, scale, scale);

    // 简化位置算法：直接挂在 player.mesh 上，使用固定高度
    // 玩家模型高度约为 3 单位（头顶 hat 在 y=3），穷神显示在 y=4.5 的位置
    const fixedHeight = 4.5;

    // 先附加到玩家mesh并设置引用，这样动画回调可以正常工作
    player.mesh.add(group);
    player.binbougamiMesh = group;

    if (animateFalling) {
      const startHeight = fixedHeight + 10; // 从上方10单位落下
      group.position.set(0, startHeight, 0);

      const startTime = Date.now();
      const duration = 600; // 0.6 second fall

      const animateFall = () => {
        if (!player.binbougamiMesh || !group.parent) return;

        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);

        // Quadratic ease in (accelerate)
        const currentY = startHeight - (startHeight - fixedHeight) * (progress * progress);
        group.position.y = currentY;

        if (progress < 1) {
          requestAnimationFrame(animateFall);
        } else {
          group.position.y = fixedHeight;
          this.animateBinbougamiHover(group, fixedHeight);
        }
      };
      animateFall();
    } else {
      group.position.set(0, fixedHeight, 0);
      this.animateBinbougamiHover(group, fixedHeight);
    }
  }

  animateBinbougamiHover(group, baseY) {
    const animate = () => {
      if (!group.parent) return; // Removed from scene

      const time = Date.now() * 0.002;
      group.position.y = baseY + Math.sin(time) * 0.5;
      group.rotation.y = Math.sin(time * 0.5) * 0.2; // Slight rotation

      requestAnimationFrame(animate);
    };
    animate();
  }

  async handleBinbougamiAction(player) {
    if (!player.hasBinbougami) return;

    player.binbougamiTurns++;

    // 检查是否升级为大魔王 (例如8回合后)
    if (player.binbougamiLevel === 0 && player.binbougamiTurns >= BINBOUGAMI_UPGRADE_TURNS) {
      player.binbougamiLevel = 1;
      this.log(`👻 穷神进化为大魔王了！`, "#ef4444");
      showToast(`👻 穷神进化为大魔王了！`, "#ef4444");
      // Update visual to look scarier (scale up, turn red)
      if (player.binbougamiMesh) {
        player.binbougamiMesh.children[0].material.color.setHex(0xef4444); // Red body
        // Scale up modestly for 'king' mode rather than huge value
        player.binbougamiMesh.scale.set(2.4, 2.4, 2.4);
      }
      await wait(1000);
    }

    // 决定效果
    const effects = player.binbougamiLevel === 1 ? BINBOUGAMI_EFFECTS.king : BINBOUGAMI_EFFECTS.normal;
    const effect = effects[Math.floor(Math.random() * effects.length)];

    // 显示弹窗
    await this.showBinbougamiDialog(player, effect);

    // 执行效果
    switch (effect.type) {
      case "loseMoney":
        const amount = rand(effect.min, effect.max);
        player.money -= amount;
        this.log(`${player.name} 损失了 ¥${amount}`, "#ef4444");
        break;
      case "debt":
        const debt = rand(effect.min, effect.max);
        player.money -= debt;
        this.log(`${player.name} 背负了 ¥${debt} 债务`, "#ef4444");
        break;
      case "sellProperty":
        await this.sellRandomProperty(player);
        break;
      case "sellAllProperty":
        // Sell multiple properties
        let count = 0;
        while ((await this.sellRandomProperty(player, false)) && count < 5) {
          count++;
        }
        break;
      case "nothing":
        this.log("穷神什么也没做", "#9ca3af");
        break;
    }

    this.updateUI();
  }

  async sellRandomProperty(player, showLog = true) {
    // Find owned properties
    const ownedTiles = this.map.filter((t) => t.owner === player.id && t.buildings.length > 0);
    if (ownedTiles.length === 0) {
      if (showLog) this.log("穷神想卖地，但你一无所有...", "#9ca3af");
      return false;
    }

    const tile = ownedTiles[Math.floor(Math.random() * ownedTiles.length)];
    // Sell the most expensive building on this tile
    const buildingIdx = tile.buildings.pop(); // Remove last added

    const sellPrice = Math.floor(BUILDING_COSTS[buildingIdx] / 2);
    player.money += sellPrice;
    player.assets -= BUILDING_COSTS[buildingIdx];

    // If no buildings left, clear owner
    if (tile.buildings.length === 0) {
      tile.owner = null;
    }

    this.removeBuildingVisually(tile);

    if (showLog) this.log(`穷神卖掉了 ${tile.stationName} 的物件，获得 ¥${sellPrice}`, "#ef4444");
    return true;
  }

  removeBuildingVisually(stationTile) {
    // Find environment tiles around station
    const range = 2;
    const candidates = [];
    for (let x = stationTile.gridX - range; x <= stationTile.gridX + range; x++) {
      for (let z = stationTile.gridY - range; z <= stationTile.gridY + range; z++) {
        const t = this.tilesMap.get(`${x},${z}`);
        if (t && !t.isRoad && t.mesh.children.length > 0) {
          candidates.push(t);
        }
      }
    }

    if (candidates.length > 0) {
      // Pick one and remove a child
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      if (target.mesh.children.length > 0) {
        target.mesh.remove(target.mesh.children[target.mesh.children.length - 1]);
      }
    }
  }

  async showBinbougamiDialog(player, effect) {
    return new Promise((resolve) => {
      const modal = document.getElementById("binbougami-modal");
      const title = document.getElementById("binbougami-modal-title");
      const desc = document.getElementById("binbougami-modal-desc");
      const effectEl = document.getElementById("binbougami-modal-effect");
      const hint = document.getElementById("binbougami-modal-hint");

      modal.classList.remove("hidden");

      title.innerText = player.binbougamiLevel === 1 ? "大魔王降临！" : "穷神来袭！";
      // 替换占位符：用户显示"你"，AI显示玩家名字
      const displayName = player.isAI ? player.name : "你";
      desc.innerText = effect.msg.replace(/{playerName}/g, displayName);
      effectEl.innerText = "";
      hint.innerText = "点击任意处继续...";

      // Auto close after delay
      setTimeout(() => {
        modal.classList.add("hidden");
        resolve();
      }, 2500);
    });
  }

  // 显示AI购买房产弹窗
  async showAIPurchaseDialog(player, property, location) {
    return new Promise((resolve) => {
      const modal = document.getElementById("ai-purchase-modal");
      const title = document.getElementById("ai-purchase-title");
      const propertyName = document.getElementById("ai-purchase-property-name");
      const locationEl = document.getElementById("ai-purchase-location");
      const priceEl = document.getElementById("ai-purchase-price");

      modal.classList.remove("hidden");

      title.innerText = `${player.name} 购买房产`;
      propertyName.innerText = property.homeName;
      locationEl.innerText = `📍 ${location}`;
      priceEl.innerText = `-¥${property.price.toLocaleString()}`;

      // Auto close after delay
      setTimeout(() => {
        modal.classList.add("hidden");
        resolve();
      }, 2000);
    });
  }

  // --- 卡牌系统方法 ---

  async handleCardStation(player) {
    // Randomly pick a card from pool based on rarity weights
    const r = Math.random();
    let pool = CARD_POOL.common;
    if (r > 0.7) pool = CARD_POOL.rare;
    if (r > 0.95) pool = CARD_POOL.epic;

    const cardKey = pool[Math.floor(Math.random() * pool.length)];
    const card = CARD_TYPES[cardKey];

    // Add to player hand
    if (player.cards.length < MAX_HAND_SIZE) {
      player.cards.push(cardKey);
      this.log(`🎴 ${player.name} 获得了 [${card.name}]`, "#fbbf24");
      await this.showCardGetDialog(player, card);
    } else {
      this.log(`🎴 ${player.name} 找到了 [${card.name}]，但是手牌满了...`, "#9ca3af");
      showToast("手牌已满，无法获取新卡片", "gray");
    }
  }

  async showCardGetDialog(player, card) {
    return new Promise((resolve) => {
      const modal = document.getElementById("card-modal");
      const content = document.getElementById("card-modal-content");

      modal.classList.remove("hidden");
      content.innerHTML = `
          <div class="text-center">
              <div class="text-6xl mb-4">${card.icon}</div>
              <div class="text-3xl font-bold text-gray-800 mb-2">${card.name}</div>
              <div class="text-gray-600">${card.desc}</div>
              <div class="mt-4 text-sm text-yellow-600 font-bold">稀有度: ${card.rarity.toUpperCase()}</div>
          </div>
      `;

      if (player.isAI) {
        setTimeout(() => {
          this.closeCardModal();
          resolve();
        }, 1500);
      } else {
        this._resolveCardModal = resolve;
      }
    });
  }

  closeCardModal() {
    document.getElementById("card-modal").classList.add("hidden");
    if (this._resolveCardModal) {
      this._resolveCardModal();
      this._resolveCardModal = null;
    }
  }

  openUseCardModal() {
    const player = this.players[0]; // Human player
    if (player.cards.length === 0) return;

    const modal = document.getElementById("use-card-modal");
    const list = document.getElementById("use-card-list");
    list.innerHTML = "";

    player.cards.forEach((cardKey, index) => {
      const card = CARD_TYPES[cardKey];
      const div = document.createElement("div");
      div.className = `card-item w-32 p-3 rounded-xl border-2 flex flex-col items-center gap-2 bg-white shadow-md card-rarity-${card.rarity}`;
      div.onclick = () => this.useCard(index);

      div.innerHTML = `
          <div class="text-3xl">${card.icon}</div>
          <div class="font-bold text-sm text-center">${card.name}</div>
          <div class="text-xs text-gray-600 text-center leading-tight">${card.desc}</div>
      `;
      list.appendChild(div);
    });

    modal.classList.remove("hidden");
  }

  closeUseCardModal() {
    document.getElementById("use-card-modal").classList.add("hidden");
  }

  async useCard(cardIndex) {
    this.closeUseCardModal();
    const player = this.players[0];
    const cardKey = player.cards[cardIndex];
    const card = CARD_TYPES[cardKey];

    // Remove card from hand
    player.cards.splice(cardIndex, 1);
    this.updateUI();

    this.log(`🃏 ${player.name} 使用了 [${card.name}]`, "#a855f7");

    // Hide buttons
    document.getElementById("roll-btn").classList.add("hidden");
    document.getElementById("use-card-btn").classList.add("hidden");

    // Execute Effect
    if (card.type === "move") {
      await this.processMove(card.diceCount);
    } else if (card.type === "attack") {
      await this.handleAttackCard(player, card);
      this.nextTurn();
    } else if (card.type === "special") {
      await this.handleSpecialCard(player, card);
      this.nextTurn();
    }
  }

  async handleAttackCard(player, card) {
    const target = this.players.find((p) => p !== player); // Simple 1v1 logic

    if (card.effect === "skip") {
      target.skipNextTurn = true;
      this.log(`💤 ${target.name} 下回合将无法行动！`, "#3b82f6");
      showToast(`${target.name} 进入冬眠！`, "#3b82f6");
    } else if (card.effect === "blowAway") {
      // 只选择station格子(type === "green")
      const stations = this.map.filter((t) => t.type === "green");
      const randomStation = stations[Math.floor(Math.random() * stations.length)];
      target.currentTile = randomStation;
      target.mesh.position.copy(randomStation.worldPos);
      target.mesh.position.y = 1.5;
      this.log(`💨 ${target.name} 被吹飞到了 ${randomStation.stationName}！`, "#3b82f6");
      this.updateDistanceDisplay();
    } else if (card.effect === "trap") {
      this.log("陷阱卡尚未实装", "gray");
    }
    await wait(1000);
  }

  async handleSpecialCard(player, card) {
    if (card.effect === "backward") {
      this.log("后退卡尚未实装", "gray");
    } else if (card.effect === "teleport") {
      const stations = this.map.filter((t) => t.type === "green");
      const target = stations[Math.floor(Math.random() * stations.length)];
      player.currentTile = target;
      player.mesh.position.copy(target.worldPos);
      player.mesh.position.y = 1.5;
      this.log(`🚪 ${player.name} 使用任意门传送到了 ${target.stationName}`, "#a855f7");
      this.updateDistanceDisplay();
    } else if (card.effect === "exorcise") {
      if (player.hasBinbougami) {
        player.hasBinbougami = false;
        if (player.binbougamiMesh) {
          try {
            if (typeof player.binbougamiMesh.removeFromParent === "function") player.binbougamiMesh.removeFromParent();
            else if (player.binbougamiMesh.parent) player.binbougamiMesh.parent.remove(player.binbougamiMesh);
          } catch (e) {}
          player.binbougamiMesh = null;
        }
        this.log(`📿 穷神被驱散了！`, "#fbbf24");
      } else {
        this.log("你身上没有穷神...", "gray");
      }
    }
    await wait(1000);
  }

  async triggerTileEvent(player, alreadyReachedDestination = false) {
    this.state = "EVENT";
    const tile = player.currentTile;
    let endTurn = true;

    // 目的地到达已在移动过程中处理，不再重复检查

    switch (tile.type) {
      case "blue":
        const bonus = rand(500, 2000);
        const finalBonus = await this.handleMinigameChallenge(player, bonus, true);
        player.money += finalBonus;
        this.log(`幸运！获得资金 ¥${finalBonus}`, "#60a5a5");
        // 金额动画已在 handleMinigameChallenge 中显示
        break;
      case "red":
        const loss = rand(500, 1500);
        const finalLoss = await this.handleMinigameChallenge(player, loss, false);
        player.money -= finalLoss;
        this.log(`倒霉！损失 ¥${finalLoss}`, "#f87171");
        // 金额动画已在 handleMinigameChallenge 中显示
        break;
      case "yellow":
        await this.handleCardStation(player);
        break;
      case "green":
        endTurn = false;
        await this.handleStation(player, tile);
        break;
    }

    // Handle Binbougami at end of turn
    if (player.hasBinbougami) {
      // 如果是刚刚附身的，本回合不触发效果（下回合开始才触发）
      if (player.binbougamiJustAttached) {
        player.binbougamiJustAttached = false;
      } else {
        await wait(500);
        await this.handleBinbougamiAction(player);
      }
    }

    this.updateUI();
    if (endTurn) this.nextTurn();
  }

  spawnFloatingText(pos, text, color) {
    const div = document.createElement("div");
    div.innerText = text;
    div.style.color = color;
    div.className = "absolute text-2xl font-black shadow-white drop-shadow-md pointer-events-none transition-all duration-1000 ease-out";

    const screenPos = this.getScreenPosition(pos);
    div.style.left = screenPos.x + "px";
    div.style.top = screenPos.y + "px";

    document.getElementById("ui-layer").appendChild(div);

    // Animate via CSS
    requestAnimationFrame(() => {
      div.style.transform = "translateY(-50px)";
      div.style.opacity = "0";
    });

    setTimeout(() => div.remove(), 1000);
  }

  async handleStation(player, tile) {
    if (player.isAI) {
      // AI策略：尝试购买房产
      const playerProperties = this.generatePlayerProperties(tile);
      
      // 筛选可购买的房产（未购买 + 能支付）
      const affordableProperties = playerProperties.filter(
        p => !p.isPurchased && player.money >= p.price * 1.2
      );
      
      if (affordableProperties.length > 0) {
        // 选择最便宜的房产
        const property = affordableProperties.sort((a, b) => a.price - b.price)[0];
        
        // 更新缓存 - 使用property.index（原始索引）而不是排序后的索引
        const propertyRecord = getOrCreatePropertyId(tile.stationName, property.index);
        propertyRecord.purchasedBy = player.id;
        propertyRecord.purchasePrice = property.price;
        // 缓存已购买房产的完整数据，确保数据不再变动
        propertyRecord.cachedData = {
          level: property.level,
          price: property.price,
          income: property.income,
          playerId: property.playerId,
          playerName: property.playerName,
          avatar: property.avatar,
          homeName: property.homeName,
          isOnline: property.isOnline
        };
        
        // 执行购买
        player.money -= property.price;
        player.assets += property.price;
        
        // 全屏弹窗展示AI购买信息
        await this.showAIPurchaseDialog(player, property, tile.stationName);
        
        this.log(`🏠 ${player.name} 购买了 ${property.homeName}！`, "#fca5a5");
      } else {
        this.log(`${player.name} 没有购买意向`, "#9ca3af");
      }
      this.nextTurn();
    } else {
      this.state = "BUYING";
      this.showCityInfoModal(tile);
    }
  }

  playerBuy(tierIndex) {
    // This method is deprecated - use purchaseProperty instead
    // Kept for backward compatibility
    const player = this.players[0];
    const tile = player.currentTile;
    if (tile.buildings.includes(tierIndex) || player.money < BUILDING_COSTS[tierIndex]) return;

    this.doBuy(player, tile, tierIndex);
    this.populatePropertiesAndBuildingsTab(tile);
    this.updateUI();
  }

  doBuy(player, tile, tierIndex) {
    player.money -= BUILDING_COSTS[tierIndex];
    player.assets += BUILDING_COSTS[tierIndex];
    tile.buildings.push(tierIndex);
    tile.buildings.sort();
    tile.owner = player.id;

    this.placeBuildingVisually(tile, tierIndex);
    this.log(`${player.name} 购买了 ${BUILDING_NAMES[tierIndex]}!`, player.color === 0x3b82f6 ? "#60a5fa" : "#f87171");
  }

  placeBuildingVisually(stationTile, tierIndex) {
    // Find a spot near the station
    const range = 2;
    const candidates = [];
    for (let x = stationTile.gridX - range; x <= stationTile.gridX + range; x++) {
      for (let z = stationTile.gridY - range; z <= stationTile.gridY + range; z++) {
        const t = this.tilesMap.get(`${x},${z}`);
        // Must be environment (not road) and empty
        if (t && !t.isRoad && t.mesh.children.length === 0) {
          candidates.push(t);
        }
      }
    }

    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];

      const bColor = COLORS.building[tierIndex];
      const h = (tierIndex + 1) * 3; // Height varies by tier

      const bGeo = new THREE.BoxGeometry(2.5, h, 2.5);
      const bMat = new THREE.MeshLambertMaterial({ color: bColor });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      bMesh.position.y = h / 2 + 1; // Adjust for height
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;

      // Add windows texture logic (simplified as black boxes)
      const winGeo = new THREE.BoxGeometry(2.6, h * 0.8, 0.5);
      const winMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
      const wins = new THREE.Mesh(winGeo, winMat);
      bMesh.add(wins);

      target.mesh.add(bMesh);

      // Juice effect
      const scaleUp = () => {
        bMesh.scale.set(0.1, 0.1, 0.1);
        let s = 0.1;
        const grow = setInterval(() => {
          s += 0.1;
          bMesh.scale.set(s, s, s);
          if (s >= 1) clearInterval(grow);
        }, 16);
      };
      scaleUp();
    }
  }

  onGameClick(event) {
    // Perform raycasting to detect clicked tiles
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.gameMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.gameMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.gameRaycaster.setFromCamera(this.gameMouse, this.camera);
    
    // Collect all instanced meshes from road chunks for raycasting
    const instancedMeshes = [];
    if (this.roadChunkGroups) {
      this.roadChunkGroups.forEach(chunkGroup => {
        chunkGroup.children.forEach(child => {
          if (child.isInstancedMesh && child.userData.tiles) {
            instancedMeshes.push(child);
          }
        });
      });
    }
    
    const intersects = this.gameRaycaster.intersectObjects(instancedMeshes, false);

    if (intersects.length > 0) {
      const intersection = intersects[0];
      const instancedMesh = intersection.object;
      const instanceId = intersection.instanceId;
      
      // Get the tile from the instanced mesh's userData
      if (instancedMesh.userData.tiles && instanceId !== undefined) {
        const clickedTile = instancedMesh.userData.tiles[instanceId];
        
        if (clickedTile && clickedTile.type === "green") {
          // Open city info panel in "view-only" mode (no purchase)
          this.showCityInfoModalViewOnly(clickedTile);
        }
      }
    }
  }

  showCityInfoModal(tile) {
    const modal = document.getElementById("city-info-modal");
    this.currentCityInfoTile = tile;
    this.cityInfoPanelMode = "purchase"; // Mark as purchase mode (when stopped at city)
    
    // Update header
    document.getElementById("city-info-title").innerText = tile.stationName;
    document.getElementById("city-info-subtitle").innerText = `人口: ${tile.population?.toLocaleString() || '未知'} | 级别: ${tile.level || 'N/A'}`;
    
    // Show modal
    modal.classList.remove("hidden");
    
    // In purchase mode, show properties tab (merged with buildings)
    this.switchCityInfoTab("properties");
    
    // Populate merged properties & buildings tab
    this.populatePropertiesAndBuildingsTab(tile);
    
    // Also populate info tab for reference
    this.populateCityInfoTab(tile);
    
    // Setup tab switching
    this.setupCityInfoTabs();
  }

  showCityInfoModalViewOnly(tile) {
    // Open city info panel in view-only mode (when clicking from map, not stopped)
    const modal = document.getElementById("city-info-modal");
    this.currentCityInfoTile = tile;
    this.cityInfoPanelMode = "view-only"; // Mark as view-only mode
    
    // Update header
    document.getElementById("city-info-title").innerText = tile.stationName;
    document.getElementById("city-info-subtitle").innerText = `人口: ${tile.population?.toLocaleString() || '未知'} | 级别: ${tile.level || 'N/A'}`;
    
    // Show modal
    modal.classList.remove("hidden");
    
    // Reset to properties tab (merged)
    this.switchCityInfoTab("properties");
    
    // Populate merged properties & buildings tab
    this.populatePropertiesAndBuildingsTab(tile);
    
    // Load city info from LLM (async, no await needed for UI responsiveness)
    this.populateCityInfoTab(tile);
    
    // Setup tab switching
    this.setupCityInfoTabs();
  }

  closeCityInfoModal() {
    document.getElementById("city-info-modal").classList.add("hidden");
    
    // Only proceed to next turn if in purchase mode (stopped at city)
    // In view-only mode (clicked from map), just close the panel
    if (this.cityInfoPanelMode === "purchase") {
      this.nextTurn();
    }
  }

  switchCityInfoTab(tabName) {
    // Hide all tabs
    document.querySelectorAll(".city-info-tab-content").forEach(el => {
      el.classList.add("hidden");
    });
    
    // Remove active border from all buttons
    document.querySelectorAll(".city-info-tab").forEach(btn => {
      btn.classList.remove("border-blue-600", "text-blue-600");
      btn.classList.add("border-transparent", "text-gray-600");
    });
    
    // Show selected tab
    const tabEl = document.getElementById(`city-info-${tabName}-tab`);
    if (tabEl) {
      tabEl.classList.remove("hidden");
    }
    
    // Highlight selected button
    const btnEl = document.querySelector(`.city-info-tab[data-tab="${tabName}"]`);
    if (btnEl) {
      btnEl.classList.remove("border-transparent", "text-gray-600");
      btnEl.classList.add("border-blue-600", "text-blue-600");
    }
  }

  setupCityInfoTabs() {
    document.querySelectorAll(".city-info-tab").forEach(btn => {
      btn.onclick = () => {
        const tabName = btn.dataset.tab;
        this.switchCityInfoTab(tabName);
      };
    });
  }

  populatePropertiesAndBuildingsTab(tile) {
    // Update player money display
    const player = this.players[0];
    document.getElementById("city-info-player-money").innerText = player.money.toLocaleString();
    
    // Show/hide destination indicator
    const destIndicator = document.getElementById("city-info-dest-indicator");
    const isDestination = tile === this.destinationTile;
    if (isDestination) {
      destIndicator.classList.remove("hidden");
    } else {
      destIndicator.classList.add("hidden");
    }
    
    // Get player properties (these are homes available for purchase)
    const container = document.getElementById("city-info-properties-list");
    const emptyDiv = document.getElementById("city-info-empty-properties");
    
    container.innerHTML = "";
    
    // Get player properties (homes from other players)
    const playerProperties = this.generatePlayerProperties(tile);
    
    if (playerProperties.length === 0) {
      container.style.display = "none";
      emptyDiv.style.display = "block";
      return;
    }
    
    emptyDiv.style.display = "none";
    container.style.display = "grid";
    
    // Render all property cards
    playerProperties.forEach((property, index) => {
      const card = document.createElement("div");
      card.className = "bg-white rounded-lg border-2 border-blue-300 overflow-hidden shadow-md hover:shadow-lg transition flex flex-col";
      
      // Check if already purchased
      const isPurchased = property.isPurchased;
      
      // Top section: Home name, price, income, and action button
      const headerBg = isPurchased ? "from-purple-100 to-pink-100" : "from-blue-100 to-cyan-100";
      const borderColor = isPurchased ? "border-purple-400" : "border-blue-400";
      
      let actionBtn = "";
      if (isPurchased) {
        actionBtn = `<span class="text-purple-600 font-bold text-xs whitespace-nowrap">✓ 被 ${property.purchasedByName} 购买</span>`;
      } else {
        // 检查玩家是否在当前城市（只有在购买模式下且玩家在正确位置才能购买）
        const isPlayerHere = tile.stationName === player.currentTile.stationName && this.cityInfoPanelMode === "purchase";
        const canAfford = player.money >= property.price;
        
        if (isPlayerHere && canAfford) {
          actionBtn = `<button class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs font-bold shadow transition" onclick="game.purchaseProperty(${index})">购买</button>`;
        } else if (!isPlayerHere) {
          actionBtn = `<span class="text-gray-400 text-xs font-bold"></span>`;
        } else {
          actionBtn = `<span class="text-red-400 text-xs font-bold">💸 缺钱</span>`;
        }
      }
      
      const incomeRate = property.price > 0 ? Math.round((property.income || 0) / property.price * 100) : 0;
      card.className = `bg-white rounded-lg border-2 ${borderColor} overflow-hidden shadow-md hover:shadow-lg transition flex flex-col`;
      card.innerHTML = `
        <!-- Header: Home name, price, income, action button -->
        <div class="bg-gradient-to-br ${headerBg} p-3 flex justify-between items-start gap-2">
          <div class="flex-1 min-w-0">
            <p class="font-bold text-gray-800 text-base truncate">${property.homeName}</p>
            <p class="text-sm text-gray-700 mt-1">💰:<span class="font-bold">¥${property.price.toLocaleString()}</span>  📈 年收益:<span class="font-bold text-green-600">¥${property.income || 0}</span> <span class="font-bold ${incomeRate >= 50 ? 'text-red-500' : incomeRate >= 30 ? 'text-orange-500' : 'text-gray-500'}">(${incomeRate}%)</span></p>
          </div>
          <div class="flex-shrink-0 text-center">
            ${actionBtn}
          </div>
        </div>
        
        <!-- Footer: Player info (avatar, name, level) -->
        <div class="p-3 flex items-center justify-between bg-gray-50 border-t border-gray-200">
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <img src="${property.avatar}" alt="头像" class="w-10 h-10 rounded-full border-2 border-blue-400 flex-shrink-0">
            <div class="min-w-0">
              <p class="font-bold text-gray-800 text-sm truncate">${property.playerName}</p>
              <p class="text-xs text-gray-600">等级: ${property.level} ⭐</p>
            </div>
          </div>
          <div class="flex-shrink-0">
            <div class="${property.isOnline ? 'bg-green-500' : 'bg-gray-400'} text-white px-2 py-0.5 rounded-full text-xs font-bold">
              ${property.isOnline ? '🟢' : '⚫'}
            </div>
          </div>
        </div>
      `;
      
      container.appendChild(card);
    });
    
    // Hide monopoly hint (not applicable for home purchases)
    const monopolyContainer = document.getElementById("city-info-properties-tab").querySelector(".bg-purple-50");
    if (monopolyContainer) {
      monopolyContainer.style.display = "none";
    }
  }

  generatePlayerProperties(tile) {
    // Generate player property data for display
    // 需求: 
    // 1. 已购买的地产始终置顶显示，且数据保持不变（从缓存读取）
    // 2. 未购买的地产每次可以有随机性
    // 3. 城市的房产数量在session中保持一致
    
    const playerNames = ["小明", "小红", "老王", "张三", "李四", "王五", "赵六", "孙七", "周八", "吴九"];
    const homeNames = ["梦幻庄园", "绿洲家园", "天空之城", "森林小屋", "云端别墅", "海滨度假", "山顶别墅", "古镇民宿", "湖边小屋", "花园洋房"];
    
    const cityName = tile.stationName;
    
    // 确保city的session缓存存在（只保存房产数量，不保存具体数据）
    if (!this.sessionPropertyCache[cityName]) {
      // 首次访问此城市 - 生成随机属性数量
      const minProperties = 5;
      const maxProperties = 8;
      const count = Math.floor(Math.random() * (maxProperties - minProperties + 1)) + minProperties;
      
      // 保存到session缓存 - 只保存数量
      this.sessionPropertyCache[cityName] = {
        totalCount: count
      };
    }
    
    const totalCount = this.sessionPropertyCache[cityName].totalCount;
    
    // 为所有属性生成数据
    const allProperties = [];
    for (let i = 0; i < totalCount; i++) {
      const propertyData = getOrCreatePropertyId(cityName, i);
      
      // Determine if purchased and by whom
      const isPurchased = propertyData.purchasedBy !== null;
      let ownerName = "";
      
      if (isPurchased) {
        const purchaser = this.players.find((p) => p.id === propertyData.purchasedBy);
        ownerName = purchaser ? purchaser.name : "未知玩家";
      }
      
      let propInfo;
      if (isPurchased && propertyData.cachedData) {
        // 已购买的房产：使用缓存的固定数据
        propInfo = propertyData.cachedData;
      } else {
        // 未购买的房产：每次随机生成
        const level = Math.floor(Math.random() * 5) + 1;
        const price = PROPERTY_PRICE_RANGE[0] + Math.floor(Math.random() * (PROPERTY_PRICE_RANGE[1] - PROPERTY_PRICE_RANGE[0]));
        const income = Math.floor((Math.random() * 2000) + 500 * level);
        propInfo = {
          level: level,
          price: price,
          income: income,
          playerId: `P${Math.floor(Math.random() * 10000)}`,
          playerName: playerNames[i % playerNames.length],
          avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
          homeName: homeNames[i % homeNames.length],
          isOnline: Math.random() > 0.3
        };
      }
      
      allProperties.push({
        type: "property",
        id: propertyData.id,
        index: i,
        playerId: propInfo.playerId,
        playerName: propInfo.playerName,
        avatar: propInfo.avatar,
        homeName: propInfo.homeName,
        level: propInfo.level,
        price: propInfo.price,
        income: propInfo.income,
        isOnline: propInfo.isOnline,
        isPurchased: isPurchased,
        purchasedBy: propertyData.purchasedBy,
        purchasedByName: ownerName
      });
    }
    
    // 分离已购买和未购买的属性
    const purchasedProps = allProperties.filter(p => p.isPurchased);
    const unpurchasedProps = allProperties.filter(p => !p.isPurchased);
    
    // 已购买的始终在前，未购买的按照session中保存的顺序显示
    const result = [...purchasedProps, ...unpurchasedProps];
    
    return result;
  }

  purchaseProperty(propertyIndex) {
    const player = this.players[0];
    const tile = player.currentTile;
    
    // 验证玩家是否在正确的城市
    // 确保玩家只能购买当前所在城市的地产
    if (!this.currentCityInfoTile || tile.stationName !== this.currentCityInfoTile.stationName) {
      this.log("只能购买当前所在城市的地产！", "#ef4444");
      return;
    }
    
    // Get the properties list
    const playerProperties = this.generatePlayerProperties(tile);
    if (propertyIndex >= playerProperties.length) return;
    
    const property = playerProperties[propertyIndex];
    
    // Check if already purchased
    if (property.isPurchased) {
      this.log("该家园已被购买", "#9ca3af");
      return;
    }
    
    // Check if player has enough money
    if (player.money < property.price) {
      this.log("资金不足，无法购买", "#ef4444");
      return;
    }
    
    // Update cache to mark as purchased - 使用property.index（原始索引）而不是排序后的propertyIndex
    const propertyRecord = getOrCreatePropertyId(tile.stationName, property.index);
    propertyRecord.purchasedBy = player.id;
    propertyRecord.purchasePrice = property.price;
    // 缓存已购买房产的完整数据，确保数据不再变动
    propertyRecord.cachedData = {
      level: property.level,
      price: property.price,
      income: property.income,
      playerId: property.playerId,
      playerName: property.playerName,
      avatar: property.avatar,
      homeName: property.homeName,
      isOnline: property.isOnline
    };
    
    // Purchase the property
    player.money -= property.price;
    player.assets += property.price;
    
    this.log(`${player.name} 购买了 ${property.homeName}！`, player.color === 0x3b82f6 ? "#60a5fa" : "#f87171");
    showToast(`🏠 ${player.name} 购买了 ${property.homeName}！`, "#22c55e");
    
    // Refresh the UI
    this.populatePropertiesAndBuildingsTab(tile);
    this.updateUI();
  }

  async populateCityInfoTab(tile) {
    const container = document.getElementById("city-llm-content");
    
    // Check cache first
    if (this.cityInfoCache && this.cityInfoCache[tile.stationName]) {
      container.innerHTML = this.cityInfoCache[tile.stationName];
      return;
    }
    
    // Check if already loading this city to prevent duplicate requests
    if (!this.cityInfoLoadingPromises) {
      this.cityInfoLoadingPromises = {};
    }
    
    if (this.cityInfoLoadingPromises[tile.stationName]) {
      // Already loading, wait for it to complete
      await this.cityInfoLoadingPromises[tile.stationName];
      // After loading completes, render from cache
      if (this.cityInfoCache && this.cityInfoCache[tile.stationName]) {
        container.innerHTML = this.cityInfoCache[tile.stationName];
      }
      return;
    }
    
    try {
      // Show loading state
      container.innerHTML = `
        <div class="text-center py-8">
          <div class="inline-block animate-spin">⏳</div>
          <p class="text-gray-600 mt-2">加载城市信息中...</p>
        </div>
      `;
      
      // Create a promise for this request and track it
      const loadPromise = this.generateCityInfoFromLLM(tile.stationName, tile.population, tile.level, container);
      this.cityInfoLoadingPromises[tile.stationName] = loadPromise;
      
      // Generate city info using LLM with streaming
      await loadPromise;
      
      // Clean up the loading promise
      delete this.cityInfoLoadingPromises[tile.stationName];
    } catch (error) {
      console.error("Error loading city info:", error);
      container.innerHTML = `
        <div class="text-center py-12">
          <p class="text-red-500 text-xl">加载城市信息失败</p>
          <p class="text-gray-500 mt-2">${error.message}</p>
        </div>
      `;
      // Clean up the loading promise
      delete this.cityInfoLoadingPromises[tile.stationName];
    }
  }

  async generateCityInfoFromLLM(cityName, population, level, container) {
    // Initialize Keepwork SDK if not already done
    if (!window.sdk) {
      window.sdk = new KeepworkSDK({
        timeout: 30000
      });
      console.log(`Keepwork SDK initialized token: ${window.sdk.token}`);
    }

    const prompt = `请用中文为我生成关于城市"${cityName}"的有趣信息。内容应该包括：
地理位置和特点（2-3句）
景或文化特色（2-3句）
点或特色（3-4个点）
化（2-3句）
议（2-3句）

kdown格式，包含标题、列表等。内容应该通俗易懂，有趣且准确。`;

    try {
      // Reuse a single session for all city info requests
      if (!window.sdk || !window.sdk.aiChat) {
        throw new Error("AI chat not available");
      }
      
      // Create session only once and reuse it
      if (!window.cityInfoChatSession) {
        window.cityInfoChatSession = window.sdk.aiChat.createSession({
          stream: true,
        });
      }
      
      const aiChatSession = window.cityInfoChatSession;

      // Use SDK aiChat session to send message and stream response
      let fullResponse = "";
      let lastRenderedResponse = "";
      
      const shouldRenderUpdate = (text) => {
        // Only render if we have at least one complete paragraph or line
        // Look for complete sentences ending with Chinese punctuation or newline
        const lastNewlineIdx = text.lastIndexOf('\n');
        const lastSentenceEnd = Math.max(
          text.lastIndexOf('。'),
          text.lastIndexOf('！'),
          text.lastIndexOf('？'),
          text.lastIndexOf('\n')
        );
        
        // Render if we have meaningful content since last render
        // and either have a complete sentence or significant new content
        const newContent = text.substring(lastRenderedResponse.length);
        const hasCompleteSentence = newContent.includes('。') || 
                                   newContent.includes('！') || 
                                   newContent.includes('？') ||
                                   newContent.includes('\n');
        const significantContent = newContent.length > 50;
        
        return hasCompleteSentence || significantContent;
      };
      
      const renderStreamingContent = (text) => {
        const htmlContent = this.markdownToHtml(text);
        container.innerHTML = htmlContent;
        lastRenderedResponse = text;
      };

      await aiChatSession.send(prompt, {
        onMessage: (partialText, fullResponse) => {
          if (partialText !== undefined && partialText !== null) {
            fullResponse = partialText;
            // Only render when we have complete sentences to avoid flickering
            if (shouldRenderUpdate(fullResponse)) {
              renderStreamingContent(fullResponse);
            }
          }
        },
        onComplete: (finalText, fullResponse) => {
          // Final render - always render complete content
          fullResponse = finalText || "";
          if (fullResponse) {
            renderStreamingContent(fullResponse);
            
            // Cache the final result
            if (!this.cityInfoCache) this.cityInfoCache = {};
            this.cityInfoCache[cityName] = this.markdownToHtml(fullResponse);
          }
        },
        onError: (error) => {
          throw error;
        },
      });
    } catch (error) {
      console.error("LLM Error:", error);
      // Fallback: render formatted HTML with generic info
      const fallbackContent = this.generateFallbackCityInfo(cityName);
      container.innerHTML = fallbackContent;
      
      // Cache the fallback result
      if (!this.cityInfoCache) this.cityInfoCache = {};
      this.cityInfoCache[cityName] = fallbackContent;
    }
  }

  markdownToHtml(markdown) {
    // Simple markdown to HTML converter
    let html = markdown;
    
    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3 class="text-2xl font-bold mt-4 mb-2 text-gray-800">$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2 class="text-3xl font-bold mt-6 mb-3 text-gray-900">$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1 class="text-4xl font-bold mt-8 mb-4 text-gray-900">$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong class="font-bold text-gray-900">$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em class="italic text-gray-700">$1</em>');
    html = html.replace(/_(.*?)_/g, '<em class="italic text-gray-700">$1</em>');
    
    // Lists
    html = html.replace(/^\* (.*?)$/gm, '<li class="ml-6 text-gray-700 mb-2">$1</li>');
    html = html.replace(/^- (.*?)$/gm, '<li class="ml-6 text-gray-700 mb-2">$1</li>');
    html = html.replace(/^\d+\. (.*?)$/gm, '<li class="ml-6 text-gray-700 mb-2">$1</li>');
    
    // Wrap consecutive lists
    html = html.replace(/(<li[^>]*>.*?<\/li>)/gs, (match) => {
      if (!match.includes('<ul') && !match.includes('<ol')) {
        return '<ul class="list-disc">' + match + '</ul>';
      }
      return match;
    });
    
    // Line breaks
    html = html.replace(/\n\n/g, '</p><p class="mb-4 text-gray-700">');
    html = html.replace(/\n/g, '<br>');
    
    // Wrap in paragraph tags if not already wrapped
    if (!html.includes('<p') && !html.includes('<h') && !html.includes('<ul')) {
      html = '<p class="mb-4 text-gray-700">' + html + '</p>';
    }
    
    return `<div class="prose prose-lg max-w-none">${html}</div>`;
  }

  generateFallbackCityInfo(cityName) {
    return `
      <div class="bg-blue-50 rounded-lg p-6">
        <h2 class="text-3xl font-bold mb-4 text-gray-900">🌍 ${cityName}</h2>
        <div class="space-y-4 text-gray-700">
          <p class="text-lg"><strong>📍 地理位置：</strong>这是一个充满活力的城市，拥有悠久的历史和现代的魅力。</p>
          <p class="text-lg"><strong>🏛️ 历史文化：</strong>城市融合了传统与现代，展现了独特的文化特色。</p>
          <p class="text-lg"><strong>🎯 主要景点：</strong></p>
          <ul class="list-disc ml-8 space-y-2">
            <li>历史遗迹和古建筑</li>
            <li>现代艺术和文化中心</li>
            <li>自然风景和公园</li>
            <li>繁华的商业街区</li>
          </ul>
          <p class="text-lg"><strong>🍜 美食文化：</strong>城市拥有丰富的美食文化，融合了传统和国际风味。</p>
          <p class="text-lg"><strong>✈️ 旅游建议：</strong>最佳访问季节是春季和秋季，建议停留3-5天以充分体验城市的魅力。</p>
        </div>
      </div>
    `;
  }

  async nextTurn() {
    // 时间推进（每两个回合（P1+COM各走一次）算一个月）
    // 这里每个玩家回合结束后，如果是COM回合结束，则推进一个月
    if (this.turn === 1) {
      // COM刚结束回合
      const needSettlement = this.advanceTime();
      if (needSettlement) {
        await this.performSettlement();
      }
    }

    this.turn = (this.turn + 1) % 2;
    this.startTurn();
  }

  updateUI() {
    const p1 = this.players[0];
    const com = this.players[1];
    document.getElementById("p1-money").innerText = p1.money.toLocaleString();
    document.getElementById("com-money").innerText = com.money.toLocaleString();

    // Update Binbougami Indicators
    const p1Binbougami = document.getElementById("p1-binbougami");
    const comBinbougami = document.getElementById("com-binbougami");

    if (this.players[0].hasBinbougami) p1Binbougami.classList.remove("hidden");
    else p1Binbougami.classList.add("hidden");

    if (this.players[1].hasBinbougami) comBinbougami.classList.remove("hidden");
    else comBinbougami.classList.add("hidden");

    // Update Hand Panel (for P1) - 只在玩家回合且状态为IDLE时显示（投掷骰子前）
    const handPanel = document.getElementById("card-hand-panel");
    const handContainer = document.getElementById("card-hand");

    if (this.turn === 0 && !this.players[0].isAI && this.players[0].cards.length > 0 && this.state === "IDLE") {
      handPanel.classList.remove("hidden");
      handContainer.innerHTML = "";
      this.players[0].cards.forEach((cardKey, index) => {
        const card = CARD_TYPES[cardKey];
        const div = document.createElement("div");
        div.className = `flex-shrink-0 w-16 h-20 bg-white rounded border-2 flex flex-col items-center justify-center cursor-pointer hover:scale-110 transition-transform card-rarity-${card.rarity}`;
        div.title = `${card.name}: ${card.desc}`;
        div.onclick = () => this.useCard(index);
        div.innerHTML = `<div class="text-2xl">${card.icon}</div><div class="text-[10px] font-bold truncate w-full text-center">${card.name}</div>`;
        handContainer.appendChild(div);
      });
    } else {
      handPanel.classList.add("hidden");
    }

    // 更新距离显示
    this.updateDistanceDisplay();
  }

  // --- Rendering Loop ---

  getScreenPosition(vec3) {
    const v = vec3.clone();
    v.project(this.camera);
    const x = (v.x * 0.5 + 0.5) * this.width;
    const y = (-(v.y * 0.5) + 0.5) * this.height;
    return { x, y };
  }

  centerCameraOnPlayer(player, duration = 500) {
    return new Promise((resolve) => {
      if (!player || !player.mesh) {
        resolve();
        return;
      }

      const targetPos = player.mesh.position.clone();
      const startTarget = this.controls.target.clone();
      const startCamPos = this.camera.position.clone();

      // Calculate camera offset from current target
      const offset = startCamPos.clone().sub(startTarget);
      const endCamPos = targetPos.clone().add(offset);

      const startTime = Date.now();

      const animateCamera = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);

        this.controls.target.lerpVectors(startTarget, targetPos, eased);
        this.camera.position.lerpVectors(startCamPos, endCamPos, eased);

        if (progress < 1) {
          requestAnimationFrame(animateCamera);
        } else {
          resolve();
        }
      };

      animateCamera();
    });
  }

  // Focus camera on a specific player by index (0 = P1, 1 = COM)
  focusOnPlayer(playerIndex) {
    if (this.mode !== "GAME") return;
    if (playerIndex < 0 || playerIndex >= this.players.length) return;

    const player = this.players[playerIndex];
    if (!player || !player.mesh) return;

    // Temporarily disable camera lock to allow manual focus
    this.cameraLocked = false;

    // Center camera on the selected player
    this.centerCameraOnPlayer(player, 400);
  }

  // 显示玩家详情弹窗
  showPlayerDetail(playerIndex) {
    if (playerIndex < 0 || playerIndex >= this.players.length) return;
    
    const player = this.players[playerIndex];
    this.currentDetailPlayer = playerIndex;
    
    const modal = document.getElementById("player-detail-modal");
    const content = document.getElementById("player-detail-content");
    const colorDiv = document.getElementById("player-detail-color");
    const nameEl = document.getElementById("player-detail-name");
    const binbougamiEl = document.getElementById("player-detail-binbougami");
    const moneyEl = document.getElementById("player-detail-money");
    const assetsEl = document.getElementById("player-detail-assets");
    const distanceEl = document.getElementById("player-detail-distance");
    const cardsEl = document.getElementById("player-detail-cards");
    
    // 设置边框颜色
    const borderColor = playerIndex === 0 ? "border-blue-400" : "border-red-400";
    content.className = `bg-gradient-to-b from-gray-900 to-gray-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full border-4 ${borderColor} relative`;
    
    // 设置颜色圆点
    colorDiv.style.backgroundColor = playerIndex === 0 ? "#60a5fa" : "#ef4444";
    
    // 设置名字
    nameEl.textContent = player.name;
    
    // 穷神状态
    if (player.hasBinbougami) {
      binbougamiEl.classList.remove("hidden");
    } else {
      binbougamiEl.classList.add("hidden");
    }
    
    // 设置数据
    moneyEl.textContent = "¥" + player.money.toLocaleString();
    assetsEl.textContent = "¥" + player.assets.toLocaleString();
    cardsEl.textContent = player.cards.length;
    
    // 距离
    if (this.destinationTile && player.currentTile) {
      const distance = this.calculateDistanceToDestination(player.currentTile);
      distanceEl.textContent = distance >= 0 ? distance + " 格" : "--";
    } else {
      distanceEl.textContent = "--";
    }
    
    modal.classList.remove("hidden");
  }
  
  // 关闭玩家详情弹窗
  closePlayerDetailModal() {
    document.getElementById("player-detail-modal").classList.add("hidden");
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Update Game Camera
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    // Note: World map iframe handles its own resize events

    this.renderer.setSize(this.width, this.height);
    
    // Mark viewport as dirty to force label/indicator recalculation
    this._viewportDirty = true;
    this._cameraDirty = true;
  }

  /**
   * Check if camera has moved significantly since last frame
   * Updates _cameraDirty flag if movement exceeds threshold
   */
  checkCameraChanged() {
    const camPos = this.camera.position;
    const target = this.controls ? this.controls.target : camPos;
    const zoom = this.camera.zoom || 1;

    // Check if camera position or target changed beyond threshold
    const posChanged = this._lastCameraPosition.distanceToSquared(camPos) > this._cameraChangeThreshold;
    const targetChanged = this._lastCameraTarget.distanceToSquared(target) > this._cameraChangeThreshold;
    const zoomChanged = Math.abs(this._lastCameraZoom - zoom) > 0.001;

    if (posChanged || targetChanged || zoomChanged || this._viewportDirty) {
      this._cameraDirty = true;
      this._lastCameraPosition.copy(camPos);
      this._lastCameraTarget.copy(target);
      this._lastCameraZoom = zoom;
      this._viewportDirty = false;
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // When in MAP mode, the iframe handles rendering - just skip
    if (this.mode === "MAP") {
      return;
    }

    // Camera Follow Logic
    if (this.cameraLocked) {
      const activePlayer = this.players[this.turn];
      if (activePlayer && activePlayer.mesh) {
        const targetPos = activePlayer.mesh.position;

        // Smoothly move both target and camera to maintain angle
        const currentTarget = this.controls.target.clone();
        const newTarget = currentTarget.clone().lerp(targetPos, 0.1);
        const delta = new THREE.Vector3().subVectors(newTarget, currentTarget);

        this.camera.position.add(delta);
        this.controls.target.copy(newTarget);
      }
    }

    if (this.controls) this.controls.update();

    // Update billboard labels to face camera
    // this.updateBillboardLabels(); // Removed in refactor

    // Check if camera has moved - optimize by only updating screen positions when needed
    this.checkCameraChanged();

    // Only update labels, indicators, and culling when camera has changed
    if (this._cameraDirty) {
      // Note: Station labels are now 3D Sprites that auto-billboard toward camera
      // No need to update HTML positions - they are rendered as part of the scene
      
      // Perform frustum culling on road/station chunks
      this.cullRoadChunks();

      // Update off-screen destination indicator
      this.updateDestinationIndicator();

      // Update Overlay Buttons if active
      const overlay = document.getElementById("direction-overlay");
      if (overlay) {
        Array.from(overlay.children).forEach((btn) => {
          if (btn.target3D) {
            const screenPos = this.getScreenPosition(btn.target3D);
            btn.style.left = `${screenPos.x}px`;
            btn.style.top = `${screenPos.y}px`;
          }
        });
      }

      // Perform frustum culling on terrain chunks (only when camera moved)
      if (this.terrainManager) {
        this.chunkCullStats = this.terrainManager.cullChunks(this.camera);
      }

      // Reset camera dirty flag after processing
      this._cameraDirty = false;
    }

    // Update terrain tiles based on camera position (already throttled internally)
    this.updateTerrainTiles();

    this.renderer.render(this.scene, this.camera);

    // Update render stats (FPS, triangles, draw calls)
    this.updateRenderStats();
  }
  
  /**
   * Perform frustum culling on road/station chunk groups
   * Hides chunks outside camera view for better performance
   * Tracks visibility changes for optimized label updates
   */
  cullRoadChunks() {
    if (!this.roadChunkGroups || this.roadChunkGroups.length === 0) return;
    
    // Reuse cached objects to avoid GC pressure
    if (!this._roadCullFrustum) {
      this._roadCullFrustum = new THREE.Frustum();
      this._roadCullMatrix = new THREE.Matrix4();
      this._roadCullSphere = new THREE.Sphere();
    }
    
    // Update frustum from camera
    this._roadCullMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this._roadCullFrustum.setFromProjectionMatrix(this._roadCullMatrix);
    
    let visible = 0;
    let culled = 0;
    let visibilityChanged = false;
    
    const chunks = this.worldScene ? this.worldScene.roadChunkGroups : [];
    for (const chunkGroup of chunks) {
      const center = chunkGroup.userData.chunkCenter;
      const radius = chunkGroup.userData.chunkRadius;
      let isVisible = true;

      if (center && radius) {
        this._roadCullSphere.set(center, radius);
        isVisible = this._roadCullFrustum.intersectsSphere(this._roadCullSphere);
      }
      
      // Track if visibility changed from last frame
      const wasVisible = chunkGroup.userData._wasVisible;
      if (wasVisible !== isVisible) {
        visibilityChanged = true;
        chunkGroup.userData._visibilityChanged = true;
      } else {
        chunkGroup.userData._visibilityChanged = false;
      }
      
      // Store current visibility for next frame comparison
      chunkGroup.userData._wasVisible = isVisible;
      chunkGroup.visible = isVisible;
      
      if (isVisible) {
        visible++;
      } else {
        culled++;
      }
    }
    
    // Update visible station labels (only process changed chunks + currently visible)
    if (this.worldScene) {
      this.worldScene.updateVisibleStationLabels(this.camera);
    }
    
    // Update road chunk culling stats (optional, for debugging)
    this.roadChunkCullStats = { visible, culled };
  }

  updateRenderStats() {
    this.frameCount++;
    const now = performance.now();
    
    // Update stats every 500ms
    if (now - this.lastStatsUpdate >= 500) {
      const elapsed = now - this.lastFrameTime;
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFrameTime = now;
      this.lastStatsUpdate = now;
      
      // Get renderer info
      const info = this.renderer.info;
      const triangles = info.render.triangles;
      const drawCalls = info.render.calls;
      
      // Update DOM
      document.getElementById('stats-fps').textContent = this.fps;
      document.getElementById('stats-triangles').textContent = triangles.toLocaleString();
      document.getElementById('stats-drawcalls').textContent = drawCalls;
      
      // Update chunk culling stats
      if (this.chunkCullStats) {
        const total = this.chunkCullStats.visible + this.chunkCullStats.culled;
        document.getElementById('stats-chunks-visible').textContent = this.chunkCullStats.visible;
        document.getElementById('stats-chunks-total').textContent = total;
      }
    }
  }

  // Throttled terrain tile update
  async updateTerrainTiles() {
    if (!this.terrainManager || this.mode !== "GAME") return;
    
    // Throttle updates to avoid excessive loading
    const now = Date.now();
    if (this._lastTerrainUpdate && now - this._lastTerrainUpdate < 1000) return;
    this._lastTerrainUpdate = now;
    
    // Calculate camera center in lon/lat
    const target = this.controls.target;
    
    // Convert world position back to lon/lat
   const gridX = target.x / TILE_SIZE;
    const gridZ = target.z / TILE_SIZE;
    
    const centerLon = this.mapCenterLon + gridX / this.configScale;
    const centerLat = this.mapCenterLat - gridZ / this.configScale;
    
    // Update visible terrain tiles - returns true if any tiles changed
    const tilesChanged = await this.terrainManager.updateVisibleTiles(centerLon, centerLat, this.configScale);
    
    // If terrain tiles were loaded/created/changed visibility, mark camera dirty for frustum culling
    if (tilesChanged) {
      this._cameraDirty = true;
    }
  }
}
