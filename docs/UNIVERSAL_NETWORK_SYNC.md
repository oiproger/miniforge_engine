# Network Sync — selected fields and entity lifecycle (3.0.4)

## Inspector

- **Owner authority**: Host (shared world objects) or Local player owned (independent proxies per peer).
- **Sync Transform**: position/rotation/scale. **Sync Animation**: current state/clip.
- **Sync Active / Visibility**: shares `Entity.active` using host/owner snapshots; children follow normal entity hierarchy.
- **Sync Spawn / Despawn**: host-owned prefabs created by `api.net.spawnNetworkPlayer` use stable root IDs and new peers receive their spawn records. `api.destroy` of host-owned synced entities is propagated and stored as a tombstone for late joiners.
- **Sync Paths**: comma-separated selected paths. `properties.hp`, `properties.inventory.gold`, `components.light.intensity`, `components.mesh.color`, `components.behavior.params.speed`, `components.light[1].range`.
- `Sync Keys` is retained as an old-project alias for `properties.*`.
- A helper dropdown in Inspector can add existing entity properties and simple component fields. Up to 32 valid selected paths are sent per entity per tick. Paths are explicitly allowlisted on the receiving side.

## Script API

```ts
api.net.setSyncedField('door-1', 'properties.open', true)
const isOpen = api.net.getSyncedField('door-1', 'properties.open')
```

The field must be selected in the entity's Network Sync Inspector. The default host authority blocks client writes to shared world objects when connected. Only plain bounded JSON values are supported. Executable script code, component types/IDs/assets, prototypes and network sync internals cannot be remote-written.

Component data is replicated as configuration. Supported live-render updates include light intensity/color/range, mesh color/material, decal opacity and particle rate. Other component fields are updated in the scene object, **but may require an additional behavior listener via `net.fieldChanged` to apply live**. A complete generic PBR renderer patch for all component fields is not part of this change.

## Collectibles in Multiplayer Arena

The Energy Beacon now has host-owned Network Sync with **Sync Active** enabled. A client approaching the beacon sends a pickup request. The host validates the requesting peer's network player proxy and distance before hiding the beacon. Other players receive `active: false` through the normal snapshot. Score is awarded to the collecting client. Late joiners receive the host's current active state on the next snapshot.

## Limitations

- Current packets are tick-based snapshots, not a transactional replicated database. Path changes can be missed if rapidly changed and reversed within the same network tick.
- Reconnects and late joins cause a full snapshot of selected fields; spawned entities and destroyed tombstones are also sent by the host (bounded to 256 spawns, 512 tombstones per join).
- `net:spawn` only accepts a prefab already in the project and a host-supplied root ID. Only the host may spawn shared prefabs; peer-owned player proxies remain separate.
- No protocol version migration or server persistence. The transport can elect a new host or follow the new Steam lobby owner. Recovery of the previous host’s match state is not implemented. [Network roadmap](NETWORKING.md)
- The WebSocket relay authenticates *connection identity*, not game actions. Critical actions must be checked by the host, as pickup is in this example.
- Collection range uses the peer's last transmitted position, with a 0.3-unit tolerance to allow for network delay.
