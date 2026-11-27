# Steamworks — редактор, SDK и экспорт депо

Включите Steamworks для проекта и укажите AppID. Для автоматического подключения задайте **Steam P2P** в настройках мультиплеера. Если в игре есть экран выбора лобби, оставьте `singleplayer` при запуске и подключайте Steam-транспорт после выбора комнаты. Так работает **Steam Relay Lab**. Steam использует свои аккаунты, лобби и инфраструктуру ретрансляции. Отдельный Node.js relay для Steam не нужен. [Обзор сетевых режимов](NETWORKING.md)

## Быстрая проверка в Steam Relay Lab

Откройте **Projects → Examples → Steam Relay Lab** в редакторе. **Play** запускает панель проверки. Для двух клиентов откройте **Project → Multiplayer & Net Debugger → Launch Host + Client**. Проект поставляется с флагом **Local Debug Simulation**, поэтому редактор показывает режим **Local Debug simulation** и выдаёт отдельный тестовый ID каждому клиенту.

| Что проверить | Действие | Ожидаемый результат |
|---|---|---|
| Создание и поиск лобби | Host нажимает **Create lobby**, Client нажимает **Find lobbies** и **Join lobby**. | На обеих панелях виден одинаковый ID лобби. Статус транспорта показывает `steam-p2p · 2 connected`. |
| Доставка игрового пакета | На Host нажмите **Ping peer**. | Host показывает **Round trip confirmed** со временем обмена. Client подтверждает получение и ответ. |
| Метаданные и выход | Host нажимает **Update lobby metadata**. Один клиент нажимает **Leave**. | Изменение видно в поле **Metadata probe**. После выхода список участников и владелец обновляются. |
| Cloud и достижение | Нажмите **Cloud write**, **Cloud read** и **Cloud list**. Затем **Test achievement**. | Читается тестовый JSON, файл появился в списке. Local Debug позволяет проверить обработку достижения на тестовом имени `ACH_LOBBY_JOINED`. |

**Local Debug** проверяет игровой интерфейс, обмен сообщениями и обработку результатов через симуляцию. В изолированном iframe данные отладки могут храниться только до перезапуска превью. **Ping peer** подтверждает доставку по текущему транспорту. Название режима в верхней строке отличает симуляцию от настоящего Steamworks.

### Проверка из Desktop-редактора через Steam

1. Откройте Desktop-редактор Miniforge со Steamworks и войдите в Steam на той же машине.
2. Откройте **Steam Relay Lab**, затем **Project → Steamworks & Debug Panel**. Убедитесь, что Steamworks включён, выберите AppID и нажмите **Play with Steam**. Настройки из панели используются для этого запуска. Нажмите **Save Steam Settings**, чтобы сохранить их в проект.
3. Во вкладке **Game** ожидаются режим **Native Steamworks** и ваш Steam ID. Нажмите **Stop**, измените проект и снова выберите **Play with Steam**. Редактор запускает текущую сцену через установленный Steamworks-мост. Экспорт, Cargo и перепаковка при каждом изменении не нужны. Если установка устарела, воспользуйтесь новой сборкой Desktop-редактора.
4. Для лобби и обмена пакетами используйте второй компьютер с другим Steam-аккаунтом и тем же AppID. **Launch Host + Client** остаётся локальным симулятором. Если Steam Overlay недоступен в Desktop-редакторе, подключите второй клиент по ID лобби. Overlay и запуск через Steam проверяйте в депо.

Steam привязывает AppID к процессу. Для смены AppID после успешной инициализации перезапустите Desktop-редактор. Обычный **Play** использует Local Debug, если проект его включил. При ошибке **Play with Steam** редактор выводит причину в уведомлении и в Console.

### Проверка собранного депо через Steam

