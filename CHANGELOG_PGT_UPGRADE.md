# Miniforge Engine v0.3 — PGT & Immersive-Sim Upgrade

## 1. Полный Runtime GameAPI (`packages/runtime/src/`)
- **`api.camera`**: `position`, `rotation`, `forward`, `right`, `yaw`, `pitch`, `fov`, `eyeHeight`, `lookAt(target)`, `setLook(yaw, pitch)`, `shake(intensity, duration)`.
- **`api.player`**: `id`, `position`, `isGrounded`, `isCrouching`, `isSprinting`, `speed`, `teleport(pos, yawDelta?, pitchDelta?)` (для бесшовных неевклидовых «Смещений»), `setSpeed(speed)`, `setCrouch(enabled)`. Встроенные Sprint (`Shift`) и Crouch (`Ctrl`/`C`) с плавной сменой `eyeHeight`.
- **Center-screen pick** при активном Pointer Lock (`packages/runtime/src/index.ts`).
- **Расширенная физика (`packages/runtime/src/physics.ts`)**: `api.physics.raycastHit(origin, dir, length, excludeIds?)` (возвращает `{ id, distance, point, normal }`), `applyImpulse`, `applyForce`, `setVelocity`, `getVelocity`, `setGravityScale`, а также параметры `friction`, `restitution`, `linearDamping`, `angularDamping`, `gravityScale`, `lockRotation` на `Body`/`Collider`.
- **Жизненный цикл (`packages/runtime/src/lifecycle.ts`)**: добавлены хуки `onEnable()`, `onDisable()` (при `setActive`) и `onTriggerStay(other, dt)`.
- **3D Web Audio микшер (`packages/runtime/src/audio.ts`)**: кэширование `AudioBuffer`, шины (`sfx`, `ambient`, `ui`), `loop`, `volume`, `pitch`, фейды (`setVolume(handle, vol, fade)`), HRTF 3D-позиционирование (`position`, `refDistance`, `maxDistance`) с автоматическим обновлением `AudioListener` по камере.
- **`api.environment` и `api.lights` (`packages/graphics/src/index.ts`)**: динамические `setFog`, `setBackground`, `setAmbient`, `setSun`, `setExposure`, `setSky`, управление `Light3D` на сущностях (`setIntensity`, `setColor`, `setRange`, `setEnabled`) и встроенный фонарик камеры `api.lights.setFlashlight(...)`.
- **`api.ui` (`packages/runtime/src/overlay.ts`)**: немодальные HUD-окна (`screen.modal = false`), `api.ui.mount(id, htmlOrEl, css?)` / `unmount(id)` для кастомных DOM-виджетов (`PhoneUI`, «Контурник») и кликабельные списки (`ui.item.click`).
- **`api.services` и `api.worldState`**: кросс-скриптовый реестр сервисов (`DayCycle`, `JobManager`, `WorldState`) и персистентное состояние мира, переживающее `scene.load()`, со слотами `save(slot)` / `load(slot)`.

## 2. Графика, вода, фейковый объёмный свет и террейн
- **Water Surface (`type: 'water'`)**: анимированный GLSL-шейдер (вершинные волны, Френель, блики, пена, прозрачность) + физический сенсорный объём глубины.
- **Volumetric Light (`type: 'volumetric'`)**: фейковые лучи/конусы и объёмы тумана с мягким затуханием по Френелю и анимированной пылью.
- **Sky Dome**: процедурный градиентный купол неба (`skyTopColor`, `skyHorizonColor`, `skyBottomColor`) + солнечный диск и пресеты атмосферы ПГТ (`PGT Overcast`, `PGT Dusk`, `PGT Foggy Night`, `Anomaly Shift`).
- **Террейн (`packages/project-schema/src/terrain.ts`, `apps/editor/src/TerrainEditor.tsx`)**: кисти `Noise` и `Terrace`, настройка `Falloff`, процедурный генератор ландшафтов (`Flat`, `Hills`, `Valley`, `Crater`, `Ridge`) и `Auto-paint` по склону.

## 3. Редактор кода, материалов и физические поведения
- **Monaco CodeEditor (`apps/editor/src/CodeEditor.tsx`)**: подсветка синтаксиса TypeScript и GLSL, встроенный каталог автодополнения всего `GameAPI` (работает сразу без предварительного запуска скрипта генерации), сниппеты lifecycle-хуков и GLSL-юниформов, цветные скобки и автозакрытие.
- **Редактор материалов (`apps/editor/src/Authoring.tsx`, `materialTextures.ts`)**: пресеты материалов (Бетон/Панелька, Мокрый асфальт, Советская плитка, Кирпич, Ржавый металл, Стекло, Лампа, Плиты), встроенный генератор бесшовных 256×256 текстур + Sobel Normal Map прямо в браузере, `emissiveIntensity`, `castShadow`/`receiveShadow`, пресеты шейдеров (`Anomaly Glitch (Смещение)`, `Wet Specular`, `CRT Scanlines`).
- **Физические поведения (`packages/behaviors/src/`)**: `buoyancy` (плавучесть), `grabbable` (подбор/перенос/бросок пропов по `E`/`F`), `hingeDoor` (двери на петлях), `movingPlatform` (кинематический лифт), `impulseZone` (батут/импульсная аномалия), `gravityZone` (зона гравитации для «Смещения»), `flickerLight` (мерцание ламп), `patrol` (патруль).

## 4. Как запустить и проверить локально
```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm dev
```
