export class Login {
  constructor(guest: { token: unknown });
  cookie: Record<string, string>;
  flow_token: string;
  subtask_id: string;
  updateItems(result: unknown): this;
  Init(): Promise<unknown>;
  LoginJsInstrumentationSubtask(): Promise<unknown>;
  LoginEnterUserIdentifierSSO(value: string): Promise<unknown>;
  LoginEnterAlternateIdentifierSubtask(value: string): Promise<unknown>;
  LoginEnterPassword(value: string): Promise<unknown>;
  AccountDuplicationCheck(): Promise<unknown>;
  LoginTwoFactorAuthChallenge(value: string): Promise<unknown>;
  LoginAcid(value: string): Promise<unknown>;
  Viewer(): Promise<unknown>;
}
