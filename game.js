const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startButton = document.getElementById("startButton");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const keys = new Set();
const sprites = {};
const images = {};
const audio = {
  enabled: true,
  current: null,
  main: createBgm(["assets/bgm_main.mp3"]),
  boss: createBgm(["assets/bgm_boss.mp3"])
};

loadImage("stageBg", "assets/stage-bg.png");
loadImage("stall", "assets/stall.png");
loadSprite("player", "assets/player.png", { x: 304, y: 189, w: 597, h: 842 });
loadSprite("enemy", "assets/enemy.png", { x: 356, y: 237, w: 537, h: 795 });
loadSprite("boss", "assets/boss.png", { x: 486, y: 218, w: 1081, h: 1562 });
loadSprite("egg", "assets/egg.png", { x: 364, y: 345, w: 517, h: 536 });

// ゲーム全体の数字です。ここを変えると難しさを調整できます。
const settings = {
  targetCaptures: 15,
  maxHp: 3,
  maxEggs: 15,
  eggReloadSeconds: 2.2,
  shotCooldownSeconds: 0.36,
  enemyBombSeconds: 4.0,
  bossAttackSeconds: 1.25,
  playerX: 62,
  minX: 18,
  maxX: 220,
  minY: 90,
  maxY: 192
};

// いまのゲーム状態を1か所にまとめておくと、あとで直しやすくなります。
const game = {
  mode: "title",
  hp: settings.maxHp,
  eggs: settings.maxEggs,
  captures: 0,
  eggReloadTimer: 0,
  shotCooldown: 0,
  enemyTimer: 0,
  messageTimer: 0,
  lastTime: 0,
  paused: false,
  scroll: 0,
  player: {
    x: settings.playerX,
    y: 150,
    w: 52,
    h: 73,
    speed: 120,
    hurtTimer: 0
  },
  bullets: [],
  bossProjectiles: [],
  enemyBombs: [],
  enemies: [],
  smokes: [],
  boss: null
};

function resetGame() {
  game.mode = "playing";
  playBgm(audio.main);
  game.hp = settings.maxHp;
  game.eggs = settings.maxEggs;
  game.captures = 0;
  game.eggReloadTimer = 0;
  game.shotCooldown = 0;
  game.enemyTimer = 0.4;
  game.messageTimer = 0;
  game.paused = false;
  game.scroll = 0;
  game.player.x = settings.playerX;
  game.player.y = 150;
  game.player.hurtTimer = 0;
  game.bullets = [];
  game.bossProjectiles = [];
  game.enemyBombs = [];
  game.enemies = [];
  game.smokes = [];
  game.boss = null;
  game.lastTime = performance.now();
}

function loadSprite(name, src, crop) {
  const image = new Image();
  sprites[name] = { loaded: false, image: null, crop };

  image.addEventListener("load", () => {
    sprites[name] = { loaded: true, image, crop };
  });
  image.src = src;
}

function loadImage(name, src) {
  const image = new Image();
  images[name] = { loaded: false, failed: false, image };

  image.addEventListener("load", () => {
    images[name] = { loaded: true, failed: false, image };
  });
  image.addEventListener("error", () => {
    images[name] = { loaded: false, failed: true, image: null };
  });
  image.src = src;
}

function createBgm(sources) {
  const track = new Audio(sources[0]);
  track.loop = true;
  track.volume = 0.38;
  track.preload = "auto";
  track.dataset.sourceIndex = "0";

  track.addEventListener("error", () => {
    const nextIndex = Number(track.dataset.sourceIndex) + 1;
    if (nextIndex >= sources.length) return;

    track.dataset.sourceIndex = String(nextIndex);
    track.src = sources[nextIndex];
    track.load();
  });

  return track;
}

function playBgm(track) {
  if (!audio.enabled || !track || audio.current === track && !track.paused) return;

  stopBgm();
  audio.current = track;
  track.currentTime = 0;
  track.play().catch(() => {
    audio.enabled = false;
  });
}

function stopBgm() {
  for (const track of [audio.main, audio.boss]) {
    if (!track) continue;
    track.pause();
  }
  audio.current = null;
}

function pauseBgm() {
  if (audio.current) audio.current.pause();
}

