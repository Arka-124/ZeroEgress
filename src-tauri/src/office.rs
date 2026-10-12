use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::Command;
use lopdf::content::{Content, Operation};
use lopdf::{Document, Object, Stream, Dictionary};

/// Unpacks a ZIP entry by relative file path within raw bytes
pub fn extract_zip_entry(zip_bytes: &[u8], target_entry_suffix: &str) -> Option<Vec<u8>> {
    let mut cursor = 0;
    while cursor + 30 <= zip_bytes.len() {
        // Local file header signature 0x04034b50
        if zip_bytes[cursor..cursor + 4] == [0x50, 0x4b, 0x03, 0x04] {
            let compression_method = u16::from_le_bytes([zip_bytes[cursor + 8], zip_bytes[cursor + 9]]);
            let comp_size = u32::from_le_bytes([
                zip_bytes[cursor + 18],
                zip_bytes[cursor + 19],
                zip_bytes[cursor + 20],
                zip_bytes[cursor + 21],
            ]) as usize;
            let file_name_len = u16::from_le_bytes([zip_bytes[cursor + 26], zip_bytes[cursor + 27]]) as usize;
            let extra_field_len = u16::from_le_bytes([zip_bytes[cursor + 28], zip_bytes[cursor + 29]]) as usize;

            let file_name_start = cursor + 30;
            let file_name_end = file_name_start + file_name_len;
            if file_name_end <= zip_bytes.len() {
                let file_name = String::from_utf8_lossy(&zip_bytes[file_name_start..file_name_end]);
                let data_start = file_name_end + extra_field_len;
                let data_end = data_start + comp_size;

                if file_name.ends_with(target_entry_suffix) && data_end <= zip_bytes.len() {
                    let compressed_data = &zip_bytes[data_start..data_end];
                    if compression_method == 0 {
                        return Some(compressed_data.to_vec());
                    } else if compression_method == 8 {
                        use flate2::read::DeflateDecoder;
                        let mut decoder = DeflateDecoder::new(compressed_data);
                        let mut decompressed = Vec::new();
                        if decoder.read_to_end(&mut decompressed).is_ok() {
                            return Some(decompressed);
                        }
                    }
                }
            }
            cursor += 30 + file_name_len + extra_field_len + comp_size;
        } else {
            cursor += 1;
        }
    }
    None
}

/// Simple regex/tag-based XML text content extractor
pub fn extract_xml_text(xml_data: &[u8]) -> Vec<String> {
    let raw = String::from_utf8_lossy(xml_data);
    let mut lines = Vec::new();
    let mut current_line = String::new();

    let mut in_tag = false;
    let mut tag_name = String::new();

    for ch in raw.chars() {
        if ch == '<' {
            in_tag = true;
            tag_name.clear();
        } else if ch == '>' {
            in_tag = false;
            let lower_tag = tag_name.to_lowercase();
            if lower_tag.starts_with("/w:p") || lower_tag.starts_with("/p:sp") || lower_tag.starts_with("/row") || lower_tag.starts_with("/text:p") || lower_tag.starts_with("/table:table-row") {
                let trimmed = current_line.trim().to_string();
                if !trimmed.is_empty() {
                    lines.push(trimmed);
                }
                current_line.clear();
            }
        } else if in_tag {
            tag_name.push(ch);
        } else if !in_tag {
            current_line.push(ch);
        }
    }

    let trimmed = current_line.trim().to_string();
    if !trimmed.is_empty() {
        lines.push(trimmed);
    }

    lines
}

