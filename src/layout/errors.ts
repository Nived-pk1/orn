/** ELK could not be loaded or started (the module failed to import or construct). The worker answers with the fallback, `engine_unavailable`. */
export class LayoutEngineUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutEngineUnavailable';
  }
}
