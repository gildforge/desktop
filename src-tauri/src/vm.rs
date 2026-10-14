//! Agent VMs: whether this machine can run agents in a VM. macOS and Windows
//! use Multipass (installed by the person, never bundled), Linux Firecracker
//! on KVM, which gild sets up itself on first use.

use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
pub struct VmStatus {
    /// "multipass" or "firecracker".
    backend: &'static str,
    ready: bool,
    /// What was found, e.g. "multipass 1.16.4+mac".
    found: Option<String>,
}

/// An app started from the Dock has a short PATH: look where installers put it.
fn multipass() -> Option<String> {
    let candidates: &[&str] = if cfg!(windows) {
        &["multipass", r"C:\Program Files\Multipass\bin\multipass.exe"]
    } else {
        &["/usr/local/bin/multipass", "/opt/homebrew/bin/multipass", "/snap/bin/multipass", "multipass"]
    };
    candidates.iter().find_map(|path| {
        let out = Command::new(path).arg("version").output().ok()?;
        let text = String::from_utf8(out.stdout).ok()?;
        (out.status.success()).then(|| text.lines().next().unwrap_or("multipass").split_whitespace().collect::<Vec<_>>().join(" "))
    })
}

#[tauri::command]
pub fn vm_status() -> VmStatus {
    if cfg!(target_os = "linux") {
        let kvm = std::fs::OpenOptions::new().read(true).write(true).open("/dev/kvm").is_ok();
        return VmStatus { backend: "firecracker", ready: kvm, found: kvm.then(|| "KVM (/dev/kvm)".into()) };
    }
    let found = multipass();
    VmStatus { backend: "multipass", ready: found.is_some(), found }
}
