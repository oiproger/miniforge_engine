# Native Steamworks export

Enable Steam in the project settings and enter the AppID registered in Steamworks. Select Steam P2P in multiplayer settings for Steam matchmaking and Steam Datagram Relay. Steam uses its own identity, lobbies and relay infrastructure. You do not need to deploy the Miniforge WebSocket relay for this transport.

## Build a depot

1. Export the project for the target desktop OS. Steam-enabled projects use the source package because ordinary prebuilt players do not carry the Steamworks SDK. The package includes the native bridge and a depot build script.
2. Extract the archive on the target OS and run `npm run build` with Rust and the usual Tauri prerequisites. The script builds with the `steamworks` feature, puts the executable and its Steamworks redistributable next to one another in `steam-depot/` and uses the release profile.
3. Set `MINIFORGE_STEAM_TEST_APP_ID` when building a local test depot if you need `steam_appid.txt`. Launch the game with Steam running and with an account that has access to the AppID. Configure the actual deployment in Steamworks and SteamPipe. Production depots omit `steam_appid.txt`. On macOS, configure an application bundle and signing for distribution.
4. Verify with two Steam accounts on separate machines, preferably on different networks. Create a lobby, join by invite and confirm that each user receives game events and sees the other user's state. Repeat after the owner leaves and Steam assigns a new owner. Check local saves, Steam Cloud, and an achievement defined for the AppID.

`STEAM_SDK_LOCATION` can point at an installed Steamworks SDK root. Without the override, the build uses the redistributable supplied by the pinned Rust binding.

## Game logic

- Create or join a lobby with `api.steam.createLobby` or `api.steam.joinLobby`, then call `api.net.connect({ mode: 'steam-p2p', room: lobby.id })`. Graph nodes Steam Create Lobby and Steam Join Lobby perform both actions and provide completion and failure outputs. Steam IDs stay strings.
- Use `api.steam.inviteFriends()` to open the Steam overlay. Subscribe to the `steam.lobbyInvite` game event or read `api.steam.getPendingInvite()` on startup. Pass the invite's `lobbyId` to Steam Join Lobby after confirmation.
- Use Network Status and Steam Relay Status for lobby UI. The relay status reports SDR initialization and availability. A successful lobby join only confirms membership. Test packet exchange separately.
- Use `api.steam.queryAchievement()`, `readStat()`, `writeStat()`, `isDlcInstalled()`, and `listCloudFiles()` for native features. Steam achievement and stat identifiers must be registered for the AppID. `api.saveSystem` uses Steam Cloud for native Steam games while retaining a local copy.
- Steam Local Debug remains an explicit editor simulation with no Steam account or relay. Browser exports use the browser APIs available to their platform.

In Event Graph, use **Completed** or **Failed** after Steam, save or network operations. Existing **Started** wires still run when the request starts. Graphs with unsupported compiled operations are kept interpreted and listed in the export report.