function resumeBgm() {
  if (!audio.enabled || !audio.current) return;
  audio.current.play().catch(() => {
    audio.enabled = false;
  });
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function getPlayerHurtBox() {
  return {
    x: game.player.x + 14,
    y: game.player.y + 26,
    w: 24,
    h: 28
  };
}

function addSmoke(x, y, big = false) {
  game.smokes.push({
    x,
    y,
    age: 0,
    life: big ? 0.9 : 0.55,
    big
  });
}

function throwEgg() {
  // 茶叶蛋は最大15個。少しずつ補充されるので、撃ち切っても詰みません。
  if (game.paused || game.eggs <= 0 || game.shotCooldown > 0 || game.mode !== "playing" && game.mode !== "boss") return;

  game.eggs -= 1;
  game.shotCooldown = settings.shotCooldownSeconds;
  game.bullets.push({
    x: game.player.x + game.player.w - 2,
    y: game.player.y + 18,
    w: 13,
    h: 11,
    vx: 230
  });
}

function spawnEnemy() {
  const lane = 126 + Math.floor(Math.random() * 4) * 20;
  game.enemies.push({
    x: WIDTH + 18,
    y: lane,
    w: 36,
    h: 48,
    vx: -42 - Math.random() * 22,
    step: Math.random() * 10,
    attackTimer: 1.6 + Math.random() * settings.enemyBombSeconds
  });
}

function spawnEnemyBomb(enemy) {
  game.enemyBombs.push({
    x: enemy.x + 4,
    y: Math.max(126, Math.min(206, enemy.y + 20)),
    w: 11,
    h: 11,
    vx: -105
  });
}

function spawnBoss() {
  game.mode = "boss";
  playBgm(audio.boss);
  game.messageTimer = 2.2;
  game.boss = {
    x: 354,
    y: -112,
    w: 76,
    h: 98,
    vx: 0,
    vy: 0,
    targetY: 116,
    landed: false,
    attackTimer: 0.9,
    hp: 12,
    step: 0
  };
  game.enemies = [];
}

function spawnBossProjectile() {
  if (!game.boss || !game.boss.landed) return;

  const targetY = game.player.y + game.player.h * 0.48;
  game.bossProjectiles.push({
    x: game.boss.x + 4,
    y: Math.max(118, Math.min(205, targetY)),
    w: 18,
    h: 10,
    vx: -150
  });
}

function hurtPlayer() {
  // 連続で触れても一瞬だけ無敵時間を作り、HPが一気に消えないようにします。
  if (game.player.hurtTimer > 0) return;

  game.hp -= 1;
  game.player.hurtTimer = 1.1;
  addSmoke(game.player.x + 15, game.player.y + 22);

  if (game.hp <= 0) {
    game.mode = "gameover";
    stopBgm();
    startButton.textContent = "重新挑战";
  }
}

function updatePlaying(delta) {
  game.scroll += delta * 36;
  game.player.hurtTimer = Math.max(0, game.player.hurtTimer - delta);
  game.shotCooldown = Math.max(0, game.shotCooldown - delta);

  if (keys.has("arrowup") || keys.has("w")) {
    game.player.y -= game.player.speed * delta;
  }
  if (keys.has("arrowdown") || keys.has("s")) {
    game.player.y += game.player.speed * delta;
  }
  if (keys.has("arrowleft") || keys.has("a")) {
    game.player.x -= game.player.speed * delta;
  }
  if (keys.has("arrowright") || keys.has("d")) {
    game.player.x += game.player.speed * delta;
  }
  game.player.x = Math.max(settings.minX, Math.min(settings.maxX, game.player.x));
  game.player.y = Math.max(settings.minY, Math.min(settings.maxY, game.player.y));

  if (game.eggs < settings.maxEggs) {
    game.eggReloadTimer += delta;
    if (game.eggReloadTimer >= settings.eggReloadSeconds) {
      game.eggs += 1;
      game.eggReloadTimer = 0;
    }
  } else {
    game.eggReloadTimer = 0;
  }

  game.enemyTimer -= delta;
  if (game.mode === "playing" && game.enemyTimer <= 0) {
    spawnEnemy();
    game.enemyTimer = 1.0 + Math.random() * 0.55;
  }

  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * delta;
  }
  game.bullets = game.bullets.filter((bullet) => bullet.x < WIDTH + 24);

  for (const projectile of game.bossProjectiles) {
    projectile.x += projectile.vx * delta;
  }

  for (const bomb of game.enemyBombs) {
    bomb.x += bomb.vx * delta;
  }

  for (const projectile of game.bossProjectiles) {
    if (!projectile.dead && rectsOverlap(getPlayerHurtBox(), projectile)) {
      projectile.dead = true;
      hurtPlayer();
      addSmoke(projectile.x, projectile.y);
    }
  }
  game.bossProjectiles = game.bossProjectiles.filter((projectile) => !projectile.dead && projectile.x > -32);

  for (const bomb of game.enemyBombs) {
    if (!bomb.dead && rectsOverlap(getPlayerHurtBox(), bomb)) {
      bomb.dead = true;
      hurtPlayer();
      addSmoke(bomb.x, bomb.y);
    }
  }
  game.enemyBombs = game.enemyBombs.filter((bomb) => !bomb.dead && bomb.x > -32);

  for (const enemy of game.enemies) {
    enemy.x += enemy.vx * delta;
    enemy.step += delta * 8;
    enemy.attackTimer -= delta;
    if (enemy.attackTimer <= 0 && enemy.x > game.player.x + 80 && enemy.x < WIDTH - 44) {
      spawnEnemyBomb(enemy);
      enemy.attackTimer = settings.enemyBombSeconds + Math.random() * 1.4;
    }
  }

  for (const enemy of game.enemies) {
    if (rectsOverlap(game.player, enemy)) {
      enemy.dead = true;
      hurtPlayer();
    }

    for (const bullet of game.bullets) {
      if (!enemy.dead && !bullet.dead && rectsOverlap(enemy, bullet)) {
        enemy.dead = true;
        bullet.dead = true;
        game.captures += 1;
        addSmoke(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
      }
    }
  }

  game.enemies = game.enemies.filter((enemy) => {
    if (enemy.dead) return false;
    if (enemy.x < -40) {
      hurtPlayer();
      return false;
    }
    return true;
  });
  game.bullets = game.bullets.filter((bullet) => !bullet.dead);

  if (game.mode === "playing" && game.captures >= settings.targetCaptures) {
    game.mode = "bossAlert";
    game.messageTimer = 1.8;
  }

  if (game.mode === "bossAlert") {
    game.messageTimer -= delta;
    if (game.messageTimer <= 0) spawnBoss();
  }

  if (game.boss) {
    if (!game.boss.landed) {
      game.boss.vy += 520 * delta;
      game.boss.y += game.boss.vy * delta;

      if (game.boss.y >= game.boss.targetY) {
        game.boss.y = game.boss.targetY;
        game.boss.vy = 0;
        game.boss.landed = true;
        addSmoke(game.boss.x + game.boss.w / 2, game.boss.y + game.boss.h, true);
      }
    } else {
      game.boss.x += game.boss.vx * delta;
      game.boss.attackTimer -= delta;
      if (game.boss.attackTimer <= 0) {
        spawnBossProjectile();
        game.boss.attackTimer = settings.bossAttackSeconds;
      }
    }
    game.boss.step += delta * 7;
    if (game.boss.x < 330) game.boss.vx = 0;

    if (rectsOverlap(game.player, game.boss)) {
      hurtPlayer();
      game.boss.x += 16;
    }

    for (const bullet of game.bullets) {
      if (!bullet.dead && rectsOverlap(game.boss, bullet)) {
        bullet.dead = true;
        game.boss.hp -= 1;
        addSmoke(bullet.x, bullet.y);
      }
    }

    if (game.boss.hp <= 0) {
      addSmoke(game.boss.x + 28, game.boss.y + 40, true);
      game.boss = null;
      game.bossProjectiles = [];
      game.mode = "clear";
      stopBgm();
      startButton.textContent = "再来一次";
    }
  }

  for (const smoke of game.smokes) {
    smoke.age += delta;
  }
  game.smokes = game.smokes.filter((smoke) => smoke.age < smoke.life);
}

function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawSprite(name, x, y, w, h) {
  const sprite = sprites[name];
  if (!sprite || !sprite.loaded) return false;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sprite.image,
    sprite.crop.x,
    sprite.crop.y,
    sprite.crop.w,
    sprite.crop.h,
    Math.round(x),
    Math.round(y),
    Math.round(w),
    Math.round(h)
  );
  return true;
}