/// Convert office document (DOCX, PPTX, XLSX, ODT, ODP, Pages, Keynote) to PDF
pub fn convert_office_to_pdf_native(
    input_bytes: &[u8],
    file_name: &str,
    temp_dir: Option<&Path>,
) -> Result<Vec<u8>, String> {
    // 1. Try system headless LibreOffice if available
    if let Some(t_dir) = temp_dir {
        let temp_input = t_dir.join(file_name);
        if fs::write(&temp_input, input_bytes).is_ok() {
            let output = Command::new("soffice")
                .arg("--headless")
                .arg("--convert-to")
                .arg("pdf")
                .arg("--outdir")
                .arg(t_dir)
                .arg(&temp_input)
                .output();

            if let Ok(out) = output {
                if out.status.success() {
                    let pdf_name = format!("{}.pdf", Path::new(file_name).file_stem().unwrap_or_default().to_string_lossy());
                    let pdf_path = t_dir.join(&pdf_name);
                    if pdf_path.exists() {
                        if let Ok(bytes) = fs::read(&pdf_path) {
                            let _ = fs::remove_file(&pdf_path);
                            let _ = fs::remove_file(&temp_input);
                            return Ok(bytes);
                        }
                    }
                }
            }
            let _ = fs::remove_file(&temp_input);
        }
    }

    // 2. Native Pure Rust Document Engine Fallback
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut lines = Vec::new();

    match ext.as_str() {
        "docx" => {
            if let Some(xml) = extract_zip_entry(input_bytes, "word/document.xml") {
                lines = extract_xml_text(&xml);
            }
        }
        "pptx" => {
            // Check slide XMLs
            for i in 1..=30 {
                let suffix = format!("ppt/slides/slide{i}.xml");
                if let Some(xml) = extract_zip_entry(input_bytes, &suffix) {
                    lines.push(format!("--- Slide {i} ---"));
                    lines.extend(extract_xml_text(&xml));
                }
            }
        }
        "xlsx" => {
            let mut strings = Vec::new();
            if let Some(xml) = extract_zip_entry(input_bytes, "xl/sharedStrings.xml") {
                strings = extract_xml_text(&xml);
            }
            if !strings.is_empty() {
                lines.push("Sheet Data:".to_string());
                lines.extend(strings);
            }
        }
        "odt" | "odp" | "ods" => {
            if let Some(xml) = extract_zip_entry(input_bytes, "content.xml") {
                lines = extract_xml_text(&xml);
            }
        }
        "pages" | "keynote" | "numbers" => {
            // Apple iWork documents: unpack Index.zip or extract strings
            if let Some(xml) = extract_zip_entry(input_bytes, "index.xml") {
                lines = extract_xml_text(&xml);
            } else {
                let raw_str = String::from_utf8_lossy(input_bytes);
                for chunk in raw_str.split('\0') {
                    let t = chunk.trim();
                    if t.len() > 3 && t.chars().all(|c| c.is_ascii_graphic() || c.is_ascii_whitespace()) {
                        lines.push(t.to_string());
                    }
                }
            }
        }
        _ => {
            let text = String::from_utf8_lossy(input_bytes);
            lines = text.lines().map(|s| s.to_string()).collect();
        }
    }

    if lines.is_empty() {
        lines.push(format!("Office Document Conversion: {file_name}"));
        lines.push("[Document content structure converted with ZeroEgress Native Engine]".to_string());
    }

    // Synthesize PDF document with lopdf
    generate_vector_document_pdf(&lines, file_name)
}

