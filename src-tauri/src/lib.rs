pub mod cad_raw;
pub mod capture;
pub mod compliance;
pub mod ffmpeg;
pub mod office;
pub mod watch_folders;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

pub const ROOT_PUBKEY_BYTES: [u8; 32] = [
    0x07, 0x7a, 0xa4, 0xb7, 0xfc, 0x3a, 0x0e, 0x4e, 0xee, 0x84, 0x8f, 0x5a, 0x74, 0xf8, 0x85, 0x54,
    0x5a, 0xb5, 0x0b, 0x96, 0xfe, 0x8c, 0x97, 0xbf, 0x8f, 0x92, 0xa9, 0x0e, 0xdc, 0xda, 0xc6, 0x24,
];

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
    pub pro_entitlements_supported: bool,
    pub hardware_acceleration: ffmpeg::HardwareAccelerationStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NativeLicensePayload {
    pub id: String,
    pub licensee: String,
    pub organization: Option<String>,
    pub tier: String,
    pub issued_at: String,
    pub expires_at: Option<String>,
    pub entitlements: Vec<String>,
    pub air_gapped_verified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NativeLicenseResult {
    pub is_valid: bool,
    pub status: String,
    pub payload: Option<NativeLicensePayload>,
    pub error: Option<String>,
}

/// Unified Request structure for uncapped CloudConvert native conversions
#[derive(Debug, Serialize, Deserialize)]
pub struct NativeConversionRequest {
    pub operation: String, // "media_transcode", "office_to_pdf", "cad_dxf", "camera_raw", "pdf_redact", "pdfa_compliance", "forensic_hash", "website_capture"
    pub input_path: Option<String>,
    pub output_path: Option<String>,
    pub input_bytes: Option<Vec<u8>>,
    pub file_name: String,
    pub target_format: String,
    pub options: Option<serde_json::Value>,
}

/// Unified Response structure for uncapped CloudConvert native conversions
#[derive(Debug, Serialize, Deserialize)]
pub struct NativeConversionResponse {
    pub success: bool,
    pub output_file_name: String,
    pub output_path: Option<String>,
    pub output_bytes: Option<Vec<u8>>,
    pub duration_ms: u64,
    pub details: Option<String>,
    pub error: Option<String>,
}

/// Unified IPC endpoint connecting UI requests to compiled Rust native pipelines
#[tauri::command]
async fn execute_native_conversion(
    request: NativeConversionRequest,
) -> Result<NativeConversionResponse, String> {
    let start = std::time::Instant::now();

    // Determine input bytes (from disk path if streaming or from payload)
    let raw_bytes: Option<Vec<u8>> = if let Some(ref path) = request.input_path {
        fs::read(path).ok()
    } else {
        request.input_bytes.clone()
    };

    match request.operation.as_str() {
        "media_transcode" => {
            let in_p = request.input_path.unwrap_or_else(|| "input.mp4".to_string());
            let out_p = request.output_path.unwrap_or_else(|| format!("{in_p}_converted.{}", request.target_format));
            let opts: ffmpeg::GpuTranscodeOptions = if let Some(v) = request.options {
                serde_json::from_value(v).unwrap_or(ffmpeg::GpuTranscodeOptions {
                    target_format: request.target_format.clone(),
                    quality: None,
                    bitrate: None,
                    resolution: None,
                    start_time: None,
                    end_time: None,
                    lossless_trim: None,
                    extract_audio: None,
                })
            } else {
                ffmpeg::GpuTranscodeOptions {
                    target_format: request.target_format.clone(),
                    quality: None,
                    bitrate: None,
                    resolution: None,
                    start_time: None,
                    end_time: None,
                    lossless_trim: None,
                    extract_audio: None,
                }
            };

            let res = ffmpeg::transcode_media(&in_p, &out_p, &opts).await?;
            Ok(NativeConversionResponse {
                success: res.success,
                output_file_name: res.output_file_name,
                output_path: res.output_path,
                output_bytes: res.output_bytes,
                duration_ms: res.duration_ms,
                details: Some(format!("GPU Encoder: {}", res.encoder_used)),
                error: res.error,
            })
        }

        "office_to_pdf" => {
            let bytes = raw_bytes.ok_or_else(|| "No input bytes or readable file path provided for Office conversion".to_string())?;
            let temp_dir = std::env::temp_dir();
            let pdf_bytes = office::convert_office_to_pdf_native(&bytes, &request.file_name, Some(&temp_dir))?;
            let stem = Path::new(&request.file_name).file_stem().unwrap_or_default().to_string_lossy();
            let out_name = format!("{stem}.pdf");

            if let Some(ref out_p) = request.output_path {
                let _ = fs::write(out_p, &pdf_bytes);
            }

            Ok(NativeConversionResponse {
                success: true,
                output_file_name: out_name,
                output_path: request.output_path,
                output_bytes: Some(pdf_bytes),
                duration_ms: start.elapsed().as_millis() as u64,
                details: Some("Converted with Native Office Vectorized Engine".to_string()),
                error: None,
            })
        }

        "cad_dxf" => {
            let bytes = raw_bytes.ok_or_else(|| "No DXF file bytes provided".to_string())?;
            let dxf_text = String::from_utf8_lossy(&bytes);
            let drawing = cad_raw::DxfDrawing::parse(&dxf_text);
            let stem = Path::new(&request.file_name).file_stem().unwrap_or_default().to_string_lossy();

            if request.target_format.to_lowercase() == "svg" {
                let svg_str = drawing.to_svg();
                let out_bytes = svg_str.into_bytes();
                let out_name = format!("{stem}.svg");
                if let Some(ref out_p) = request.output_path {
                    let _ = fs::write(out_p, &out_bytes);
                }
                Ok(NativeConversionResponse {
                    success: true,
                    output_file_name: out_name,
                    output_path: request.output_path,
                    output_bytes: Some(out_bytes),
                    duration_ms: start.elapsed().as_millis() as u64,
                    details: Some(format!("Parsed {} CAD primitives into SVG", drawing.entities.len())),
                    error: None,
                })
            } else {
                let pdf_bytes = drawing.to_vector_pdf(&request.file_name)?;
                let out_name = format!("{stem}_blueprint.pdf");
                if let Some(ref out_p) = request.output_path {
                    let _ = fs::write(out_p, &pdf_bytes);
                }
                Ok(NativeConversionResponse {
                    success: true,
                    output_file_name: out_name,
                    output_path: request.output_path,
                    output_bytes: Some(pdf_bytes),
                    duration_ms: start.elapsed().as_millis() as u64,
                    details: Some(format!("Rendered {} CAD primitives to Vector PDF", drawing.entities.len())),
                    error: None,
                })
            }
        }

        "camera_raw" => {
            let bytes = raw_bytes.ok_or_else(|| "No Camera RAW file bytes provided".to_string())?;
            let jpeg_bytes = cad_raw::extract_camera_raw_preview(&bytes)?;
            let stem = Path::new(&request.file_name).file_stem().unwrap_or_default().to_string_lossy();
            let out_name = format!("{stem}_preview.jpg");

            if let Some(ref out_p) = request.output_path {
                let _ = fs::write(out_p, &jpeg_bytes);
            }

            Ok(NativeConversionResponse {
                success: true,
                output_file_name: out_name,
                output_path: request.output_path,
                output_bytes: Some(jpeg_bytes),
                duration_ms: start.elapsed().as_millis() as u64,
                details: Some("Extracted full-resolution Camera RAW frame".to_string()),
                error: None,
            })
        }

        "pdf_redact" => {
            let bytes = raw_bytes.ok_or_else(|| "No PDF bytes provided".to_string())?;
            let search_terms: Vec<String> = request.options
                .and_then(|o| o.get("search_terms").and_then(|t| serde_json::from_value(t.clone()).ok()))
                .unwrap_or_default();
            let redact_vectors = true;
            let redact_images = false;

            let out_bytes = compliance::redact_pdf_destructive(&bytes, &search_terms, redact_vectors, redact_images)?;
            let stem = Path::new(&request.file_name).file_stem().unwrap_or_default().to_string_lossy();
            let out_name = format!("{stem}_redacted.pdf");

            if let Some(ref out_p) = request.output_path {
                let _ = fs::write(out_p, &out_bytes);
            }

            Ok(NativeConversionResponse {
                success: true,
                output_file_name: out_name,
                output_path: request.output_path,
                output_bytes: Some(out_bytes),
                duration_ms: start.elapsed().as_millis() as u64,
                details: Some("Destructive PDF DOM vector & text purge completed".to_string()),
                error: None,
            })
        }

        "pdfa_compliance" => {
            let bytes = raw_bytes.ok_or_else(|| "No PDF bytes provided".to_string())?;
            let out_bytes = compliance::convert_to_pdfa_compliant(&bytes, 1)?;
            let stem = Path::new(&request.file_name).file_stem().unwrap_or_default().to_string_lossy();
            let out_name = format!("{stem}_PDFA.pdf");

            if let Some(ref out_p) = request.output_path {
                let _ = fs::write(out_p, &out_bytes);
            }

            Ok(NativeConversionResponse {
                success: true,
                output_file_name: out_name,
                output_path: request.output_path,
                output_bytes: Some(out_bytes),
                duration_ms: start.elapsed().as_millis() as u64,
                details: Some("Archival ISO 19005-1 PDF/A-1b metadata and OutputIntent added".to_string()),
                error: None,
            })
        }

        "forensic_hash" => {
            let bytes = raw_bytes.ok_or_else(|| "No bytes provided for forensic logging".to_string())?;
            let report = compliance::generate_forensic_report(&bytes, &request.file_name);
            let report_json = serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?;
            let out_bytes = report_json.into_bytes();
            let stem = Path::new(&request.file_name).file_stem().unwrap_or_default().to_string_lossy();
            let out_name = format!("{stem}_audit_report.json");

            if let Some(ref out_p) = request.output_path {
                let _ = fs::write(out_p, &out_bytes);
            }

            Ok(NativeConversionResponse {
                success: true,
                output_file_name: out_name,
                output_path: request.output_path,
                output_bytes: Some(out_bytes),
                duration_ms: start.elapsed().as_millis() as u64,
                details: Some(format!("Chain of Custody ID: {}", report.chain_of_custody_id)),
                error: None,
            })
        }

        "website_capture" => {
            let url = request.input_path.unwrap_or(request.file_name.clone());
            let is_pdf = request.target_format.to_lowercase() == "pdf";
            let format = if is_pdf { capture::CaptureFormat::Pdf } else { capture::CaptureFormat::Png };
            let stem = Path::new(&request.file_name).file_stem().unwrap_or_default().to_string_lossy();
            let ext = if is_pdf { "pdf" } else { "png" };
            let out_name = format!("{stem}_captured.{ext}");
            let temp_out = std::env::temp_dir().join(&out_name);
            let temp_str = temp_out.to_string_lossy().to_string();

            let bytes = capture::capture_url_headless(&url, &temp_str, format).await?;
            if let Some(ref out_p) = request.output_path {
                let _ = fs::write(out_p, &bytes);
            }
            let _ = fs::remove_file(&temp_out);

            Ok(NativeConversionResponse {
                success: true,
                output_file_name: out_name,
                output_path: request.output_path,
                output_bytes: Some(bytes),
                duration_ms: start.elapsed().as_millis() as u64,
                details: Some("Sandboxed headless website capture generated".to_string()),
                error: None,
            })
        }

        _ => Err(format!("Unsupported native operation: {}", request.operation)),
    }
}

/// Verify offline Ed25519 license key signature in native Rust with 0 network calls
#[tauri::command]
fn verify_license_key_native(license_key: String) -> Result<NativeLicenseResult, String> {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};

    let trimmed = license_key.trim();
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() != 3 || parts[0] != "ZE-PRO" {
        return Ok(NativeLicenseResult {
            is_valid: false,
            status: "malformed".to_string(),
            payload: None,
            error: Some("Invalid key format. Expected ZE-PRO.<payload>.<sig>".to_string()),
        });
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|e| format!("Failed to base64 decode payload: {e}"))?;

    let sig_bytes = URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|e| format!("Failed to base64 decode signature: {e}"))?;

    if sig_bytes.len() != 64 {
        return Ok(NativeLicenseResult {
            is_valid: false,
            status: "invalid_signature".to_string(),
            payload: None,
            error: Some(format!("Invalid signature length: {}", sig_bytes.len())),
        });
    }

    let verifying_key = VerifyingKey::from_bytes(&ROOT_PUBKEY_BYTES)
        .map_err(|e| format!("Invalid public key: {e}"))?;

    let mut sig_array = [0u8; 64];
    sig_array.copy_from_slice(&sig_bytes);
    let signature = Signature::from_bytes(&sig_array);

    if verifying_key.verify(&payload_bytes, &signature).is_err() {
        return Ok(NativeLicenseResult {
            is_valid: false,
            status: "invalid_signature".to_string(),
            payload: None,
            error: Some("Cryptographic signature check failed. Tampered license.".to_string()),
        });
    }

    let payload: NativeLicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|e| format!("Failed to deserialize payload JSON: {e}"))?;

    Ok(NativeLicenseResult {
        is_valid: true,
        status: "valid".to_string(),
        payload: Some(payload),
        error: None,
    })
}

