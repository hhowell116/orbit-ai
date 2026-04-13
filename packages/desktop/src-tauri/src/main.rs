// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

struct PtyState {
    writer: Option<Arc<Mutex<Box<dyn Write + Send>>>>,
}

#[tauri::command]
fn pty_write(state: tauri::State<PtyState>, data: String) {
    if let Some(ref writer) = state.writer {
        if let Ok(mut w) = writer.lock() {
            let _ = w.write_all(data.as_bytes());
            let _ = w.flush();
        }
    }
}

#[tauri::command]
fn pty_resize(_width: u16, _height: u16) {}

fn try_spawn_pty(
    handle: tauri::AppHandle,
    ws_tx: broadcast::Sender<String>,
) -> Option<Arc<Mutex<Box<dyn Write + Send>>>> {
    let pty_system = native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: 24, cols: 80, pixel_width: 0, pixel_height: 0,
    }) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[pty] Failed to open PTY: {}", e);
            return None;
        }
    };

    // Try powershell first, fall back to cmd
    let shells: Vec<String> = if cfg!(target_os = "windows") {
        vec!["powershell.exe".into(), "cmd.exe".into()]
    } else {
        vec![
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()),
            "/bin/sh".into(),
        ]
    };

    let mut child = None;
    for shell in &shells {
        let mut cmd = CommandBuilder::new(shell);
        cmd.cwd(dirs_next::home_dir().unwrap_or_else(|| ".".into()));
        match pair.slave.spawn_command(cmd) {
            Ok(c) => {
                println!("[pty] Spawned shell: {}", shell);
                child = Some(c);
                break;
            }
            Err(e) => {
                eprintln!("[pty] Failed to spawn {}: {}", shell, e);
            }
        }
    }

    if child.is_none() {
        eprintln!("[pty] Could not spawn any shell — terminal disabled");
        return None;
    }

    drop(pair.slave);

    let writer = Arc::new(Mutex::new(pair.master.take_writer().unwrap()));
    let mut reader = pair.master.try_clone_reader().unwrap();

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = handle.emit("pty-output", &data);
                    let _ = ws_tx.send(data);
                }
                Err(_) => break,
            }
        }
    });

    Some(writer)
}

fn main() {
    let (ws_tx, _) = broadcast::channel::<String>(256);
    let ws_tx_clone = ws_tx.clone();

    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");

    // WebSocket bridge server
    let ws_tx_for_server = ws_tx.clone();
    rt.spawn(async move {
        let listener = match TcpListener::bind("127.0.0.1:9876").await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[bridge] Failed to bind :9876 — {}", e);
                return;
            }
        };
        println!("[bridge] WebSocket bridge listening on ws://127.0.0.1:9876");

        loop {
            if let Ok((stream, addr)) = listener.accept().await {
                println!("[bridge] Client connected: {}", addr);
                let mut rx = ws_tx_for_server.subscribe();

                tokio::spawn(async move {
                    let ws_stream = match accept_async(stream).await {
                        Ok(ws) => ws,
                        Err(e) => {
                            eprintln!("[bridge] WebSocket handshake failed: {}", e);
                            return;
                        }
                    };

                    let (mut ws_write, mut ws_read) = ws_stream.split();

                    let write_task = tokio::spawn(async move {
                        while let Ok(data) = rx.recv().await {
                            let msg = serde_json::json!({
                                "type": "pty-output",
                                "data": data
                            });
                            if ws_write.send(Message::Text(msg.to_string())).await.is_err() {
                                break;
                            }
                        }
                    });

                    while let Some(Ok(msg)) = ws_read.next().await {
                        match msg {
                            Message::Close(_) => break,
                            _ => {}
                        }
                    }

                    write_task.abort();
                    println!("[bridge] Client disconnected: {}", addr);
                });
            }
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let handle = app.handle().clone();

            // Try to spawn terminal — app works without it
            let writer = try_spawn_pty(handle, ws_tx_clone.clone());

            if writer.is_none() {
                // Notify frontend that terminal is unavailable
                let h = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    let _ = h.emit("pty-output", "\x1b[33mTerminal unavailable — shell could not be started.\x1b[0m\r\n\x1b[33mThe dashboard still works normally above.\x1b[0m\r\n");
                });
            }

            app.manage(PtyState { writer });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![pty_write, pty_resize])
        .run(tauri::generate_context!())
        .expect("error while running Orbit AI");
}
