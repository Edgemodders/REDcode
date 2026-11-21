// A stand-in for another EDGE tool, for REDcode's hand tests. Never published.
// It claims TweakDB records (REDcode issue #22) and says what REDcode passed, and calls
// REDcodeApi.openAnimation as EDGEquest's Preview button will (REDcode issue #21).
const vscode = require("vscode");

const TraumaCrew = "base\\animations\\quest_custom\\q001\\q001_00c_rescuing_girl\\q001_00c_trauma_arrives\\q001_00c_trauma_arrives_male_average.anims";
const TraumaSoldiers = "base\\animations\\quest\\main_quests\\prologue\\q001\\q001_00c_rescuing_girl\\anim\\synced\\synced__q001_00c__male_average.anims";
const TraumaTeam = "ep1\\characters\\entities\\corpo\\corpo__ep1_traumateam_ma.ent";

async function redcode() {
  const ext = vscode.extensions.getExtension("edgemodders.redcode-cyberpunk");
  return ext?.isActive ? ext.exports : await ext?.activate();
}

exports.activate = (context) => {
  context.subscriptions.push(
    vscode.commands.registerCommand("openstest.open", (record) => {
      void vscode.window.showInformationMessage(`Opens Test got ${JSON.stringify(record)}`);
    }),
    vscode.commands.registerCommand("openstest.openAnimation", async () => {
      const api = await redcode();
      if (typeof api?.openAnimation !== "function") {
        void vscode.window.showWarningMessage("This REDcode has no openAnimation.");
        return;
      }
      await api.openAnimation(TraumaCrew, "q001_00c_trauma_arrives___med_2_idle__01");
    }),
    vscode.commands.registerCommand("openstest.openAnimationOnEntity", async () => {
      // A2 (REDcode 0.10.12): the soldiers' landing from the AV, on the Trauma Team paramedic's own meshes.
      const api = await redcode();
      if (typeof api?.openAnimation !== "function") {
        void vscode.window.showWarningMessage("This REDcode has no openAnimation.");
        return;
      }
      await api.openAnimation(TraumaSoldiers, "synced__q001_00c_trauma_arrives_soldiers__land_v1__soldier_01", { entity: TraumaTeam, appearance: "corpo__traumateam_ma_paramedic__lvl1_01" });
    }),
    vscode.commands.registerCommand("openstest.readKey", async () => {
      // Keys (REDcode issue #33, K4b): another extension asking REDcode for a key, as EDGEhack or EDGEwave will.
      const api = await redcode();
      if (!api?.keys) {
        void vscode.window.showWarningMessage("This REDcode has no keys API.");
        return;
      }
      try {
        const key = await api.keys.get("tripo", "Opens Test");
        void vscode.window.showInformationMessage(key ? `Opens Test read the Tripo key: ...${key.slice(-4)}` : "Opens Test: no key (none set, or not allowed).");
      } catch (e) {
        void vscode.window.showErrorMessage(`Opens Test: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
    vscode.commands.registerCommand("openstest.openSector", async () => {
      // The sector view (REDcode 0.10.15, agreed with EDGEbuilder in its #8): a sector at one node data entry, picked and framed.
      const api = await redcode();
      if (typeof api?.openSector !== "function") {
        void vscode.window.showWarningMessage("This REDcode has no openSector.");
        return;
      }
      await api.openSector("base\\worlds\\03_night_city\\_compiled\\default\\exterior_-22_7_0_0.streamingsector", { select: 780 });
    }),
    vscode.commands.registerCommand("openstest.openAnimationSet", async () => {
      // A3 (REDcode 0.10.15): the soldiers' landing as a synced set, the AV and soldier_02 with it, soldier_02 on the paramedic.
      const api = await redcode();
      if (typeof api?.openAnimation !== "function") {
        void vscode.window.showWarningMessage("This REDcode has no openAnimation.");
        return;
      }
      await api.openAnimation(TraumaSoldiers, "synced__q001_00c_trauma_arrives_soldiers__land_v1__soldier_01", {
        set: true,
        entities: { soldier_02: { entity: TraumaTeam, appearance: "corpo__traumateam_ma_paramedic__lvl1_01" } },
      });
    }),
    vscode.commands.registerCommand("openstest.openModel", async () => {
      // REDcode issue #29 (0.10.15): a .glb in a titled 3D tab, as EDGEfab opens each prop's view.glb.
      const api = await redcode();
      if (typeof api?.openModel !== "function") {
        void vscode.window.showWarningMessage("This REDcode has no openModel.");
        return;
      }
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Models: ["glb", "gltf", "mesh"] }, title: "A model to open with a title" });
      if (!picked?.[0]) return;
      const title = await vscode.window.showInputBox({ prompt: "The tab's title", value: "a battered vending machine" });
      if (title === undefined) return;
      await api.openModel(picked[0].fsPath, { title });
    }),
    vscode.commands.registerCommand("openstest.closeModel", async () => {
      const api = await redcode();
      if (typeof api?.closeModel !== "function") {
        void vscode.window.showWarningMessage("This REDcode has no closeModel.");
        return;
      }
      const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, title: "Close the titled 3D tabs of files under this folder" });
      if (!picked?.[0]) return;
      void vscode.window.showInformationMessage(`closeModel closed ${api.closeModel(picked[0].fsPath)} tab(s).`);
    }),
    vscode.commands.registerCommand("openstest.openAnimationNotAnims", async () => {
      const api = await redcode();
      try {
        await api.openAnimation("base\\journal\\cooked_journal.journal");
      } catch (e) {
        void vscode.window.showInformationMessage(`Opens Test: REDcode refused it: ${e.message}`);
      }
    }),
    // REDcodeApi.revealInProject, as EDGEmat calls it after adding a mesh to a project (REDcode issue #27).
    vscode.commands.registerCommand("openstest.revealInProject", async () => {
      const api = await redcode();
      if (typeof api?.revealInProject !== "function") {
        void vscode.window.showWarningMessage("This REDcode has no revealInProject.");
        return;
      }
      const active = vscode.window.activeTextEditor?.document.uri;
      const file = await vscode.window.showInputBox({ prompt: "A path on disk to reveal in REDcode's Project view", value: active?.scheme === "file" ? active.fsPath : "" });
      if (file === undefined) return;
      const shown = await api.revealInProject(file);
      void vscode.window.showInformationMessage(`Opens Test: revealInProject answered ${shown}`);
    }),
  );
};
