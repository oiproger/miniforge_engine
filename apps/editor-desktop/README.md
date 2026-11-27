# Настольные приложения

Редактор и игра используют системный WebView2 (Windows) или WebKitGTK 4.1 (Linux) и требуют работающий WebGL2. Файловый диалог редактора позволяет сохранить проект и сборку на диск. Открытие и импорт используют обычный выбор файлов. Игровой профиль поставляет только содержимое выбранного веб-экспорта и запускается без команд файловой системы редактора.

## Steamworks в редакторе

В Desktop-редакторе откройте **Project → Steamworks & Debug Panel**, включите Steamworks для проекта и нажмите **Play with Steam**. Обновлённые сцены запускаются со Steam без нового экспорта. Установщик Desktop-редактора включает Steamworks redistributable. Для смены AppID перезапустите редактор. [Проверка Steam Relay Lab](../../docs/STEAM_NATIVE.md)

## Сборка на своей платформе

Установите Rust stable с Cargo, Node.js и зависимости workspace через pnpm. Для Linux установите пакеты из шага Install Linux WebView development packages в desktop.yml. Для Windows нужны Visual Studio Build Tools с C++ и Microsoft Edge WebView2. Выполняйте команды из корня репозитория.

```sh
pnpm build
pnpm desktop:editor
pnpm export:demo
pnpm desktop:game
```

Для своей игры экспортируйте Web Standalone, распакуйте ZIP и передайте папку с index.html.

```sh
node apps/editor-desktop/build.mjs game path/to/unpacked-game
```

Готовые установщики появятся в `apps/editor-desktop/src-tauri/target/release/bundle/deb/` (Linux) или `nsis/` (Windows). Профили для Windows и Linux собираются на соответствующих ОС.

В GitHub Actions вручную запустите **Native builds**. Укажите путь к сохранённому в репозитории проекту JSON или .miniforge либо оставьте поле пустым для Coin Rush 3D. Четыре задания отдельно собирают редактор и игру для каждой системы и прикладывают установщики к результатам запуска.
