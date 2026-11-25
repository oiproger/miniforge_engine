# Miniforge Engine

**English version:** [README.md](./README.md) · **План развития:** [ROADMAP.md](./ROADMAP.md)

Лёгкий (~15 МБ в десктопной сборке) браузерный 3D-движок и студия прототипирования «всё в одном» на базе **LittleJS 1.30.1** (WebGL2 3D), **Rapier3D** (WASM-физика), **React 19 + TypeScript 5.9** и **Tauri v2**.

Создан для инди-разработчиков, веб-порталов и геймджемов: моделируйте low-poly ассеты, красьте 2D/3D-материалы, синтезируйте звуки и музыку, собирайте логику нодами (Blueprints), делайте диалоги и катсцены и экспортируйте игры под Web или Desktop, не покидая редактор.

- **Запустить редактор в браузере:** `https://oiproger.github.io/miniforge_engine/editor/`
- **Полная документация (v3.0.0):** `https://oiproger.github.io/miniforge_engine/docs/`


## Что нового в v3.0.0

- **Материалы, шейдеры и профайлер**: живое 3D PBR-превью материалов сбоку в редакторе материалов и в инспекторе, Shader Studio в формате LittleJS `mainImage`/`mainVertex` с управлением uniform-параметрами из кода (`api.materials.setShaderUniform`) и Event Graph, а также Scene Profiler во вкладке **Performance**.
- **Animation State Machine**: визуальный граф переходов (`Idle -> Walk -> Run -> Jump`) с панорамированием и зумом, параметрами (`float`/`bool`/`trigger`), `api.animation.setParam / setTrigger / playState / getCurrentState` и нодами Event Graph.
- **Отдельная кисть Prop / Foliage Scatter Brush**: вынесена рядом с плашками Transform/Snap, открывается в правой панели вместо инспектора и работает как по **Terrain**, так и по **любым 3D-мешам** с авто-батчингом (`staticBatch`).
- **Единый Input, Gamepad & Touch Manager**: переназначение клавиш, мыши, геймпадов (W3C Gamepad API) и сенсорных контролов в одном окне, а также перспективный вид по умолчанию.
- **Мультиплеер и Steam API (нативный SDK ещё не подключён)**: локальный Split-Screen (2–4 игрока), WebSocket (`server/relay-server.mjs`), WebRTC P2P и Steam P2P + лобби (`AppID 480` + авто-экспорт `steam_appid.txt`), компонент `Network Sync` с дельта-синхронизацией произвольных полей (`Sync Keys`), Net Debugger с запуском **Host + Client** в 1 клик, **12 стартовых шаблонов** и **13 примеров**.

## Что внутри

