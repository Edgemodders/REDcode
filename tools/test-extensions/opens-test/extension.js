// A stand-in for a tool that claims TweakDB records (REDcode issue #22): it says what REDcode passed.
const vscode = require("vscode");

exports.activate = (context) => {
  context.subscriptions.push(
    vscode.commands.registerCommand("openstest.open", (record) => {
      void vscode.window.showInformationMessage(`Opens Test got ${JSON.stringify(record)}`);
    }),
  );
};