1. В **Project → Steamworks & Debug Panel** установите доступный обоим тестовым аккаунтам AppID. У примера по умолчанию AppID `480` для Spacewar. Используйте собственный AppID для доступа к своим достижениям, статистике и DLC. Сохраните настройки и экспортируйте Desktop-пакет.
2. Распакуйте его и соберите депо. Для локального запуска при необходимости задайте ту же переменную AppID, что указана в проекте.

   Linux или macOS

   ```bash
   MINIFORGE_STEAM_TEST_APP_ID=480 npm run build
   cd steam-depot
   ./miniforge
   ```

   Windows PowerShell

   ```powershell
   $env:MINIFORGE_STEAM_TEST_APP_ID = '480'
   npm run build
   Set-Location steam-depot
   .\miniforge.exe
   ```

3. Запустите сборку на двух машинах с авторизованным Steam. В панели должен появиться режим **Native Steamworks** и реальные Steam ID. Нажмите **Relay status** для проверки доступности SDR. Повторите создание лобби и **Ping peer**. Для проверки приглашений откройте **Invite friends** у хоста и **Join invited lobby** у получателя. Получатель также может ввести ID напрямую.
4. Для Steam Cloud используйте тестовый файл из раздела **Steam services**. Для достижений, статистики и DLC заполните соответствующие поля зарегистрированными в Steamworks именами и ID. Пример изменяет статус достижения только по явному нажатию **Test achievement**. Чтение статистики и проверка DLC не меняют данные аккаунта.

Если панель показывает **Steam unavailable**, проверьте запущенный Steam, AppID и доступ аккаунта к приложению, затем нажмите **Retry Steam**. При проверке владельца используйте **Leave** на исходном хосте и наблюдайте новое значение в списке участников второго клиента.

## Сборка депо

1. Экспортируйте проект для целевой Desktop-платформы. Для Steam редактор создаёт архив с исходниками, нативным мостом и скриптом сборки депо.
2. Распакуйте архив на целевой ОС и запустите `npm run build`. Понадобятся Rust и системные зависимости Tauri. Скрипт собирает release-профиль с флагом `steamworks` и помещает исполняемый файл и библиотеку Steamworks в `steam-depot/`.
3. Для локального запуска при необходимости задайте `MINIFORGE_STEAM_TEST_APP_ID` при сборке. Эта переменная добавляет `steam_appid.txt`. Настройте продуктивное депо в Steamworks и SteamPipe без этого файла. Для поставки macOS упакуйте и подпишите приложение.
4. При приёмке проверьте приглашение, выход владельца лобби, передачу пакетов после смены владельца и сервисы на своём AppID.

`STEAM_SDK_LOCATION` позволяет указать путь к установленному Steamworks SDK. По умолчанию сборка использует библиотеку из закреплённой версии Rust-биндинга.

## Сценарии, Script API и Event Graph

| Возможность | Script API | Event Graph |
|---|---|---|
| Идентификация и диагностика | `init(appId?)`, `getUser()`, `getMode()`, `isNative()`, `isDebug()`, `isAvailable()`, `getLogs()` | **Steam User Name** |
| Матчмейкинг | `createLobby({ name, maxMembers, type, data })`, `listLobbies()`, `joinLobby(id)`, `leaveLobby()`, `setLobbyData()`, `getLobby()`, `onLobbyChanged()` | **Steam Create Lobby**, **Steam List Lobbies**, **Steam Join Lobby**, **Steam Leave Lobby**. Метаданные и чтение текущего лобби доступны из скрипта. |
| SDR и приглашения | `relayStatus()`, `inviteFriends()`, `onLobbyInvite()`, `getPendingInvite()` | **Steam Relay Status**, **Steam Invite Friends**, **On Steam Lobby Invite**, **Steam Pending Lobby Invite** |
| Достижения | `unlockAchievement()`, `queryAchievement()`, `clearAchievement()`, `hasAchievement()`, `listAchievements()` | **Steam Unlock Achievement** |
| Steam Cloud | `cloudWrite()`, `cloudRead()`, `cloudDelete()`, `listCloudFiles()` | **Steam Cloud Save** записывает файл. Чтение, список и удаление доступны из скрипта. |
| Rich Presence, статистика и DLC | `setRichPresence()`, `clearRichPresence()`, `readStat(name, floatingPoint?)`, `writeStat(name, value, floatingPoint?)`, `isDlcInstalled(appId)` | **Steam Set Rich Presence**. Статистика и DLC доступны из скрипта. |

