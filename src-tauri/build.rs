use std::fs;
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=../index.html");
    println!("cargo:rerun-if-changed=../app.js");
    println!("cargo:rerun-if-changed=../style.css");

    let dist_dir = Path::new("dist");
    let _ = fs::create_dir_all(dist_dir);

    for file in ["index.html", "app.js", "style.css"] {
        let src = Path::new("..").join(file);
        let dst = dist_dir.join(file);
        if src.exists() {
            let _ = fs::copy(&src, &dst);
        }
    }

    tauri_build::build()
}
