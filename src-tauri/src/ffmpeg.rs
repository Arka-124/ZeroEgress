use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareAccelerationStatus {
    pub nvenc: bool,
    pub videotoolbox: bool,
    pub qsv: bool,
    pub best_encoder: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GpuTranscodeOptions {
    pub target_format: String,
    pub quality: Option<f32>,
    pub bitrate: Option<String>,
    pub resolution: Option<String>, // "4k", "1080p", "720p", "original"
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub lossless_trim: Option<bool>,
    pub extract_audio: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GpuTranscodeResult {
    pub success: bool,
    pub output_file_name: String,
    pub output_path: Option<String>,
    pub output_bytes: Option<Vec<u8>>,
    pub duration_ms: u64,
    pub encoder_used: String,
    pub hardware_accelerated: bool,
    pub error: Option<String>,
}

/// Detects available GPU hardware video encoders on the system
pub fn detect_hardware_encoders() -> HardwareAccelerationStatus {
    let output = Command::new("ffmpeg")
        .arg("-encoders")
        .output();

    let encoders_str = match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(_) => String::new(),
    };

    let nvenc = encoders_str.contains("h264_nvenc") || encoders_str.contains("hevc_nvenc");
    let videotoolbox = encoders_str.contains("h264_videotoolbox") || encoders_str.contains("hevc_videotoolbox");
    let qsv = encoders_str.contains("h264_qsv") || encoders_str.contains("hevc_qsv");

    let best_encoder = if nvenc {
        "h264_nvenc (NVIDIA NVENC GPU)".to_string()
    } else if videotoolbox {
        "h264_videotoolbox (Apple Silicon VideoToolbox)".to_string()
    } else if qsv {
        "h264_qsv (Intel Quick Sync Video)".to_string()
    } else {
        "libx264 (Multi-threaded CPU)".to_string()
    };

    HardwareAccelerationStatus {
        nvenc,
        videotoolbox,
        qsv,
        best_encoder,
    }
}

/// Transcode media with automatic GPU hardware acceleration, supporting multi-GB streaming directly on disk
pub async fn transcode_media(
    input_path: &str,
    output_path: &str,
    options: &GpuTranscodeOptions,
) -> Result<GpuTranscodeResult, String> {
    let start = std::time::Instant::now();
    let hw = detect_hardware_encoders();

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y"); // overwrite output

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

    cmd.arg("-i").arg(input_path);

    let target_ext = options.target_format.to_lowercase().replace('.', "");
    let is_lossless = options.lossless_trim.unwrap_or(false);
    let mut encoder_used = "copy".to_string();
    let mut hw_used = false;

    if is_lossless {
        cmd.arg("-c").arg("copy");
    } else if options.extract_audio.unwrap_or(false) || matches!(target_ext.as_str(), "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a") {
        cmd.arg("-vn");
        match target_ext.as_str() {
            "mp3" => {
                cmd.arg("-c:a").arg("libmp3lame")
                    .arg("-b:a").arg(options.bitrate.as_deref().unwrap_or("256k"));
                encoder_used = "libmp3lame".to_string();
            }
            "wav" => {
                cmd.arg("-c:a").arg("pcm_s16le");
                encoder_used = "pcm_s16le".to_string();
            }
            "aac" | "m4a" => {
                cmd.arg("-c:a").arg("aac")
                    .arg("-b:a").arg(options.bitrate.as_deref().unwrap_or("256k"));
                encoder_used = "aac".to_string();
            }
            "flac" => {
                cmd.arg("-c:a").arg("flac");
                encoder_used = "flac".to_string();
            }
            "ogg" => {
                cmd.arg("-c:a").arg("libvorbis")
                    .arg("-b:a").arg(options.bitrate.as_deref().unwrap_or("192k"));
                encoder_used = "libvorbis".to_string();
            }
            _ => {
                cmd.arg("-c:a").arg("copy");
            }
        }
    } else {
        // Video transcoding with GPU hardware acceleration
        let (v_codec, is_hw) = if hw.nvenc {
            if target_ext == "webm" {
                ("libvpx-vp9", false)
            } else {
                ("h264_nvenc", true)
            }
        } else if hw.videotoolbox {
            ("h264_videotoolbox", true)
        } else if hw.qsv {
            ("h264_qsv", true)
        } else {
            ("libx264", false)
        };

        encoder_used = v_codec.to_string();
        hw_used = is_hw;

        cmd.arg("-c:v").arg(v_codec);

        if !is_hw {
            cmd.arg("-preset").arg("veryfast");
        }

        // Resolution scaling
        if let Some(res) = &options.resolution {
            match res.to_lowercase().as_str() {
                "4k" => { cmd.arg("-vf").arg("scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2"); }
                "1080p" => { cmd.arg("-vf").arg("scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"); }
                "720p" => { cmd.arg("-vf").arg("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"); }
                _ => {}
            }
        }

        // Bitrate
        if let Some(br) = &options.bitrate {
            cmd.arg("-b:v").arg(br);
        }

        cmd.arg("-c:a").arg("aac").arg("-b:a").arg("192k");
    }

    cmd.arg(output_path);

    let output = cmd.output().map_err(|e| format!("FFmpeg failed to execute: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg transcoding error: {stderr}"));
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    let file_name = Path::new(output_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let output_bytes = if fs::metadata(output_path).map(|m| m.len() < 50_000_000).unwrap_or(false) {
        fs::read(output_path).ok()
    } else {
        None // For multi-GB files, return path only to prevent RAM blowout
    };

    Ok(GpuTranscodeResult {
        success: true,
        output_file_name: file_name,
        output_path: Some(output_path.to_string()),
        output_bytes,
        duration_ms,
        encoder_used,
        hardware_accelerated: hw_used,
        error: None,
    })
}
