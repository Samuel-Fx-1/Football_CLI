export class SourceError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'SourceError';
  }
}
