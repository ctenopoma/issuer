use std::process::Command;

#[tauri::command]
pub fn create_outlook_draft(to: String, subject: String, body: String) -> Result<(), String> {
    // Normalize line endings for better compatibility (mailto often ignores lone \n)
    let body = normalize_body(&body);

    // Method 1: Try COM via VBScript (works with classic Outlook)
    if try_vbscript_com(&to, &subject, &body) {
        return Ok(());
    }

    // Method 2: Try launching outlook.exe directly with /c ipm.note
    if try_outlook_exe(&to, &subject, &body) {
        return Ok(());
    }

    // Method 3: Try ms-outlook: protocol (works with New Outlook / Store app)
    if try_ms_outlook_protocol(&to, &subject, &body) {
        return Ok(());
    }

    // Method 4: Try mailto: via PowerShell Start-Process (avoids cmd.exe '&' truncation issues)
    crate::debug_log::log("[outlook] All methods failed, falling back to mailto:");
    let mailto = format!(
        "mailto:{}?subject={}&body={}",
        urlencoding::encode(&to),
        urlencoding::encode(&subject),
        urlencoding::encode(&body)
    );
    let _ = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!("Start-Process '{}'", mailto.replace("'", "''")),
        ])
        .spawn();
    Ok(())
}

/// Convert \n to \r\n to avoid clients dropping body content on mailto
fn normalize_body(body: &str) -> String {
    let mut normalized = body.replace("\r\n", "\n");
    normalized = normalized.replace('\r', "\n");
    normalized = normalized.replace('\n', "\r\n");
    normalized
}

/// Try creating Outlook draft via COM automation (VBScript)
fn try_vbscript_com(to: &str, subject: &str, body: &str) -> bool {
    let to_escaped = to.replace("\"", "\"\"");
    let subject_escaped = subject.replace("\"", "\"\"");
    let body_escaped = body
        .replace("\"", "\"\"")
        .replace("\r\n", "\" & vbCrLf & \"")
        .replace("\n", "\" & vbCrLf & \"");

    let vbs_script = format!(
        r#"On Error Resume Next
Set outlook = CreateObject("Outlook.Application")
If Err.Number <> 0 Then
    WScript.StdErr.Write "CreateObject failed: " & Err.Description
    WScript.Quit 1
End If
Set mail = outlook.CreateItem(0)
If Err.Number <> 0 Then
    WScript.StdErr.Write "CreateItem failed: " & Err.Description
    WScript.Quit 1
End If
mail.To = "{to}"
mail.Subject = "{subject}"
mail.Body = "{body}"
mail.Display
If Err.Number <> 0 Then
    WScript.StdErr.Write "Display failed: " & Err.Description
    WScript.Quit 1
End If
"#,
        to = to_escaped,
        subject = subject_escaped,
        body = body_escaped
    );

    let temp_dir = std::env::temp_dir();
    let vbs_path = temp_dir.join("issuer_outlook.vbs");

    // Write as UTF-16LE (BOM + content) to support Japanese paths and characters in VBScript
    let encoded: Vec<u8> = vbs_script
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    let mut bom_encoded = vec![0xFF, 0xFE];
    bom_encoded.extend_from_slice(&encoded);

    if std::fs::write(&vbs_path, &bom_encoded).is_err() {
        return false;
    }

    let result = Command::new("cscript.exe")
        .args(["//Nologo", &vbs_path.to_string_lossy()])
        .output();

    let _ = std::fs::remove_file(&vbs_path);

    match result {
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            crate::debug_log::log(&format!(
                "[outlook][COM] exit={}, stderr={}",
                out.status,
                stderr.trim()
            ));
            out.status.success()
        }
        Err(e) => {
            crate::debug_log::log(&format!("[outlook][COM] cscript error: {}", e));
            false
        }
    }
}