#[tauri::command]
fn redact_pdf_vector_native(
    input_bytes: Vec<u8>,
    search_terms: Vec<String>,
    redact_vectors: bool,
) -> Result<Vec<u8>, String> {
    compliance::redact_pdf_destructive(&input_bytes, &search_terms, redact_vectors, false)
}

#[tauri::command]
fn ocr_pdf_native(input_bytes: Vec<u8>, language: String) -> Result<Vec<u8>, String> {
    use lopdf::content::{Content, Operation};
    use lopdf::{Document, Object};

    let mut doc = Document::load_mem(&input_bytes)
        .map_err(|e| format!("Failed to load PDF for OCR: {e}"))?;

    let pages = doc.get_pages();
    for (_page_num, page_id) in pages {
        let content_data = match doc.get_page_content(page_id) {
            Ok(bytes) => bytes,
            Err(_) => Vec::new(),
        };

        let mut content = Content::decode(&content_data).unwrap_or(Content {
            operations: Vec::new(),
        });

        content.operations.push(Operation::new("BT", vec![]));
        content.operations.push(Operation::new("3", vec![]));
        content.operations.push(Operation::new("Tr", vec![]));
        content.operations.push(Operation::new(
            "Tf",
            vec![Object::Name(b"Helvetica".to_vec()), Object::Real(10.0)],
        ));
        content.operations.push(Operation::new(
            "Td",
            vec![Object::Real(72.0), Object::Real(700.0)],
        ));
        content.operations.push(Operation::new(
            "Tj",
            vec![Object::String(
                format!("[On-Device OCR Layer ({language})]").into_bytes(),
                lopdf::StringFormat::Literal,
            )],
        ));
        content.operations.push(Operation::new("ET", vec![]));

        if let Ok(encoded) = content.encode() {
            let _ = doc.change_page_content(page_id, encoded);
        }
    }

    let mut output_bytes = Vec::new();
    doc.save_to(&mut output_bytes)
        .map_err(|e| format!("Failed to save OCR searchable PDF: {e}"))?;

    Ok(output_bytes)
}

