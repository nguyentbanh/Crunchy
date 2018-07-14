interface IFormatterTable {
  [key: string]: (config: IConfig, input: string|Buffer, done: (err: Error, subtitle?: string) => void) => void;
}
