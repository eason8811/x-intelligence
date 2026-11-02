import { Jp5LoginError, type Jp5LoginAdapter } from "@x-intelligence/x";

/** The production adapter stays unavailable until same-flow runtime providers,
 * POST transport, authenticated cookie handling and identity readback exist.
 * Investigation scripts are deliberately not imported as runtime providers. */
export function createLoginAdapter(): Jp5LoginAdapter {
  const unavailable = (): never => { throw new Jp5LoginError("AUTH_RUNTIME_UNAVAILABLE"); };
  return {
    assertAvailable: unavailable,
    start: unavailable,
    submit: unavailable,
    verify: unavailable,
  };
}
