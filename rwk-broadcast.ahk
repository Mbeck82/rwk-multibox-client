#Requires AutoHotkey v2.0
#SingleInstance Force
; ============================================================================
;  RWK MULTIBOX - keystroke broadcaster for Race War Kingdoms in Chrome
; ============================================================================
;  Play several RWK accounts at once. Whatever key you press in the window you're
;  looking at is instantly echoed to every other account's window.
;
;  QUICK START
;    1. Install AutoHotkey v2  (https://www.autohotkey.com/  - "Download v2").
;    2. Open each account in its OWN separate Chrome window (not tabs - one
;       window per account) and log in.
;    3. Double-click this file to start it (a green "H" appears by the clock).
;    4. For each window: CLICK INSIDE THE GAME AREA once (this focuses the game
;       frame - required), then press  Ctrl+Alt+T  to tag it. A tooltip confirms
;       the count. Do this once per session.
;    5. Play. Keys you press in any tagged window go to them all - background
;       windows included, no flicker, near-instant.
;
;    Ctrl+Alt+B = pause/resume (pause it to type a chat message in one window)
;    Ctrl+Alt+Space = test (flashes Esc to every tagged window)
;    Ctrl+Alt+C = clear tags   Ctrl+Alt+L = show status
;
;  Each account must be its OWN Chrome window - keys go to a window's active tab.
; ============================================================================

; ===================== CONFIG =====================
TargetFilter := "ahk_exe chrome.exe"    ; "" to allow tagging any window
; RWK is a frameset (Chrome shows several render frames per window; HWND1 is the browser
; toolbar, NOT the game). We don't guess the frame - tagging captures whichever one you've
; clicked into, and the broadcast sends straight to it.
; =================================================

SetControlDelay -1          ; near-0 transmission delay
SetKeyDelay -1, -1

; Shared state. AHK v2 functions are local-by-default, so every function that reads
; or writes these declares `global <name>` inside itself. Arrows can't declare global,
; so the hotkey arrows below only *call* named functions - they never touch state directly.
targets := Map()     ; hwnd => true
broadcasting := true
sending := false

; ---- control / management hotkeys ----
Hotkey "^!t",     (*) => ToggleTarget()   ; Ctrl+Alt+T      tag/untag active window
Hotkey "^!c",     (*) => ClearTargets()   ; Ctrl+Alt+C      clear list
Hotkey "^!b",     (*) => ToggleCast()     ; Ctrl+Alt+B      master on/off (turn OFF to chat in one window)
Hotkey "^!l",     (*) => ShowStatus()     ; Ctrl+Alt+L      show status
Hotkey "^!Space", (*) => TestCast()       ; Ctrl+Alt+Space  smoke test (Esc to every tagged window)
Hotkey "^!Enter", (*) => Cast("{Enter}")  ; Ctrl+Alt+Enter  deliberate fleet Enter
Hotkey "^!/",     (*) => Cast("{vkBF}")   ; Ctrl+Alt+/      deliberate fleet /
; --- DEBUG (temporary) ---
Hotkey "F7", (*) => Cast("{b}")           ; F7  force-broadcast 'b' (bypasses tagging gate) + logs
Hotkey "F8", (*) => DebugActive()         ; F8  log the active window: is it tagged? what controls?
DebugActive() {
    global targets
    hwnd := WinActive("A")
    fc := 0
    try fc := ControlGetFocus("ahk_id " hwnd)
    dbg := "== F8  active=" hwnd " '" WinGetTitle("ahk_id " hwnd) "'  tagged=" (targets.Has(hwnd) ? "YES" : "NO") "  focusedCtrl=" fc "`n"
    try {
        for c in WinGetControls("ahk_id " hwnd) {
            ch := 0
            try ch := ControlGetHwnd(c, "ahk_id " hwnd)
            dbg .= "   ctrl: " c " = hwnd " ch (ch = fc ? "   <== FOCUSED (game frame)" : "") "`n"
        }
    } catch as e {
        dbg .= "   controls error: " e.Message "`n"
    }
    dbg .= "   stored: "
    for w, f in targets
        dbg .= w "->" f "  "
    dbg .= "`n"
    try FileAppend dbg, A_ScriptDir "\rwk-cast.log"
    Toast("F8: focusedCtrl=" fc)
}

Toast("RWK broadcast loaded. Ctrl+Alt+T on each game window to tag it.")

ToggleTarget() {
    global targets, TargetFilter
    hwnd := WinActive("A")
    if !hwnd
        return
    if (TargetFilter != "" && !WinActive(TargetFilter))
        return Toast("Not a Chrome window - skipped")
    if targets.Has(hwnd)
        return (targets.Delete(hwnd), Toast("Removed - " targets.Count " target(s)"))
    ; Capture the frame you've clicked into (the game). We send straight to this control's
    ; HWND later, so it works even when the window is in the background.
    frame := 0
    try frame := ControlGetFocus("ahk_id " hwnd)
    if !frame
        return Toast("Click INSIDE the game area first, then Ctrl+Alt+T")
    targets[hwnd] := frame
    Toast("Added - " targets.Count " target(s)")
}

ClearTargets() {
    global targets
    targets.Clear()
    Toast("Targets cleared")
}

ToggleCast() {
    global broadcasting
    broadcasting := !broadcasting
    Toast("Broadcast " (broadcasting ? "ON" : "OFF"))
}

ShowStatus() {
    global targets, broadcasting
    Toast(targets.Count " target(s), broadcast " (broadcasting ? "ON" : "OFF"))
}

TestCast() {
    global targets
    Cast("{Esc}")
    Toast("Test: Esc -> " targets.Count " window(s)")
}

IsTarget(hwnd) {
    global targets
    return targets.Has(hwnd)
}

; ---- the broadcast: send one key to every live target, in the background ----
; No focus switching: ControlSend posts the key straight to each window's focused frame,
; so every tagged window - including the ones behind - gets it at once, near-instantly.
Cast(key) {
    global targets, sending
    sending := true
    dbg := "== Cast '" key "'  targets=" targets.Count "  active=" WinActive("A") "`n"
    for winHwnd, frameHwnd in targets.Clone() {   ; Clone so we can prune dead windows mid-loop
        if !WinExist("ahk_id " winHwnd) {
            dbg .= "   win " winHwnd " GONE (pruned)`n"
            targets.Delete(winHwnd)
            continue
        }
        try {
            ControlSend key, frameHwnd, "ahk_id " winHwnd   ; straight to the captured game frame
            dbg .= "   win " winHwnd " frame " frameHwnd " -> SENT`n"
        } catch as e {
            dbg .= "   win " winHwnd " frame " frameHwnd " -> THREW: " e.Message "`n"
        }
    }
    try FileAppend dbg, A_ScriptDir "\rwk-cast.log"
    sending := false
}

; ---- leader keys: fire only while a tagged window is active & broadcast is on ----
; ControlSend bypasses the keyboard hook, so echoing back to the active window
; does NOT retrigger these (the `sending` guard is belt-and-suspenders).
#HotIf broadcasting && !sending && IsTarget(WinActive("A"))
; letters (game reads raw uppercase ASCII keyCodes; {b} sends VK_B = 66, matches)
b::Cast("{b}")
n::Cast("{n}")
a::Cast("{a}")
c::Cast("{c}")
d::Cast("{d}")
f::Cast("{f}")
r::Cast("{r}")
t::Cast("{t}")
p::Cast("{p}")
j::Cast("{j}")
; digits: 1-3 quick chat, 4/5/6/0 general, 7/8/9 kingdom
1::Cast("{1}")
2::Cast("{2}")
3::Cast("{3}")
4::Cast("{4}")
5::Cast("{5}")
6::Cast("{6}")
7::Cast("{7}")
8::Cast("{8}")
9::Cast("{9}")
0::Cast("{0}")
; punctuation sent by raw keyCode (game wants 219/221/192, not normalized values)
vkDB::Cast("{vkDB}")   ; [  -> 219
vkDD::Cast("{vkDD}")   ; ]  -> 221
vkC0::Cast("{vkC0}")   ; `  -> 192
; navigation
Escape::Cast("{Esc}")  ; game honors Esc even with chat focused
Up::Cast("{Up}")
Down::Cast("{Down}")
Left::Cast("{Left}")
Right::Cast("{Right}")
; NOTE: Enter and / are intentionally NOT auto-mirrored - each window's chat focus
; is independent, so mirroring them races the game. Type them locally; use
; Ctrl+Alt+Enter / Ctrl+Alt+/ to deliberately send them to the whole fleet.
#HotIf

Toast(msg) {
    ToolTip msg
    SetTimer () => ToolTip(), -1400
}
