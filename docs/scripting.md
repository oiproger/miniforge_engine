# Скрипты Miniforge

Создайте Script в Inspector или импортируйте файл TS/JS через Assets. Назначьте ресурс компоненту Script нужной сущности. Модуль экспортирует фабрику экземпляра. Публичные типы объявлены в `packages/runtime/src/types.ts` и `lifecycle.ts`. При работе во внешнем IDE допустим импорт типов, который TypeScript удалит при компиляции. В редакторе контекст называется `GameAPI`.

```ts
export default function (api: GameAPI) {
  let unsubscribe: (() => void) | undefined
  return {
    onStart() {
      unsubscribe = api.events.on('coin.collected', () => {
        api.vars.pickups = Number(api.vars.pickups ?? 0) + 1
      })
    },
    onUpdate(dt: number) {
      api.object.rotation.y += Number(api.params.speed ?? 1) * dt
    },
    onDestroy() { unsubscribe?.() }
  }
}
```

В Inspector создайте числовой параметр `speed`. У каждого экземпляра свой словарь `api.params`. Доступны числа, флаги, строки, цвета, тройки координат и ссылки на сущности или ресурсы по ID.

| API | Назначение |
| --- | --- |
| `entity`, `project` | Данные сущности и проекта |
| `object`, `transform` | Текущий Three.js Object3D. Локальная позиция, масштаб, вращение в радианах |
| `find(id)`, `component(type)` | Найти объект сцены или включённый компонент |
| `time`, `input.move`, `input.pressed(action)` | Секунды симуляции, направление XZ, состояние клавиши или действия |
| `events.on(name, fn)`, `events.emit(name, data)` | Подписка с функцией отписки и отправка события |
| `vars`, `save.set(key, value)`, `await save.get(key)` | Переменные раунда и асинхронное сохранение прогресса |
| `physics.raycast(origin, direction, length)` | ID пересечённой сущности, аргументы направления и начала имеют тип Vector3 |
| `scene.load(id)`, `ui.get(id)` | Загрузить сцену, получить DOM-элемент игрового HUD |
| `audio.play(assetId)`, `t(key, params)` | Звук и перевод с подстановкой параметров |
| `platform.showRewarded()` | Promise с результатом рекламного просмотра |

Движок вызывает onCreate при создании, onStart после загрузки сцены, onUpdate с интервалом кадра и onFixedUpdate с шагом 1/60 с. onCollisionEnter, onTriggerEnter и onTriggerExit получают ID второго объекта. onPointerClick реагирует на выбор мышью. onDestroy вызывается при смене сцены и остановке сессии.

Исключения обработчиков попадают в консоль. Preview ограничивает сетевой доступ и права iframe. Экспорт ожидает автономные скриптовые модули без импортов исполняемых зависимостей. Отладку стороннего кода и проверку типов всего проекта можно выполнять во внешнем IDE.