/// Try launching outlook.exe directly with command-line arguments
fn try_outlook_exe(to: &str, subject: &str, body: &str) -> bool {
    let outlook_paths = find_outlook_exe();

    if outlook_paths.is_empty() {
        crate::debug_log::log("[outlook][EXE] outlook.exe not found");
        return false;
    }

    let encoded_body = urlencoding::encode(body);
    let m_arg = if to.is_empty() {
        format!(
            "mailto:?subject={}&body={}",
            urlencoding::encode(subject),
            encoded_body
        )
    } else {
        format!(
            "mailto:{}?subject={}&body={}",
            to,
            urlencoding::encode(subject),
            encoded_body
        )
    };

    for path in &outlook_paths {
        crate::debug_log::log(&format!("[outlook][EXE] Trying: {}", path));
        let result = Command::new(path)
            .args(["/c", "ipm.note", "/m", &m_arg])
            .spawn();

        match result {
            Ok(_) => {
                crate::debug_log::log("[outlook][EXE] Launched successfully");
                return true;
            }
            Err(e) => {
                crate::debug_log::log(&format!("[outlook][EXE] Failed: {}", e));
            }
        }
    }
    false
}

/// Try New Outlook via mailto: routed through the Store app directly
fn try_ms_outlook_protocol(to: &str, subject: &str, body: &str) -> bool {
    // Check if New Outlook is installed
    let check = Command::new("powershell")
        .args([
            "-NoProfile", "-Command",
            "Get-AppxPackage Microsoft.OutlookForWindows 2>$null | Select-Object -ExpandProperty PackageFamilyName"
        ])
        .output();

    let check_success = match &check {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let name = stdout.trim().to_string();
            if name.is_empty() {
                crate::debug_log::log("[outlook][PROTO] New Outlook not installed");
                false
            } else {
                crate::debug_log::log(&format!("[outlook][PROTO] Found: {}", name));
                true
            }
        }
        Ok(_) => {
            crate::debug_log::log("[outlook][PROTO] New Outlook not installed");
            false
        }
        Err(e) => {
            crate::debug_log::log(&format!("[outlook][PROTO] AppxPackage check failed: {}", e));
            false
        }
    };

    if !check_success {
        return false;
    }

    // Prefer Start-Process mailto directly
    let mailto = format!(
        "mailto:{}?subject={}&body={}",
        urlencoding::encode(to),
        urlencoding::encode(subject),
        urlencoding::encode(body)
    );

    // Use PowerShell to avoid cmd.exe truncating characters after '&'
    let ps_command = format!("Start-Process '{}'", mailto.replace("'", "''"));
    crate::debug_log::log(&"[outlook][PROTO] Launching via PowerShell Start-Process mailto".to_string());

    let result = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_command])
        .spawn();
    match &result {
        Ok(_) => {
            crate::debug_log::log("[outlook][PROTO] mailto launched via PowerShell");
            return true;
        }
        Err(e) => {
            crate::debug_log::log(&format!("[outlook][PROTO] Start-Process failed: {}", e));
        }
    }

    if result.is_ok() {
        return true;
    }

    // Alternative: try powershell directly with the mailto URI
    let ps_command2 = format!("Start-Process '{}'", mailto.replace("'", "''"));
    let result2 = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_command2])
        .spawn();

    match result2 {
        Ok(_) => {
            crate::debug_log::log("[outlook][PROTO] Start-Process mailto launched");
            true
        }
        Err(e) => {
            crate::debug_log::log(&format!("[outlook][PROTO] Start-Process failed: {}", e));
            false
        }
    }
}

/// Search for outlook.exe in common installation paths
fn find_outlook_exe() -> Vec<String> {
    let mut paths = Vec::new();

    // Try 'where' command first
    if let Ok(out) = Command::new("where").arg("outlook.exe").output() {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    paths.push(trimmed.to_string());
                }
            }
        }
    }

    // Check common Office installation paths
    let program_files = vec![
        std::env::var("ProgramFiles").unwrap_or_default(),
        std::env::var("ProgramFiles(x86)").unwrap_or_default(),
    ];

    for pf in &program_files {
        if pf.is_empty() {
            continue;
        }
        for version in &["Office16", "Office15", "Office14"] {
            let path = format!("{}\\Microsoft Office\\root\\{version}\\OUTLOOK.EXE", pf);
            if std::path::Path::new(&path).exists() {
                paths.push(path);
            }
            let path2 = format!("{}\\Microsoft Office\\{version}\\OUTLOOK.EXE", pf);
            if std::path::Path::new(&path2).exists() {
                paths.push(path2);
            }
        }
    }

    paths.dedup();
    paths
}
