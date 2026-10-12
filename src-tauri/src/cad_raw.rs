use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, Stream};

#[derive(Debug, Clone)]
pub enum CadEntity {
    Line { x1: f64, y1: f64, x2: f64, y2: f64 },
    Circle { cx: f64, cy: f64, r: f64 },
    Arc { cx: f64, cy: f64, r: f64, start_deg: f64, end_deg: f64 },
    Polyline { points: Vec<(f64, f64)>, closed: bool },
    Text { x: f64, y: f64, text: String, height: f64 },
}

#[derive(Debug, Default)]
pub struct DxfDrawing {
    pub entities: Vec<CadEntity>,
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl DxfDrawing {
    pub fn parse(dxf_text: &str) -> Self {
        let mut drawing = DxfDrawing {
            entities: Vec::new(),
            min_x: f64::MAX,
            min_y: f64::MAX,
            max_x: f64::MIN,
            max_y: f64::MIN,
        };

        let lines: Vec<&str> = dxf_text.lines().map(|l| l.trim()).collect();
        let mut i = 0;
        let mut in_entities = false;

        while i + 1 < lines.len() {
            let code = lines[i].parse::<i32>().unwrap_or(-1);
            let val = lines[i + 1];
            i += 2;

            if code == 0 && val == "SECTION" {
                if i + 1 < lines.len() && lines[i].parse::<i32>().unwrap_or(-1) == 2 && lines[i + 1] == "ENTITIES" {
                    in_entities = true;
                    i += 2;
                }
            } else if code == 0 && val == "ENDSEC" {
                in_entities = false;
            } else if in_entities && code == 0 {
                match val {
                    "LINE" => {
                        let mut x1 = 0.0; let mut y1 = 0.0;
                        let mut x2 = 0.0; let mut y2 = 0.0;
                        while i + 1 < lines.len() && lines[i].parse::<i32>().unwrap_or(-1) != 0 {
                            let c = lines[i].parse::<i32>().unwrap_or(-1);
                            let v = lines[i + 1];
                            i += 2;
                            match c {
                                10 => x1 = v.parse().unwrap_or(0.0),
                                20 => y1 = v.parse().unwrap_or(0.0),
                                11 => x2 = v.parse().unwrap_or(0.0),
                                21 => y2 = v.parse().unwrap_or(0.0),
                                _ => {}
                            }
                        }
                        drawing.update_bounds(x1, y1);
                        drawing.update_bounds(x2, y2);
                        drawing.entities.push(CadEntity::Line { x1, y1, x2, y2 });
                    }
                    "CIRCLE" => {
                        let mut cx = 0.0; let mut cy = 0.0; let mut r = 1.0;
                        while i + 1 < lines.len() && lines[i].parse::<i32>().unwrap_or(-1) != 0 {
                            let c = lines[i].parse::<i32>().unwrap_or(-1);
                            let v = lines[i + 1];
                            i += 2;
                            match c {
                                10 => cx = v.parse().unwrap_or(0.0),
                                20 => cy = v.parse().unwrap_or(0.0),
                                40 => r = v.parse().unwrap_or(1.0),
                                _ => {}
                            }
                        }
                        drawing.update_bounds(cx - r, cy - r);
                        drawing.update_bounds(cx + r, cy + r);
                        drawing.entities.push(CadEntity::Circle { cx, cy, r });
                    }
                    "ARC" => {
                        let mut cx = 0.0; let mut cy = 0.0; let mut r = 1.0;
                        let mut start_deg = 0.0; let mut end_deg = 360.0;
                        while i + 1 < lines.len() && lines[i].parse::<i32>().unwrap_or(-1) != 0 {
                            let c = lines[i].parse::<i32>().unwrap_or(-1);
                            let v = lines[i + 1];
                            i += 2;
                            match c {
                                10 => cx = v.parse().unwrap_or(0.0),
                                20 => cy = v.parse().unwrap_or(0.0),
                                40 => r = v.parse().unwrap_or(1.0),
                                50 => start_deg = v.parse().unwrap_or(0.0),
                                51 => end_deg = v.parse().unwrap_or(360.0),
                                _ => {}
                            }
                        }
                        drawing.update_bounds(cx - r, cy - r);
                        drawing.update_bounds(cx + r, cy + r);
                        drawing.entities.push(CadEntity::Arc { cx, cy, r, start_deg, end_deg });
                    }
                    "LWPOLYLINE" | "POLYLINE" => {
                        let mut pts = Vec::new();
                        let mut cur_x: Option<f64> = None;
                        while i + 1 < lines.len() && lines[i].parse::<i32>().unwrap_or(-1) != 0 {
                            let c = lines[i].parse::<i32>().unwrap_or(-1);
                            let v = lines[i + 1];
                            i += 2;
                            if c == 10 {
                                cur_x = v.parse().ok();
                            } else if c == 20 {
                                if let Some(x) = cur_x {
                                    let y: f64 = v.parse().unwrap_or(0.0);
                                    drawing.update_bounds(x, y);
                                    pts.push((x, y));
                                    cur_x = None;
                                }
                            }
                        }
                        if !pts.is_empty() {
                            drawing.entities.push(CadEntity::Polyline { points: pts, closed: false });
                        }
                    }
                    "TEXT" | "MTEXT" => {
                        let mut x = 0.0; let mut y = 0.0; let mut h = 10.0; let mut txt = String::new();
                        while i + 1 < lines.len() && lines[i].parse::<i32>().unwrap_or(-1) != 0 {
                            let c = lines[i].parse::<i32>().unwrap_or(-1);
                            let v = lines[i + 1];
                            i += 2;
                            match c {
                                10 => x = v.parse().unwrap_or(0.0),
                                20 => y = v.parse().unwrap_or(0.0),
                                40 => h = v.parse().unwrap_or(10.0),
                                1 => txt = v.to_string(),
                                _ => {}
                            }
                        }
                        if !txt.is_empty() {
                            drawing.update_bounds(x, y);
                            drawing.entities.push(CadEntity::Text { x, y, text: txt, height: h });
                        }
                    }
                    _ => {}
                }
            }
        }

        if drawing.min_x >= drawing.max_x || drawing.min_y >= drawing.max_y {
            drawing.min_x = 0.0; drawing.min_y = 0.0;
            drawing.max_x = 800.0; drawing.max_y = 600.0;
        }

        drawing
    }

    fn update_bounds(&mut self, x: f64, y: f64) {
        if x < self.min_x { self.min_x = x; }
        if x > self.max_x { self.max_x = x; }
        if y < self.min_y { self.min_y = y; }
        if y > self.max_y { self.max_y = y; }
    }

    pub fn to_svg(&self) -> String {
        let pad = 20.0;
        let width = (self.max_x - self.min_x).abs() + pad * 2.0;
        let height = (self.max_y - self.min_y).abs() + pad * 2.0;
        let ox = self.min_x - pad;
        let oy = self.min_y - pad;

        let mut svg = format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ox} {oy} {width} {height}" width="100%" height="100%" style="background:#09090b">
  <g stroke="#10b981" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
"##
        );