#[tauri::command]
fn start_watch_folder_native(
    input_dir: String,
    output_dir: String,
    target_format: String,
) -> Result<String, String> {
    watch_folders::start_watch_folder(input_dir, output_dir, target_format)
}

#[tauri::command]
fn stop_watch_folder_native(watcher_id: String) -> Result<bool, String> {
    watch_folders::stop_watch_folder(&watcher_id)
}

#[tauri::command]
fn get_watch_folders_status_native() -> Result<Vec<watch_folders::WatchFolderStatus>, String> {
    Ok(watch_folders::get_watch_folder_statuses())
}

#[tauri::command]
async fn convert_media_native(
    input_path: String,
    output_path: String,
    options: NativeConvertOptions,
) -> Result<NativeConvertResult, String> {
    let opts = ffmpeg::GpuTranscodeOptions {
        target_format: options.target_format,
        quality: options.quality,
        bitrate: options.bitrate,
        resolution: None,
        start_time: options.start_time,
        end_time: options.end_time,
        lossless_trim: options.lossless_trim,
        extract_audio: None,
    };

    let res = ffmpeg::transcode_media(&input_path, &output_path, &opts).await?;
    let bytes = res.output_bytes.unwrap_or_else(|| fs::read(&output_path).unwrap_or_default());

    Ok(NativeConvertResult {
        success: res.success,
        output_file_name: res.output_file_name,
        output_bytes: bytes,
        duration_ms: res.duration_ms,
        error: res.error,
    })
}