- В скрипте вызовите `api.steam.createLobby()` или `api.steam.joinLobby(id)`. После успеха подключите транспорт через `api.net.connect({ mode: 'steam-p2p', room: lobby.id })`. Ноды **Steam Create Lobby** и **Steam Join Lobby** выполняют оба шага. Steam ID и ID лобби передавайте строками.
- Для Steam Overlay используйте `api.steam.inviteFriends()`. Запущенная игра получает событие `steam.lobbyInvite`. При старте проверьте `api.steam.getPendingInvite()` и передайте `lobbyId` в **Steam Join Lobby** после подтверждения игроком.
- **Network Status** показывает подключение к комнате, а **Steam Relay Status** — состояние SDR. Для подтверждения доставки используйте тестовый RPC с ответом второго клиента.
- `api.saveSystem` в нативном режиме использует Steam Cloud для облачной части и пытается записать локальную копию. Флаг **Enable Steam Cloud Saves** пока сохраняется в настройках проекта, но рантайм его не применяет. Для конкретного вызова сохранения облако можно отключить параметром `cloudSync: false`. Для ручной работы с файлами используйте `api.steam.cloudWrite()`, `cloudRead()`, `cloudDelete()` и `listCloudFiles()`.
- Для нативной проверки достижения используйте `await api.steam.queryAchievement(id)`. Синхронные `hasAchievement()` и `listAchievements()` в нативном режиме читают кэш текущего запуска. Для списка облачных файлов используйте `await api.steam.listCloudFiles()`. Синхронный `cloudList()` обслуживает Local Debug.
- В Local Debug `getMode()` возвращает `local-debug`, а `isAvailable()` остаётся `false`. Для логики, которую тестируют в обоих режимах, проверяйте, что `getMode()` возвращает `native` или `local-debug`. Экспорт для браузера не запускает Steam-симуляцию.

В Event Graph используйте **Completed** и **Failed** у нод, которые предоставляют эти выходы. **Started** срабатывает сразу. У **Steam Unlock Achievement** и **Steam Set Rich Presence** есть обычный выход выполнения. Если нужно подтвердить результат этих операций, дождитесь ответа из Script API. Графы с неподдерживаемыми при компиляции операциями остаются интерпретируемыми и указаны в отчёте экспорта.

### Диагностика результатов

| Наблюдение | Что проверять |
|---|---|
| **Local Debug simulation** | Это обычный **Play** или **Launch Host + Client**. Для аккаунта Steam используйте **Play with Steam** в Desktop-редакторе. |
| Ошибка ещё до открытия Game | Посмотрите уведомление и Console. Проверьте версию Desktop-редактора, запущенный Steam, доступ к AppID. После смены AppID перезапустите Desktop-редактор. |
| Лобби видно, **Ping peer** не отвечает | Сверьте AppID и ID лобби, дождитесь второго пира в поле **Transport**, затем проверьте **Relay status**. Состояния лобби, готовность SDR и подтверждённый RPC измеряются отдельно. |
| Оверлей не открывается | Для текущего теста используйте ID лобби. Приглашения с оверлеем проверьте в сборке, запущенной через Steam. |
| Cloud, достижение, статистика или DLC возвращают ошибку | Для сервиса проверьте его настройки в Steamworks и права тестового аккаунта. AppID 480 подходит для проверки подключения и лобби. Для собственных сервисов используйте AppID своего проекта. |

Автотесты проверяют Local Debug, состав Desktop-архива и повторный запуск **Play with Steam** с подменой IPC. Нативная проверка с двумя аккаунтами и собственным AppID остаётся пунктом приёмки. [План сетевых работ](NETWORKING.md)
