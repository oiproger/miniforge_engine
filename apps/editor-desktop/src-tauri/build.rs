fn main() {
    if std::env::var_os("CARGO_FEATURE_STEAMWORKS").is_some() {
        match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
            Ok("linux") => println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN"),
            Ok("macos") => println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path"),
            _ => {}
        }
        if std::env::var_os("CARGO_FEATURE_EDITOR").is_some() {
            match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
                Ok("linux") => {
                    println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN/../lib/miniforge-editor")
                }
                Ok("macos") => {
                    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks")
                }
                _ => {}
            }
        }
    }
    tauri_build::build()
}
