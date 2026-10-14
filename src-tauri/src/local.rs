//! What the window needs from this machine: who you are (your gild identity,
//! git's name and email) and the instance it installed, kept in files only
//! you can read.

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::pkcs8::{EncodePrivateKey, EncodePublicKey};
use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize)]
pub struct Identity {
    name: Option<String>,
    email: Option<String>,
    /// The gild identity key, `ed25519:<base64 SPKI>`, shared with the CLI.
    public_key: Option<String>,
    /// The name this identity already goes by on a forge, if any.
    gild_name: Option<String>,
    key_path: String,
}

fn git_config(key: &str) -> Option<String> {
    let out = Command::new("git").args(["config", "--global", key]).output().ok()?;
    let value = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (out.status.success() && !value.is_empty()).then_some(value)
}

/// The CLI's identity file: `gild auth init` writes it, `gild` signs with it.
fn identity_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".config/gild/identity.json")
}

fn write_private(path: &PathBuf, text: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn identity() -> Identity {
    let path = identity_path();
    let stored: Option<serde_json::Value> = fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok());
    let field = |k: &str| stored.as_ref().and_then(|v| v.get(k)).and_then(|v| v.as_str()).map(str::to_string);
    Identity {
        name: git_config("user.name"),
        email: git_config("user.email"),
        public_key: field("publicKey"),
        gild_name: field("name"),
        key_path: path.display().to_string(),
    }
}

/// Make a gild identity on a machine without one, exactly as `gild auth init`
/// would, so the CLI and this window are the same person. Never replaces one.
#[tauri::command]
pub fn identity_create(name: Option<String>) -> Result<Identity, String> {
    let path = identity_path();
    if path.exists() {
        return Ok(identity());
    }
    let key = SigningKey::generate(&mut rand_core::OsRng);
    let public = key.verifying_key().to_public_key_der().map_err(|e| e.to_string())?;
    let secret = key.to_pkcs8_der().map_err(|e| e.to_string())?;
    let device = Command::new("hostname").output().ok().and_then(|o| String::from_utf8(o.stdout).ok()).map(|h| h.trim().to_string()).unwrap_or_default();
    let created = Command::new("date").args(["-u", "+%Y-%m-%dT%H:%M:%S.000Z"]).output().ok().and_then(|o| String::from_utf8(o.stdout).ok()).map(|d| d.trim().to_string()).unwrap_or_default();
    let record = serde_json::json!({
        "schema": 1,
        "name": name,
        "device": device,
        "publicKey": format!("ed25519:{}", STANDARD.encode(public.as_bytes())),
        "secretKey": STANDARD.encode(secret.as_bytes()),
        "apiToken": null,
        "createdAt": created,
    });
    write_private(&path, &serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?)?;
    Ok(identity())
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
    /// Where agents run: "vm" or "host" (the person skipped agent VMs).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    agents: Option<String>,
}

fn instance_path() -> Result<PathBuf, String> {
    Ok(dirs::config_dir().ok_or("no configuration directory")?.join("gg.gild.desktop").join("instance.json"))
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
    write_private(&instance_path()?, &serde_json::to_string_pretty(&instance).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn instance_forget() -> Result<(), String> {
    match fs::remove_file(instance_path()?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::pkcs8::DecodePublicKey;

    /// The CLI reads a key back with Node's crypto as SPKI DER after
    /// `ed25519:`; the server keeps only the last 32 bytes (verify.ts).
    #[test]
    fn identity_keys_are_spki_like_the_cli_writes() {
        let key = SigningKey::generate(&mut rand_core::OsRng);
        let der = key.verifying_key().to_public_key_der().unwrap();
        assert_eq!(der.as_bytes().len(), 44);
        assert_eq!(&der.as_bytes()[12..], key.verifying_key().as_bytes());
        let text = format!("ed25519:{}", STANDARD.encode(der.as_bytes()));
        assert!(text.starts_with("ed25519:MCowBQYDK2VwAyEA"), "{text}");
        let back = ed25519_dalek::VerifyingKey::from_public_key_der(&STANDARD.decode(&text[8..]).unwrap()).unwrap();
        assert_eq!(back, key.verifying_key());
    }
}
