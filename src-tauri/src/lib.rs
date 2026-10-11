use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct NativeConvertOptions {
    pub target_format: String,
    pub quality: Option<f32>,
    pub bitrate: Option<String>,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub lossless_trim: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NativeConvertResult {
    pub success: bool,
    pub output_file_name: String,
    pub output_bytes: Vec<u8>,
    pub duration_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemCapabilities {
    pub os: String,
    pub arch: String,
    pub is_air_gapped: bool,
    pub engine_type: String,
    pub ffmpeg_cli_available: bool,
}

/// Convert media file using system FFmpeg CLI with fast stream copy or audio extraction
#[tauri::command]
pub async fn convert_media_native(
    input_path: String,
    output_path: String,
    options: NativeConvertOptions,
) -> Result<NativeConvertResult, String> {
    let start = std::time::Instant::now();

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y"); // overwrite

    // Stream trimming
    if let Some(st) = options.start_time {
        if st > 0.0 {
            cmd.arg("-ss").arg(st.to_string());
        }
    }
    if let Some(et) = options.end_time {
        if et > 0.0 {
            cmd.arg("-to").arg(et.to_string());
        }
    }

    cmd.arg("-i").arg(&input_path);

    let target_ext = options.target_format.to_lowercase();
    let is_lossless = options.lossless_trim.unwrap_or(false);

    if is_lossless {
        cmd.arg("-c").arg("copy");
    } else {
        match target_ext.as_str() {
            "mp3" => {
                cmd.arg("-vn")
                    .arg("-c:a")
                    .arg("libmp3lame")
                    .arg("-b:a")
                    .arg(options.bitrate.as_deref().unwrap_or("192k"));
            }
            "wav" => {
                cmd.arg("-vn").arg("-c:a").arg("pcm_s16le");
            }
            "aac" => {
                cmd.arg("-vn")
                    .arg("-c:a")
                    .arg("aac")
                    .arg("-b:a")
                    .arg(options.bitrate.as_deref().unwrap_or("192k"));
            }
            "flac" => {
                cmd.arg("-vn").arg("-c:a").arg("flac");
            }
            "mp4" => {
                cmd.arg("-c:v")
                    .arg("libx264")
                    .arg("-preset")
                    .arg("ultrafast")
                    .arg("-c:a")
                    .arg("aac");
            }
            _ => {
                cmd.arg("-c").arg("copy");
            }
        }
    }

    cmd.arg(&output_path);

    let output = cmd.output().map_err(|e| format!("Failed to execute FFmpeg: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg error: {stderr}"));
    }

    let bytes = fs::read(&output_path).map_err(|e| format!("Failed to read output: {e}"))?;
    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(NativeConvertResult {
        success: true,
        output_file_name: Path::new(&output_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        output_bytes: bytes,
        duration_ms,
        error: None,
    })
}

/// Compute cryptographic hashes natively using compiled CPU acceleration
#[tauri::command]
pub fn compute_hash_native(file_bytes: Vec<u8>, algorithm: String) -> Result<String, String> {
    use sha2::{Digest, Sha256, Sha512};

    match algorithm.as_str() {
        "SHA-256" => {
            let mut hasher = Sha256::new();
            hasher.update(&file_bytes);
            let result = hasher.finalize();
            Ok(format!("{result:x}"))
        }
        "SHA-512" => {
            let mut hasher = Sha512::new();
            hasher.update(&file_bytes);
            let result = hasher.finalize();
            Ok(format!("{result:x}"))
        }
        "MD5" => {
            use md5::compute;
            let digest = compute(&file_bytes);
            Ok(format!("{digest:x}"))
        }
        _ => Err(format!("Unsupported algorithm: {algorithm}")),
    }
}

/// System capabilities query confirming zero-egress native mode
#[tauri::command]
pub fn get_system_capabilities() -> SystemCapabilities {
    let ffmpeg_exists = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    SystemCapabilities {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        is_air_gapped: true,
        engine_type: "Tauri Rust Native Architecture".to_string(),
        ffmpeg_cli_available: ffmpeg_exists,
    }
}

/// Native file reader directly from OS Drag-and-Drop path without browser buffer duplication
#[tauri::command]
pub fn read_file_from_path(file_path: String) -> Result<Vec<u8>, String> {
    fs::read(&file_path).map_err(|e| format!("Failed to read file from path {file_path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            convert_media_native,
            compute_hash_native,
            get_system_capabilities,
            read_file_from_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZeroEgress desktop application");
}