        for entity in &self.entities {
            match entity {
                CadEntity::Line { x1, y1, x2, y2 } => {
                    svg.push_str(&format!(r##"    <line x1="{x1:.2}" y1="{y1:.2}" x2="{x2:.2}" y2="{y2:.2}" />"##));
                    svg.push('\n');
                }
                CadEntity::Circle { cx, cy, r } => {
                    svg.push_str(&format!(r##"    <circle cx="{cx:.2}" cy="{cy:.2}" r="{r:.2}" />"##));
                    svg.push('\n');
                }
                CadEntity::Arc { cx, cy, r, start_deg, end_deg } => {
                    let rad1 = start_deg.to_radians();
                    let rad2 = end_deg.to_radians();
                    let sx = cx + r * rad1.cos();
                    let sy = cy + r * rad1.sin();
                    let ex = cx + r * rad2.cos();
                    let ey = cy + r * rad2.sin();
                    let large = if (end_deg - start_deg).abs() > 180.0 { 1 } else { 0 };
                    svg.push_str(&format!(r##"    <path d="M {sx:.2} {sy:.2} A {r:.2} {r:.2} 0 {large} 1 {ex:.2} {ey:.2}" />"##));
                    svg.push('\n');
                }
                CadEntity::Polyline { points, closed } => {
                    if let Some((first_x, first_y)) = points.first() {
                        let mut d = format!("M {first_x:.2} {first_y:.2}");
                        for (px, py) in points.iter().skip(1) {
                            d.push_str(&format!(" L {px:.2} {py:.2}"));
                        }
                        if *closed { d.push_str(" Z"); }
                        svg.push_str(&format!(r##"    <path d="{d}" />"##));
                        svg.push('\n');
                    }
                }
                CadEntity::Text { x, y, text, height } => {
                    let sanitized = text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
                    svg.push_str(&format!(
                        r##"    <text x="{x:.2}" y="{y:.2}" font-size="{height:.2}" fill="#38bdf8" stroke="none" font-family="monospace">{sanitized}</text>"##
                    ));
                    svg.push('\n');
                }
            }
        }

        svg.push_str("  </g>\n</svg>");
        svg
    }

    pub fn to_vector_pdf(&self, title: &str) -> Result<Vec<u8>, String> {
        let mut doc = Document::with_version("1.7");
        let pages_id = doc.new_object_id();

        let page_width = 841.89f64;
        let page_height = 595.28f64;
        let margin = 40.0f64;

        let dw = (self.max_x - self.min_x).abs().max(1.0);
        let dh = (self.max_y - self.min_y).abs().max(1.0);
        let scale = ((page_width - margin * 2.0) / dw).min((page_height - margin * 2.0) / dh);

        let mut ops = Vec::new();

        // Dark Blueprint background
        ops.push(Operation::new("q", vec![]));
        ops.push(Operation::new("0.05", vec![]));
        ops.push(Operation::new("0.08", vec![]));
        ops.push(Operation::new("0.12", vec![]));
        ops.push(Operation::new("rg", vec![]));
        ops.push(Operation::new("re", vec![Object::Real(0.0), Object::Real(0.0), Object::Real(page_width as f32), Object::Real(page_height as f32)]));
        ops.push(Operation::new("f", vec![]));
        ops.push(Operation::new("Q", vec![]));

        // Draw CAD vectors in Emerald/Cyan
        ops.push(Operation::new("q", vec![]));
        ops.push(Operation::new("0.06", vec![]));
        ops.push(Operation::new("0.72", vec![]));
        ops.push(Operation::new("0.50", vec![]));
        ops.push(Operation::new("RG", vec![]));
        ops.push(Operation::new("1.0", vec![]));
        ops.push(Operation::new("w", vec![]));

        let map_x = |x: f64| -> f32 { (margin + (x - self.min_x) * scale) as f32 };
        let map_y = |y: f64| -> f32 { (margin + (y - self.min_y) * scale) as f32 };

        for entity in &self.entities {
            match entity {
                CadEntity::Line { x1, y1, x2, y2 } => {
                    ops.push(Operation::new("m", vec![Object::Real(map_x(*x1)), Object::Real(map_y(*y1))]));
                    ops.push(Operation::new("l", vec![Object::Real(map_x(*x2)), Object::Real(map_y(*y2))]));
                    ops.push(Operation::new("S", vec![]));
                }
                CadEntity::Circle { cx, cy, r } => {
                    let rx = (*r * scale) as f32;
                    let px = map_x(*cx);
                    let py = map_y(*cy);
                    ops.push(Operation::new("re", vec![Object::Real(px - rx), Object::Real(py - rx), Object::Real(rx * 2.0), Object::Real(rx * 2.0)]));
                    ops.push(Operation::new("S", vec![]));
                }
                CadEntity::Polyline { points, closed } => {
                    if let Some((first_x, first_y)) = points.first() {
                        ops.push(Operation::new("m", vec![Object::Real(map_x(*first_x)), Object::Real(map_y(*first_y))]));
                        for (px, py) in points.iter().skip(1) {
                            ops.push(Operation::new("l", vec![Object::Real(map_x(*px)), Object::Real(map_y(*py))]));
                        }
                        if *closed { ops.push(Operation::new("h", vec![])); }
                        ops.push(Operation::new("S", vec![]));
                    }
                }
                _ => {}
            }
        }
        ops.push(Operation::new("Q", vec![]));

        let font_id = doc.add_object(Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Font".to_vec())),
            ("Subtype", Object::Name(b"Type1".to_vec())),
            ("BaseFont", Object::Name(b"Helvetica-Bold".to_vec())),
        ]));

        ops.push(Operation::new("BT", vec![]));
        ops.push(Operation::new("1.0", vec![]));
        ops.push(Operation::new("1.0", vec![]));
        ops.push(Operation::new("1.0", vec![]));
        ops.push(Operation::new("rg", vec![]));
        ops.push(Operation::new("Tf", vec![Object::Name(b"F1".to_vec()), Object::Real(12.0)]));
        ops.push(Operation::new("Td", vec![Object::Real(margin as f32), Object::Real((page_height - 25.0) as f32)]));
        ops.push(Operation::new("Tj", vec![Object::String(format!("CAD BLUEPRINT: {title}").into_bytes(), lopdf::StringFormat::Literal)]));
        ops.push(Operation::new("ET", vec![]));

        let content = Content { operations: ops };
        let content_data = content.encode().map_err(|e| format!("{e:?}"))?;
        let content_id = doc.add_object(Stream::new(Dictionary::new(), content_data));

        let resources = Dictionary::from_iter(vec![
            ("Font", Object::Dictionary(Dictionary::from_iter(vec![
                ("F1", Object::Reference(font_id)),
            ]))),
        ]);

        let page_dict = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Page".to_vec())),
            ("Parent", Object::Reference(pages_id)),
            ("MediaBox", Object::Array(vec![Object::Real(0.0), Object::Real(0.0), Object::Real(page_width as f32), Object::Real(page_height as f32)])),
            ("Contents", Object::Reference(content_id)),
            ("Resources", Object::Dictionary(resources)),
        ]);

        let page_id = doc.add_object(page_dict);
        let pages_dict = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Pages".to_vec())),
            ("Kids", Object::Array(vec![Object::Reference(page_id)])),
            ("Count", Object::Integer(1)),
        ]);
        doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

        let catalog_id = doc.add_object(Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Catalog".to_vec())),
            ("Pages", Object::Reference(pages_id)),
        ]));
        doc.trailer.set("Root", Object::Reference(catalog_id));

