#Requires AutoHotkey v2.0
#SingleInstance Force
; RWK BACKGROUND delivery test. Answers: can we send to a window WITHOUT focusing it?
; Your game window has 3 frames (Chrome_RenderWidgetHostHWND1/2/3); the game's key
; listener is on one of them, so this hits them ALL.
;
;   1) Click inside window B's game area (press a key, confirm the game responds - this
;      gives B's inner game frame keyboard focus).
;   2) Alt+Tab (or click the taskbar) to window A. Do NOT click inside B again.
;   3) With A in front, press F9. WATCH WINDOW B - does 'b' land there?
;
; Writes to rwk-diag.log next to this file.

logfile := A_ScriptDir "\rwk-diag.log"

ToolTip "BACKGROUND test loaded.`n1) click into window B (confirm it works)`n2) Alt+Tab to window A`n3) press F9, watch window B"
SetTimer () => ToolTip(), -9000

F9:: {
    global logfile
    active := WinActive("A")
    others := []
    for hwnd in WinGetList("ahk_exe chrome.exe") {
        if (hwnd = active) || (WinGetTitle("ahk_id " hwnd) = "")
            continue
        others.Push(hwnd)
    }

    log := "=== BG test " A_Now " ===`nactive HWND: " active "`nother chrome windows: " others.Length "`n"
    if !others.Length {
        FileAppend log "  (none - open window B first)`n`n", logfile
        ToolTip "No other Chrome window found - open window B first."
        SetTimer () => ToolTip(), -4000
        return
    }

    ; --- Test 1: background send to ALL render frames (no focus change whatsoever) ---
    ToolTip "BG Test 1/2: background send to all frames (no focus change).`nWatch window B for 'b'..."
    Sleep 600
    for hwnd in others {
        log .= "win " hwnd " (" WinGetTitle("ahk_id " hwnd) "):`n"
        for ctrl in WinGetControls("ahk_id " hwnd) {
            if !InStr(ctrl, "Chrome_RenderWidgetHostHWND")
                continue
            try {
                ControlSend "{b}", ctrl, "ahk_id " hwnd
                log .= "  test1 sent -> " ctrl "`n"
            } catch as e {
                log .= "  test1 FAIL " ctrl ": " e.Message "`n"
            }
        }
    }
    Sleep 2600

    ; --- Test 2: ControlFocus each frame first, then send (still no window activation) ---
    ToolTip "BG Test 2/2: ControlFocus + send to all frames.`nWatch window B for 'b'..."
    Sleep 600
    for hwnd in others {
        for ctrl in WinGetControls("ahk_id " hwnd) {
            if !InStr(ctrl, "Chrome_RenderWidgetHostHWND")
                continue
            try ControlFocus ctrl, "ahk_id " hwnd
            try ControlSend "{b}", ctrl, "ahk_id " hwnd
        }
    }
    Sleep 2600

    FileAppend log "`n", logfile
    ToolTip "Done. Did window B react on Test 1, Test 2, both, or neither?"
    SetTimer () => ToolTip(), -7000
}
