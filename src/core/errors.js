// errors.js — the one error type the whole extension speaks.
//
// A SfError carries a machine `code`, a short user-facing `message`, and an
// optional `hint` line with the next step. The UI decides how to show it; the
// client and the models only decide what to say. Pure — no globals.

export class SfError extends Error {
  constructor(code, message, hint) {
    super(message);
    this.name = "SfError";
    this.code = code;
    this.hint = hint || "";
  }
}
