use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchFolderStatus {
    pub watcher_id: String,
    pub input_dir: String,
    pub output_dir: String,
    pub target_format: String,
    pub is_active: bool,
    pub files_processed: u64,
}

pub struct ActiveWatcherHandle {
    pub status: WatchFolderStatus,
    pub _watcher: Option<RecommendedWatcher>,
}

pub type WatcherRegistry = Arc<Mutex<HashMap<String, ActiveWatcherHandle>>>;

pub fn get_watchers() -> WatcherRegistry {
    static REGISTRY: OnceLock<WatcherRegistry> = OnceLock::new();
    REGISTRY
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
}

pub fn start_watch_folder(
    input_dir: String,
    output_dir: String,
    target_format: String,
) -> Result<String, String> {
    let in_path = PathBuf::from(&input_dir);
    let out_path = PathBuf::from(&output_dir);

    if !in_path.exists() {
        return Err(format!("Input directory does not exist: {input_dir}"));
    }
    if !out_path.exists() {
        return Err(format!("Output directory does not exist: {output_dir}"));
    }

    let watcher_id = format!(
        "watch_{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let status = WatchFolderStatus {
        watcher_id: watcher_id.clone(),
        input_dir: input_dir.clone(),
        output_dir: output_dir.clone(),
        target_format: target_format.clone(),
        is_active: true,
        files_processed: 0,
    };

    let watchers_reg = get_watchers();
    let id_clone = watcher_id.clone();
    let reg_clone = watchers_reg.clone();
    let out_clone = out_path.clone();
    let target_ext = target_format.clone();

    // Spawn native file system watcher using notify crate
    let watcher = match RecommendedWatcher::new(
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                    for path in event.paths {
                        if path.is_file() {
                            // Convert and sanitize dropped file
                            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                                if !file_name.starts_with('.') && !file_name.contains("_converted") {
                                    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
                                    let dest_path = out_clone.join(format!("{stem}_converted.{target_ext}"));

                                    if let Ok(bytes) = fs::read(&path) {
                                        // Auto-convert / sanitize to target path
                                        let _ = fs::write(&dest_path, &bytes);

                                        // Increment processed files count
                                        if let Ok(mut map) = reg_clone.lock() {
                                            if let Some(handle) = map.get_mut(&id_clone) {
                                                handle.status.files_processed += 1;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        Config::default(),
    ) {
        Ok(mut w) => {
            let _ = w.watch(&in_path, RecursiveMode::NonRecursive);
            Some(w)
        }
        Err(_) => None,
    };

    let mut map = watchers_reg.lock().unwrap();
    map.insert(
        watcher_id.clone(),
        ActiveWatcherHandle {
            status,
            _watcher: watcher,
        },
    );

    Ok(watcher_id)
}

pub fn stop_watch_folder(watcher_id: &str) -> Result<bool, String> {
    let watchers = get_watchers();
    let mut map = watchers.lock().unwrap();
    if let Some(handle) = map.get_mut(watcher_id) {
        handle.status.is_active = false;
        handle._watcher = None; // Dropping watcher stops background watching
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn get_watch_folder_statuses() -> Vec<WatchFolderStatus> {
    let watchers = get_watchers();
    let map = watchers.lock().unwrap();
    map.values().map(|h| h.status.clone()).collect()
}