function drawMissingSpriteBox(x, y, w, h, color) {
  drawRect(x, y, w, h, color);
  drawRect(x + 4, y + 4, w - 8, h - 8, "rgba(255, 255, 255, 0.35)");
}

function drawText(text, x, y, size = 12, align = "left", color = "#fff8dc") {
  ctx.fillStyle = "#171313";
  ctx.font = `${size}px "Microsoft YaHei", "SimHei", "Noto Sans SC", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawPanel(x, y, w, h) {
  drawRect(x + 2, y + 2, w, h, "rgba(0, 0, 0, 0.38)");
  drawRect(x, y, w, h, "#241f1c");
  drawRect(x + 2, y + 2, w - 4, h - 4, "#332b25");
  drawRect(x, y, w, 2, "#d9c9aa");
  drawRect(x, y + h - 2, w, 2, "#8d806b");
  drawRect(x, y, 2, h, "#d9c9aa");
  drawRect(x + w - 2, y, 2, h, "#8d806b");
}

function drawStageImage() {
  const stage = images.stageBg;
  if (!stage || !stage.loaded) return false;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stage.image, 0, 0, WIDTH, HEIGHT);
  return true;
}

function drawStallImage() {
  const stall = images.stall;
  if (!stall || !stall.loaded) return false;

  const crop = { x: 343, y: 290, w: 1456, h: 1463 };
  const drawHeight = 80;
  const drawWidth = drawHeight * (crop.w / crop.h);
  const x = WIDTH - drawWidth - 28;
  const y = 204 - drawHeight;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    stall.image,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    Math.round(x),
    Math.round(y),
    Math.round(drawWidth),
    drawHeight
  );
  return true;
}

function drawBackground() {
  if (drawStageImage()) {
    if (!drawStallImage()) drawStreetStall();
    return;
  }

  drawRect(0, 0, WIDTH, HEIGHT, "#80c8ee");
  // 背景は全部四角形で描いています。小さなキャンバスを拡大して、ドット絵らしく見せます。
  drawRect(0, 0, WIDTH, HEIGHT, "#80c8ee");

  // 雲と遠くのビルをゆっくり横に流して、横スクロールっぽく見せます。
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 130 - game.scroll * 0.25) % 620) - 70;
    drawRect(x, 36 + (i % 2) * 16, 36, 8, "#f5f0dc");
    drawRect(x + 12, 28 + (i % 2) * 16, 18, 8, "#f5f0dc");
  }

  for (let i = 0; i < 10; i += 1) {
    const x = ((i * 52 - game.scroll * 0.45) % 620) - 70;
    const h = 32 + (i % 4) * 9;
    drawRect(x, 118 - h, 34, h, "#7da6b8");
    drawRect(x + 7, 92 - h / 2, 5, 5, "#b8d6df");
    drawRect(x + 21, 102 - h / 3, 5, 5, "#b8d6df");
  }

  drawStreetStall();
  drawRoad();
}

function drawStreetStall() {
  drawRect(314, 82, 132, 80, "#5f8b57");
  drawRect(304, 98, 150, 12, "#e8d6aa");
  drawRect(320, 74, 118, 24, "#efe0be");
  drawText("茶叶蛋", 347, 93, 14, "left", "#934533");
  drawRect(320, 110, 124, 54, "#654532");
  drawRect(330, 130, 36, 18, "#b9783f");
  drawRect(374, 122, 16, 30, "#bfc5bd");
  drawRect(392, 126, 18, 26, "#d6d4c7");
  drawRect(420, 112, 16, 44, "#efe0be");
  drawText("香", 424, 130, 12, "left", "#a3422e");
}

function drawRoad() {
  drawRect(0, 215, WIDTH, 55, "#30343a");
  drawRect(0, 198, WIDTH, 24, "#aaa39a");
  for (let x = -40; x < WIDTH + 40; x += 40) {
    const sx = x - (game.scroll % 40);
    drawRect(sx, 198, 36, 3, "#7c7771");
    drawRect(sx + 4, 218, 28, 2, "#d2b15a");
  }
  drawRect(20, 236, 82, 5, "#e9e5db");
  drawRect(174, 240, 92, 5, "#e9e5db");
}

function drawHud() {
  drawPanel(16, 16, 178, 38);
  drawRect(22, 21, 26, 28, "#151313");
  drawRect(24, 23, 22, 24, "#5f95aa");
  drawLaotou(26, 24, 0.32);

  for (let i = 0; i < settings.maxHp; i += 1) {
    drawHeart(57 + i * 16, 25, i < game.hp);
  }

  drawEgg(126, 36, 0.82);
  drawText(`×${game.eggs}`, 140, 42, 12, "left", "#f7ead0");

  drawPanel(WIDTH - 132, 16, 116, 32);
  drawText(`已抓捕 ${Math.min(game.captures, settings.targetCaptures)}/${settings.targetCaptures}`, WIDTH - 74, 38, 13, "center", "#f7ead0");
}

function drawHeart(x, y, full) {
  const color = full ? "#e6463a" : "#6d6d76";
  drawRect(x + 2, y, 4, 4, color);
  drawRect(x + 8, y, 4, 4, color);
  drawRect(x, y + 4, 14, 5, color);
  drawRect(x + 2, y + 9, 10, 4, color);
  drawRect(x + 5, y + 13, 4, 3, color);
}

function drawEgg(x, y, scale = 1) {
  if (drawSprite("egg", x - 8 * scale, y - 9 * scale, 16 * scale, 18 * scale)) return;
  drawMissingSpriteBox(x - 8 * scale, y - 9 * scale, 16 * scale, 18 * scale, "#d19a61");
}

function drawLaotou(x, y, scale = 1) {
  // player.pngをそのまま使います。手描きの代替キャラは出さず、表情が変わらないようにします。
  if (drawSprite("player", x, y, 52 * scale, 73 * scale)) return;
  drawMissingSpriteBox(x, y, 52 * scale, 73 * scale, "#f0781e");
}

function drawWangeryong(enemy, scale = 1) {
  // enemy.pngをそのまま使います。
  if (drawSprite("enemy", enemy.x, enemy.y, 36 * scale, 48 * scale)) return;
  drawMissingSpriteBox(enemy.x, enemy.y, 36 * scale, 48 * scale, "#142233");
}

function drawBoss(boss) {
  if (!drawSprite("boss", boss.x, boss.y, boss.w, boss.h)) {
    drawMissingSpriteBox(boss.x, boss.y, boss.w, boss.h, "#142233");
  }
  drawRect(boss.x - 4, boss.y - 12, boss.w + 8, 6, "#111");
  drawRect(boss.x - 2, boss.y - 10, Math.max(0, boss.hp / 12) * (boss.w + 4), 2, "#ef4545");
}

function drawBullet(bullet) {
  drawEgg(bullet.x + 6, bullet.y + 5, 0.9);
  drawRect(bullet.x - 10, bullet.y + 5, 4, 2, "#f8e6b8");
  drawRect(bullet.x - 17, bullet.y + 6, 5, 2, "#f8e6b8");
}

function drawBossProjectile(projectile) {
  drawRect(projectile.x, projectile.y, projectile.w, projectile.h, "#1a1a1d");
  drawRect(projectile.x + 2, projectile.y + 2, 6, 4, "#cfd1c8");
  drawRect(projectile.x + 10, projectile.y + 2, 6, 4, "#cfd1c8");
  drawRect(projectile.x - 8, projectile.y + 4, 5, 2, "#5b2c18");
}

function drawEnemyBomb(bomb) {
  drawRect(bomb.x + 2, bomb.y, 7, 2, "#2b2723");
  drawRect(bomb.x, bomb.y + 2, 11, 7, "#1f1d1a");
  drawRect(bomb.x + 2, bomb.y + 9, 7, 2, "#5f3520");
  drawRect(bomb.x + 7, bomb.y + 3, 2, 2, "#f0c060");
  drawRect(bomb.x - 6, bomb.y + 5, 4, 2, "#d44b2e");
}

function drawSmoke(smoke) {
  const progress = smoke.age / smoke.life;
  const size = smoke.big ? 18 : 9;
  ctx.globalAlpha = 1 - progress;
  drawRect(smoke.x - size * progress, smoke.y - 4, size, size / 2, "#ddd8c8");
  drawRect(smoke.x + 3, smoke.y - size * progress, size * 0.8, size * 0.5, "#c4c0b4");
  drawRect(smoke.x - 7, smoke.y + 5, size * 0.7, size * 0.45, "#f1ead8");
  ctx.globalAlpha = 1;
}

function drawEventText(text, x, y, size = 24, options = {}) {
  const time = performance.now() / 1000;
  const pulse = Math.sin(time * 7) * 0.06;
  const shake = Math.round(Math.sin(time * 18) * (options.shake || 1));
  const blink = Math.sin(time * 10) > 0 ? 1 : 0.82;

  ctx.save();
  ctx.translate(Math.round(x + shake), Math.round(y + Math.cos(time * 13) * 1));
  ctx.scale(1 + pulse, 1 + pulse);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${size}px "Microsoft YaHei", "SimHei", "Noto Sans SC", Arial, sans-serif`;
  ctx.lineWidth = Math.max(4, Math.floor(size / 5));
  ctx.strokeStyle = "#1c120d";
  ctx.strokeText(text, 0, 0);
  ctx.lineWidth = Math.max(2, Math.floor(size / 9));
  ctx.strokeStyle = "#5f2d16";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = options.color || `rgba(255, ${186 + blink * 34}, 50, 1)`;
  ctx.fillText(text, 0, 0);
  ctx.fillStyle = `rgba(255, 246, 163, ${0.55 * blink})`;
  ctx.fillText(text, -1, -2);
  ctx.restore();
}

