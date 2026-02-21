use std::process::Command;

#[tauri::command]
pub fn create_outlook_draft(to: String, subject: String, body: String) -> Result<(), String> {
    let ps_script = format!(r#"
        $ErrorActionPreference = "Stop"
        try {{
            $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
        }} catch {{
            $outlook = New-Object -ComObject Outlook.Application
        }}
        $mail = $outlook.CreateItem(0)
        $mail.To = "{to}"
        $mail.Subject = "{subject}"
        $mail.Body = "{body}"
        $mail.Display()
    "#, to=to, subject=subject, body=body.replace("\n", "`n").replace("\"", "`\""));

    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", &ps_script])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            return Ok(());
        }
    }
    
    let mailto = format!("mailto:{}?subject={}&body={}", 
        urlencoding::encode(&to), 
        urlencoding::encode(&subject), 
        urlencoding::encode(&body)
    );
    let _ = webbrowser::open(&mailto);
    Ok(())
}