fn generate_vector_document_pdf(lines: &[String], title: &str) -> Result<Vec<u8>, String> {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let mut page_ids = Vec::new();

    let font_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Font".to_vec())),
        ("Subtype", Object::Name(b"Type1".to_vec())),
        ("BaseFont", Object::Name(b"Helvetica".to_vec())),
    ]));

    let bold_font_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Font".to_vec())),
        ("Subtype", Object::Name(b"Type1".to_vec())),
        ("BaseFont", Object::Name(b"Helvetica-Bold".to_vec())),
    ]));

    let page_width: f32 = 595.28;
    let page_height: f32 = 841.89;
    let margin: f32 = 50.0;
    let line_height: f32 = 16.0;
    let max_lines_per_page = 42;

    let chunks: Vec<&[String]> = lines.chunks(max_lines_per_page).collect();

    for (page_idx, chunk) in chunks.iter().enumerate() {
        let mut ops = Vec::new();

        // Header rule
        ops.push(Operation::new("q", vec![]));
        ops.push(Operation::new("0.2", vec![]));
        ops.push(Operation::new("G", vec![]));
        ops.push(Operation::new("1", vec![]));
        ops.push(Operation::new("w", vec![]));
        ops.push(Operation::new("m", vec![Object::Real(margin), Object::Real(page_height - margin - 20.0)]));
        ops.push(Operation::new("l", vec![Object::Real(page_width - margin), Object::Real(page_height - margin - 20.0)]));
        ops.push(Operation::new("S", vec![]));
        ops.push(Operation::new("Q", vec![]));

        // Header Title
        ops.push(Operation::new("BT", vec![]));
        ops.push(Operation::new("Tf", vec![Object::Name(b"F2".to_vec()), Object::Real(12.0)]));
        ops.push(Operation::new("Td", vec![Object::Real(margin), Object::Real(page_height - margin - 12.0)]));
        ops.push(Operation::new("Tj", vec![Object::String(title.as_bytes().to_vec(), lopdf::StringFormat::Literal)]));
        ops.push(Operation::new("ET", vec![]));

        // Page text lines
        let mut y: f32 = page_height - margin - 45.0;
        for line in *chunk {
            let is_header = line.starts_with("---") || line.starts_with('#');
            ops.push(Operation::new("BT", vec![]));
            if is_header {
                ops.push(Operation::new("Tf", vec![Object::Name(b"F2".to_vec()), Object::Real(11.0)]));
            } else {
                ops.push(Operation::new("Tf", vec![Object::Name(b"F1".to_vec()), Object::Real(9.5)]));
            }
            ops.push(Operation::new("Td", vec![Object::Real(margin), Object::Real(y)]));

            let sanitized: Vec<u8> = line.chars()
                .filter(|c| c.is_ascii())
                .take(90)
                .collect::<String>()
                .into_bytes();

            ops.push(Operation::new("Tj", vec![Object::String(sanitized, lopdf::StringFormat::Literal)]));
            ops.push(Operation::new("ET", vec![]));

            y -= line_height;
        }

        // Page number footer
        let footer = format!("Page {} of {}", page_idx + 1, chunks.len());
        ops.push(Operation::new("BT", vec![]));
        ops.push(Operation::new("Tf", vec![Object::Name(b"F1".to_vec()), Object::Real(8.0)]));
        ops.push(Operation::new("Td", vec![Object::Real(page_width / 2.0 - 20.0), Object::Real(30.0)]));
        ops.push(Operation::new("Tj", vec![Object::String(footer.into_bytes(), lopdf::StringFormat::Literal)]));
        ops.push(Operation::new("ET", vec![]));

        let content = Content { operations: ops };
        let content_data = content.encode().map_err(|e| format!("PDF encoding error: {e:?}"))?;
        let content_id = doc.add_object(Stream::new(Dictionary::new(), content_data));

        let resources = Dictionary::from_iter(vec![
            ("Font", Object::Dictionary(Dictionary::from_iter(vec![
                ("F1", Object::Reference(font_id)),
                ("F2", Object::Reference(bold_font_id)),
            ]))),
        ]);

        let page_dict = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Page".to_vec())),
            ("Parent", Object::Reference(pages_id)),
            ("MediaBox", Object::Array(vec![
                Object::Real(0.0),
                Object::Real(0.0),
                Object::Real(page_width),
                Object::Real(page_height),
            ])),
            ("Contents", Object::Reference(content_id)),
            ("Resources", Object::Dictionary(resources)),
        ]);

        let page_id = doc.add_object(page_dict);
        page_ids.push(Object::Reference(page_id));
    }

    let pages_dict = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Pages".to_vec())),
        ("Kids", Object::Array(page_ids)),
        ("Count", Object::Integer(chunks.len() as i64)),
    ]);
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let catalog_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Catalog".to_vec())),
        ("Pages", Object::Reference(pages_id)),
    ]));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    let mut output_bytes = Vec::new();
    doc.save_to(&mut output_bytes).map_err(|e| format!("Failed to generate PDF: {e}"))?;
    Ok(output_bytes)
}