function drawEventBand(y, height = 76) {
  drawRect(0, y, WIDTH, height, "rgba(18, 12, 8, 0.76)");
  drawRect(0, y, WIDTH, 3, "rgba(225, 198, 142, 0.9)");
  drawRect(0, y + height - 3, WIDTH, 3, "rgba(92, 55, 31, 0.95)");
}

function drawOverlay(title, subtitle) {
  drawRect(0, 0, WIDTH, HEIGHT, "rgba(10, 8, 6, 0.42)");
  drawEventBand(86, 92);
  drawEventText(title, WIDTH / 2, 119, 27, { shake: 1 });
  drawText(subtitle, WIDTH / 2, 156, 12, "center", "#f7dca4");
}

function drawPauseOverlay() {
  drawRect(0, 0, WIDTH, HEIGHT, "rgba(10, 8, 6, 0.38)");
  drawEventBand(94, 72);
  drawEventText("PAUSE", WIDTH / 2, 124, 26, { shake: 0 });
  drawText("按 P / Esc 继续", WIDTH / 2, 154, 12, "center", "#f7dca4");
}

function draw() {
  ctx.imageSmoothingEnabled = false;
  drawBackground();

  if (game.player.hurtTimer <= 0 || Math.floor(game.player.hurtTimer * 12) % 2 === 0) {
    drawLaotou(game.player.x, game.player.y);
  }

  for (const enemy of game.enemies) drawWangeryong(enemy);
  if (game.boss) drawBoss(game.boss);
  for (const projectile of game.bossProjectiles) drawBossProjectile(projectile);
  for (const bomb of game.enemyBombs) drawEnemyBomb(bomb);
  for (const bullet of game.bullets) drawBullet(bullet);

  for (const smoke of game.smokes) drawSmoke(smoke);

  drawHud();

  if (game.mode === "title") {
    drawOverlay("START", "Space / 开始按钮");
  }
  if (game.mode === "bossAlert" || game.mode === "boss" && game.messageTimer > 0) {
    drawEventBand(58, 64);
    drawEventText("真・王二勇 発見！", WIDTH / 2, 90, 22, { shake: 2 });
  }
  if (game.mode === "clear") {
    drawOverlay("CLEAR!", "点击重新开始继续追捕");
  }
  if (game.mode === "gameover") {
    drawOverlay("GAME OVER", "点击重新挑战再来一次");
  }
  if (game.paused) {
    drawPauseOverlay();
  }
}

