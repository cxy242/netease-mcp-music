/* ============================================================
   一起听 - 黑毛红瞳小猫 互动系统 超级版
   ============================================================ */

const ListenCat = {
  el: null,
  state: 'idle',
  mood: 60,
  energy: 80,
  affection: 0,
  menuOpen: false,
  blinkTimer: null,
  stateTimer: null,
  bubbleTimer: null,
  danceTimer: null,

  // ====== 话语库 ======
  speeches: {
    idle: [
      '主人在听什么歌呀~',
      '今天也要开心哦！',
      '想被摸摸头...',
      '主人~理理我嘛',
      '♪ 哼着小曲儿~',
      '困了...zzZ',
      '想吃小鱼干...',
      '主人的歌单好好听！',
      '喵~',
      '这首歌好耳熟~',
      '主人今天心情怎么样？',
      '陪主人一起听~',
      '嘿嘿，主人最棒了！',
      '想和主人一起跳舞~',
      '主人累不累呀？',
    ],
    happy: [
      '开心！主人摸我了！',
      '喵呜~好舒服~',
      '再摸摸！还要！',
      '咕噜咕噜~',
      '好幸福呀~',
      '主人最好了！',
      '开心到转圈圈~',
      '喵喵喵~',
    ],
    sleepy: [
      '好困...主人...',
      '让我打个盹...',
      'zzZ...小鱼干...',
      '困了困了...',
      '眼皮好重...',
    ],
    sleeping: [
      '...zzZ...',
      '...(打呼噜)...',
      '...小鱼干...是我的...',
      '...主人...',
    ],
    curious: [
      '咦？那是什么？',
      '主人在干嘛呀？',
      '这首歌好耳熟！',
      '让我康康~',
      '有新歌吗？',
      '主人在看什么？',
      '好奇~',
    ],
    love: [
      '最喜欢主人了！',
      '喵~爱你哦~',
      '主人是我的！',
      '好喜欢好喜欢~',
      '心跳好快...',
      '想一直陪着主人~',
      '主人~抱抱~',
    ],
    surprised: [
      '哇！吓我一跳！',
      '喵！！',
      '什么什么？',
      '发生什么了？！',
      '主人你干嘛！',
    ],
    shy: [
      '才、才没有害羞！',
      '别、别看我...',
      '呜...好羞...',
      '主人别逗我了...',
      '脸好红...',
    ],
    playing: [
      '来抓我呀~',
      '抓不到抓不到~',
      '喵哈哈~',
      '一起玩！',
      '再来再来！',
    ],
    click: [
      '喵？',
      '怎么了？',
      '主人~',
      '嘿嘿~',
      '摸摸头~',
      '有事吗？',
    ],
    song: [
      '这首歌好听！',
      '跟着节奏摇~',
      '♪ ♫ ♪',
      '主人品味真好！',
      '想跳舞~',
      '好好听！',
      '再放一遍！',
    ],
    feed: [
      '好好吃！谢谢主人！',
      '小鱼干！最爱了！',
      '吃饱饱~',
      '主人最好了~',
    ],
    pet: [
      '咕噜咕噜~',
      '好舒服~',
      '继续继续~',
      '喵~',
      '再摸摸~',
    ],
  },

  // ====== 初始化 ======
  init() {
    this.el = document.getElementById('listenCat');
    if (!this.el) return;

    // 绑定事件
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('dblclick', (e) => this.onDoubleclick(e));
    this.el.addEventListener('mouseenter', () => this.onHover());
    this.el.addEventListener('mouseleave', () => this.onLeave());
    this.el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onTouch();
    }, { passive: false });

    // 长按
    let longPressTimer;
    this.el.addEventListener('mousedown', () => {
      longPressTimer = setTimeout(() => this.onLongPress(), 500);
    });
    this.el.addEventListener('mouseup', () => clearTimeout(longPressTimer));
    this.el.addEventListener('mouseleave', () => clearTimeout(longPressTimer));

    // 开始系统
    this.startBlinking();
    this.startRandomStates();
    this.startMoodDecay();

    // 初始打招呼
    setTimeout(() => this.speak('idle'), 1500);

    console.log('[ListenCat] 初始化完成');
  },

  // ====== 状态切换 ======
  setState(state, duration = 3000) {
    if (this.stateTimer) clearTimeout(this.stateTimer);

    // 移除旧状态
    this.el.classList.remove(this.state);

    // 设置新状态
    this.state = state;
    this.el.classList.add(state);

    // 自动恢复
    if (state !== 'idle' && state !== 'sleeping' && state !== 'dancing') {
      this.stateTimer = setTimeout(() => {
        this.setState('idle');
      }, duration);
    }
  },

  // ====== 说话 ======
  speak(category, customText) {
    const bubble = this.el.querySelector('.lc-bubble');
    if (!bubble) return;

    const texts = this.speeches[category] || this.speeches.idle;
    const text = customText || texts[Math.floor(Math.random() * texts.length)];

    bubble.textContent = text;
    bubble.classList.add('show');

    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => {
      bubble.classList.remove('show');
    }, 3500);
  },

  // ====== 粒子效果 ======
  emitParticles(type = 'hearts') {
    const container = this.el.querySelector('.lc-particles');
    if (!container) return;

    const emojis = {
      hearts: ['💖', '💕', '💗', '❤️', '💝'],
      stars: ['⭐', '✨', '🌟', '💫', '⚡'],
      notes: ['🎵', '🎶', '♪', '♫', '🎼'],
      sparkles: ['✨', '💫', '🌟', '⭐', '💥'],
      zzz: ['💤', '😴', '🌙'],
      fish: ['🐟', '🐠', '🐡'],
      paws: ['🐾', '🐱', '🐈'],
    };

    const items = emojis[type] || emojis.hearts;

    for (let i = 0; i < 6; i++) {
      const p = document.createElement('div');
      p.className = 'lc-particle';
      p.textContent = items[Math.floor(Math.random() * items.length)];
      p.style.setProperty('--tx', (Math.random() - 0.5) * 50 + 'px');
      p.style.setProperty('--rot', (Math.random() - 0.5) * 60 + 'deg');
      p.style.left = Math.random() * 50 + 15 + 'px';
      p.style.animationDelay = (i * 0.12) + 's';
      container.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  },

  // ====== 点击事件 ======
  onClick(e) {
    this.affection++;
    this.mood = Math.min(100, this.mood + 8);

    if (this.state === 'sleeping') {
      this.setState('surprised', 1500);
      this.speak('surprised');
      return;
    }

    if (this.mood > 85) {
      this.setState('love', 2500);
      this.speak('love');
      this.emitParticles('hearts');
    } else if (this.affection % 4 === 0) {
      this.setState('happy', 2000);
      this.speak('happy');
      this.emitParticles('stars');
      // 跳跃
      this.el.classList.add('jump');
      setTimeout(() => this.el.classList.remove('jump'), 700);
    } else {
      this.speak('click');
      this.setState('happy', 1500);
      this.emitParticles('hearts');
    }

    if (typeof SFX !== 'undefined') SFX.pop();
  },

  // 双击
  onDoubleclick(e) {
    e.preventDefault();
    this.affection += 3;
    this.mood = Math.min(100, this.mood + 15);
    this.setState('love', 3000);
    this.speak('love', '最喜欢主人了！💖');
    this.emitParticles('hearts');
    this.emitParticles('sparkles');
  },

  // 悬停
  onHover() {
    if (this.state === 'sleeping') return;
    this.setState('curious', 2000);
    this.speak('curious');
    // 显示互动菜单
    this.showMenu();
  },

  // 离开
  onLeave() {
    // 隐藏菜单
    setTimeout(() => this.hideMenu(), 2000);
  },

  // 触摸
  onTouch() {
    this.affection += 2;
    this.mood = Math.min(100, this.mood + 12);

    this.setState('pet', 2000);
    this.speak('pet');
    this.emitParticles('hearts');

    // 挥爪
    setTimeout(() => {
      this.el.classList.add('wave');
      setTimeout(() => this.el.classList.remove('wave'), 2400);
    }, 300);
  },

  // 长按 - 撒娇
  onLongPress() {
    this.affection += 5;
    this.mood = Math.min(100, this.mood + 20);
    this.setState('love', 3000);
    this.speak('love', '主人~抱抱~');
    this.emitParticles('hearts');
    this.emitParticles('hearts');
  },

  // ====== 互动菜单 ======
  showMenu() {
    const menu = this.el.querySelector('.lc-menu');
    if (menu) menu.classList.add('show');
  },

  hideMenu() {
    const menu = this.el.querySelector('.lc-menu');
    if (menu) menu.classList.remove('show');
  },

  // 喂食
  feed() {
    this.energy = Math.min(100, this.energy + 30);
    this.mood = Math.min(100, this.mood + 25);
    this.setState('happy', 2500);
    this.speak('feed');
    this.emitParticles('fish');
    this.hideMenu();
  },

  // 玩耍
  play() {
    this.energy = Math.max(0, this.energy - 15);
    this.mood = Math.min(100, this.mood + 20);
    this.setState('playing', 3000);
    this.speak('playing');
    this.emitParticles('paws');
    this.hideMenu();
  },

  // 摸摸
  pet() {
    this.mood = Math.min(100, this.mood + 10);
    this.setState('pet', 2000);
    this.speak('pet');
    this.emitParticles('hearts');
    this.hideMenu();
  },

  // 睡觉
  sleep() {
    this.setState('sleeping');
    this.speak('sleeping');
    this.emitParticles('zzz');
    this.hideMenu();
  },

  // 跳舞
  dance() {
    this.energy = Math.max(0, this.energy - 10);
    this.mood = Math.min(100, this.mood + 15);
    this.setState('dancing', 5000);
    this.speak('song');
    this.emitParticles('notes');
    this.hideMenu();
  },

  // ====== 眨眼 ======
  startBlinking() {
    const blink = () => {
      if (this.state === 'sleeping') return;
      this.el.classList.add('blink');
      setTimeout(() => this.el.classList.remove('blink'), 180);
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

  // ====== 随机状态 ======
  startRandomStates() {
    const states = ['curious', 'sleepy', 'playing', 'shy'];

    setInterval(() => {
      if (this.state !== 'idle') return;
      if (Math.random() > 0.25) return;

      const newState = states[Math.floor(Math.random() * states.length)];
      this.setState(newState, 3000);
      this.speak(newState);

      if (newState === 'playing') {
        this.emitParticles('sparkles');
        this.el.classList.add('jump');
        setTimeout(() => this.el.classList.remove('jump'), 700);
      }
    }, 10000);
  },

  // ====== 心情衰减 ======
  startMoodDecay() {
    setInterval(() => {
      this.mood = Math.max(0, this.mood - 0.5);
      this.energy = Math.max(0, this.energy - 0.2);

      // 更新心情条
      const fill = this.el.querySelector('.lc-mood-fill');
      if (fill) fill.style.width = this.mood + '%';

      // 自动困了
      if (this.energy < 25 && this.state === 'idle') {
        this.setState('sleepy', 3000);
        this.speak('sleepy');
      }

      // 自动睡着
      if (this.energy < 10 && this.state === 'sleepy') {
        this.setState('sleeping');
        this.speak('sleeping');
      }
    }, 5000);
  },

  // ====== 音乐联动 ======
  onSongPlay(songName) {
    this.mood = Math.min(100, this.mood + 10);
    this.setState('dancing', 4000);
    this.speak('song');
    this.emitParticles('notes');
  },

  onSongPause() {
    if (this.state === 'dancing') {
      this.setState('idle');
    }
  },

  // ====== 销毁 ======
  destroy() {
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (this.stateTimer) clearTimeout(this.stateTimer);
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    if (this.danceTimer) clearTimeout(this.danceTimer);
  }
};

window.ListenCat = ListenCat;