        let mut output_bytes = Vec::new();
        doc.save_to(&mut output_bytes).map_err(|e| format!("{e}"))?;
        Ok(output_bytes)
    }
}

pub fn extract_camera_raw_preview(raw_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if raw_bytes.len() < 16 {
        return Err("File too small to be a camera RAW format".to_string());
    }

    let mut best_start = 0;
    let mut best_len = 0;

    let mut i = 0;
    while i + 4 < raw_bytes.len() {
        if raw_bytes[i] == 0xFF && raw_bytes[i + 1] == 0xD8 && raw_bytes[i + 2] == 0xFF {
            let start = i;
            let mut j = start + 2;
            let mut found_eoi = None;
            while j + 1 < raw_bytes.len() {
                if raw_bytes[j] == 0xFF && raw_bytes[j + 1] == 0xD9 {
                    found_eoi = Some(j + 2);
                    j += 2;
                } else {
                    j += 1;
                }
            }

            if let Some(end) = found_eoi {
                let len = end - start;
                if len > best_len {
                    best_len = len;
                    best_start = start;
                }
            }
            i += 2;
        } else {
            i += 1;
        }
    }

    if best_len > 1024 {
        Ok(raw_bytes[best_start..best_start + best_len].to_vec())
    } else {
        Err("No preview JPEG frame found in Camera RAW container".to_string())
    }
}
