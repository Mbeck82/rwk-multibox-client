#Requires AutoHotkey v2.0
#SingleInstance Force
; RWK delivery diagnostic. Run it, click your GAME window, press F8.
; It writes rwk-diag.log next to this file (Claude reads it) and fires 3 send methods
; so you can see which one the game actually reacts to.

logfile := A_ScriptDir "\rwk-diag.log"

ToolTip "RWK diag ready.  Click your game window, then press F8."
SetTimer () => ToolTip(), -5000

F8:: {
    global logfile
    hwnd := WinActive("A")

    info := "=== diag " A_Now " ===`n"
    info .= "HWND: " hwnd "`n"
    info .= "Title: " WinGetTitle("ahk_id " hwnd) "`n"
    info .= "Class: " WinGetClass("ahk_id " hwnd) "`n"
    try info .= "Process: " WinGetProcessName("ahk_id " hwnd) "`n"
    info .= "-- Controls (ClassNN) --`n"
    try {
        ctrls := WinGetControls("ahk_id " hwnd)
        if !ctrls.Length
            info .= "  (none reported)`n"
        for c in ctrls
            info .= "  " c "`n"
    } catch as e {
        info .= "  (error: " e.Message ")`n"
    }
    FileAppend info "`n", logfile

    ; --- 3 delivery tests. Watch the game after each tooltip; each sends 'b'. ---
    methods := ["ControlSend -> Chrome_RenderWidgetHostHWND1",
                "ControlSend -> focused control (blank)",
                "real Send (foreground input)"]
    for i, label in methods {
        ToolTip "Test " i "/3: " label "`n(sending 'b' - watch the game)"
        Sleep 800
        try {
            if (i = 1)
                ControlSend "{b}", "Chrome_RenderWidgetHostHWND1", "ahk_id " hwnd
            else if (i = 2)
                ControlSend "{b}", , "ahk_id " hwnd
            else
                Send "{b}"
        } catch as e {
            FileAppend "test " i " threw: " e.Message "`n", logfile
        }
        Sleep 1400
    }
    ToolTip "Done. Tell Claude which test number (1, 2, 3, or none) made the game react."
    SetTimer () => ToolTip(), -6000
}
