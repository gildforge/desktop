//! What the window needs from this machine: who you are (git's name and
//! email, your SSH key) and the instance it installed, kept in a file only
//! you can read.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize)]
pub struct Identity {
    name: Option<String>,
    email: Option<String>,
    /// `~/.ssh/id_ed25519.pub`: the key gild signs you in with.
    public_key: Option<String>,
    key_path: String,
}

fn git_config(key: &str) -> Option<String> {
    let out = Command::new("git").args(["config", "--global", key]).output().ok()?;
    let value = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (out.status.success() && !value.is_empty()).then_some(value)
}

#[tauri::command]
pub fn identity() -> Identity {
    let key = dirs::home_dir().unwrap_or_default().join(".ssh/id_ed25519.pub");
    Identity {
        name: git_config("user.name"),
        email: git_config("user.email"),
        public_key: fs::read_to_string(&key).ok().map(|k| k.trim().to_string()),
        key_path: key.display().to_string(),
    }
}

/// The installed instance: where it is and the owner's token.
#[derive(Serialize, Deserialize)]
pub struct Instance {
    url: String,
    owner: String,
    token: String,
    account_id: String,
    name: String,
    version: String,
}

fn instance_path() -> Result<PathBuf, String> {
    let dir = dirs::config_dir()
        .ok_or("no configuration directory")?
        .join("gg.gild.desktop");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("instance.json"))
}

#[tauri::command]
pub fn instance_read() -> Result<Option<Instance>, String> {
    match fs::read_to_string(instance_path()?) {
        Ok(text) => serde_json::from_str(&text).map(Some).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn instance_write(instance: Instance) -> Result<(), String> {
    let path = instance_path()?;
    let text = serde_json::to_string_pretty(&instance).map_err(|e| e.to_string())?;
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn instance_forget() -> Result<(), String> {
    match fs::remove_file(instance_path()?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}
