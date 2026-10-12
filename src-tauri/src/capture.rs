use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug)]
pub enum CaptureFormat {
    Png,
    Pdf,
}

/// Capture website or local webpage to screenshot PNG or PDF without browser CORS limits
pub async fn capture_url_headless(
    target_url: &str,
    output_path: &str,
    format: CaptureFormat,
) -> Result<Vec<u8>, String> {
    // Detect installed system browser binary
    let browsers = if cfg!(target_os = "windows") {
        vec![
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            "msedge",
            "chrome",
        ]
    } else if cfg!(target_os = "macos") {
        vec![
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "google-chrome",
            "chromium",
        ]
    } else {
        vec![
            "google-chrome",
            "google-chrome-stable",
            "chromium-browser",
            "chromium",
            "brave-browser",
        ]
    };

    let mut browser_bin: Option<&str> = None;
    for b in &browsers {
        if Path::new(b).exists() {
            browser_bin = Some(b);
            break;
        }
        if let Ok(out) = Command::new(b).arg("--version").output() {
            if out.status.success() {
                browser_bin = Some(b);
                break;
            }
        }
    }

    if let Some(bin) = browser_bin {
        let mut cmd = Command::new(bin);
        cmd.arg("--headless=new")
            .arg("--disable-gpu")
            .arg("--no-sandbox")
            .arg("--disable-software-rasterizer")
            .arg("--hide-scrollbars")
            .arg("--window-size=1920,1080");

        match format {
            CaptureFormat::Png => {
                cmd.arg(format!("--screenshot={output_path}"));
            }
            CaptureFormat::Pdf => {
                cmd.arg(format!("--print-to-pdf={output_path}"));
            }
        }

        cmd.arg(target_url);

        let output = cmd.output().map_err(|e| format!("Headless browser failed to execute: {e}"))?;
        if output.status.success() && Path::new(output_path).exists() {
            let bytes = fs::read(output_path).map_err(|e| format!("Failed to read captured output: {e}"))?;
            return Ok(bytes);
        }
    }

    // Fallback: If URL is a local file or HTML snippet, convert directly via pure Rust
    if target_url.ends_with(".html") || target_url.ends_with(".htm") || target_url.starts_with("file://") {
        let local_path = target_url.trim_start_matches("file://");
        if let Ok(html_str) = fs::read_to_string(local_path) {
            return crate::office::convert_office_to_pdf_native(
                html_str.as_bytes(),
                "webpage_capture.html",
                None,
            );
        }
    }

    Err("No compatible headless browser (Edge/Chrome/Chromium) found for live URL capture.".to_string())
}
