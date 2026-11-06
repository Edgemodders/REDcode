// A stand-in for another EDGE tool, for REDcode's hand tests. Never published.
// It claims TweakDB records (REDcode issue #22) and says what REDcode passed, and calls
// REDcodeApi.openAnimation as EDGEquest's Preview button will (REDcode issue #21).
const vscode = require("vscode");

const TraumaCrew = "base\\animations\\quest_custom\\q001\\q001_00c_rescuing_girl\\q001_00c_trauma_arrives\\q001_00c_trauma_arrives_male_average.anims";

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
    vscode.commands.registerCommand("openstest.openAnimationNotAnims", async () => {
      const api = await redcode();
      try {
        await api.openAnimation("base\\journal\\cooked_journal.journal");
      } catch (e) {
        void vscode.window.showInformationMessage(`Opens Test: REDcode refused it: ${e.message}`);
      }
    }),
  );
};
