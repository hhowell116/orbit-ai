// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

struct PtyState {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

#[tauri::command]
fn pty_write(state: tauri::State<PtyState>, data: String) {
    if let Ok(mut writer) = state.writer.lock() {
        let _ = writer.write_all(data.as_bytes());
        let _ = writer.flush();
    }
}

#[tauri::command]
fn pty_resize(width: u16, height: u16) {
    // PTY resize would need the master pair reference — simplified for now
    let _ = (width, height);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Spawn PTY with default shell
            let pty_system = native_pty_system();
            let pair = pty_system
                .openpty(PtySize {
                    rows: 24,
                    cols: 80,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .expect("Failed to open PTY");

            // Determine the shell to use
            let shell = if cfg!(target_os = "windows") {
                "powershell.exe".to_string()
            } else {
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
            };

            let mut cmd = CommandBuilder::new(&shell);
            cmd.cwd(dirs_next::home_dir().unwrap_or_else(|| ".".into()));

            let _child = pair.slave.spawn_command(cmd).expect("Failed to spawn shell");
            drop(pair.slave); // Close slave side in parent

            let writer = Arc::new(Mutex::new(pair.master.take_writer().unwrap()));

            // Read from PTY and emit to frontend
            let mut reader = pair.master.try_clone_reader().unwrap();
            std::thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
                            let _ = handle.emit("pty-output", data);
                        }
                        Err(_) => break,
                    }
                }
            });

            app.manage(PtyState { writer });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![pty_write, pty_resize])
        .run(tauri::generate_context!())
        .expect("error while running Orbit AI");
}
