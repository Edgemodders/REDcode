// The 3D viewer for .glb and .gltf files, such as an exported mesh in a project's source/raw. VS Code
// has none. The same bundled viewer as the CR2W editor's mesh mode (media/mesh/viewer.js); no bridge
// is needed, since the file is already glTF. See docs/design/view.md, V1.
//
// Two ways in: the custom editor (Open With, a click on a .glb), whose tab VS Code names after the
// file; and REDcodeApi.openModel (REDcode issue #29), a plain panel with a title of the caller's, for
// files that all share one name (EDGEfab's props are each a view.glb).

import * as path from "node:path";
import * as vscode from "vscode";
import { meshPayload } from "./meshExport";

export const MeshViewType = "redcode.mesh";
/** The titled panels' view type. */
const ModelViewType = "redcode.model";

interface ModelPanel {
  panel: vscode.WebviewPanel;
  file: string;
  title: string;
  send: () => void;
}

export class MeshViewer implements vscode.CustomReadonlyEditorProvider {
  /** The titled panels, by the full path of their file in lower case. */
  private readonly models = new Map<string, ModelPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly log: vscode.OutputChannel,
    /** Where the light is kept for the window (REDcode issue #31). */
    private readonly state?: vscode.Memento,
  ) {}

  register(): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(MeshViewType, this, { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true });
  }

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    const file = document.uri.fsPath;
    this.fill(panel, file, () => path.basename(file));
  }

  /**
   * Shows a .glb or .gltf in a panel titled title (the file's name without one). The same file again
   * shows its open panel, with the new title. The panel redraws when the file changes on disk.
   */
  openModel(file: string, title?: string): void {
    const full = path.resolve(file);
    const key = full.toLowerCase();
    const label = title?.trim() || path.basename(full);
    const known = this.models.get(key);
    if (known) {
      if (known.title !== label) {
        known.title = label;
        known.panel.title = label;
        known.send();
      }
      known.panel.reveal();
      return;
    }
    const media = vscode.Uri.joinPath(this.extensionUri, "media");
    const panel = vscode.window.createWebviewPanel(ModelViewType, label, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] });
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "images", "icon.png");
    const model: ModelPanel = { panel, file: full, title: label, send: () => undefined };
    model.send = this.fill(panel, full, () => model.title);
    this.models.set(key, model);
    panel.onDidDispose(() => {
      if (this.models.get(key)?.panel === panel) this.models.delete(key);
    });
  }

  /** Closes the titled panels of a file, or of every file under a folder; answers how many closed. */
  closeModel(fileOrFolder: string): number {
    const root = path.resolve(fileOrFolder).toLowerCase();
    let closed = 0;
    for (const [key, model] of [...this.models]) {
      if (key === root || key.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) {
        model.panel.dispose();
        closed++;
      }
    }
    return closed;
  }

  /** Builds the viewer page in a panel for a file; answers the function that sends the file again. */
  private fill(panel: vscode.WebviewPanel, file: string, title: () => string): () => void {
    const media = vscode.Uri.joinPath(this.extensionUri, "media");
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const nonce = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");
    const viewer = panel.webview.asWebviewUri(vscode.Uri.joinPath(media, "mesh", "viewer.js"));
    const style = panel.webview.asWebviewUri(vscode.Uri.joinPath(media, "cr2w", "editor.css"));
    const send = () => {
      try {
        void panel.webview.postMessage({ type: "mesh", title: title(), light: this.state?.get("redcode.light"), ...meshPayload(file) });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.log.appendLine(`mesh viewer: ${message}`);
        void panel.webview.postMessage({ type: "error", error: message });
      }
    };
    panel.webview.onDidReceiveMessage((m: { type?: string; settings?: unknown }) => {
      if (m?.type === "ready") send();
      else if (m?.type === "light") void this.state?.update("redcode.light", m.settings);
    });
    // Re-read the file when it changes on disk, such as after a new export.
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)));
    watcher.onDidChange(send);
    watcher.onDidCreate(send);
    panel.onDidDispose(() => watcher.dispose());
    panel.webview.html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data: blob:; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}'; connect-src data: blob:;">
<link rel="stylesheet" href="${style}">
<title>${escapeHtml(title())}</title>
</head>
<body class="mesh-mode meshfile">
<main id="mesh" class="meshfile-main"><div class="note">Loading…</div></main>
<script nonce="${nonce}" src="${viewer}"></script>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const host = document.getElementById("mesh");
let view = null;
window.addEventListener("message", async (e) => {
  const m = e.data;
  if (m.type === "error") { host.textContent = "Could not read the file: " + m.error; return; }
  if (m.type !== "mesh") return;
  view?.dispose();
  let source;
  if (m.json) source = { json: m.json };
  else { const bin = atob(m.data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); source = { data: bytes.buffer }; }
  view = await window.REDcodeMesh.mount(host, source, m.title, { light: m.light, onLight: (settings) => vscode.postMessage({ type: "light", settings }) });
});
vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
    return send;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
