/* ============================================================
   黑毛红瞳小猫 - 互动系统
   ============================================================ */

// 小猫状态
const Cat = {
  el: null,
  state: 'idle', // idle, happy, sleepy, sleeping, curious, love, surprised, shy, playing
  mood: 50, // 0-100
  energy: 80, // 0-100
  affection: 0, // 累计互动次数
  blinkTimer: null,
  stateTimer: null,
  bubbleTimer: null,
  
  // 话语库
  speeches: {
    idle: [
      '主人在听什么歌呀~',
      '今天天气好好喵~',
      '想被摸摸头...',
      '主人~理理我嘛',
      '♪ 哼着小曲儿~',
      '困了...zzZ',
      '主人今天也要开心哦！',
      '想吃小鱼干...',
      '主人的歌单好好听！',
      '喵~',
    ],
    happy: [
      '开心！主人摸我了！',
      '喵呜~好舒服~',
      '再摸摸！还要！',
      '咕噜咕噜~',
      '好幸福呀~',
      '主人最好了！',
    ],
    sleepy: [
      '好困...主人...',
      '让我打个盹...',
      'zzZ...小鱼干...',
      '困了困了...',
    ],
    sleeping: [
      '...zzZ...',
      '...(打呼噜)...',
      '...小鱼干...是我的...',
    ],
    curious: [
      '咦？那是什么？',
      '主人在干嘛呀？',
      '这首歌好耳熟！',
      '让我康康~',
      '有新歌吗？',
    ],
    love: [
      '最喜欢主人了！',
      '喵~爱你哦~',
      '主人是我的！',
      '好喜欢好喜欢~',
      '心跳好快...',
    ],
    surprised: [
      '哇！吓我一跳！',
      '喵！！',
      '什么什么？',
      '发生什么了？！',
    ],
    shy: [
      '才、才没有害羞！',
      '别、别看我...',
      '呜...好羞...',
      '主人别逗我了...',
    ],
    playing: [
      '来抓我呀~',
      '抓不到抓不到~',
      '喵哈哈~',
      '一起玩！',
    ],
    click: [
      '喵？',
      '怎么了？',
      '主人~',
      '嘿嘿~',
      '摸摸头~',
    ],
    song: [
      '这首歌好听！',
      '跟着节奏摇~',
      '♪ ♫ ♪',
      '主人品味真好！',
      '想跳舞~',
    ],
  },

  // 初始化
  init() {
    this.el = document.getElementById('catMascot');
    if (!this.el) return;
    
    // 绑定事件
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('mouseenter', () => this.onHover());
    this.el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onTouch();
    }, { passive: false });
    
    // 开始眨眼
    this.startBlinking();
    
    // 随机状态变化
    this.startRandomStates();
    
    // 初始打招呼
    setTimeout(() => this.speak('idle'), 2000);
    
    console.log('[Cat] 初始化完成');
  },

  // 切换状态
  setState(state, duration = 3000) {
    if (this.stateTimer) clearTimeout(this.stateTimer);
    
    // 移除旧状态
    this.el.classList.remove(this.state);
    
    // 设置新状态
    this.state = state;
    this.el.classList.add(state);
    
    // 自动恢复
    if (state !== 'idle' && state !== 'sleeping') {
      this.stateTimer = setTimeout(() => {
        this.setState('idle');
      }, duration);
    }
  },

  // 说话
  speak(category, customText) {
    const bubble = this.el.querySelector('.cat-bubble');
    if (!bubble) return;
    
    const texts = this.speeches[category] || this.speeches.idle;
    const text = customText || texts[Math.floor(Math.random() * texts.length)];
    
    bubble.textContent = text;
    bubble.classList.add('show');
    
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => {
      bubble.classList.remove('show');
    }, 3000);
  },

  // 产生粒子
  emitParticles(type = 'hearts') {
    const container = this.el.querySelector('.cat-particles');
    if (!container) return;
    
    const emojis = {
      hearts: ['💖', '💕', '💗', '❤️'],
      stars: ['⭐', '✨', '🌟', '💫'],
      notes: ['🎵', '🎶', '♪', '♫'],
      sparkles: ['✨', '💫', '⚡', '🌟'],
    };
    
    const items = emojis[type] || emojis.hearts;
    
    for (let i = 0; i < 5; i++) {
      const p = document.createElement('div');
      p.className = 'cat-particle';
      p.textContent = items[Math.floor(Math.random() * items.length)];
      p.style.setProperty('--tx', (Math.random() - 0.5) * 40 + 'px');
      p.style.left = Math.random() * 40 + 10 + 'px';
      p.style.animationDelay = (i * 0.1) + 's';
      container.appendChild(p);
      setTimeout(() => p.remove(), 1500);
    }
  },

  // 点击事件
  onClick(e) {
    this.affection++;
    this.mood = Math.min(100, this.mood + 5);
    
    // 根据心情选择反应
    if (this.state === 'sleeping') {
      this.setState('surprised', 1500);
      this.speak('surprised');
      return;
    }
    
    if (this.mood > 80) {
      this.setState('love', 2000);
      this.speak('love');
      this.emitParticles('hearts');
    } else if (this.affection % 5 === 0) {
      this.setState('happy', 2000);
      this.speak('happy');
      this.emitParticles('stars');
    } else {
      this.speak('click');
      this.setState('happy', 1500);
      this.emitParticles('hearts');
    }
    
    // 播放音效
    if (typeof SFX !== 'undefined') SFX.pop();
  },

  // 悬停事件
  onHover() {
    if (this.state === 'sleeping') return;
    this.setState('curious', 2000);
    this.speak('curious');
  },

  // 触摸事件
  onTouch() {
    this.affection += 2;
    this.mood = Math.min(100, this.mood + 10);
    
    this.setState('pet', 1500);
    this.speak('happy');
    this.emitParticles('hearts');
    
    // 挥爪
    setTimeout(() => {
      this.el.classList.add('wave');
      setTimeout(() => this.el.classList.remove('wave'), 1500);
    }, 300);
  },

  // 眨眼
  startBlinking() {
    const blink = () => {
      if (this.state === 'sleeping') return;
      this.el.classList.add('blink');
      setTimeout(() => this.el.classList.remove('blink'), 150);
    };
    
    const scheduleNext = () => {
      const delay = 2000 + Math.random() * 4000;
      this.blinkTimer = setTimeout(() => {
        blink();
        scheduleNext();
      }, delay);
    };
    
    scheduleNext();
  },

  // 随机状态变化
  startRandomStates() {
    const states = ['curious', 'sleepy', 'playing', 'shy'];
    
    setInterval(() => {
      if (this.state !== 'idle') return;
      if (Math.random() > 0.3) return; // 30% 概率触发
      
      const newState = states[Math.floor(Math.random() * states.length)];
      this.setState(newState, 3000);
      this.speak(newState);
      
      if (newState === 'playing') {
        this.emitParticles('sparkles');
        this.el.classList.add('jump');
        setTimeout(() => this.el.classList.remove('jump'), 600);
      }
    }, 8000);
  },

  // 歌曲播放时反应
  onSongPlay(songName) {
    this.setState('happy', 3000);
    this.speak('song');
    this.emitParticles('notes');
  },

  // 歌曲暂停时反应
  onSongPause() {
    this.setState('sleepy', 2000);
    this.speak('sleepy');
  },

  // 能量系统
  updateEnergy() {
    this.energy = Math.max(0, this.energy - 0.1);
    if (this.energy < 20 && this.state === 'idle') {
      this.setState('sleeping');
      this.speak('sleeping');
    }
  },

  // 喂食（增加能量）
  feed() {
    this.energy = Math.min(100, this.energy + 30);
    this.mood = Math.min(100, this.mood + 20);
    this.setState('happy', 2000);
    this.speak('happy', '好好吃！谢谢主人！');
    this.emitParticles('hearts');
  },

  // 玩耍
  play() {
    this.energy = Math.max(0, this.energy - 20);
    this.mood = Math.min(100, this.mood + 15);
    this.setState('playing', 3000);
    this.speak('playing');
    this.emitParticles('sparkles');
  },

  // 销毁
  destroy() {
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (this.stateTimer) clearTimeout(this.stateTimer);
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
  }
};

// 导出给其他模块使用
window.Cat = Cat;
