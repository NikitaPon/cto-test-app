/*
Интерактивная 3D-сцена Солнечной системы на Three.js
Управление:
- ЛКМ — вращение камеры
- ПКМ/Shift — панорама
- Колесо — масштаб
- Клик по планете — выбор, затем кнопка «К планете» для фокуса камеры
*/

(() => {
  const TWO_PI = Math.PI * 2;

  // DOM
  const container = document.getElementById('canvas-container');
  const infoEl = document.getElementById('info');

  const ui = {
    speed: document.getElementById('speed'),
    speedValue: document.getElementById('speedValue'),
    togglePause: document.getElementById('togglePause'),
    toggleOrbits: document.getElementById('toggleOrbits'),
    toggleLabels: document.getElementById('toggleLabels'),
    toggleAxes: document.getElementById('toggleAxes'),
    resetCamera: document.getElementById('resetCamera'),
    targetSelect: document.getElementById('targetSelect'),
    focusTarget: document.getElementById('focusTarget'),
  };

  // Renderer & Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03040a);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Label renderer (CSS2D)
  const CSS2DRendererClass =
    (typeof THREE !== 'undefined' && THREE.CSS2DRenderer) ||
    (typeof window !== 'undefined' && window.CSS2DRenderer) ||
    null;
  const CSS2DObjectClass =
    (typeof THREE !== 'undefined' && THREE.CSS2DObject) ||
    (typeof window !== 'undefined' && window.CSS2DObject) ||
    null;

  const labelRenderer = (typeof CSS2DRendererClass === 'function')
    ? new CSS2DRendererClass()
    : {
        domElement: document.createElement('div'),
        setSize: () => {},
        render: () => {}
      };

  labelRenderer.setSize && labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'fixed';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.className = 'label-container';
  document.body.appendChild(labelRenderer.domElement);

  // Camera & Controls
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
  const defaultCameraPos = new THREE.Vector3(0, 120, 280);
  camera.position.copy(defaultCameraPos);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 1500;
  controls.minDistance = 5;
  controls.target.set(0, 0, 0);

  // Lights
  const ambient = new THREE.AmbientLight(0x404050, 0.4);
  scene.add(ambient);
  const sunLight = new THREE.PointLight(0xffffff, 2.0, 0, 2);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  // Groups
  const systemGroup = new THREE.Group();
  scene.add(systemGroup);

  const orbitsGroup = new THREE.Group();
  systemGroup.add(orbitsGroup);

  const axesHelper = new THREE.AxesHelper(40);
  axesHelper.visible = false;
  systemGroup.add(axesHelper);

  // Star field
  addStars(scene, 2000, 1200, 0x99bbff);

  // Sun
  const sun = createSun();
  systemGroup.add(sun.mesh);

  // Simulation time
  let daysPerSecond = parseFloat(ui.speed.value);
  let paused = false;

  ui.speed.addEventListener('input', () => {
    daysPerSecond = parseFloat(ui.speed.value);
    ui.speedValue.textContent = daysPerSecond.toFixed(2);
  });
  ui.speedValue.textContent = daysPerSecond.toFixed(2);

  ui.togglePause.addEventListener('click', () => {
    paused = !paused;
    ui.togglePause.textContent = paused ? 'Продолжить' : 'Пауза';
  });

  ui.toggleOrbits.addEventListener('change', () => {
    const visible = ui.toggleOrbits.checked;
    orbitsGroup.visible = visible;
    // Орбиты лун присоединены к планетам — переключим явно
    planets.forEach(p => { (p.moons || []).forEach(m => m.orbit.visible = visible); });
  });
  ui.toggleLabels.addEventListener('change', () => {
    const visible = ui.toggleLabels.checked;
    planets.forEach(p => {
      p.label.visible = visible;
      (p.moons || []).forEach(m => m.label.visible = visible);
    });
  });
  ui.toggleAxes.addEventListener('change', () => {
    axesHelper.visible = ui.toggleAxes.checked;
  });
  ui.resetCamera.addEventListener('click', () => smoothCameraTo(defaultCameraPos, new THREE.Vector3(0, 0, 0)));

  // Planet data (упрощенные, со скейлами для наглядности)
  const distanceScale = 8; // ед. на 1 астрономическую единицу
  const earthRadiusUnits = 0.85; // условный радиус Земли в сцене

  const planetDefs = [
    { name: 'Меркурий', color: 0xb1b1b1, radius: earthRadiusUnits*0.38, distanceAU: 0.39, orbitalPeriodDays: 88, rotationHours: 1407.6, tilt: 0.01 },
    { name: 'Венера',   color: 0xd4c29c, radius: earthRadiusUnits*0.95, distanceAU: 0.72, orbitalPeriodDays: 225, rotationHours: -5832.5, tilt: 177.3 },
    { name: 'Земля',    color: 0x2b6cff, radius: earthRadiusUnits*1.00, distanceAU: 1.00, orbitalPeriodDays: 365, rotationHours: 24.0, tilt: 23.5, moons: [
      { name: 'Луна', color: 0xcfd6e6, radius: earthRadiusUnits*0.27, distance: 2.5, orbitalPeriodDays: 27.3, rotationHours: 655.7, tilt: 6.7 }
    ] },
    { name: 'Марс',     color: 0xcb4b3a, radius: earthRadiusUnits*0.53, distanceAU: 1.52, orbitalPeriodDays: 687, rotationHours: 24.6, tilt: 25.2 },
    { name: 'Юпитер',   color: 0xd2b48c, radius: earthRadiusUnits*11.21, distanceAU: 5.20, orbitalPeriodDays: 4333, rotationHours: 9.9, tilt: 3.1 },
    { name: 'Сатурн',   color: 0xe8d8a8, radius: earthRadiusUnits*9.45, distanceAU: 9.58, orbitalPeriodDays: 10759, rotationHours: 10.7, tilt: 26.7, ring: { inner: 1.2, outer: 2.2, color: 0xe6dec9 } },
    { name: 'Уран',     color: 0xa6d1e6, radius: earthRadiusUnits*4.01, distanceAU: 19.2, orbitalPeriodDays: 30687, rotationHours: -17.2, tilt: 97.8 },
    { name: 'Нептун',   color: 0x5b88ff, radius: earthRadiusUnits*3.88, distanceAU: 30.05, orbitalPeriodDays: 60190, rotationHours: 16.1, tilt: 28.3 },
  ];

  // Build planets
  const planets = [];
  const selectableMeshes = []; // for raycasting

  planetDefs.forEach(def => {
    const planet = createPlanet(def);
    planets.push(planet);
    systemGroup.add(planet.pivot);
    orbitsGroup.add(planet.orbit);

    selectableMeshes.push(planet.mesh);

    if (planet.moons && planet.moons.length) {
      planet.moons.forEach(m => {
        selectableMeshes.push(m.mesh);
      });
    }
  });

  // Populate select
  const options = ['Солнце', ...planets.map(p => p.name)];
  options.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    ui.targetSelect.appendChild(opt);
  });

  // Focus controls
  ui.focusTarget.addEventListener('click', () => {
    const name = ui.targetSelect.value;
    if (name === 'Солнце') {
      smoothCameraTo(new THREE.Vector3(0, 80, 160), new THREE.Vector3(0, 0, 0));
      return;
    }
    const target = planets.find(p => p.name === name);
    if (target) {
      const worldPos = target.mesh.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      const distance = Math.max(target.radius * 8, 25);
      const newCamPos = new THREE.Vector3().addVectors(worldPos, dir.multiplyScalar(distance));
      smoothCameraTo(newCamPos, worldPos);
    }
  });

  // Raycaster selection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onPointerDown(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ( (ev.clientX - rect.left) / rect.width ) * 2 - 1;
    const y = - ( (ev.clientY - rect.top) / rect.height ) * 2 + 1;
    mouse.set(x, y);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(selectableMeshes, true);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      const planet = findPlanetByMesh(obj);
      if (planet) selectPlanet(planet);
    }
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function findPlanetByMesh(mesh) {
    for (const p of planets) {
      if (p.mesh === mesh) return p;
      if (p.moons) { for (const m of p.moons) if (m.mesh === mesh) return m; }
    }
    return null;
  }

  function selectPlanet(p) {
    const name = p.isMoon ? `${p.name} (спутник)` : p.name;
    ui.targetSelect.value = p.isMoon ? (findParentPlanet(p)?.name || p.name) : p.name;
    const worldPos = p.mesh.getWorldPosition(new THREE.Vector3());
    infoEl.textContent = `${name}: Радиус ~ ${p.radius.toFixed(2)} ед., расстояние от центра ~ ${p.baseDistance.toFixed(1)} ед.`;
    // Маленькая вспышка на планете
    pulse(p.mesh, 1.06, 250);
  }

  function findParentPlanet(moon) {
    return planets.find(pl => pl.moons && pl.moons.includes(moon));
  }

  function pulse(obj, scale = 1.05, duration = 250) {
    const start = performance.now();
    const init = obj.scale.clone();
    const target = init.clone().multiplyScalar(scale);
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const k = t < 0.5 ? (t*2) : (2 - t*2);
      obj.scale.lerpVectors(init, target, k);
      if (t < 1) requestAnimationFrame(tick); else obj.scale.copy(init);
    }
    requestAnimationFrame(tick);
  }

  // Create Sun
  function createSun() {
    const geom = new THREE.SphereGeometry(6, 48, 48);
    const mat = new THREE.MeshPhongMaterial({ color: 0xffdd66, emissive: 0xffaa00, emissiveIntensity: 0.9, shininess: 60 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'Солнце';
    return { mesh };
  }

  // Create planet with orbit and optional rings/moons
  function createPlanet(def) {
    const pivot = new THREE.Group();
    pivot.rotation.x = 0; // орбиты в плоскости XZ

    const distance = (def.distanceAU || 0) * distanceScale;
    const radius = def.radius;

    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.9, metalness: 0.0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.position.set(distance, 0, 0);

    // Наклон оси
    mesh.rotation.z = THREE.MathUtils.degToRad(def.tilt || 0);

    // Собственная ось вращения (скорость в радианах/сим.день)
    const spinPerDay = (def.rotationHours ? (TWO_PI / (def.rotationHours / 24)) : 0);

    // Орбитальная скорость (радиан/сим.день)
    const orbitalPerDay = def.orbitalPeriodDays ? (TWO_PI / def.orbitalPeriodDays) : 0;

    // Орбитальный контур
    const orbit = createOrbit(distance, 256, 0x4466aa);

    // Кольца Сатурна и т.п.
    const ringMesh = def.ring ? createRingMesh(radius * def.ring.inner, radius * def.ring.outer, def.ring.color) : null;
    if (ringMesh) {
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.rotation.z = mesh.rotation.z; // совпадение наклона
      mesh.add(ringMesh);
    }

    // Метка — привязываем к планете
    const label = createLabel(def.name);
    label.position.set(0, radius * 1.6, 0);
    mesh.add(label);

    // Привязки
    pivot.add(mesh);

    // Луны (пример: Луна у Земли)
    const moons = [];
    if (def.moons) {
      def.moons.forEach(m => {
        const moon = createMoon(m, mesh);
        moons.push(moon);
      });
    }

    // Храним внутренние состояния
    const state = {
      orbitAngle: Math.random() * TWO_PI,
      spinAngle: Math.random() * TWO_PI,
    };

    // Публичный интерфейс планеты
    const planet = {
      name: def.name,
      pivot,
      mesh,
      orbit,
      label,
      color: def.color,
      radius,
      baseDistance: distance,
      orbitalPerDay,
      spinPerDay,
      moons,
      isMoon: false,
      update(dtDays) {
        state.orbitAngle += orbitalPerDay * dtDays;
        pivot.rotation.y = state.orbitAngle;
        state.spinAngle += spinPerDay * dtDays;
        mesh.rotation.y = state.spinAngle;
        // обновляем луны
        moons.forEach(m => m.update(dtDays));
      }
    };

    return planet;
  }

  function createMoon(def, parentMesh) {
    const pivot = new THREE.Group();
    parentMesh.add(pivot);

    const radius = def.radius;
    const distance = def.distance; // уже в сценических ед.

    const geometry = new THREE.SphereGeometry(radius, 24, 24);
    const material = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.9 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(distance, 0, 0);
    mesh.rotation.z = THREE.MathUtils.degToRad(def.tilt || 0);

    const orbit = createOrbit(distance, 128, 0x5577aa);
    // орбиту лун крепим в их локальный пивот, чтобы она следовала за планетой
    pivot.add(orbit);

    const label = createLabel(def.name);
    label.position.set(0, radius * 1.6, 0);
    mesh.add(label);

    pivot.add(mesh);

    const spinPerDay = def.rotationHours ? (TWO_PI / (def.rotationHours / 24)) : 0;
    const orbitalPerDay = def.orbitalPeriodDays ? (TWO_PI / def.orbitalPeriodDays) : 0;

    const state = { orbitAngle: Math.random() * TWO_PI, spinAngle: Math.random() * TWO_PI };

    const moon = {
      name: def.name,
      pivot,
      mesh,
      orbit,
      label,
      color: def.color,
      radius,
      baseDistance: distance,
      orbitalPerDay,
      spinPerDay,
      isMoon: true,
      update(dtDays) {
        state.orbitAngle += orbitalPerDay * dtDays;
        pivot.rotation.y = state.orbitAngle;
        state.spinAngle += spinPerDay * dtDays;
        mesh.rotation.y = state.spinAngle;
      }
    };

    return moon;
  }

  function createOrbit(radius, segments = 128, color = 0x888888) {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
    const points2 = curve.getPoints(segments);
    const points3 = points2.map(p => new THREE.Vector3(p.x, 0, p.y));
    const geometry = new THREE.BufferGeometry().setFromPoints(points3);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
    const line = new THREE.LineLoop(geometry, material);
    line.rotation.x = Math.PI / 2; // на плоскости XZ
    return line;
  }

  function createRingMesh(inner, outer, color) {
    const geom = new THREE.RingGeometry(inner, outer, 128, 1);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(geom, mat);
    return ring;
  }

  function createLabel(text) {
    const div = document.createElement('div');
    div.className = 'label';
    div.textContent = text;
    if (typeof CSS2DObjectClass === 'function') {
      return new CSS2DObjectClass(div);
    } else {
      const placeholder = new THREE.Object3D();
      placeholder.visible = false;
      return placeholder;
    }
  }

  function addStars(targetScene, count = 1000, radius = 1000, color = 0xffffff) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = radius * (0.5 + Math.random() * 0.5);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      positions[i*3+0] = x;
      positions[i*3+1] = y;
      positions[i*3+2] = z;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 1.2, sizeAttenuation: true });
    const pts = new THREE.Points(geom, mat);
    targetScene.add(pts);
  }

  // Camera tween utility
  function smoothCameraTo(pos, target, duration = 900) {
    const start = performance.now();
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const e = easeInOutQuad(t);
      camera.position.lerpVectors(fromPos, pos, e);
      controls.target.lerpVectors(fromTarget, target, e);
      controls.update();
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function easeInOutQuad(x) {
    return x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2) / 2;
  }

  // Animation loop
  let last = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dtSec = Math.min(0.05, (now - last) / 1000);
    last = now;

    const dtDays = paused ? 0 : dtSec * daysPerSecond;

    planets.forEach(p => p.update(dtDays));

    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  animate();

  // Resize
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  });
})();
