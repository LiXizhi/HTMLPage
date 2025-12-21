/**
 * DiceAnimation - 3D骰子动画类
 */
export class DiceAnimation {
  constructor() {
    this.modal = document.getElementById('dice-modal');
    this.stage = document.getElementById('dice-stage');
    this.camera = document.getElementById('dice-camera');
    this.resultEl = document.getElementById('dice-result');
    this.resultValueEl = document.getElementById('dice-result-value');
    
    this.isRolling = false;
    this.duration = 1200; // Animation duration in ms
    
    // Target rotations for each dice face (which face lands up)
    this.targetRotations = {
      1: { x: 90, y: 0, z: 0 },   
      2: { x: 0, y: 0, z: 0 },    
      3: { x: 0, y: 0, z: 90 },   
      4: { x: 0, y: 0, z: -90 },  
      5: { x: 180, y: 0, z: 0 },  
      6: { x: -90, y: 0, z: 0 },  
    };
    
    // Dot positions for each face value (0-8 grid positions)
    this.dotMap = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8]
    };
  }
  
  /**
   * Create HTML for a single dice face
   * @param {number} number - Face value (1-6)
   * @returns {string} HTML string
   */
  _createFaceHTML(number) {
    const activeDots = this.dotMap[number] || [];
    let dotsHTML = '';
    for (let i = 0; i < 9; i++) {
      if (activeDots.includes(i)) {
        dotsHTML += `<div class="die-dot" style="grid-area: ${Math.floor(i / 3) + 1} / ${(i % 3) + 1}"></div>`;
      }
    }
    return `<div class="die-face die-face-${number}">${dotsHTML}</div>`;
  }
  
  /**
   * Render dice elements
   * @param {number} count - Number of dice
   */
  _renderDice(count) {
    this.camera.innerHTML = '';
    const spacing = 20;
    
    for (let i = 0; i < count; i++) {
      const dieWrapper = document.createElement('div');
      dieWrapper.className = 'die-wrapper';
      dieWrapper.style.transform = `translate3d(${i * spacing}px, 0, ${i * -spacing}px)`;
      
      const die = document.createElement('div');
      die.className = 'die';
      die.dataset.index = i;
      
      // Create all 6 faces
      let facesHTML = '';
      [1, 6, 2, 5, 3, 4].forEach(n => facesHTML += this._createFaceHTML(n));
      die.innerHTML = facesHTML;
      
      dieWrapper.appendChild(die);
      
      // Add shadow
      const shadow = document.createElement('div');
      shadow.className = 'die-shadow';
      dieWrapper.appendChild(shadow);
      
      this.camera.appendChild(dieWrapper);
    }
  }
  
  /**
   * Generate random result for a single die
   * @returns {Object} Result with value and rotation angles
   */
  _generateResult() {
    const val = Math.ceil(Math.random() * 6);
    const base = this.targetRotations[val];
    const spins = 2 + Math.floor(Math.random() * 3);
    
    return {
      value: val,
      x: base.x + (spins * 360),
      y: base.y + (Math.floor(Math.random() * 2) * 360),
      z: base.z + (spins * 360)
    };
  }
  
  /**
   * Roll dice with animation
   * @param {number} diceCount - Number of dice to roll
   * @returns {Promise<{results: number[], total: number}>}
   */
  roll(diceCount = 1) {
    return new Promise((resolve) => {
      if (this.isRolling) {
        resolve({ results: [], total: 0 });
        return;
      }
      
      this.isRolling = true;
      
      // Render dice
      this._renderDice(diceCount);
      
      // Show modal
      this.modal.classList.add('show');
      this.resultEl.classList.remove('show');
      
      // Reset and trigger fly-in animation
      this.stage.classList.remove('entering');
      void this.stage.offsetWidth; // Force reflow
      this.stage.classList.add('entering');
      
      // Generate results
      const results = [];
      let total = 0;
      for (let i = 0; i < diceCount; i++) {
        const res = this._generateResult();
        results.push(res);
        total += res.value;
      }
      
      // Apply rotation animations
      const diceEls = this.camera.querySelectorAll('.die');
      const easing = "cubic-bezier(0.1, 0.9, 0.2, 1)";
      
      diceEls.forEach((die, idx) => {
        const target = results[idx];
        die.style.transition = `transform ${this.duration}ms ${easing}`;
        die.style.transform = `rotateX(${target.x}deg) rotateY(${target.y}deg) rotateZ(${target.z}deg)`;
      });
      
      // Show result after animation
      setTimeout(() => {
        this.resultValueEl.textContent = total;
        this.resultEl.classList.add('show');
      }, this.duration);
      
      // Hide modal and resolve after showing result

      setTimeout(() => {
        this.isRolling = false;
        this.modal.classList.remove('show');
        this.stage.classList.remove('entering');
        
        resolve({ 
          results: results.map(r => r.value), 
          total: total 
        });
      }, this.duration + 800);
    });
  }
  
  /**
   * Set animation duration
   * @param {number} ms - Duration in milliseconds
   */
  setDuration(ms) {
    this.duration = Math.max(500, ms);
  }
}

// Create global dice animation instance
const diceAnimation = new DiceAnimation();