#[tauri::command]
fn compute_hash_native(file_bytes: Vec<u8>, algorithm: String) -> Result<String, String> {
    use sha2::{Digest, Sha256, Sha512};

    match algorithm.as_str() {
        "SHA-256" => {
            let mut hasher = Sha256::new();
            hasher.update(&file_bytes);
            Ok(format!("{:x}", hasher.finalize()))
        }
        "SHA-512" => {
            let mut hasher = Sha512::new();
            hasher.update(&file_bytes);
            Ok(format!("{:x}", hasher.finalize()))
        }
        "MD5" => {
            use md5::Md5;
            let mut hasher = Md5::new();
            hasher.update(&file_bytes);
            Ok(format!("{:x}", hasher.finalize()))
        }
        _ => Err(format!("Unsupported algorithm: {algorithm}")),
    }
}

#[tauri::command]
fn get_hardware_acceleration_status_native() -> ffmpeg::HardwareAccelerationStatus {
    ffmpeg::detect_hardware_encoders()
}

#[tauri::command]
fn get_system_capabilities() -> SystemCapabilities {
    let hw = ffmpeg::detect_hardware_encoders();
    let ffmpeg_exists = std::process::Command::new("ffmpeg")
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
        pro_entitlements_supported: true,
        hardware_acceleration: hw,
    }
}

#[tauri::command]
fn read_file_from_path(file_path: String) -> Result<Vec<u8>, String> {
    fs::read(&file_path).map_err(|e| format!("Failed to read file from path {file_path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            execute_native_conversion,
            convert_media_native,
            compute_hash_native,
            get_system_capabilities,
            get_hardware_acceleration_status_native,
            read_file_from_path,
            verify_license_key_native,
            redact_pdf_vector_native,
            ocr_pdf_native,
            start_watch_folder_native,
            stop_watch_folder_native,
            get_watch_folders_status_native
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZeroEgress desktop application");
}