- **Project Hub и автоподгрузка `/examples/`:** стартовое окно с выбором, созданием и открытием проектов; примеры автоматически подгружаются из папки `examples/` с автогенерацией 3D-скриншотов и описанием из проекта. Возврат из редактора — кнопкой **Projects** в шапке.
- **Редактор сцен и живые префабы:** 3D-вьюпорт, гизмо, террейн, навигация NavGrid, свет/постпроцессинг и 3D-пипетка выбора объектов прямо со сцены.
- **Event Graph (Blueprints):** визуальное программирование на нодах с типизированными пинами, переменными и кастомными функциями (вместе со скриптами TypeScript).
- **Low-Poly CSG Mesh Builder:** булевы операции (`Union`/`Subtract`), интерактивный **Drag Extrude / Drag Inset** мышью, `Subdivide`/`Mirror X`, быстрая UV-развёртка, неограниченные слоты материалов и мгновенная 60 FPS **3D-кисть материалами** с экспортом в `.glb`.
- **Model Editor:** импорт 3D-моделей через `assimpjs` WASM, переопределение материалов и нарезка анимаций по таймлайну.
- **2D Paint Editor:** слои, симметрия, бесшовный тайлинг 3×3 и экспорт в PNG.
- **Sound / SFX / Music Synth:** пресеты, 16-шаговый секвенсор, экспорт `.wav` и модификация звука в рантайме (`setSemitones`, `setSpeed`, `setLowpass`).
- **Dialogue & Quest Graph + Keyframe Sequencer:** ветвящиеся диалоги, квесты и многодорожечные катсцены.
- **Система плагинов (v2.2):** создание, редактирование и импорт/экспорт `.mfplugin.json` с расширением редактора и рантайма (4 встроенных примера от HUD до RPG-инвентаря).
- **Динамический UI API и 95+ нод Event Graph (v2.7):** создание/обновление/удаление UI-экранов и базовых виджетов (`label`, `button`, `bar`, `panel`, `image`, `html`), `ui.mount` из кода и Event Graph (интерпретатор + AOT-компилятор), а также ноды Audio, Dialogue/Quest, Sequencer, Particles, NavGrid, Touch и Tween.
- **Export Settings и Export Templates (v3.0.0):** отдельное окно настроек экспорта (название, версия, Bundle ID, иконка, окно/fullscreen) и мгновенная сборка исполняемых файлов под Windows, macOS и Linux через готовые шаблоны плеера (или Tauri Source ZIP).

## Быстрый старт

Требования: **Node.js 20+** и **pnpm 10+**.

```bash
pnpm install
pnpm dev
```

### Основные команды

```bash
pnpm typecheck      # Проверка типов TypeScript
pnpm build          # Сборка веб-редактора в dist/editor/
pnpm build:site     # Сборка лендинга + документации + редактора в dist/pages/
pnpm test           # Юнит-тесты (Vitest)
pnpm desktop:editor # Десктопная сборка редактора (Tauri v2, ~15 МБ)
```

## План развития (Roadmap)

Подробная версия в [ROADMAP.md](./ROADMAP.md):

- **v2.8:** Редактор материалов с живым 3D-превью, редактор GLSL-шейдеров с живым превью, слайдерами uniform и пресетами, профайлер сцены.
- **v2.9:** Визуальная Animation State Machine, кисть расстановки пропов и листвы, Input & Gamepad Manager.
- **v3.0:** Мультиплеер (локальный Split-Screen, WebSocket и WebRTC P2P), компонент `NetworkSync` для синхронизации параметров, лобби и отладка Host + Client прямо из редактора.
- **v3.1:** Интеграция со Steamworks SDK для десктоп-сборок (Steam Lobbies, Steam Networking Sockets, достижения, облачные сохранения) и панель отладки Steam.

## Известные ограничения

- Движок ориентирован на **low-poly / стилизованное 3D** и быстрое прототипирование, а не на тяжёлую AAA-графику.
- Требуется поддержка WebGL2; для слабых мобильных устройств на крупных сценах рекомендуется включать статический батчинг и дистанцию отсечения.
- Плагины выполняются в лёгком контексте (`new Function`) и рассчитаны на доверенный код автора или сообщества.

## Поддержать разработку

Проект полностью бесплатный и открыт под лицензией MIT. Поддержать развитие движка можно здесь:

- **Boosty (РФ):** `https://boosty.to/oipdever`
- **CloudTips (разовый донат с карты РФ):** `https://pay.cloudtips.ru/p/93fbe76b`
- **Tribute (Telegram / крипто):** `https://t.me/tribute/app?startapp=dUBS`
- **Lava.top (зарубежные карты):** `https://app.lava.top/oipdever`

## Благодарности и разработка

Архитектура, проектирование, тестирование и поддержка — [@oiproger](https://github.com/oiproger) с использованием AI-assisted разработки.

## Лицензия

[MIT License](./LICENSE). В проекте используются открытые библиотеки, включая [LittleJS](https://github.com/KilledByAPixel/LittleJS) (MIT) и [Rapier](https://rapier.rs/) (Apache 2.0).