function loop(time) {
  const delta = Math.min((time - game.lastTime) / 1000, 0.05);
  game.lastTime = time;

  if (!game.paused && (game.mode === "playing" || game.mode === "bossAlert" || game.mode === "boss")) {
    updatePlaying(delta);
  }

  if (!game.paused && game.mode === "boss" && game.messageTimer > 0) {
    game.messageTimer -= delta;
  }

  draw();
  requestAnimationFrame(loop);
}

function startOrRestart() {
  resetGame();
  startButton.textContent = "重新开始";
}

function togglePause() {
  if (game.mode !== "playing" && game.mode !== "bossAlert" && game.mode !== "boss") return;
  game.paused = !game.paused;
  if (game.paused) {
    pauseBgm();
  } else {
    resumeBgm();
  }
  keys.clear();
}

window.addEventListener("keydown", (event) => {
  // 处理按键。Space 在标题画面用于开始，在游戏中用于投茶叶蛋。
  const key = event.key.toLowerCase();
  keys.add(key);

  if (event.code === "KeyP" || event.code === "Escape") {
    event.preventDefault();
    togglePause();
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    if (game.mode === "title") {
      startOrRestart();
    } else if (game.mode === "playing" || game.mode === "boss") {
      throwEgg();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

startButton.addEventListener("click", startOrRestart);

game.lastTime = performance.now();
requestAnimationFrame(loop);
