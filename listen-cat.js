/* ============================================================
   一起听 - 黑毛红瞳小猫 互动系统 超级版 v2
   更多话语 + 更多互动 + 更完善系统
   ============================================================ */

const ListenCat = {
  el: null,
  state: 'idle',
  mood: 60,
  energy: 80,
  affection: 0,
  blinkTimer: null,
  stateTimer: null,
  bubbleTimer: null,

  // ====== 话语库 - 40+条 ======
  speeches: {
    idle: [
      '主人在听什么歌呀~',
      '今天也要开心哦！',
      '想被摸摸头...',
      '主人~理理我嘛',
      '♪ 哼着小曲儿~',
      '想吃小鱼干...',
      '主人的歌单好好听！',
      '喵~',
      '这首歌好耳熟~',
      '主人今天心情怎么样？',
      '陪主人一起听~',
      '嘿嘿，主人最棒了！',
      '想和主人一起跳舞~',
      '主人累不累呀？',
      '外面天气好吗？',
      '主人喝水了吗？',
      '好无聊呀~',
      '主人在干嘛~',
      '想出去玩...',
      '喵喵~',
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
      '尾巴摇得停不下来~',
      '好开心好开心！',
    ],
    sleepy: [
      '好困...主人...',
      '让我打个盹...',
      'zzZ...小鱼干...',
      '困了困了...',
      '眼皮好重...',
      '想睡觉了...',
    ],
    sleeping: [
      '...zzZ...',
      '...(打呼噜)...',
      '...小鱼干...是我的...',
      '...主人...别走...',
      '...zzZ...好暖...',
    ],
    curious: [
      '咦？那是什么？',
      '主人在干嘛呀？',
      '这首歌好耳熟！',
      '让我康康~',
      '有新歌吗？',
      '主人在看什么？',
      '好奇~',
      '这是什么味道？',
    ],
    love: [
      '最喜欢主人了！',
      '喵~爱你哦~',
      '主人是我的！',
      '好喜欢好喜欢~',
      '心跳好快...',
      '想一直陪着主人~',
      '主人~抱抱~',
      '你是我的全世界~',
      '喵~好想蹭蹭你~',
      '主人~亲亲~',
    ],
    surprised: [
      '哇！吓我一跳！',
      '喵！！',
      '什么什么？',
      '发生什么了？！',
      '主人你干嘛！',
      '吓死猫了！',
    ],
    shy: [
      '才、才没有害羞！',
      '别、别看我...',
      '呜...好羞...',
      '主人别逗我了...',
      '脸好红...',
      '人家会不好意思的...',
    ],
    playing: [
      '来抓我呀~',
      '抓不到抓不到~',
      '喵哈哈~',
      '一起玩！',
      '再来再来！',
      '你追我呀~',
    ],
    click: [
      '喵？',
      '怎么了？',
      '主人~',
      '嘿嘿~',
      '摸摸头~',
      '有事吗？',
      '我在这里~',
      '怎么啦？',
    ],
    song: [
      '这首歌好听！',
      '跟着节奏摇~',
      '♪ ♫ ♪',
      '主人品味真好！',
      '想跳舞~',
      '好好听！',
      '再放一遍！',
      '这首歌好甜~',
      '音乐真好~',
      '跟着唱~喵喵喵~',
    ],
    feed: [
      '好好吃！谢谢主人！',
      '小鱼干！最爱了！',
      '吃饱饱~',
      '主人最好了~',
      '还要还要！',
      '好满足~',
    ],
    pet: [
      '咕噜咕噜~',
      '好舒服~',
      '继续继续~',
      '喵~',
      '再摸摸~',
      '这里也要~',
      '呼噜呼噜~',
    ],
    dance: [
      '跳起来~',
      '左摇摇右摇摇~',
      '跟着音乐动~',
      '喵~跳舞好开心~',
    ],
    miss: [
      '主人好久没理我了...',
      '是不是忘记我了？',
      '好想主人...',
      '主人~看看我嘛...',
    ],
  },

  // ====== 初始化 ======
  init() {
    this.el = document.getElementById('listenCat');
    if (!this.el) return;

    // 绑定事件
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('.lc-menu')) return;
      this.onClick();
    });
    this.el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.onDoubleclick();
    });
    this.el.addEventListener('mouseenter', () => this.onHover());
    this.el.addEventListener('mouseleave', () => this.onLeave());
    this.el.addEventListener('touchstart', (e) => {
      if (e.target.closest('.lc-menu')) return;
      e.preventDefault();
      this.onTouch();
    }, { passive: false });

    // 长按
    let lpTimer;
    this.el.addEventListener('mousedown', () => {
      lpTimer = setTimeout(() => this.onLongPress(), 500);
    });
    this.el.addEventListener('mouseup', () => clearTimeout(lpTimer));
    this.el.addEventListener('mouseleave', () => clearTimeout(lpTimer));

    // 开始系统
    this.startBlinking();
    this.startRandomStates();
    this.startMoodDecay();

    // 初始打招呼
    setTimeout(() => this.speak('idle'), 1200);
  },

  // ====== 状态切换 ======
  setState(state, duration = 3000) {
    if (this.stateTimer) clearTimeout(this.stateTimer);
    this.el.classList.remove(this.state);
    this.state = state;
    this.el.classList.add(state);
    if (state !== 'idle' && state !== 'sleeping' && state !== 'dancing') {
      this.stateTimer = setTimeout(() => this.setState('idle'), duration);
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
    this.bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 3500);
  },

  // ====== 粒子效果 ======
  emitParticles(type = 'hearts') {
    const container = this.el.querySelector('.lc-particles');
    if (!container) return;
    const emojis = {
      hearts: ['💖', '💕', '💗', '❤️', '💝'],
      stars: ['⭐', '✨', '🌟', '💫'],
      notes: ['🎵', '🎶', '♪', '♫'],
      sparkles: ['✨', '💫', '⚡', '🌟'],
      zzz: ['💤', '😴', '🌙'],
      fish: ['🐟', '🐠', '🐡'],
      paws: ['🐾', '🐱'],
    };
    const items = emojis[type] || emojis.hearts;
    for (let i = 0; i < 5; i++) {
      const p = document.createElement('div');
      p.className = 'lc-particle';
      p.textContent = items[Math.floor(Math.random() * items.length)];
      p.style.setProperty('--tx', (Math.random() - 0.5) * 40 + 'px');
      p.style.setProperty('--rot', (Math.random() - 0.5) * 50 + 'deg');
      p.style.left = Math.random() * 40 + 15 + 'px';
      p.style.animationDelay = (i * 0.1) + 's';
      container.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
  },

  // ====== 点击 ======
  onClick() {
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
      this.el.classList.add('jump');
      setTimeout(() => this.el.classList.remove('jump'), 600);
    } else {
      this.speak('click');
      this.setState('happy', 1500);
      this.emitParticles('hearts');
    }
    if (typeof SFX !== 'undefined') SFX.pop();
  },

  onDoubleclick() {
    this.affection += 3;
    this.mood = Math.min(100, this.mood + 15);
    this.setState('love', 3000);
    this.speak('love', '最喜欢主人了！💖');
    this.emitParticles('hearts');
    this.emitParticles('sparkles');
  },

  onHover() {
    if (this.state === 'sleeping') return;
    this.setState('curious', 2000);
    this.speak('curious');
    this.showMenu();
  },

  onLeave() {
    setTimeout(() => this.hideMenu(), 2000);
  },

  onTouch() {
    this.affection += 2;
    this.mood = Math.min(100, this.mood + 12);
    this.setState('pet', 2000);
    this.speak('pet');
    this.emitParticles('hearts');
    setTimeout(() => {
      this.el.classList.add('wave');
      setTimeout(() => this.el.classList.remove('wave'), 2000);
    }, 200);
  },

  onLongPress() {
    this.affection += 5;
    this.mood = Math.min(100, this.mood + 20);
    this.setState('love', 3000);
    this.speak('love', '主人~抱抱我~');
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
  // 摸摸
  pet() {
    this.mood = Math.min(100, this.mood + 10);
    this.setState('pet', 2000);
    this.speak('pet');
    this.emitParticles('hearts');
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
  // 跳舞
  dance() {
    this.energy = Math.max(0, this.energy - 10);
    this.mood = Math.min(100, this.mood + 15);
    this.setState('dancing', 5000);
    this.speak('dance');
    this.emitParticles('notes');
    this.hideMenu();
  },
  // 睡觉
  sleep() {
    this.setState('sleeping');
    this.speak('sleeping');
    this.emitParticles('zzz');
    this.hideMenu();
  },

  // ====== 系统 ======
  startBlinking() {
    const blink = () => {
      if (this.state === 'sleeping') return;
      this.el.classList.add('blink');
      setTimeout(() => this.el.classList.remove('blink'), 160);
    };
    const schedule = () => {
      this.blinkTimer = setTimeout(() => {
        blink();
        schedule();
      }, 2500 + Math.random() * 3500);
    };
    schedule();
  },

  startRandomStates() {
    const states = ['curious', 'sleepy', 'playing', 'shy'];
    setInterval(() => {
      if (this.state !== 'idle') return;
      if (Math.random() > 0.25) return;
      const s = states[Math.floor(Math.random() * states.length)];
      this.setState(s, 3000);
      this.speak(s);
      if (s === 'playing') {
        this.emitParticles('sparkles');
        this.el.classList.add('jump');
        setTimeout(() => this.el.classList.remove('jump'), 600);
      }
    }, 12000);
  },

  startMoodDecay() {
    setInterval(() => {
      this.mood = Math.max(0, this.mood - 0.3);
      this.energy = Math.max(0, this.energy - 0.15);
      const fill = this.el.querySelector('.lc-mood-fill');
      if (fill) fill.style.width = this.mood + '%';
      if (this.energy < 25 && this.state === 'idle') {
        this.setState('sleepy', 3000);
        this.speak('sleepy');
      }
      if (this.energy < 10 && this.state === 'sleepy') {
        this.setState('sleeping');
        this.speak('sleeping');
      }
      // 主人不理我
      if (this.mood < 20 && this.state === 'idle') {
        this.speak('miss');
      }
    }, 8000);
  },

  // ====== 音乐联动 ======
  onSongPlay() {
    this.mood = Math.min(100, this.mood + 10);
    this.setState('dancing', 4000);
    this.speak('song');
    this.emitParticles('notes');
  },
  onSongPause() {
    if (this.state === 'dancing') this.setState('idle');
  },

  destroy() {
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (this.stateTimer) clearTimeout(this.stateTimer);
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
  }
};

window.ListenCat = ListenCat;
