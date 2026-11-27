# DB Editor · Таблицы данных проекта

Откройте **Assets → Add asset → New DB Asset**. В **DB Editor** задайте уникальное имя базы, добавьте колонки и строки. Нажмите заголовок колонки или ID строки, чтобы переименовать его. Нажмите ячейку, введите JSON, затем выберите **Apply → Save changes**.

Одна база — одна таблица. У строки есть стабильный ID, а значения в колонках могут быть числами, строками в кавычках, логическими значениями, `null`, массивами и вложенными объектами. Строки могут заполнять разные наборы колонок. **Clear cell** удаляет значение. Ячейка с `null` считается заполненной.

## Скрипты

Все DB Asset включаются в экспорт. Доступ по имени базы чувствителен к регистру. В примере база называется `Inventory`, ID строки — `key`, а в колонке `stats` хранится объект `{"price":12,"tags":["quest"]}`.

```js
api.db.list(); // ["Inventory"]
api.db.rows("Inventory"); // [{ id: "key", values: { stats: ... } }]

api.db.get("Inventory", "key"); // вся строка без ID
api.db.get("Inventory", "key", "stats.price"); // 12

api.db.set("Inventory", "key", "stats.price", 20);
api.db.set("Inventory", "key", ["stats", "tags", 0], "rare");
api.db.has("Inventory", "key", "stats.price");
api.db.delete("Inventory", "key", "stats.tags.0");

api.db.upsertRow("Inventory", "map", { stats: { price: 5 } });
api.db.removeRow("Inventory", "map");
api.db.reset("Inventory");
```

Передайте путь массивом, если само имя поля содержит точку. Например, `["cost.gold"]` читает колонку с именем `cost.gold`. Чтение возвращает копию. Запись может добавить строку или вложенное поле и возвращает `false` для неизвестной базы, несовместимого пути или значения вне JSON. `upsertRow()` заменяет объект строки целиком. `reset()` восстанавливает данные ассета. Изменения в игре живут в текущем запуске, включая переходы между сценами.

На успешную запись, удаление или сброс можно подписаться через `api.events.on("db.changed", handler)`. Событие передаёт имя базы, операцию и ID строки или путь, если они применимы.

## Event Graph

Ноды находятся в категории **Database**. **List Databases**, **List DB Rows**, **Get DB Value** и **Has DB Value** читают данные. **Set DB Value**, **Delete DB Value**, **Insert or Replace DB Row**, **Remove DB Row** и **Reset Database** возвращают **Success**. Для литерала в **Value (JSON or wire)** вводите JSON. Значение, пришедшее по связи, используется со своим исходным типом. Для реакции на изменения используйте **On Custom Event** с именем `db.changed`.

## Dialogue Editor

Создайте узел **Action**, выберите **Set DB Value**, базу, **Row ID**, **Field path** и **Value (JSON)**. Например, `Inventory` → `key` → `stats.price` → `0`. Для буквального имени колонки с точкой укажите JSON-массив в пути. Запись выполняется при прохождении ноды и сразу доступна скриптам и графам. При ошибке действия движок отправляет `db.error` и продолжает диалог.
