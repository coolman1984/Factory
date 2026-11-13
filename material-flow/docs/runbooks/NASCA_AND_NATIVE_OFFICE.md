# NASCA, native Office and desktop limits

## Diagnose bytes and capabilities separately

The supplied PDF and Excel-generated preview PDFs have a NASCA header. PyMuPDF reported `no objects found`; this was a protected wrapper, not evidence of an empty plan. Do not repeatedly switch plain-PDF libraries, strip headers, decrypt or bypass DRM. Use permitted native access or record the unavailable capability.

Native Foxit rendered the supplied PDF, so native viewing was demonstrated. Acrobat PDDoc COM could not be instantiated in the earlier session. A separate Word COM import did not complete. No approved PDF text export succeeded; no PDF/DWG text reconciliation was performed. Native viewing and text extraction are different outcomes.

The first normal-environment Excel doctor reported `Server execution failed`; outside the restricted shell a separate `DispatchEx('Excel.Application')` connected to Excel 16.0. This establishes a sandbox/context difference for this machine, not a missing Excel installation. Use the required approval mechanism for outside-sandbox native operations; do not disable sandboxing or change trust settings.

## Native Excel workflow that worked

1. `pythoncom.CoInitialize()`; create a separate `DispatchEx` instance.
2. Set Visible=False, DisplayAlerts=False, AskToUpdateLinks=False and AutomationSecurity=3.
3. Open only the generated workbook read-only, UpdateLinks=0, AddToMru=False.
4. Read UsedRange bounds in bulk. Export a bounded first-row preview per sheet; do not print hundreds of thousands of rows.
5. Close this workbook with SaveChanges=False, quit only the instance created by the task, and release COM in finally.
6. Inspect output headers. In this run all preview PDFs were automatically NASCA-wrapped. Export success and file size therefore do **not** establish visual QA or ordinary PDF readability.

`dist/layout_tools/render_excel_previews.py` implements the proven native-open/PDF-export route and reports protection. Its exports are not a full-sheet visual acceptance result.

## Approaches that remain unvalidated

- Orca desktop commands returned `runtime_unavailable`; opening it returned `runtime_open_timeout`. A nominal helper installation did not provide a working automation connection.
- Pywinauto title discovery on the attached desktop timed out even while direct `EnumDesktopWindows` found the task window. Desktop/window-station context matters. A known handle must still be revalidated against its title and PID.
- A shortcut intended as Save As did not produce an export dialog; the captured view showed a tool-format pane. The next direct action was stopped when the window was unresponsive. Do not encode that shortcut as a working export procedure.
- `PrintWindow` obtained a viewport image; it is not full-resolution PDF extraction, OCR, or proof that every part of the page was read.
- Hidden Excel `CopyPicture(Appearance=2, Format=2)` failed. Clipboard restoration also raised `CoInitialize has not been called`. No bitmap was delivered. The unproven image option was removed from the maintained renderer. Additional OLE initialization/visibility changes are **hypotheses**, not validated fixes. Do not depend on the user's clipboard as the normal extraction path.

## Application cleanup

Preserve the user's existing Office sessions. Prefer normal document close. The owner explicitly requested closing the supplied PDF; WM_CLOSE did not finish. Only the reader process opened by this task was stopped after confirming its PID, exact PDF command-line argument, window title and absence of other document windows. That narrowly authorized cleanup is not permission to kill an arbitrary Foxit/Office process. The original source hashes remained unchanged. Do not force-close another app or discard unsaved user work to resolve an automation error.

If native access remains unavailable, deliver the verified CAD data, record the PDF limitation, and request an approved text/plain export only when the user's next task actually depends on it.
