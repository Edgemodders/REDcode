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
