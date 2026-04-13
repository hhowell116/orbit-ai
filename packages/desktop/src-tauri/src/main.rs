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
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    ws_sender: broadcast::Sender<String>,
}

#[tauri::command]
fn pty_write(state: tauri::State<PtyState>, data: String) {
    if let Ok(mut writer) = state.writer.lock() {
        let _ = writer.write_all(data.as_bytes());
        let _ = writer.flush();
    }
}

#[tauri::command]
fn pty_resize(_width: u16, _height: u16) {
    // PTY resize placeholder
}

fn main() {
    // Create a broadcast channel for PTY output → WebSocket clients
    let (ws_tx, _) = broadcast::channel::<String>(256);
    let ws_tx_clone = ws_tx.clone();

    // Start the tokio runtime for WebSocket server
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");

    // Spawn WebSocket bridge server on localhost:9876
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

                    // Send PTY output to WebSocket client
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

                    // Read messages from WebSocket client (input to PTY)
                    // Note: WebSocket input goes through Tauri IPC, not directly here
                    // This just keeps the connection alive and handles pings
                    while let Some(Ok(msg)) = ws_read.next().await {
                        match msg {
                            Message::Ping(data) => {
                                // Pong is handled automatically by tungstenite
                                let _ = data;
                            }
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
        .setup(move |app| {
            let handle = app.handle().clone();
            let ws_tx = ws_tx_clone.clone();

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

            let shell = if cfg!(target_os = "windows") {
                "powershell.exe".to_string()
            } else {
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
            };

            let mut cmd = CommandBuilder::new(&shell);
            cmd.cwd(dirs_next::home_dir().unwrap_or_else(|| ".".into()));

            let _child = pair.slave.spawn_command(cmd).expect("Failed to spawn shell");
            drop(pair.slave);

            let writer = Arc::new(Mutex::new(pair.master.take_writer().unwrap()));

            // Read PTY output → emit to frontend + broadcast to WebSocket clients
            let mut reader = pair.master.try_clone_reader().unwrap();
            std::thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            let data = String::from_utf8_lossy(&buf[..n]).to_string();
                            // Send to Tauri frontend (embedded terminal)
                            let _ = handle.emit("pty-output", &data);
                            // Broadcast to WebSocket clients (browser bridge)
                            let _ = ws_tx.send(data);
                        }
                        Err(_) => break,
                    }
                }
            });

            app.manage(PtyState {
                writer,
                ws_sender: ws_tx_clone,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![pty_write, pty_resize])
        .run(tauri::generate_context!())
        .expect("error while running Orbit AI");
}
